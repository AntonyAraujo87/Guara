require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const {
  extractItems,
  transcreverAudio,
  lerImagem,
  quemEstaNaFila,
  quemLeMidia,
} = require('./ai-service');
const { baixarAudio, baixarImagem } = require('./media-service');
const { lerSemIA } = require('./leitura-simples');
const {
  currency,
  NL,
  formatConfirmation,
  formatConfirmationPorCarteira,
  avisoDeData,
  avisoDeLeituraSimples,
} = require('./formato');
const {
  EMAIL_CONTATO,
  MSG_APRESENTACAO,
  MSG_CRIAR_CONTA,
  MSG_NAO_ENTENDI,
  MSG_INSTALAR,
  MSG_IA_FORA,
  MSG_SEM_COTA,
  MSG_CONVERSA,
  MSG_PLANILHA,
  MSG_APAGAR_CONFIRMA,
  MSG_APAGAR_CANCELADO,
  MSG_AJUDA,
  MSG_LEMBRETE_PAINEL,
  TIPOS_IGNORADOS,
  msgTipoNaoSuportado,
} = require('./mensagens');
const {
  responderConsulta,
  responderDesfazer,
  responderMeta,
  responderPlanejar,
  responderParcelaPaga,
  responderConverter,
  responderRecorrente,
  responderEditarRecorrente,
  responderCarteira,
  responderMoverCarteira,
  responderEditarLancamento,
  responderApagarItem,
  responderQuitarDivida,
  responderDesmarcarParcela,
  responderRenomearCofrinho,
  responderCategoria,
  responderResumo,
  confirmarGuardado,
  perguntaDeAssinatura,
  salvarParcelamento,
} = require('./respostas');

const {
  saveTransaction,
  saveDebt,
  ensureUser,
  isPhoneLinked,
  saveSaving,
  getCategories,
  savingsByJar,
  apagarTudoDoTelefone,
  moverUltimoGuardado,
  resolverCarteira,
  lembrarCarteira,
  CARTEIRA_PADRAO,
  comCarteira,
  contextoDeCarteira,
  criarCarteira,
  LIMITE_CARTEIRAS,
  trocarCarteira,
  renomearCarteira,
  apagarCarteira,
  supabaseAdmin,
} = require('./db-service');


// A Meta só deixa mandar texto livre (fora de template aprovado) se o número mandou
// mensagem pro bot nas últimas 24h — senão é "mensagem iniciada pela empresa" e é bloqueado.
async function hasOpenWindow(phone) {
  const { data } = await supabaseAdmin.from('users').select('last_message_at').eq('phone', phone).maybeSingle();
  if (!data?.last_message_at) return false;
  return Date.now() - new Date(data.last_message_at).getTime() < 24 * 60 * 60 * 1000;
}

const app = express();
app.disable('x-powered-by');

// O Caddy fica na frente e repassa o IP real em X-Forwarded-For. Sem confiar
// nele, o limitador de requisições enxerga todo mundo com o mesmo IP — o do
// proxy — e os 30 por minuto viravam um teto compartilhado entre TODOS os
// usuários, em vez de 30 para cada um.
//
// O número 1 é o de saltos confiáveis: só o Caddy. Confiar em todos deixaria
// qualquer um forjar o cabeçalho e escapar do limite.
app.set('trust proxy', 1);
// CSP fica a cargo do Next (next.config.ts), que conhece as origens que a página usa.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

const webhookLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

