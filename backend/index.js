require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { extractItems, transcreverAudio, lerImagem } = require('./ai-service');
const { baixarAudio, baixarImagem } = require('./media-service');
const { lerSemIA } = require('./leitura-simples');
const {
  saveTransaction,
  saveDebt,
  ensureUser,
  isPhoneLinked,
  sumTransactions,
  listRecentTransactions,
  sumOpenDebts,
  deleteLastEntry,
  saveInstallments,
  upcomingInstallments,
  saveSaving,
  savingsSummary,
  getCategories,
  markInstallmentPaid,
  saveRecurring,
  listRecurring,
  updateRecurring,
  savingsByJar,
  getGoal,
  saveGoal,
  apagarTudoDoTelefone,
  converterUltimoEmParcelamento,
  moverUltimoGuardado,
  moverUltimoParaCarteira,
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
  desmarcarParcela,
  quitarDivida,
  apagarItem,
  editarLancamento,
  renomearCofrinho,
  criarCategoria,
  apagarCategoria,
  converterUltimoEmRecorrente,
  supabaseAdmin,
} = require('./db-service');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// "2026-09-01" -> "setembro/2026"
function nomeDoMes(dueMonth) {
  const [ano, mes] = dueMonth.split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

const PAINEL_URL = 'https://guarapp.duckdns.org';

// Canal oficial de contato, o mesmo publicado na política e nos termos.
// Fica em constante porque estava escrito no meio de duas mensagens: numa
// troca de endereço, uma delas ficaria pra trás sem ninguém notar.
const EMAIL_CONTATO = 'guarafinancas@gmail.com';

// Mensagem 1: curta de propósito. O objetivo dela não é ensinar tudo — é fazer a
// pessoa RESPONDER. Quem responde já entrou; o resto ela descobre usando.
const MSG_APRESENTACAO = `Oii! 👋 Eu sou o *Guará* 🐺

Anoto seus gastos por aqui mesmo, no WhatsApp. Sem planilha, sem app pra baixar, sem complicação. 💙

*Experimenta agora:* me conta um gasto recente, do seu jeito.
Tipo: _"paguei 30 no mercado"_

Pode escrever torto, sem acento, com abreviação — eu entendo. 😉

_Preferir falar? Manda áudio. Tem o comprovante? Manda a foto._`;

// Mensagem 2: a conta é OPCIONAL e isso precisa ficar claro. Ela não é um pedágio
// pra usar o Guará — é o que destrava os gráficos. As regras de senha e formato de
// telefone ficam de fora: a própria tela já mostra cada uma na hora certa.
const MSG_CRIAR_CONTA = `*Ah, e fica tranquilo:* você *não precisa* criar conta pra me usar. 😊

Pode conversar comigo pra sempre assim, do jeito que está. Eu anoto tudo, respondo suas perguntas e nunca vou te cobrar cadastro.

*📊 O QUE A CONTA ADICIONA*

Se um dia quiser, ela destrava no site:
📈 Gráficos de pra onde seu dinheiro vai
📅 Navegar mês a mês, e ver o que já está parcelado
✏️ Editar e apagar lançamentos com o dedo
📗 Baixar tudo em planilha

*Se quiser criar (2 minutos, de graça):*
👉 ${PAINEL_URL}

1️⃣ Toque em *Criar conta*
2️⃣ Confirme o e-mail que eu mando _(olhe o spam 📬)_
3️⃣ Digite seu número e o código que eu te envio ✅

Sem pressa nenhuma. Pode ir me mandando seus gastos enquanto isso. 🐺

*📱 E se quiser o Guará na tela inicial:*
👉 ${PAINEL_URL}/instalar
_Dois toques, sem loja e sem ocupar espaço._

_Seus dados são só seus. O que eu guardo e por quê:_ ${PAINEL_URL}/privacidade`;

// Para quem já tem conta ligada e mandou algo que não era financeiro.
const MSG_NAO_ENTENDI = `Oi! 🐺 Não achei nenhum valor nessa mensagem.

Me conta assim que eu anoto na hora:
💸 "paguei 30 no xis"
💰 "recebi 500 do freela"
🤝 "devo 50 pro João"

Ou me pergunte: _"quanto gastei esse mês?"_
Digite *ajuda* pra ver tudo que eu faço. 😉`;

// Quem escreve "quero instalar o app" já decidiu. Abrir com "não precisa
// baixar nada" é discutir com o pedido da pessoa — ela perguntou COMO, não SE.
//
// O "não precisa de loja" continua aqui, mas como alívio depois da instrução,
// não como resposta no lugar dela.
const MSG_INSTALAR = `📱 *Bora deixar o Guará na sua tela inicial!*

Abre aqui que eu te mostro o passo a passo:
👉 ${PAINEL_URL}/instalar

A página reconhece se você está no Android ou no iPhone e mostra só os passos do seu — são dois toques.

Depois ele abre igual qualquer outro app, sem digitar endereço. 😉

_Não passa por loja nenhuma, não ocupa espaço, e você pode tirar quando quiser._`;

// A planilha sai do painel, não daqui: o arquivo é montado no navegador com os
// dados que já estão na tela. Mandar por WhatsApp exigiria gerar o arquivo no
// servidor e subir como mídia — e a pessoa ia receber um anexo que o WhatsApp
// abre mal. O link resolve, e ainda deixa ela escolher o mês.
// Quando a IA está fora e a frase é complicada demais pro leitor simples.
// Dizer O QUE dá pra fazer agora vale mais do que pedir desculpa: a pessoa
// consegue registrar do jeito curto e não perde o gasto.
const MSG_IA_FORA = `Tive um problema pra entender essa frase. 😕

*Enquanto isso, do jeito curto eu anoto:*
_"paguei 30 no mercado"_
_"recebi 500"_
_"guardei 200"_

Frases mais compridas eu volto a entender já já.`;

const MSG_SEM_COTA = `Bati o limite de mensagens do dia pra entender frase complicada. 😅

*Mas do jeito curto eu continuo anotando:*
_"paguei 30 no mercado"_
_"recebi 500"_
_"guardei 200"_

Amanhã cedo volto ao normal — e nada do que você já mandou se perdeu.`;

const MSG_CONVERSA = `Tô por aqui! 🐺

Manda o gasto quando quiser, do seu jeito — escrito, por áudio, ou foto do comprovante.

Digite *ajuda* pra ver tudo que eu faço.`;

const MSG_PLANILHA = `📗 *Sua planilha está no painel*

Abre aqui e toca em *Baixar planilha*:
👉 ${PAINEL_URL}

Vem tudo: gastos, entradas, dívidas, parcelas e cofrinhos — do mês que você escolher.

_Precisa da conta criada pra abrir o painel._`;

const MSG_APAGAR_CONFIRMA = `⚠️ *Isso apaga tudo, e não tem volta.*

Vou remover todos os seus lançamentos, dívidas, parcelas, cofrinhos, metas e categorias. O vínculo com o painel também sai.

Se tiver certeza, responda exatamente:
*APAGAR TUDO*

Qualquer outra coisa cancela.

_Quer levar seus dados antes? Baixe a planilha no painel:_ ${PAINEL_URL}`;

const MSG_APAGAR_CANCELADO = `Tudo certo, não apaguei nada. 😌

Seus dados continuam onde estavam.`;

const MSG_AJUDA = `*🐺 O QUE EU SEI FAZER*

*💸 Anotar seus gastos*
"paguei 30 no xis"
"gastei 55 no mercado"
"uber 22 reais"

*💰 Anotar o que entrou*
"recebi 500 do freela"
"caiu meu salário de 2000"

*🤝 Anotar combinados*
"o João me deve 50"
"devo 120 pra Maria"

*🔁 Gastos que se repetem*
"todo mês pago 50 de Netflix"
"todo dia 10 pago 1200 de aluguel"
"muda o salário pro dia 5"

*💳 Anotar parcelamentos*
"comprei uma TV em 6x de 200"
"parcelei o celular em 10x de 150"
"paguei a parcela da TV"

*🐷 Guardar dinheiro*
"guardei 200"
"guardei 100 no cofrinho da viagem"
"tirei 100 do guardado"

*🎯 Definir metas*
"quero guardar 300 por mês"
"quero juntar 5000 pra viagem"

*📊 Responder suas perguntas*
"quanto gastei esse mês?"
"qual meu saldo?"
"quanto gastei com comida?"
"quanto entrou essa semana?"
"quanto eu devo?"
"quanto tenho guardado?"
"quais minhas parcelas?"
"meus últimos gastos"

*🔄 Reclassificar o que já mandou*
"está parcelado" _(eu pergunto em quantas vezes)_
"isso é todo mês"

*↩️ Corrigir e apagar*
"apaga o último"
"aquele mercado era 45"
"apaga o gasto do mercado"
"cancela a Netflix"
"cancela o parcelamento da TV"
"não paguei aquela parcela"

*🤝 Quando a dívida é paga*
"o João me pagou"
"quitei a dívida da Maria"

*🏷️ Suas categorias*
"cria a categoria Pets"
"apaga a categoria Viagem"

*🐷 Organizar os cofrinhos*
"renomeia o secador pra casa nova"

*🎧 Mandar áudio ou foto*
Grava um áudio contando o gasto
Manda foto do comprovante, nota ou print do PIX

*👛 Separar trabalho de pessoal*
"cria uma carteira da empresa"
"muda pra empresa"
"gastei 200 na empresa"
"esse foi da empresa" _(move o último)_
"quais minhas carteiras"

*📗 Levar seus dados*
"me manda a planilha"

*📱 Ter o app no celular*
"tem app?"
"quero instalar no celular"

*🗑️ Apagar tudo que tenho de você*
"quero apagar meus dados"

Pode falar do seu jeito, sem acento e com abreviação — eu entendo. 😉

Seu painel: ${PAINEL_URL}
Privacidade: ${PAINEL_URL}/privacidade`;

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

const NL = String.fromCharCode(10);

const currency = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Evita reprocessar a mesma mensagem se o WhatsApp reentregar o webhook (in-memory, por processo)
const processedMessageIds = new Set();

// Resposta ao "isso é todo mês?". Um "sim" sozinho não tem como ser entendido
// por IA nenhuma — não há nada na frase pra classificar. Aqui é o texto cru que
// decide, do mesmo jeito que a confirmação de apagar tudo.
const SIM = /^(sim|isso|isso ai|isso aí|é sim|eh sim|s|ss|aham|uhum|claro|pode|pode deixar|pode sim|todo mes|todo mês|é mensal|eh mensal|confirmo|positivo|yes|ok|blz|beleza)[.!]*$/i;
const NAO = /^(n|nao|não|nn|negativo|so esse mes|só esse mês|so esse|nao é|não é|nope|no)[.!]*$/i;

// Resolve em qual carteira esta mensagem vai cair, e roda o atendimento
// inteiro dentro desse contexto. Quem nunca criou uma segunda carteira nem
// percebe: cai sempre na padrão.
async function processIncomingMessage(phone, text) {
  await ensureUser(phone);
  const { ativa } = await contextoDeCarteira(phone);
  return comCarteira(ativa, () => atenderMensagem(phone, text, ativa));
}

async function atenderMensagem(phone, text, carteiraAtiva) {

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
    // O bot já funciona sem conta nenhuma, então a apresentação convida a usar
    // AGORA. O cadastro só é pedido depois do primeiro gasto registrado.
    if (await isPhoneLinked(phone)) {
      await replyWhatsApp(phone, MSG_NAO_ENTENDI);
    } else {
      await replyWhatsApp(phone, MSG_APRESENTACAO);
      await replyWhatsApp(phone, MSG_CRIAR_CONTA);
    }
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
    await replyWhatsApp(phone, MSG_CONVERSA);
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
    if (text.trim().toUpperCase() === 'APAGAR TUDO') {
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
    await replyWhatsApp(phone, MSG_APAGAR_CONFIRMA);
    return;
  }

  // A confirmação chega como mensagem solta, sem a IA reconhecer como intenção.
  // Sem isto, quem escreve "APAGAR TUDO" receberia "não entendi".
  if (text.trim().toUpperCase() === 'APAGAR TUDO') {
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
  const semValor = items.filter(
    (i) => ['transacao', 'guardado', 'divida'].includes(i.kind) && !(Number(i.amount) > 0)
  );
  if (semValor.length === items.length && items.length > 0) {
    await replyWhatsApp(phone, [
      'Entendi o que você quis dizer, mas não achei o valor. 🤔',
      '',
      'Me manda com o número, tipo:',
      '_"paguei 50 no mercado"_',
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

// Confirmação quando a mesma mensagem espalhou dinheiro por carteiras
// diferentes: agrupa por destino, senão a pessoa não tem como conferir.
function formatConfirmationPorCarteira(saved, ondeSalvou) {
  const grupos = new Map();
  saved.forEach((item, n) => {
    const carteira = ondeSalvou[n];
    if (!grupos.has(carteira)) grupos.set(carteira, []);
    grupos.get(carteira).push(item);
  });

  const partes = [`✅ *${saved.length} registrados*, em ${grupos.size} carteiras:`];
  for (const [carteira, itens] of grupos) {
    partes.push('', `👛 *${carteira}*`, ...itens.map((i) => formatLine(i)));
  }
  return partes.join(NL);
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

async function confirmarGuardado(phone, item) {
  const { total, noMes } = await savingsSummary(phone);
  const meta = await getGoal(phone);

  const partes = [];
  const nomePote = (item.jar || '').trim();
  const ondePote = nomePote ? ` no cofrinho *${nomePote}*` : '';
  if (item.direction === 'retirar') {
    partes.push(`↩️ Tirei R$ ${currency.format(item.amount)}${ondePote}.`);
  } else {
    partes.push(`🐷 Guardei R$ ${currency.format(item.amount)}${ondePote}!`);
  }
  partes.push('', `*Você tem guardado:* R$ ${currency.format(total)}`);

  // Guardar tira do saldo do mês. Sem dizer aqui, a pessoa só descobriria
  // olhando o painel, e acharia que sumiu dinheiro.
  const { saldo } = await sumTransactions(phone, 'mes');
  partes.push(`*Saldo do mês:* R$ ${currency.format(saldo)}`);

  const alvo = Number(meta?.monthly_target) || 0;
  if (alvo > 0) {
    const falta = alvo - noMes;
    partes.push('', `🎯 *Meta do mês:* R$ ${currency.format(alvo)}`);
    partes.push(`Já guardou R$ ${currency.format(noMes)} este mês.`);
    partes.push(falta <= 0
      ? '✅ Meta batida! Mandou bem! 🎉'
      : `Faltam R$ ${currency.format(falta)} pra bater. Bora! 💪`);
  }

  const objetivo = Number(meta?.goal_target) || 0;
  if (objetivo > 0) {
    const pct = Math.min(100, Math.round((total / objetivo) * 100));
    partes.push('', `🏁 *${meta.goal_name || 'Objetivo'}:* R$ ${currency.format(total)} de R$ ${currency.format(objetivo)} (${pct}%)`);
  }

  return partes.join('\n');
}

async function responderRecorrente(phone, itens) {
  const validos = (itens || []).filter((i) => i.amount > 0);
  if (validos.length === 0) {
    return 'Não entendi o valor. 🤔\nTenta assim: _"todo mês pago 50 de Netflix"_';
  }

  const salvos = [];
  for (const item of validos) {
    try {
      salvos.push(await saveRecurring(phone, item));
    } catch (err) {
      console.error('Falha ao salvar recorrente:', item.description, err.message);
    }
  }
  if (salvos.length === 0) {
    return 'Não consegui anotar agora. 😕\nTenta de novo daqui a pouco, por favor.';
  }

  const partes = [];
  if (salvos.length === 1) {
    const s = salvos[0];
    const verbo = s.type === 'receita' ? 'Recebimento' : 'Gasto';
    partes.push(
      s.atualizado ? `🔁 *${verbo} mensal atualizado!*` : `🔁 *${verbo} mensal anotado!*`,
      '',
      `${s.description} — R$ ${currency.format(Number(s.amount))}`,
      `Todo dia *${s.day_of_month}* eu lanço sozinho pra você. 😉`
    );
  } else {
    const novos = salvos.filter((s) => !s.atualizado).length;
    const mexidos = salvos.length - novos;
    const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;
    const titulo = mexidos === 0 ? `${salvos.length} lançamentos mensais anotados!`
      : novos === 0 ? `${salvos.length} lançamentos mensais atualizados!`
      : `${plural(novos, 'anotado', 'anotados')} e ${plural(mexidos, 'atualizado', 'atualizados')}!`;
    partes.push(`🔁 *${titulo}*`, '');
    for (const s of salvos) {
      partes.push(`${s.type === 'receita' ? '💰' : '💸'} ${s.description} — R$ ${currency.format(Number(s.amount))} _(dia ${s.day_of_month})_`);
    }
    partes.push('', 'Eu lanço todos sozinho, no dia certo. 😉');
  }

  // Separar gasto de entrada: somar tudo junto daria um número que não significa nada.
  const lista = await listRecurring(phone);
  const soma = (tipo) => lista.filter((r) => r.type === tipo).reduce((s, r) => s + Number(r.amount), 0);
  const despesas = lista.filter((r) => r.type === 'despesa');
  const receitas = lista.filter((r) => r.type === 'receita');

  if (lista.length > salvos.length) {
    partes.push('', '*📋 SEU MÊS FIXO*');
    if (despesas.length) partes.push(`💸 ${despesas.length} gasto${despesas.length > 1 ? 's' : ''} — R$ ${currency.format(soma('despesa'))}`);
    if (receitas.length) partes.push(`💰 ${receitas.length} entrada${receitas.length > 1 ? 's' : ''} — R$ ${currency.format(soma('receita'))}`);
    const sobra = soma('receita') - soma('despesa');
    if (receitas.length && despesas.length) {
      partes.push(sobra >= 0
        ? `✅ Sobram R$ ${currency.format(sobra)} por mês`
        : `⚠️ Faltam R$ ${currency.format(Math.abs(sobra))} por mês`);
    }
  }
  return partes.join('\n');
}

async function responderEditarRecorrente(phone, itens) {
  const pedidos = (itens || []).filter((i) => i.dayOfMonth > 0 || i.amount > 0);
  if (pedidos.length === 0) {
    return 'Não entendi o que mudar. 🤔\nTenta assim: _"muda o salário pro dia 5"_ ou _"o aluguel agora é 1300"_.';
  }

  // "muda a Netflix, o Prime e a Vivo pro dia 11" chega como três pedidos.
  // Cada um mexe no seu, e o Set evita contar duas vezes se dois pedidos
  // acabarem caindo no mesmo lançamento.
  const alvos = [];
  const vistos = new Set();
  const naoAchados = [];

  for (const pedido of pedidos) {
    let r;
    try {
      r = await updateRecurring(phone, pedido);
    } catch (err) {
      console.error('Falha ao editar recorrente:', pedido.description, err.message);
      naoAchados.push(pedido.description || '');
      continue;
    }
    if (!r) {
      naoAchados.push(pedido.description || '');
      continue;
    }
    for (const a of r.alvos) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      alvos.push(a);
    }
  }

  if (alvos.length === 0) {
    const nome = naoAchados.find(Boolean);
    return nome
      ? `Não achei nenhum lançamento mensal de "${nome}". 🤔`
      : 'Você ainda não tem nenhum lançamento mensal cadastrado.\nPra criar: _"todo mês pago 50 de Netflix"_';
  }

  const partes = [];
  if (alvos.length === 1) {
    const a = alvos[0];
    partes.push(
      '✏️ *Corrigido!*',
      '',
      `${a.description} — R$ ${currency.format(Number(a.amount))}`,
      `Agora eu lanço todo dia *${a.day_of_month}*. 😉`
    );
  } else {
    // Em lote a pessoa não vê o que foi tocado — listar tudo é o que deixa ela
    // perceber na hora se eu peguei um lançamento que não era pra pegar.
    partes.push(`✏️ *${alvos.length} lançamentos corrigidos!*`, '');
    for (const a of alvos) {
      partes.push(`${a.type === 'receita' ? '💰' : '💸'} ${a.description} — R$ ${currency.format(Number(a.amount))} _(dia ${a.day_of_month})_`);
    }
    partes.push('', 'Se peguei algum sem querer, é só me falar qual. 😉');
  }

  // Mudar três de quatro e só confirmar os três é o bug que estamos corrigindo.
  const perdidos = naoAchados.filter(Boolean);
  if (perdidos.length) {
    partes.push('', `⚠️ Não achei lançamento mensal de: *${perdidos.join('*, *')}*`);
  }
  return partes.join('\n');
}

// "24,90 Amazon Kindle" quase sempre se repete todo mês, mas assumir isso
// sozinho criaria uma conta mensal que a pessoa não pediu — e ela só
// descobriria no mês seguinte. Então pergunta, e um "sim" resolve.
// "gastei 50 ontem" entra em ontem. Sem dizer isso, a pessoa procura o
// lançamento no dia de hoje, não acha, e conclui que não foi salvo.
// Leitura sem IA acerta o valor, mas a categoria é chute de palavra-chave.
// Dizer isso deixa a pessoa conferir em vez de descobrir depois no gráfico.
function avisoDeLeituraSimples(saved) {
  if (!saved.some((i) => i.simples)) return '';
  return `${NL}_(li do jeito simples, a IA está fora — confere a categoria)_`;
}

function avisoDeData(saved) {
  const dias = saved.map((i) => Number(i.diasAtras) || 0).filter((d) => d > 0);
  if (dias.length === 0) return '';

  const quando = new Date(Date.now() - Math.max(...dias) * 24 * 60 * 60 * 1000);
  const dia = String(quando.getUTCDate()).padStart(2, '0');
  const mes = String(quando.getUTCMonth() + 1).padStart(2, '0');
  return `${NL}_(lancei em ${dia}/${mes})_`;
}

async function perguntaDeAssinatura(phone, saved) {
  if (saved.length !== 1) return '';
  const item = saved[0];
  if (item.kind !== 'transacao' || !item.assinatura) return '';

  // Se já existe recorrente com esse nome, a pergunta seria repetitiva —
  // e a resposta "sim" só sobrescreveria o que já está certo.
  const jaTem = await listRecurring(phone);
  const nome = (item.description || '').toLowerCase();
  if (jaTem.some((r) => nome.includes(r.description.toLowerCase()) || r.description.toLowerCase().includes(nome))) {
    return '';
  }

  return `\n\n_Isso é todo mês?_ Responde *sim* que eu deixo automático. 🔁`;
}

// ── CARTEIRAS ──────────────────────────────────────────────────────
// Separar o dinheiro de casa do dinheiro do trabalho. Quem nunca pedir uma
// segunda carteira nunca vê nada disto — nem uma linha a mais nas respostas.

function listaDeCarteiras(carteiras, ativa) {
  return carteiras.map((c) => (c === ativa ? `• *${c}* ← você está aqui` : `• ${c}`)).join(NL);
}

// "Esse foi da empresa" logo depois de lançar. Sem isto, consertar exigia
// apagar e redigitar — e ninguém faz isso, deixa errado.
async function responderMoverCarteira(phone, item, ativa) {
  if (!item.para) {
    const { carteiras } = await contextoDeCarteira(phone);
    return ['Pra qual carteira?', '', listaDeCarteiras(carteiras, ativa)].join(NL);
  }

  const r = await moverUltimoParaCarteira(phone, item.para);
  if (r.erro === 'nao_achei') {
    return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
  }
  if (r.erro === 'nada_recente') {
    return 'Não achei nenhum lançamento recente pra mover. 🤔';
  }
  if (r.jaEstava) return `Esse já está na *${r.alvo}*. 👛`;

  const nome = r.reg.description || r.reg.person || 'o lançamento';
  return [
    '👛 *Movido!*',
    '',
    `${nome} — R$ ${currency.format(Number(r.reg.amount))}`,
    `${r.de} → *${r.para}*`,
  ].join(NL);
}

async function responderCarteira(phone, item, ativa) {
  const { acao, nome, novoNome } = item;

  if (acao === 'listar') {
    const { carteiras } = await contextoDeCarteira(phone);
    if (carteiras.length === 1) {
      return [
        `Você tem uma carteira só: *${carteiras[0]}*. 👛`,
        '',
        'Dá pra separar o dinheiro do trabalho do dinheiro de casa, se quiser. É só dizer:',
        '_"cria uma carteira da empresa"_',
        '',
        '_Cada carteira tem saldo, gastos e cofrinhos próprios._',
      ].join(NL);
    }
    return [
      '👛 *Suas carteiras*',
      '',
      listaDeCarteiras(carteiras, ativa),
      '',
      'Pra mudar: _"muda pra ' + carteiras.find((c) => c !== ativa) + '"_',
      'Pra lançar sem mudar: _"gastei 50 na ' + carteiras.find((c) => c !== ativa) + '"_',
    ].join(NL);
  }

  if (acao === 'criar') {
    if (!nome) {
      return [
        'Boa ideia! 👛 Como você quer chamar a carteira nova?',
        '',
        'Me diz tipo: _"cria a carteira Empresa"_',
      ].join(NL);
    }
    const r = await criarCarteira(phone, nome);
    if (r.erro === 'ja_existe') return `Você já tem a carteira *${r.nome}*. 😉 Pra ir pra ela: _"muda pra ${r.nome}"_`;
    if (r.erro === 'demais') {
      return [
        `Você já tem ${r.carteiras.length} carteiras, que é o máximo. 😅`,
        '',
        listaDeCarteiras(r.carteiras, ativa),
        '',
        'Apaga uma que não usa pra abrir espaço — o dinheiro dela não some, volta pra *' + CARTEIRA_PADRAO + '*.',
      ].join(NL);
    }
    if (r.erro) return 'Como você quer chamar a carteira? Me diz tipo: _"cria a carteira Empresa"_';

    // Criar não troca de contexto, e isso precisa ficar explícito: quem achasse
    // que entrou nela mandaria o próximo gasto pensando que vai pra lá.
    return [
      `👛 *Carteira ${r.nome} criada!*`,
      '',
      `Você continua na *${ativa}* — nada mudou de lugar.`,
      '',
      `Pra lançar nela: _"gastei 50 na ${r.nome.toLowerCase()}"_`,
      `ou _"nessa mesma carteira, gastei 50"_`,
      `Pra ficar nela: _"muda pra ${r.nome.toLowerCase()}"_`,
    ].join(NL);
  }

  if (acao === 'trocar') {
    const r = await trocarCarteira(phone, nome);
    if (r.erro === 'nao_achei') {
      return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
    }
    if (r.jaEstava) return `Você já está na *${r.nome}*. 👛`;
    return [
      `👛 Agora você está na carteira *${r.nome}*.`,
      '',
      'Tudo que você mandar daqui pra frente cai aqui.',
    ].join(NL);
  }

  if (acao === 'renomear') {
    const r = await renomearCarteira(phone, nome, novoNome);
    if (r.erro === 'sem_nome') return 'Qual o nome novo? Me diz tipo: _"renomeia a carteira empresa pra loja"_';
    if (r.erro === 'ja_existe') return `Você já tem uma carteira chamada *${r.nome}*. Escolhe outro nome.`;
    if (r.erro) return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
    return `👛 A carteira *${r.de}* agora se chama *${r.para}*.${NL}${NL}Nada foi movido — só o nome mudou.`;
  }

  // apagar
  const r = await apagarCarteira(phone, nome);
  if (r.erro === 'e_a_padrao') return `A *${CARTEIRA_PADRAO}* não dá pra apagar — é onde tudo cai por padrão. 🙂`;
  if (r.erro === 'ultima') return 'Essa é sua única carteira, não dá pra apagar. 🙂';
  if (r.erro) return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
  return [
    `👛 Carteira *${r.nome}* apagada.`,
    '',
    r.movidos > 0
      ? `Os ${r.movidos} lançamentos dela foram pra *${CARTEIRA_PADRAO}* — nada foi perdido.`
      : 'Ela estava vazia, então não movi nada.',
  ].join(NL);
}

// Lista as opções quando a frase não decidiu qual item era. Perguntar custa
// uma mensagem; apagar o errado custa a confiança.
function listarOpcoes(opcoes, verbo) {
  return [
    `Achei mais de um. Qual deles você quer ${verbo}? 🤔`,
    '',
    ...opcoes.map((o) => {
      const nome = o.description || o.person || o.jar || 'sem nome';
      return `• *${nome}* — R$ ${currency.format(Number(o.amount))}`;
    }),
    '',
    'Me responde com o nome de um deles.',
  ].join(NL);
}

async function responderEditarLancamento(phone, item) {
  const r = await editarLancamento(phone, item);

  if (r.semMudanca) {
    return [
      'Entendi que você quer corrigir, mas não achei o que mudar. 🤔',
      '',
      'Me diz o valor novo, tipo: _"aquele mercado era 45"_',
    ].join(NL);
  }
  if (r.opcoes.length > 0) return listarOpcoes(r.opcoes, 'corrigir');
  if (!r.depois) {
    return [
      `Não achei nenhum lançamento com esse nome. 🤔`,
      '',
      'Tenta me dizer do jeito que você anotou, ou peça _"meus últimos gastos"_ pra ver a lista.',
    ].join(NL);
  }

  const { antes, depois } = r;
  const mudou = [];
  if (Number(antes.amount) !== Number(depois.amount)) {
    mudou.push(`R$ ${currency.format(Number(antes.amount))} → *R$ ${currency.format(Number(depois.amount))}*`);
  }
  if (antes.category !== depois.category) mudou.push(`${antes.category} → *${depois.category}*`);
  if (antes.description !== depois.description) mudou.push(`${antes.description} → *${depois.description}*`);

  return ['✏️ *Corrigido!*', '', depois.description, ...mudou].join(NL);
}

const NOME_DO_TIPO = {
  lancamento: 'lançamento',
  divida: 'dívida',
  recorrente: 'conta mensal',
  parcelamento: 'parcelamento',
  guardado: 'guardado',
};

async function responderApagarItem(phone, item) {
  const r = await apagarItem(phone, item.tipo, item.description);
  if (r.opcoes.length > 0) return listarOpcoes(r.opcoes, 'apagar');

  const rotulo = NOME_DO_TIPO[item.tipo] || 'lançamento';
  if (!r.alvo) {
    return [
      `Não achei nenhum(a) ${rotulo} com esse nome. 🤔`,
      '',
      'Confere o nome e me manda de novo — ou digite *ajuda* pra ver o que dá pra fazer.',
    ].join(NL);
  }

  const nome = r.alvo.description || r.alvo.person || r.alvo.jar || rotulo;
  const valor = `R$ ${currency.format(Number(r.alvo.amount))}`;

  if (item.tipo === 'recorrente') {
    return `🚫 *${nome}* cancelado.${NL}${NL}Não lanço mais os ${valor} todo mês. O que já foi lançado antes continua no histórico.`;
  }
  if (item.tipo === 'parcelamento') {
    return `🚫 Parcelamento de *${nome}* cancelado.${NL}${NL}Tirei as ${r.alvo.installments_total} parcelas de ${valor}.`;
  }
  return `🗑️ Apaguei: *${nome}* — ${valor}.`;
}

async function responderQuitarDivida(phone, item) {
  const r = await quitarDivida(phone, item.description);
  if (r.opcoes.length > 0) return listarOpcoes(r.opcoes, 'quitar');
  if (!r.alvo) {
    return [
      'Não achei nenhuma dívida em aberto com esse nome. 🤔',
      '',
      'Pergunta _"quanto eu devo?"_ que eu te mostro as que estão abertas.',
    ].join(NL);
  }

  const { aReceber, aPagar } = await sumOpenDebts(phone);
  const quem = r.alvo.person || 'essa dívida';
  const valor = `R$ ${currency.format(Number(r.alvo.amount))}`;
  const cabeca = r.alvo.direction === 'a_receber'
    ? `🤝 *${quem} te pagou!*${NL}${NL}${valor} quitados.`
    : `🤝 *Dívida quitada!*${NL}${NL}Você pagou ${valor} pra ${quem}.`;

  const sobra = [];
  if (aReceber > 0) sobra.push(`Ainda têm a te pagar: R$ ${currency.format(aReceber)}`);
  if (aPagar > 0) sobra.push(`Você ainda deve: R$ ${currency.format(aPagar)}`);
  return sobra.length ? [cabeca, '', ...sobra].join(NL) : `${cabeca}${NL}${NL}Não sobrou nenhuma dívida em aberto. 🎉`;
}

async function responderDesmarcarParcela(phone, item) {
  const alvo = await desmarcarParcela(phone, item.description);
  if (!alvo) {
    return [
      'Não achei nenhuma parcela marcada como paga pra desmarcar. 🤔',
      '',
      'Pergunta _"quais minhas parcelas?"_ que eu te mostro como estão.',
    ].join(NL);
  }
  return [
    '↩️ *Desmarquei!*',
    '',
    `${alvo.description} — parcela ${alvo.installment_number} de ${alvo.installments_total}`,
    `R$ ${currency.format(Number(alvo.amount))} voltou pra lista de parcelas em aberto.`,
  ].join(NL);
}

async function responderRenomearCofrinho(phone, item) {
  if (!item.para) {
    return 'Como você quer chamar o cofrinho? Me diz tipo: _"renomeia o secador pra casa nova"_';
  }
  const r = await renomearCofrinho(phone, item.de, item.para);
  if (!r) {
    const potes = await savingsByJar(phone);
    if (potes.length === 0) return 'Você ainda não tem nenhum cofrinho. 🐷 Guarde algo primeiro, tipo _"guardei 100 na viagem"_.';
    return [
      'Não achei esse cofrinho. 🤔 Os seus são:',
      '',
      ...potes.map((x) => `• *${x.nome}* — R$ ${currency.format(x.total)}`),
    ].join(NL);
  }
  return `🐷 Pronto! O cofrinho *${r.de}* agora se chama *${r.para}*.${NL}${NL}Os R$ ${currency.format(r.total)} continuam lá.`;
}

async function responderCategoria(phone, item) {
  if (!item.nome) return 'Qual categoria? Me diz tipo: _"cria a categoria Pets"_';

  if (item.acao === 'apagar') {
    const alvo = await apagarCategoria(phone, item.nome);
    if (!alvo) {
      const atuais = await getCategories(phone);
      return atuais.length
        ? ['Não achei essa categoria. 🤔 As suas são:', '', ...atuais.map((c) => `• ${c}`)].join(NL)
        : 'Você ainda não criou nenhuma categoria própria. 🏷️';
    }
    return `🏷️ Categoria *${alvo.name}* apagada.${NL}${NL}_Os lançamentos que estavam nela continuam onde estão._`;
  }

  const r = await criarCategoria(phone, item.nome);
  if (!r) return 'Qual categoria? Me diz tipo: _"cria a categoria Pets"_';
  return r.jaExistia
    ? `Você já tem a categoria *${r.nome}*. 😉 Pode usar à vontade.`
    : `🏷️ Categoria *${r.nome}* criada!${NL}${NL}Agora é só usar: _"paguei 50 em ${r.nome.toLowerCase()}"_`;
}

// O gráfico do painel, em texto. Barras de blocos porque é o que o WhatsApp
// desenha igual em qualquer aparelho — emoji e tabela quebram o alinhamento.
async function responderResumo(phone, period) {
  const { saidas, entradas, categorias, label } = await sumTransactions(phone, period || 'mes');
  const cats = (categorias || []).filter((c) => c.valor > 0);

  if (cats.length === 0) {
    return `Ainda não tem gasto nenhum ${rotuloPeriodo(period, label)} pra resumir. 🐺`;
  }

  // Barra de blocos porque é o único desenho que o WhatsApp alinha igual em
  // qualquer aparelho — tabela e emoji quebram dependendo da fonte.
  const LARGURA = 10;
  const maior = cats[0].valor;
  const linhas = cats.slice(0, 8).map(({ nome, valor }) => {
    const cheios = Math.max(1, Math.round((valor / maior) * LARGURA));
    const fatia = saidas > 0 ? Math.round((valor / saidas) * 100) : 0;
    const barra = '▓'.repeat(cheios) + '░'.repeat(LARGURA - cheios);
    return `${barra}  ${fatia}%${NL}*${nome}* — R$ ${currency.format(valor)}`;
  });

  const partes = [
    `*📊 PRA ONDE FOI O DINHEIRO*`,
    `_${rotuloPeriodo(period, label)}_`,
    '',
    linhas.join(NL + NL),
    '',
    `Total que saiu: *R$ ${currency.format(saidas)}*`,
  ];
  if (entradas > 0) partes.push(`Total que entrou: R$ ${currency.format(entradas)}`);
  if (cats.length > 8) partes.push(`_(+ ${cats.length - 8} categorias menores)_`);
  partes.push('', `Gráfico colorido no painel 👉 ${PAINEL_URL}`);
  return partes.join(NL);
}

// O sumTransactions já devolve um label pronto pro período pedido, inclusive
// pra mês nomeado ("em junho"). Usar o dele evita que dois lugares tenham
// opinião diferente sobre como se chama o mesmo pedaço de tempo.
function rotuloPeriodo(period, labelDoBanco) {
  if (labelDoBanco) return labelDoBanco;
  if (period === 'mes_passado') return 'no mês passado';
  if (period === 'semana') return 'nesta semana';
  if (period === 'tudo') return 'no total';
  return 'neste mês';
}

async function responderConverter(phone, item) {
  const ehParcela = item.para === 'parcelamento';

  // Faltou o número: PERGUNTA, em vez de errar um palpite. A resposta curta
  // ("6x", "dia 10") volta como converter_ultimo e cai aqui completa.
  if (ehParcela && item.installments <= 0) {
    return `Beleza, vou marcar como parcelado. 💳

*Em quantas vezes?*
Me responde só o número, tipo: _"6x"_`;
  }
  if (!ehParcela && item.dayOfMonth <= 0 && item.amount <= 0) {
    return `Entendi, é uma conta que se repete todo mês. 🔁

*Cai em que dia?*
Me responde tipo: _"dia 10"_

Se não souber o dia certo, é só dizer _"não sei"_ que eu uso o de hoje.`;
  }

  const r = ehParcela
    ? await converterUltimoEmParcelamento(phone, item)
    : await converterUltimoEmRecorrente(phone, item);

  if (!r) {
    return `Não achei nenhum lançamento recente pra converter. 🤔

Me manda o gasto primeiro, tipo _"IPTU 200"_, e aí me diz que é parcelado.`;
  }

  if (ehParcela) {
    const total = r.valorParcela * r.installments;
    const proximas = await upcomingInstallments(phone, 3);
    const partes = [
      '💳 *Convertido em parcelamento!*',
      '',
      `${r.origem.description || r.origem.category} — ${r.installments}x de R$ ${currency.format(r.valorParcela)}`,
      `Total: R$ ${currency.format(total)}`,
      '',
      'Espalhei as parcelas nos próximos meses. 📅',
    ];
    if (proximas.length > 0) {
      partes.push('', `Próxima em ${nomeDoMes(proximas[0].mes)}: R$ ${currency.format(proximas[0].total)}`);
    }
    partes.push('', `Veja mês a mês no painel 👉 ${PAINEL_URL}`);
    return partes.join('\n');
  }

  const rec = r.recorrente;
  return [
    '🔁 *Virou conta mensal!*',
    '',
    `${rec.description} — R$ ${currency.format(Number(rec.amount))}`,
    `Todo dia *${rec.day_of_month}* eu lanço sozinho pra você. 😉`,
    '',
    '_O lançamento de agora continua valendo: ele é o deste mês._',
  ].join('\n');
}

async function responderParcelaPaga(phone, itens) {
  const lista = itens?.length ? itens : [{ description: '' }];
  const pagas = [];
  const naoAchadas = [];

  for (const item of lista) {
    const paga = await markInstallmentPaid(phone, item.description);
    if (paga) pagas.push(paga);
    else naoAchadas.push(item.description || '');
  }

  if (pagas.length === 0) {
    const nome = naoAchadas.find(Boolean);
    return nome
      ? `Não achei nenhuma parcela em aberto de "${nome}". 🤔\nManda *"quais minhas parcelas"* que eu te mostro o que tem.`
      : 'Você não tem nenhuma parcela em aberto. 🎉';
  }

  const restantes = await upcomingInstallments(phone, 24);
  const total = restantes.reduce((s, m) => s + m.total, 0);

  const partes = [];
  if (pagas.length === 1) {
    const p = pagas[0];
    partes.push(
      '✅ *Parcela paga!*',
      `${p.description} — parcela ${p.installment_number} de ${p.installments_total}`,
      `R$ ${currency.format(Number(p.amount))}`
    );
  } else {
    partes.push(`✅ *${pagas.length} parcelas pagas!*`, '');
    for (const p of pagas) {
      partes.push(`• ${p.description} — ${p.installment_number}/${p.installments_total} — R$ ${currency.format(Number(p.amount))}`);
    }
  }

  // Quitar uma e ignorar a outra em silêncio deixaria a pessoa achando que
  // estava tudo certo até dar de cara com a parcela em aberto no painel.
  const perdidas = naoAchadas.filter(Boolean);
  if (perdidas.length) {
    partes.push('', `⚠️ Não achei parcela em aberto de: *${perdidas.join('*, *')}*`);
  }

  partes.push('', total > 0
    ? `Ainda faltam R$ ${currency.format(total)} em parcelas.`
    : 'Era a última! Você não tem mais nada parcelado. 🎉');

  // Parcela paga sai do saldo do mês em que vence. Dizer aqui evita a pessoa
  // ver o número mudar depois, no painel, sem entender o motivo.
  const { saldo } = await sumTransactions(phone, 'mes');
  partes.push(`*Saldo do mês:* R$ ${currency.format(saldo)}`);
  return partes.join('\n');
}

async function responderMeta(phone, item) {
  if (item.monthlyTarget <= 0 && item.goalTarget <= 0) {
    return 'Não entendi o valor da meta. 🤔\nTenta assim: _"quero guardar 200 por mês"_ ou _"quero juntar 5000 pra viagem"_.';
  }

  const salva = await saveGoal(phone, item);
  const { total } = await savingsSummary(phone);

  const partes = ['🎯 *Meta anotada!*', ''];
  if (Number(salva.monthly_target) > 0) {
    partes.push(`📅 Guardar *R$ ${currency.format(Number(salva.monthly_target))}* por mês.`);
  }
  if (Number(salva.goal_target) > 0) {
    const pct = Math.min(100, Math.round((total / Number(salva.goal_target)) * 100));
    partes.push(`🏁 Juntar *R$ ${currency.format(Number(salva.goal_target))}*${salva.goal_name ? ` pra ${salva.goal_name}` : ''}.`);
    partes.push(`Você já tem R$ ${currency.format(total)} (${pct}%).`);
  }
  partes.push('', 'Quando guardar, é só me falar: _"guardei 200"_ 🐷');
  return partes.join('\n');
}

// Cada parcela vira uma linha com o mês em que vence — é isso que permite
// navegar pros meses da frente e ver o que já está comprometido.
async function salvarParcelamento(phone, item) {
  return saveInstallments(phone, {
    description: item.description,
    category: item.category,
    installments: item.installments,
    installmentAmount: item.installmentAmount,
  });
}

async function responderDesfazer(phone) {
  const apagado = await deleteLastEntry(phone);
  if (!apagado) return 'Não achei nenhum registro seu pra apagar. 🤔';

  const { tipo, reg } = apagado;
  const valor = currency.format(Math.abs(Number(reg.amount)));
  let linha;

  if (tipo === 'transacao') {
    const sinal = reg.type === 'receita' ? '+' : '−';
    linha = `${reg.description || reg.category}\n${sinal}R$ ${valor} (${reg.category})`;
  } else if (tipo === 'guardado') {
    linha = `${Number(reg.amount) > 0 ? 'Guardado' : 'Retirada'} de R$ ${valor} do cofrinho`;
  } else if (tipo === 'divida') {
    linha = `${reg.direction === 'a_receber' ? 'A receber' : 'A pagar'}: R$ ${valor}${reg.person ? ` (${reg.person})` : ''}`;
  } else {
    linha = `${reg.description} — parcelamento inteiro (${reg.installments_total}x)`;
  }

  return `↩️ *Apaguei:*\n${linha}\n\nPode mandar de novo do jeito certo. 😉`;
}

async function responderConsulta(phone, consulta) {
  const { metric, period, category } = consulta;

  if (metric === 'dividas') {
    const { aReceber, aPagar, linhas } = await sumOpenDebts(phone);
    if (linhas.length === 0) return '🤝 Você não tem nenhum combinado em aberto. Tudo quitado! 🎉';

    const partes = ['*🤝 SEUS COMBINADOS EM ABERTO*', ''];
    if (aReceber > 0) {
      partes.push(`💰 *Tem a receber:* R$ ${currency.format(aReceber)}`);
      for (const d of linhas.filter((l) => l.direction === 'a_receber')) {
        partes.push(`   • R$ ${currency.format(Number(d.amount))}${d.person ? ` — ${d.person}` : ''}`);
      }
      partes.push('');
    }
    if (aPagar > 0) {
      partes.push(`💸 *Tem a pagar:* R$ ${currency.format(aPagar)}`);
      for (const d of linhas.filter((l) => l.direction === 'a_pagar')) {
        partes.push(`   • R$ ${currency.format(Number(d.amount))}${d.person ? ` — ${d.person}` : ''}`);
      }
    }
    return partes.join('\n');
  }

  if (metric === 'guardado') {
    const { total, noMes } = await savingsSummary(phone);
    const meta = await getGoal(phone);

    if (total === 0 && !meta) {
      return 'Você ainda não guardou nada. 🐷\n\nQuando guardar, me fala: _"guardei 200"_\nE se quiser uma meta: _"quero guardar 300 por mês"_';
    }

    const partes = ['*🐷 SEU COFRINHO*', '', `Total guardado: *R$ ${currency.format(total)}*`];
    partes.push(`Guardado neste mês: R$ ${currency.format(noMes)}`);

    // Só vale listar os potes quando existe mais de um — com um só, seria repetir o total.
    const potes = await savingsByJar(phone);
    if (potes.length > 1) {
      partes.push('', '*Seus cofrinhos:*');
      for (const p of potes) {
        partes.push(`   🫙 ${p.nome}: R$ ${currency.format(p.total)}`);
      }
    }

    const alvo = Number(meta?.monthly_target) || 0;
    if (alvo > 0) {
      const falta = alvo - noMes;
      const pct = Math.max(0, Math.min(100, Math.round((noMes / alvo) * 100)));
      partes.push('', `🎯 *Meta do mês:* R$ ${currency.format(alvo)} (${pct}%)`);
      partes.push(falta <= 0 ? '✅ Meta batida! 🎉' : `Faltam R$ ${currency.format(falta)}.`);
    }

    const objetivo = Number(meta?.goal_target) || 0;
    if (objetivo > 0) {
      const pct = Math.min(100, Math.round((total / objetivo) * 100));
      const falta = objetivo - total;
      partes.push('', `🏁 *${meta.goal_name || 'Objetivo'}:* R$ ${currency.format(objetivo)} (${pct}%)`);
      if (falta > 0) partes.push(`Faltam R$ ${currency.format(falta)}.`);
      else partes.push('✅ Objetivo alcançado! 🎉');
    }

    return partes.join('\n');
  }

  if (metric === 'parcelas') {
    const meses = await upcomingInstallments(phone, 12);
    if (meses.length === 0) {
      return 'Você não tem nenhuma parcela em aberto. 🎉\n\nQuando parcelar algo, me fala: _"comprei uma TV em 6x de 200"_';
    }

    const totalGeral = meses.reduce((s, m) => s + m.total, 0);
    const partes = ['*💳 SUAS PRÓXIMAS PARCELAS*', '', `Total comprometido: *R$ ${currency.format(totalGeral)}*`, ''];

    for (const m of meses.slice(0, 6)) {
      partes.push(`*${nomeDoMes(m.mes)}* — R$ ${currency.format(m.total)}`);
      for (const p of m.parcelas) {
        partes.push(`   • ${p.description} (${p.installment_number}/${p.installments_total}): R$ ${currency.format(Number(p.amount))}`);
      }
      partes.push('');
    }
    if (meses.length > 6) partes.push(`_...e mais ${meses.length - 6} meses._`, '');
    partes.push(`Ver tudo mês a mês 👉 ${PAINEL_URL}`);
    return partes.join('\n');
  }

  if (metric === 'extrato') {
    const linhas = await listRecentTransactions(phone, 5);
    if (linhas.length === 0) return 'Você ainda não tem nenhum lançamento. Me conta um gasto que eu anoto! 😊';

    const itens = linhas.map((t) => {
      const sinal = t.type === 'receita' ? '+' : '−';
      const data = new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return `${sinal}R$ ${currency.format(Number(t.amount))} — ${t.description || t.category} _(${data})_`;
    });
    return `*📋 SEUS ÚLTIMOS LANÇAMENTOS*\n\n${itens.join('\n')}\n\nVer tudo 👉 ${PAINEL_URL}`;
  }

  const r = await sumTransactions(phone, period, category);
  const doQue = category ? ` com *${category}*` : '';

  if (r.quantidade === 0) {
    return `Não achei nenhum lançamento${doQue} ${r.label}. 🤔\n\nMe conta um gasto que eu anoto na hora!`;
  }

  if (metric === 'entradas') {
    return `*💰 ENTRADAS ${r.label.toUpperCase()}*\n\nR$ ${currency.format(r.entradas)}`;
  }

  if (metric === 'gastos') {
    const partes = [`*💸 GASTOS ${r.label.toUpperCase()}*${doQue ? `\n_(só ${category})_` : ''}`, '', `R$ ${currency.format(r.saidas)}`];
    if (!category && r.topCategorias.length > 0) {
      partes.push('', '*Onde foi:*');
      for (const c of r.topCategorias) {
        partes.push(`   • ${c.nome}: R$ ${currency.format(c.valor)}`);
      }
    }
    return partes.join('\n');
  }

  // saldo (padrão)
  const emoji = r.saldo >= 0 ? '🟢' : '🔴';
  const recado = r.saldo >= 0 ? 'Você está no azul! 🎉' : 'Você gastou mais do que entrou. 😬';
  return [
    `*${emoji} SEU SALDO ${r.label.toUpperCase()}*`,
    '',
    `R$ ${currency.format(r.saldo)}`,
    '',
    `💰 Entrou: R$ ${currency.format(r.entradas)}`,
    `💸 Saiu: R$ ${currency.format(r.saidas)}`,
    '',
    recado,
  ].join('\n');
}

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

// Reação e evento de sistema não são a pessoa falando comigo — responder a um
// "joinha" com "não entendi" seria mais irritante do que ficar quieto.
const TIPOS_IGNORADOS = new Set(['reaction', 'system', 'order']);

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

  await processIncomingMessage(phone, texto);
}

function msgTipoNaoSuportado(tipo) {
  // audio e image não chegam aqui: são tratados em tratarMidia.
  const abertura = {
    video: 'Ainda não consigo ver vídeo. 🎬',
    document: 'Ainda não consigo abrir arquivo. 📄',
    sticker: 'Figurinha eu até curto, mas não sei anotar. 😄',
    location: 'Localização eu não sei anotar. 📍',
    contacts: 'Contato eu não sei anotar. 👤',
  }[tipo] || 'Só consigo entender mensagem escrita. 📝';

  return `${abertura}

Me manda escrito, por áudio, ou uma foto do comprovante:
💸 _"paguei 30 no mercado"_
🎧 um áudio contando o gasto
📸 foto da nota ou do print do PIX

Digite *ajuda* pra ver tudo que eu faço. 😉`;
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
        if (processedMessageIds.size > 2000) processedMessageIds.clear();
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
        await processIncomingMessage(phone, text);
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

function formatLine(item) {
  if (item.kind === 'parcelamento') {
    return `💳 ${item.installments}x de R$ ${currency.format(item.installmentAmount)} — total R$ ${currency.format(item.total)}`;
  }
  if (item.kind === 'divida') {
    const quem = item.person ? ` (${item.person})` : '';
    return item.direction === 'a_receber'
      ? `📝 A receber: R$ ${currency.format(item.amount)}${quem}`
      : `📝 A pagar: R$ ${currency.format(item.amount)}${quem}`;
  }
  const sinal = item.type === 'receita' ? '+' : '-';
  return `${sinal}R$ ${currency.format(item.amount)} (${item.category})`;
}

function formatConfirmation(items) {
  if (items.length === 1) {
    const item = items[0];
    if (item.kind === 'parcelamento') {
      return [
        `💳 *${item.description}*`,
        `${item.installments}x de R$ ${currency.format(item.installmentAmount)}`,
        `Total: R$ ${currency.format(item.total)}`,
        '',
        `Espalhei as ${item.installments} parcelas nos próximos meses. 📅`,
        `Veja mês a mês no painel 👉 ${PAINEL_URL}`,
      ].join('\n');
    }
    const emoji = item.kind === 'divida' ? '📝' : '✅';
    return `${emoji} ${formatLine(item).replace(/^📝 /, '')}`;
  }

  const linhas = items.map(formatLine);
  const transacoes = items.filter((item) => item.kind === 'transacao');
  const dividas = items.filter((item) => item.kind === 'divida');

  const totais = [];
  if (transacoes.length > 0) {
    const saldo = transacoes.reduce((s, t) => s + (t.type === 'receita' ? t.amount : -t.amount), 0);
    const sinalSaldo = saldo >= 0 ? '+' : '-';
    totais.push(`Total: ${sinalSaldo}R$ ${currency.format(Math.abs(saldo))}`);
  }
  if (dividas.length > 0) {
    const aPagar = dividas.filter((d) => d.direction === 'a_pagar').reduce((s, d) => s + d.amount, 0);
    const aReceber = dividas.filter((d) => d.direction === 'a_receber').reduce((s, d) => s + d.amount, 0);
    if (aPagar > 0) totais.push(`Total a pagar: R$ ${currency.format(aPagar)}`);
    if (aReceber > 0) totais.push(`Total a receber: R$ ${currency.format(aReceber)}`);
  }

  return `✅ ${items.length} registrados:\n${linhas.join('\n')}\n\n${totais.join('\n')}`;
}

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

    const respostas = await coletandoRespostas(() => processIncomingMessage(perfil.phone, texto));
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

app.listen(PORT || 3001, () => console.log(`Servidor rodando na porta ${PORT || 3001}`));