async function getAuthedUser(req) {
  const token = (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

const { PORT, META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_VERIFY_TOKEN, META_API_VERSION, META_APP_SECRET } = process.env;

// Confirma que o POST realmente veio da Meta (assinatura HMAC do payload com o App Secret)
function verifyMetaSignature(req) {
  const signature = req.header('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(req.rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}


// Quem já recebeu o aviso de exclusão, e há quanto tempo.
//
// Sem isto a exclusão era "em duas etapas" só no papel: quem digitasse APAGAR
// TUDO direto pulava a confirmação e perdia tudo na hora — e a frase está
// escrita na mensagem de ajuda, à vista de qualquer um que pegue o celular.
//
// Agora a frase só executa se ELA for resposta a uma pergunta minha. Digitada
// do nada, ela vira o pedido — e aí sim aparece o aviso.
const AVISO_EXCLUSAO_MS = 10 * 60 * 1000;
const avisadosDaExclusao = new Map();

function jaFoiAvisado(phone) {
  const quando = avisadosDaExclusao.get(phone);
  if (!quando) return false;
  if (Date.now() - quando > AVISO_EXCLUSAO_MS) {
    avisadosDaExclusao.delete(phone);
    return false;
  }
  return true;
}

function marcarAvisado(phone) {
  avisadosDaExclusao.set(phone, Date.now());
  // Sem limpeza o Map cresce pra sempre num processo que não reinicia.
  if (avisadosDaExclusao.size > 500) {
    const limite = Date.now() - AVISO_EXCLUSAO_MS;
    for (const [k, v] of avisadosDaExclusao) if (v < limite) avisadosDaExclusao.delete(k);
  }
}

// Evita reprocessar a mesma mensagem se o WhatsApp reentregar o webhook (in-memory, por processo)
const processedMessageIds = new Set();

// Resposta ao "isso é todo mês?". Um "sim" sozinho não tem como ser entendido
// por IA nenhuma — não há nada na frase pra classificar. Aqui é o texto cru que
// decide, do mesmo jeito que a confirmação de apagar tudo.
const SIM = /^(sim|isso|isso ai|isso aí|é sim|eh sim|s|ss|aham|uhum|claro|pode|pode deixar|pode sim|todo mes|todo mês|é mensal|eh mensal|confirmo|positivo|yes|ok|blz|beleza)[.!]*$/i;
const NAO = /^(n|nao|não|nn|negativo|so esse mes|só esse mês|so esse|nao é|não é|nope|no)[.!]*$/i;

// De onde a frase veio.
//
// Não é detalhe: texto transcrito de áudio ou lido de uma foto NÃO foi escrito
// pela pessoa — pode ter sido escrito por quem montou o comprovante. Serve pra
// anotar um gasto; não serve pra destravar exclusão de tudo.
const ORIGENS_DIGITADAS = new Set(['texto', 'painel']);

// Resolve em qual carteira esta mensagem vai cair, e roda o atendimento
// inteiro dentro desse contexto. Quem nunca criou uma segunda carteira nem
// percebe: cai sempre na padrão.
async function processIncomingMessage(phone, text, origem = 'texto') {
  const { primeiraVez } = await ensureUser(phone);
  const { ativa } = await contextoDeCarteira(phone);
  return comCarteira(ativa, () => atenderMensagem(phone, text, ativa, primeiraVez, origem));
}

async function atenderMensagem(phone, text, carteiraAtiva, primeiraVez = false, origem = 'texto') {
  // Primeiro "oi" da vida da pessoa: apresentação, sempre — não importa o que
  // ela escreveu nem se a IA entendeu.
  //
  // Antes isso dependia da IA NÃO entender a mensagem, o que ficou errado no dia
  // em que "oi" passou a ser reconhecido: quem chegava recebia um "tô por aqui"
  // genérico como primeira impressão. E quem já usava há meses sem conta levava
  // a apresentação inteira toda vez que escrevia algo solto.
  if (primeiraVez) {
    await replyWhatsApp(phone, MSG_APRESENTACAO);
    await replyWhatsApp(phone, MSG_CRIAR_CONTA);
    // Um "oi" já foi respondido pela apresentação. Mas se veio um gasto junto,
    // ele continua o caminho e é registrado normalmente.
    const soCumprimento = /^(oi|ola|olá|bom dia|boa tarde|boa noite|eai|e ai|opa|hey|hi|alo|alô|tudo bem|tudo bom)[!?.\s]*$/i;
    if (soCumprimento.test(String(text).trim())) return;
  }


  const cru = String(text).trim();
  if (SIM.test(cru)) {
    await replyWhatsApp(phone, await responderConverter(phone, {
      para: 'recorrente', dayOfMonth: 0, amount: 0, installments: 0,
    }));
    return;
  }
  if (NAO.test(cru)) {
    await replyWhatsApp(phone, 'Beleza, deixo como gasto único mesmo. 👍');
    return;
  }

  // O tier gratuito do Gemini é 15 req/min. Se estourar (ou der timeout), a pessoa
  // não pode ficar sem resposta — silêncio parece que o bot morreu.
  let items;
  try {
    // As categorias que a pessoa criou entram no prompt, senão a IA só conhece as padrão.
    const categoriasExtras = await getCategories(phone);
    // As carteiras entram no prompt junto com as categorias: são a mesma
    // natureza de informação — coisas que só existem pra esta pessoa e que o
    // modelo não tem como adivinhar.
    const { carteiras: minhasCarteiras } = await contextoDeCarteira(phone);
    items = await extractItems(text, categoriasExtras, minhasCarteiras, carteiraAtiva);
  } catch (err) {
    console.error('Falha ao interpretar mensagem:', err.message);

    // A IA caiu, mas nem toda mensagem precisa dela. "Paguei 30 no mercado" é
    // simples o bastante pra ler sem modelo nenhum — e anotar o gasto vale
    // muito mais do que um pedido de desculpas.
    //
    // O leitor simples só responde quando tem certeza; nos outros casos devolve
    // null e a pessoa recebe o aviso honesto abaixo.
    // As carteiras entram pra que "gastei 12 na abacate" continue caindo na
    // Abacate mesmo com a IA fora. Sem elas, ia tudo pra carteira ativa — o
    // erro silencioso que este leitor existe justamente pra não cometer.
    const { carteiras } = await contextoDeCarteira(phone);
    const simples = lerSemIA(text, carteiras);
    if (simples) {
      await salvarEResponder(phone, [simples], carteiraAtiva);
      return;
    }

    const semCota = /quota|429/i.test(err.message) && /perday|per day|daily/i.test(err.message);
    await replyWhatsApp(phone, semCota ? MSG_SEM_COTA : MSG_IA_FORA);
    return;
  }

  if (items.length === 0) {
    // A apresentação saiu daqui: ela agora é do primeiro contato, e não de
    // "a IA não entendeu". Quem usa há meses sem conta não pode levar o
    // onboarding inteiro toda vez que escreve algo solto.
    if (!primeiraVez) await replyWhatsApp(phone, MSG_NAO_ENTENDI);
    return;
  }

  // Intenções que respondem em vez de registrar vêm sozinhas na lista.
  const intencao = items[0]?.kind;

  if (intencao === 'ajuda') {
    await replyWhatsApp(phone, MSG_AJUDA);
    return;
  }

  // "Está parcelado" / "isso é todo mês": a pessoa reclassifica o que acabou de
  // mandar. Quase ninguém diz tudo de uma vez, e antes disto a segunda frase
  // não tinha onde encostar — o Guará respondia algo sem sentido.
  // Daqui pra baixo é a paridade com o painel: tudo que tinha botão na tela e
  // não tinha jeito nenhum no chat.
  if (intencao === 'editar_lancamento') {
    await replyWhatsApp(phone, await responderEditarLancamento(phone, items[0]));
    return;
  }

  if (intencao === 'apagar_item') {
    await replyWhatsApp(phone, await responderApagarItem(phone, items[0]));
    return;
  }

  if (intencao === 'quitar_divida') {
    await replyWhatsApp(phone, await responderQuitarDivida(phone, items[0]));
    return;
  }

  if (intencao === 'desmarcar_parcela') {
    await replyWhatsApp(phone, await responderDesmarcarParcela(phone, items[0]));
    return;
  }

  if (intencao === 'renomear_cofrinho') {
    await replyWhatsApp(phone, await responderRenomearCofrinho(phone, items[0]));
    return;
  }

  if (intencao === 'categoria') {
    await replyWhatsApp(phone, await responderCategoria(phone, items[0]));
    return;
  }

  if (intencao === 'planilha') {
    await replyWhatsApp(phone, MSG_PLANILHA);
    return;
  }

  if (intencao === 'resumo') {
    await replyWhatsApp(phone, await responderResumo(phone, items[0].period));
    return;
  }

  // Cumprimento, agradecimento, desabafo. Não é erro, e responder "não entendi"
  // pra um "valeu" faz o Guará parecer burro.
  if (intencao === 'conversa') {
    // No primeiro contato a apresentação já foi, e um "tô por aqui" logo
    // depois seria a segunda mensagem dizendo menos que a primeira.
    if (!primeiraVez) await replyWhatsApp(phone, MSG_CONVERSA);
    return;
  }

  if (intencao === 'mover_carteira') {
    await replyWhatsApp(phone, await responderMoverCarteira(phone, items[0], carteiraAtiva));
    return;
  }

  if (intencao === 'carteira') {
    await replyWhatsApp(phone, await responderCarteira(phone, items[0], carteiraAtiva));
    return;
  }

  if (intencao === 'mover_guardado') {
    const r = await moverUltimoGuardado(phone, items[0].jar);
    await replyWhatsApp(phone, r
      ? `🐷 Pronto! Os R$ ${currency.format(r.amount)} agora estão no cofrinho *${r.para}*.`
      : `Não achei nenhum "guardei" recente pra mover. 🤔`);
    return;
  }

  if (intencao === 'converter_ultimo') {
    await replyWhatsApp(phone, await responderConverter(phone, items[0]));
    return;
  }

  if (intencao === 'instalar') {
    await replyWhatsApp(phone, MSG_INSTALAR);
    return;
  }

  // Exclusão em duas etapas. A confirmação é conferida no texto CRU, nunca no
  // que a IA devolveu: interpretar "apaga tudo" errado custa caro demais pra
  // depender de um modelo. Só a frase exata destrava.
  if (intencao === 'apagar_dados') {
    // Apagar tudo exige frase DIGITADA. Uma foto de um papel escrito
    // "APAGAR TUDO", ou um áudio em que alguém diz isso ao fundo, chegariam
    // aqui como texto comum — e apagariam a vida financeira de uma pessoa por
    // uma frase que ela nunca escreveu.
    if (text.trim().toUpperCase() === 'APAGAR TUDO' && !ORIGENS_DIGITADAS.has(origem)) {
      await replyWhatsApp(phone, [
        'Entendi que você quer apagar tudo — mas isso eu só aceito digitado. 🔒',
        '',
        'Escreve *APAGAR TUDO* aqui na conversa, com as suas mãos.',
      ].join(NL));
      return;
    }

    if (text.trim().toUpperCase() === 'APAGAR TUDO' && jaFoiAvisado(phone)) {
      try {
        const r = await apagarTudoDoTelefone(phone);
        const partes = [
          '🗑️ *Pronto, apaguei tudo.*',
          '',
          `${r.total} ${r.total === 1 ? 'registro removido' : 'registros removidos'}.`,
          '',
          'As cópias de segurança ainda guardam esses dados por até 14 dias, e depois somem de vez — está escrito na nossa política de privacidade.',
        ];
        if (r.tinhaConta) {
          partes.push(
            '',
            `Sua conta de login no painel continua existindo. Pra apagá-la também, escreva pra ${EMAIL_CONTATO} — respondo em até 15 dias.`
          );
        }
        partes.push('', 'Se um dia quiser voltar, é só me mandar uma mensagem. Começamos do zero. 🐺');
        await replyWhatsApp(phone, partes.join('\n'));
      } catch (err) {
        console.error('Falha ao apagar dados de', phone, err.message);
        await replyWhatsApp(
          phone,
          `Não consegui apagar agora. 😕\nTenta de novo em instantes, ou escreve pra ${EMAIL_CONTATO} que eu faço na mão.`
        );
      }
      return;
    }
    marcarAvisado(phone);
    await replyWhatsApp(phone, MSG_APAGAR_CONFIRMA);
    return;
  }

  // A confirmação chega como mensagem solta, sem a IA reconhecer como intenção.
  // Sem isto, quem escreve "APAGAR TUDO" receberia "não entendi".
  if (text.trim().toUpperCase() === 'APAGAR TUDO' && ORIGENS_DIGITADAS.has(origem)) {
    await replyWhatsApp(phone, MSG_APAGAR_CANCELADO);
    return;
  }

  if (intencao === 'desfazer') {
    await replyWhatsApp(phone, await responderDesfazer(phone));
    return;
  }

  if (intencao === 'consulta') {
    // "quanto gastei e quanto tenho guardado" são duas perguntas numa mensagem.
    // Deduplica porque a IA às vezes repete a mesma pergunta em itens separados,
    // e limita a 3 pra resposta não virar um paredão de texto no WhatsApp.
    const vistas = new Set();
    const consultas = items
      .filter((i) => i.kind === 'consulta')
      .filter((c) => {
        const chave = `${c.metric}|${c.period}|${c.category}`;
        if (vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
      })
      .slice(0, 3);

    const respostas = [];
    for (const c of consultas) respostas.push(await responderConsulta(phone, c));
    await replyWhatsApp(phone, respostas.join('\n\n'));
    return;
  }

  if (intencao === 'planejar') {
    await replyWhatsApp(phone, await responderPlanejar(phone));
    return;
  }

  if (intencao === 'meta') {
    await replyWhatsApp(phone, await responderMeta(phone, items[0]));
    return;
  }

  if (intencao === 'parcela_paga') {
    const parcelas = items.filter((i) => i.kind === 'parcela_paga');
    await replyWhatsApp(phone, await responderParcelaPaga(phone, parcelas));
    return;
  }

  // Gasto fixo é a única intenção que registra e ainda assim pode vir em lote:
  // "59,90 na Netflix / 29,90 no Prime / 30 na Vivo" é uma mensagem só.
  if (intencao === 'recorrente') {
    const recorrentes = items.filter((i) => i.kind === 'recorrente');
    await replyWhatsApp(phone, await responderRecorrente(phone, recorrentes));
    return;
  }

  if (intencao === 'editar_recorrente') {
    const edicoes = items.filter((i) => i.kind === 'editar_recorrente');
    await replyWhatsApp(phone, await responderEditarRecorrente(phone, edicoes));
    return;
  }

  // "guardar 15 nessa caixinha" não diz em qual. Antes ia tudo pro pote Geral,
  // que é justamente onde ela NÃO queria. Pergunta só quando existe mais de um
  // pote pra escolher: com nenhum ou com um só, perguntar seria burocracia.
  const vago = items.find((i) => i.kind === 'guardado' && i.jarVago && !i.jar);
  if (vago && items.length === 1) {
    const potes = await savingsByJar(phone);
    const nomeados = potes.filter((p) => p.nome !== 'Geral');
    if (nomeados.length > 0) {
      await replyWhatsApp(phone, [
        `Em qual cofrinho eu guardo os R$ ${currency.format(vago.amount)}? 🐷`,
        '',
        ...nomeados.map((p) => `• *${p.nome}* — tem R$ ${currency.format(p.total)}`),
        '',
        'Me responde só o nome, tipo: _"' + nomeados[0].nome + '"_',
        '_Ou diga "geral" pra deixar solto, fora dos cofrinhos._',
      ].join('\n'));
      return;
    }
  }

  // "Adiantar primeira parcela do secador" virou uma despesa de R$ 0,00, que
  // não quer dizer nada e ainda suja o extrato. Valor ausente significa que a
  // frase não foi entendida — e a saída certa é perguntar, nunca gravar zero.
  // Parcelamento entra na mesma regra: `installments` zerado quer dizer que o
  // numero de parcelas nao passou na validacao (veio ausente, negativo, ou
  // grande demais pra ser verdade). Perguntar e melhor que inventar seis vezes.
  const semValor = items.filter(
    (i) =>
      (['transacao', 'guardado', 'divida'].includes(i.kind) && !(Number(i.amount) > 0)) ||
      (i.kind === 'parcelamento' && !(Number(i.installments) > 0))
  );
  if (semValor.length === items.length && items.length > 0) {
    await replyWhatsApp(phone, [
      'Entendi o que você quis dizer, mas não achei o número. 🤔',
      '',
      'Me manda com o valor, tipo:',
      '_"paguei 50 no mercado"_',
      '_"comprei uma TV em 6x de 200"_',
    ].join('\n'));
    return;
  }
  // Os que têm valor seguem; os zerados ficam de fora em vez de virar R$ 0,00.
  items = items.filter((i) => !semValor.includes(i));

  await salvarEResponder(phone, items, carteiraAtiva);
}

async function salvarEResponder(phone, items, carteiraAtiva) {
  // Cada item na SUA carteira. "Gastei 50 da empresa com lanche e 50 do pessoal
  // com combustível" são dois destinos diferentes na mesma frase — usar a
  // primeira carteira pros dois jogava o gasto de casa na conta da empresa.
  const { carteiras, ativa } = await contextoDeCarteira(phone);
  // resolverCarteira entende tanto o nome ("empresa", "PJ") quanto o
  // apontamento ("nessa mesma carteira"), que é como a pessoa se refere à que
  // acabou de criar sem repetir o nome.
  const destinos = items.map((i) => resolverCarteira(phone, i.carteira, carteiras, ativa) || carteiraAtiva);

  const saved = [];
  const ondeSalvou = [];
  for (let n = 0; n < items.length; n++) {
    const item = items[n];
    const destino = destinos[n];
    try {
      await comCarteira(destino, async () => {
        if (item.kind === 'parcelamento') await salvarParcelamento(phone, item);
        else if (item.kind === 'guardado') await saveSaving(phone, item);
        else if (item.kind === 'divida') await saveDebt(phone, item);
        else await saveTransaction(phone, item);
      });
      saved.push(item);
      ondeSalvou.push(destino);
    } catch (err) {
      console.error('Erro ao salvar item:', err.message, JSON.stringify(item));
    }
  }
  if (saved.length === 0) {
    await replyWhatsApp(phone, 'Consegui entender, mas deu erro pra salvar. 😕 Tenta de novo, por favor.');
    return;
  }

  const foraDaAtiva = [...new Set(ondeSalvou.filter((c) => c !== carteiraAtiva))];
  // Citou uma carteira? Ela passa a ser o alvo de "nessa mesma" na próxima.
  if (foraDaAtiva.length === 1) lembrarCarteira(phone, foraDaAtiva[0]);

  // Guardar dinheiro merece resposta própria: mostra o cofrinho e o andamento da meta.
  if (saved.length === 1 && saved[0].kind === 'guardado') {
    const onde = foraDaAtiva.length ? `${NL}${NL}_(na carteira *${foraDaAtiva[0]}*)_` : '';
    const resposta = await comCarteira(ondeSalvou[0], () => confirmarGuardado(phone, saved[0]));
    await replyWhatsApp(phone, resposta + onde);
  } else {
    // Sem isto a pessoa não teria como saber onde cada coisa foi parar. Com
    // dois destinos, o rótulo vai item a item; com um só, uma linha no fim.
    const varios = new Set(ondeSalvou).size > 1;
    const corpo = varios
      ? formatConfirmationPorCarteira(saved, ondeSalvou)
      : formatConfirmation(saved) + avisoDeData(saved) + avisoDeLeituraSimples(saved) + (foraDaAtiva.length ? `${NL}_(na carteira *${foraDaAtiva[0]}*)_` : '');
    await replyWhatsApp(phone, corpo + (await perguntaDeAssinatura(phone, saved)));
  }

  await convidarParaPainel(phone);
}


// Convida pro cadastro só depois da pessoa registrar algo — e só duas vezes na vida,
// pra não virar insistência. Pedir cadastro antes de mostrar valor derruba o funil.
async function convidarParaPainel(phone) {
  try {
    if (await isPhoneLinked(phone)) return;

    const { count } = await supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_phone', phone);

    // Quem chegou por "oi" já recebeu o passo a passo completo na apresentação.
    // Aqui fica só um lembrete leve pra quem pegou o hábito e ainda não criou conta.
    if (count === 5) await replyWhatsApp(phone, MSG_LEMBRETE_PAINEL);
  } catch (err) {
    // O convite é secundário: se falhar, o lançamento já foi confirmado.
    console.error('Erro ao convidar para o painel:', err.message);
  }
}


// ── CARTEIRAS ──────────────────────────────────────────────────────
// Separar o dinheiro de casa do dinheiro do trabalho. Quem nunca pedir uma
// segunda carteira nunca vê nada disto — nem uma linha a mais nas respostas.




// Handshake de verificação do webhook da Meta (GET, chamado quando se salva a URL no console)
app.get('/meta-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});


// Áudio e foto viram TEXTO, e o texto segue pelo mesmo caminho de sempre. Toda
// regra que o Guará já tem — parcelamento, cofrinho, carteira, categoria —
// passa a valer pra fala e pra foto de comprovante sem ser reescrita.
//
// O que a pessoa vê de volta inclui o que foi entendido: transcrição pode errar
// e leitura de nota pode errar, e sem mostrar não haveria como perceber.
async function tratarMidia(phone, message) {
  const ehAudio = message.type === 'audio';
  const mediaId = ehAudio ? message.audio?.id : message.image?.id;
  if (!mediaId) return;

  await ensureUser(phone);

  let texto;
  try {
    if (ehAudio) {
      const { buffer, mimeType } = await baixarAudio(mediaId);
      texto = await transcreverAudio(buffer, mimeType);
      if (!texto) {
        await replyWhatsApp(phone, [
          'Não consegui ouvir nada nesse áudio. 🙉',
          '',
          'Tenta gravar de novo mais perto do microfone, ou me manda escrito.',
        ].join(NL));
        return;
      }
    } else {
      const { buffer, mimeType } = await baixarImagem(mediaId);
      const r = await lerImagem(buffer, mimeType);
      if (r.erro === 'nao_financeiro') {
        await replyWhatsApp(phone, [
          'Bonita a foto! 😄 Mas não achei nada de dinheiro nela.',
          '',
          'Me manda foto de comprovante, nota, cupom ou print de PIX que eu anoto sozinho.',
        ].join(NL));
        return;
      }
      if (r.erro === 'ilegivel' || !r.frase) {
        await replyWhatsApp(phone, [
          'Consegui ver que é um comprovante, mas o valor não está legível. 🔍',
          '',
          'Tenta uma foto com mais luz, ou me diz o valor: _"paguei 87,50 no mercado"_',
        ].join(NL));
        return;
      }
      texto = r.frase;
    }
  } catch (err) {
    if (err.message === 'grande_demais') {
      await replyWhatsApp(phone, ehAudio
        ? `Esse áudio ficou comprido demais pra mim. 😅${NL}${NL}Manda um mais curto, ou escreve — nos dois casos eu anoto igual.`
        : `Essa imagem ficou grande demais pra mim. 😅${NL}${NL}Manda uma menor, ou me diz o valor escrito.`);
      return;
    }
    console.error(`Falha ao tratar ${message.type} de ${phone}:`, err.message);
    await replyWhatsApp(phone, [
      ehAudio ? 'Não consegui ouvir esse áudio. 😕' : 'Não consegui abrir essa imagem. 😕',
      '',
      'Me manda escrito que eu anoto na hora.',
    ].join(NL));
    return;
  }

  // O aviso do que foi entendido vai ANTES, e separado: a confirmação do
  // lançamento já é longa, e enfiar a transcrição no meio dela esconderia
  // justamente a parte que a pessoa precisa conferir.
  await replyWhatsApp(phone, ehAudio
    ? `🎧 Entendi: _"${texto}"_`
    : `📸 Li no comprovante: _"${texto}"_`);

  await processIncomingMessage(phone, texto, ehAudio ? 'audio' : 'imagem');
}


app.post('/meta-webhook', webhookLimiter, async (req, res) => {
  if (!verifyMetaSignature(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    // A Meta pode entregar várias mensagens no mesmo webhook. Pegar só a
    // primeira significava perder as outras sem deixar rastro.
    const mensagens = value?.messages || [];

    let jaAvisou = false;
    for (const message of mensagens) {
      const messageId = message.id;
      if (messageId) {
        if (processedMessageIds.has(messageId)) continue;
        processedMessageIds.add(messageId);
        // Descarta a metade mais velha em vez de esvaziar tudo. Com `.clear()`,
        // a mensagem processada um segundo antes da limpeza voltava a ser
        // desconhecida — e uma reentrega do WhatsApp naquele instante gravava o
        // gasto de novo. Set em JS mantém a ordem de inserção, então os 1000
        // mais recentes são exatamente os que ainda podem ser reentregues.
        if (processedMessageIds.size > 2000) {
          const recentes = [...processedMessageIds].slice(-1000);
          processedMessageIds.clear();
          for (const id of recentes) processedMessageIds.add(id);
        }
      }

      const phone = message.from;
      if (!phone) continue;

      // Cada mensagem no seu próprio try: sem isso, uma falha ao responder a
      // primeira abortaria o laço e as seguintes sumiriam sem deixar rastro.
      try {
        if (message.type === 'audio' || message.type === 'image') {
          await tratarMidia(phone, message);
          continue;
        }

        if (message.type !== 'text') {
          if (TIPOS_IGNORADOS.has(message.type)) continue;
          // Silêncio faz a pessoa achar que o bot morreu. Um aviso por lote:
          // quem mandou três áudios seguidos não precisa de três respostas iguais.
          if (jaAvisou) continue;
          jaAvisou = true;
          await ensureUser(phone);
          await replyWhatsApp(phone, msgTipoNaoSuportado(message.type));
          continue;
        }

        const text = message.text?.body;
        if (!text) continue;
        await processIncomingMessage(phone, text, 'texto');
      } catch (err) {
        console.error(`Falha ao tratar mensagem ${messageId || '(sem id)'}:`, err.message);
        // Silêncio é a pior resposta possível: a pessoa não sabe se o Guará
        // morreu, se ela escreveu errado, ou se o gasto foi anotado. A IA do
        // Google cai com alguma frequência no plano gratuito, e quando isso
        // acontece nas três tentativas ninguém avisava ninguém.
        try {
          await replyWhatsApp(phone, `Ops, deu erro aqui do meu lado. 😕\n\nMe manda essa mensagem de novo, por favor — não anotei nada ainda.`);
        } catch (falhaAoAvisar) {
          console.error('Nem o aviso de erro saiu:', falhaAoAvisar.message);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao processar webhook da Meta:', err.message);
  }
});


// Quando a mensagem chega pelo painel em vez do WhatsApp, as respostas são
// recolhidas aqui e devolvidas na resposta HTTP. É o que faz o painel ter
// exatamente as mesmas capacidades do chat sem reimplementar nenhuma delas:
// uma lógica só, dois jeitos de falar com ela.
const { AsyncLocalStorage } = require('async_hooks');
const respostasDoPainel = new AsyncLocalStorage();

async function coletandoRespostas(fn) {
  const caixa = [];
  await respostasDoPainel.run(caixa, fn);
  return caixa;
}

async function replyWhatsApp(to, body) {
  const caixa = respostasDoPainel.getStore();
  if (caixa) {
    caixa.push(body);
    return;
  }
  return enviarWhatsApp(to, body);
}

async function enviarWhatsApp(to, body) {
  await axios.post(
    `https://graph.facebook.com/${META_API_VERSION || 'v21.0'}/${META_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      // preview_url faz o WhatsApp montar o cartão com ícone e título quando a
      // mensagem traz um link. Sem isso o endereço do painel chega como texto
      // pelado, e um link solto não convida ninguém a tocar.
      text: { body, preview_url: true },
    },
    {
      headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
      // Sem timeout, uma instabilidade da Meta deixa este await pendurado pra
      // sempre. O webhook já respondeu 200, então ninguém percebe — só o
      // processo, que vai segurando requisição morta até faltar memória.
      timeout: 15_000,
    }
  );
}

// Prova que o usuário logado é dono do número antes de vincular (envia um código de 6 dígitos via WhatsApp)
// Tudo que dá pra fazer conversando, dá pra fazer pelo painel. Mesma IA, mesma
// lógica, mesmas regras — o painel só troca o meio de entrada e de saída.
//
// Sem isto, cada coisa nova precisaria ser escrita duas vezes, e as duas
// versões divergiriam na primeira pressa.
const painelLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

// Carteiras pelo painel. Chama exatamente as mesmas funções que o WhatsApp
// chama — criar, renomear, apagar e trocar moram num lugar só, então as regras
// (limite, nome repetido, inicial maiúscula, não apagar a padrão) valem igual
// nos dois lados sem serem escritas duas vezes.
//
// Podia passar por /api/mensagem, mas gastaria uma chamada de IA pra executar
// algo que o botão já disse sem ambiguidade nenhuma.
app.post('/api/carteiras', painelLimiter, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) return res.sendStatus(401);

    const { data: perfil } = await supabaseAdmin
      .from('profiles').select('phone').eq('id', user.id).maybeSingle();
    if (!perfil?.phone) return res.status(400).json({ error: 'Vincule seu número primeiro.' });

    const acao = String(req.body?.acao || '');
    const nome = String(req.body?.nome || '').trim();
    const novoNome = String(req.body?.novoNome || '').trim();

    let r;
    if (acao === 'criar') r = await criarCarteira(perfil.phone, nome);
    else if (acao === 'renomear') r = await renomearCarteira(perfil.phone, nome, novoNome);
    else if (acao === 'apagar') r = await apagarCarteira(perfil.phone, nome);
    else if (acao === 'trocar') r = await trocarCarteira(perfil.phone, nome);
    else return res.status(400).json({ error: 'Ação desconhecida.' });

    // Os erros viram frase em português aqui, e não no painel, pra que a
    // explicação seja a mesma que a pessoa ouviria no WhatsApp.
    const EXPLICACAO = {
      sem_nome: 'Dê um nome pra carteira.',
      ja_existe: `Você já tem uma carteira chamada "${r.nome || novoNome || nome}".`,
      demais: `Você já tem ${LIMITE_CARTEIRAS} carteiras, que é o máximo.`,
      nao_achei: 'Não achei essa carteira.',
      e_a_padrao: `A carteira "${CARTEIRA_PADRAO}" não pode ser apagada — é onde tudo cai por padrão.`,
      ultima: 'Essa é sua única carteira.',
    };
    if (r.erro) return res.status(400).json({ error: EXPLICACAO[r.erro] || 'Não deu certo.' });

    const { ativa, carteiras } = await contextoDeCarteira(perfil.phone);
    res.json({ ok: true, ativa, carteiras, movidos: r.movidos ?? 0 });
  } catch (err) {
    console.error('Erro no /api/carteiras:', err.message);
    res.status(500).json({ error: 'Não consegui fazer isso agora.' });
  }
});

app.post('/api/mensagem', painelLimiter, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) return res.sendStatus(401);

    // O telefone vem do perfil, nunca do corpo do pedido: aceitar o número que
    // o cliente mandar deixaria qualquer pessoa logada mexer na conta alheia.
    const { data: perfil } = await supabaseAdmin
      .from('profiles').select('phone').eq('id', user.id).maybeSingle();
    if (!perfil?.phone) {
      return res.status(400).json({ error: 'Vincule seu número antes de usar o assistente.' });
    }

    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva alguma coisa.' });
    if (texto.length > 1000) return res.status(400).json({ error: 'Mensagem longa demais.' });

    const respostas = await coletandoRespostas(() => processIncomingMessage(perfil.phone, texto, 'painel'));
    res.json({ respostas });
  } catch (err) {
    console.error('Erro no /api/mensagem:', err.message);
    res.status(500).json({ error: 'Não consegui processar agora. Tenta de novo.' });
  }
});

app.post('/api/phone/request-code', authLimiter, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) return res.sendStatus(401);
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    // Formato que a Meta manda no webhook pra números BR: DDI(55) + DDD(2) + número(8), sem o 9 extra do celular.
    if (!/^55\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Número inválido. Use DDI 55 + DDD + número, sem o 9 extra (12 dígitos). Ex.: 555180562381.' });
    }

    if (!(await hasOpenWindow(phone))) {
      return res.status(400).json({
        error: 'Antes de pedir o código, manda qualquer mensagem (ex: "oi") pro Guará nesse número pelo WhatsApp. Depois volta aqui.',
      });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error } = await supabaseAdmin
      .from('phone_verifications')
      .upsert({ user_id: user.id, phone, code, attempts: 0, expires_at: expiresAt });
    if (error) throw error;

    // O código sai sozinho numa linha, em bloco monoespaçado. Não é o botão de
    // copiar do WhatsApp — esse só existe em template de autenticação, que é
    // categoria PAGA. Assim ao menos dá pra tocar e segurar em cima do bloco e
    // copiar só o número, sem levar o texto junto.
    await replyWhatsApp(phone, [
      '🔐 *Seu código do Guará*',
      '',
      '```',
      code,
      '```',
      '',
      '_Toque e segure no número acima pra copiar._',
      'Vale por 10 minutos. Não compartilhe com ninguém.',
    ].join(NL));
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao enviar código de verificação:', err.message);
    res.status(500).json({ error: 'Não foi possível enviar o código. Tente novamente.' });
  }
});

app.post('/api/phone/verify-code', authLimiter, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) return res.sendStatus(401);
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const code = String(req.body?.code || '').trim();
    // O código é sempre 6 dígitos. Validar o formato antes de ir ao banco
    // descarta lixo sem gastar consulta, e fecha a porta pra alguém mandar
    // um texto enorme só pra ver o que acontece.
    if (!/^55\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Dados incompletos.' });
    }

    const { data: verification, error: fetchError } = await supabaseAdmin
      .from('phone_verifications')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!verification || verification.phone !== phone) {
      return res.status(400).json({ error: 'Solicite um novo código para este número.' });
    }
    if (new Date(verification.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    }
    if (verification.attempts >= 5) {
      return res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });
    }
    if (verification.code !== code) {
      await supabaseAdmin.from('phone_verifications').update({ attempts: verification.attempts + 1 }).eq('user_id', user.id);
      return res.status(400).json({ error: 'Código incorreto.' });
    }

    const { error: upsertError } = await supabaseAdmin.from('profiles').upsert({ id: user.id, phone });
    if (upsertError) {
      // A mensagem crua do banco carrega nome de coluna, de constraint e outros
      // detalhes de schema. Isso serve pra depurar, não pra entregar a quem está
      // tentando entrar: vai pro log, e a pessoa recebe algo sobre o que possa
      // de fato agir.
      console.error('Falha ao vincular telefone:', upsertError.message);
      const duplicado = upsertError.message.includes('duplicate');
      return res.status(400).json({
        error: duplicado
          ? 'Esse número já está vinculado a outra conta.'
          : 'Não consegui vincular esse número. Tente de novo em instantes.',
      });
    }
    await supabaseAdmin.from('phone_verifications').delete().eq('user_id', user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao verificar código:', err.message);
    res.status(500).json({ error: 'Erro ao verificar o código. Tente novamente.' });
  }
});

// Qualquer rota que não seja /meta-webhook ou /api cai no dashboard Next.js (mesma porta, sem precisar de firewall novo)
// Durante uma publicação o painel reinicia por alguns segundos. Sem tratar isso,
// quem estivesse usando veria a tela de erro do navegador.
const PAGINA_ATUALIZANDO = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guará</title>
<meta http-equiv="refresh" content="3">
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#efe3d2; color:#191007; text-align:center; padding:1.5rem;
         font-family: system-ui, -apple-system, sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#14100b; color:#f7efe2; } }
  .caixa { max-width: 22rem; }
  h1 { font-size:1.6rem; margin:0 0 .6rem; letter-spacing:-.01em; }
  p { margin:0; font-size:1.05rem; opacity:.75; line-height:1.5; }
  .rodela { width:2.5rem; height:2.5rem; margin:0 auto 1.5rem; border-radius:50%;
            border:4px solid rgba(196,64,13,.25); border-top-color:#c4400d;
            animation: girar .9s linear infinite; }
  @keyframes girar { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .rodela { animation-duration: 3s; } }
</style></head>
<body><div class="caixa">
  <div class="rodela"></div>
  <h1>Já volto 🐺</h1>
  <p>Estou aplicando uma atualização. Esta página se recarrega sozinha em alguns segundos.</p>
</div></body></html>`;

app.use(
  createProxyMiddleware({
    target: process.env.FRONTEND_URL || 'http://frontend:3000',
    changeOrigin: true,
    on: {
      // Não entregar de bandeja qual tecnologia roda por trás.
      proxyRes: (proxyRes) => {
        delete proxyRes.headers['x-powered-by'];
      },
      error: (err, req, res) => {
        console.error('Painel indisponível:', err.message);
        if (res.headersSent || !res.writeHead) return;
        // 503 + Retry-After diz a buscadores e navegadores que é temporário.
        res.writeHead(503, {
          'Content-Type': 'text/html; charset=utf-8',
          'Retry-After': '5',
          'Cache-Control': 'no-store',
        });
        res.end(PAGINA_ATUALIZANDO);
      },
    },
  })
);


// ── A ÚLTIMA REDE ──────────────────────────────────────────────────
//
// Sem este bloco, um erro que escapa de um try/catch cai no handler padrão do
// Express — que, fora de NODE_ENV=production, devolve a STACK INTEIRA pro
// cliente. Medido: `throw new Error('SUPABASE_SERVICE_ROLE_KEY=...')` numa rota
// voltava com a mensagem e os caminhos do servidor no corpo da resposta.
//
// Depender do NODE_ENV pra isso é frágil: basta alguém subir o container sem a
// variável e o vazamento volta calado. Então o handler é explícito, e o
// NODE_ENV no Dockerfile é só a segunda camada.
//
// Precisa dos quatro argumentos: é assim que o Express reconhece um handler de
// erro. Tirar o `_next` quebra o reconhecimento, mesmo sem usá-lo.
app.use((err, req, res, _next) => {
  // Um número curto pra ligar o que a pessoa viu ao que ficou no log. Sem isto,
  // investigar um erro relatado é procurar agulha no palheiro.
  const marca = crypto.randomBytes(4).toString('hex');

  // No servidor, tudo. Aqui é onde se investiga.
  console.error(`[${marca}] erro não tratado em ${req.method} ${req.path}:`, err?.stack || err);

  if (res.headersSent) return;

  // Pro cliente, nada além do necessário. Nem mensagem do erro (pode conter
  // nome de tabela, trecho de SQL ou valor de variável), nem stack, nem tipo.
  res.status(500).json({
    error: 'Algo deu errado aqui do nosso lado. Tenta de novo em instantes.',
    codigo: marca,
  });
});

// Uma promise rejeitada sem catch DERRUBA o processo no Node moderno. Num
// servidor de WhatsApp isso significa: mensagens em voo perdidas, e o container
// reiniciando por causa de um erro que talvez nem importasse.
//
// Registrar e seguir é o certo aqui. O contrário — morrer — é o que um atacante
// procuraria: uma requisição que provoque a rejeição certa vira desligamento.
process.on('unhandledRejection', (motivo) => {
  console.error('Promise rejeitada sem tratamento:', motivo?.stack || motivo);
});

// Exceção não capturada é outra história: o processo pode estar num estado
// inconsistente, e continuar servindo seria pior. Registra e sai com código de
// erro, deixando o Docker subir um processo limpo.
process.on('uncaughtException', (erro) => {
  console.error('Exceção não capturada — encerrando pra subir limpo:', erro?.stack || erro);
  process.exit(1);
});

app.listen(PORT || 3001, () => {
  console.log(`Servidor rodando na porta ${PORT || 3001}`);

  // Quem pode responder hoje. Aparece no boot porque "o Guara esta burro" quase
  // sempre significa "a fila esta menor do que voce pensa" — e essa linha
  // responde isso em um segundo, sem precisar de chamada nenhuma.
  const fila = quemEstaNaFila();
  if (fila.length === 0) {
    console.error('ATENCAO: nenhum provedor de IA configurado. So a leitura simples vai funcionar.');
  } else {
    console.log('IA para TEXTO: ' + fila.map((p) => p.provedor).join(' -> '));
    for (const p of fila) console.log('   ' + p.provedor + ': ' + p.modelos.join(', '));
  }

  // Midia e outra fila, com outro criterio: nao ha escolha, so a Gemini le
  // audio e foto. Por isso ela vai pro FIM da fila de texto assim que houver
  // outro provedor — cada chamada dela gasta em texto e uma chamada roubada de
  // algo que so ela faz.
  const midia = quemLeMidia();
  if (midia.length === 0) {
    console.error('ATENCAO: nenhum provedor le audio/foto. Midia vai falhar e pedir texto.');
  } else {
    console.log('IA para AUDIO e FOTO: ' + midia.join(', '));
    if (fila.length > 1 && fila[fila.length - 1].provedor === midia[0]) {
      console.log('   (guardada pro fim no texto de proposito, pra sobrar cota pra midia)');
    }
  }
});
