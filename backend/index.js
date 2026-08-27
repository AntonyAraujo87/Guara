require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { extractItems } = require('./ai-service');
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
  supabaseAdmin,
} = require('./db-service');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// "2026-09-01" -> "setembro/2026"
function nomeDoMes(dueMonth) {
  const [ano, mes] = dueMonth.split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

const PAINEL_URL = 'https://168-138-141-214.sslip.io';

// Mensagem 1: curta de propósito. O objetivo dela não é ensinar tudo — é fazer a
// pessoa RESPONDER. Quem responde já entrou; o resto ela descobre usando.
const MSG_APRESENTACAO = `Oii! 👋 Eu sou o *Guará* 🐺

Anoto seus gastos por aqui mesmo, no WhatsApp. Sem planilha, sem app pra baixar, sem complicação. 💙

*Experimenta agora:* me conta um gasto recente, do seu jeito.
Tipo: _"paguei 30 no mercado"_

Pode escrever torto, sem acento, com abreviação — eu entendo. 😉`;

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

Sem pressa nenhuma. Pode ir me mandando seus gastos enquanto isso. 🐺`;

// Para quem já tem conta ligada e mandou algo que não era financeiro.
const MSG_NAO_ENTENDI = `Oi! 🐺 Não achei nenhum valor nessa mensagem.

Me conta assim que eu anoto na hora:
💸 "paguei 30 no xis"
💰 "recebi 500 do freela"
🤝 "devo 50 pro João"

Ou me pergunte: _"quanto gastei esse mês?"_
Digite *ajuda* pra ver tudo que eu faço. 😉`;

const MSG_INSTALAR = `📱 *Tem sim!*

O Guará vira um app na sua tela inicial — mesmo painel, sem barra de navegador, abre com um toque.

👉 ${PAINEL_URL}/instalar

A página reconhece seu aparelho e mostra o caminho certo. Leva uns 20 segundos.

_Não é nada pra baixar de loja: é o próprio painel virando atalho._ 😉`;

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

*↩️ Corrigir um erro*
"apaga o último"

*📱 Ter o app no celular*
"tem app?"
"quero instalar no celular"

Pode falar do seu jeito, sem acento e com abreviação — eu entendo. 😉
Seu painel completo: ${PAINEL_URL}`;

// A Meta só deixa mandar texto livre (fora de template aprovado) se o número mandou
// mensagem pro bot nas últimas 24h — senão é "mensagem iniciada pela empresa" e é bloqueado.
async function hasOpenWindow(phone) {
  const { data } = await supabaseAdmin.from('users').select('last_message_at').eq('phone', phone).maybeSingle();
  if (!data?.last_message_at) return false;
  return Date.now() - new Date(data.last_message_at).getTime() < 24 * 60 * 60 * 1000;
}

const app = express();
app.disable('x-powered-by');
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

const currency = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Evita reprocessar a mesma mensagem se o WhatsApp reentregar o webhook (in-memory, por processo)
const processedMessageIds = new Set();

async function processIncomingMessage(phone, text) {
  // Marca a conversa como aberta já na chegada, mesmo que a mensagem não tenha nada financeiro
  // (ex: um "oi" pra liberar o envio do código de verificação no dashboard).
  await ensureUser(phone);

  // O tier gratuito do Gemini é 15 req/min. Se estourar (ou der timeout), a pessoa
  // não pode ficar sem resposta — silêncio parece que o bot morreu.
  let items;
  try {
    // As categorias que a pessoa criou entram no prompt, senão a IA só conhece as padrão.
    const categoriasExtras = await getCategories(phone);
    items = await extractItems(text, categoriasExtras);
  } catch (err) {
    console.error('Falha ao interpretar mensagem:', err.message);
    const sobrecarga = /429|quota|rate/i.test(err.message);
    await replyWhatsApp(
      phone,
      sobrecarga
        ? 'Ufa, recebi muita mensagem de uma vez e preciso de um minutinho. 😅\nMe manda de novo daqui a pouco que eu anoto!'
        : 'Tive um probleminha pra entender sua mensagem. 😕\nTenta mandar de novo, por favor.'
    );
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

  if (intencao === 'instalar') {
    await replyWhatsApp(phone, MSG_INSTALAR);
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

  const saved = [];
  for (const item of items) {
    try {
      if (item.kind === 'parcelamento') await salvarParcelamento(phone, item);
      else if (item.kind === 'guardado') await saveSaving(phone, item);
      else if (item.kind === 'divida') await saveDebt(phone, item);
      else await saveTransaction(phone, item);
      saved.push(item);
    } catch (err) {
      console.error('Erro ao salvar item:', err.message, JSON.stringify(item));
    }
  }
  if (saved.length === 0) {
    await replyWhatsApp(phone, 'Consegui entender, mas deu erro pra salvar. 😕 Tenta de novo, por favor.');
    return;
  }

  // Guardar dinheiro merece resposta própria: mostra o cofrinho e o andamento da meta.
  if (saved.length === 1 && saved[0].kind === 'guardado') {
    await replyWhatsApp(phone, await confirmarGuardado(phone, saved[0]));
  } else {
    await replyWhatsApp(phone, formatConfirmation(saved));
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

function msgTipoNaoSuportado(tipo) {
  const abertura = {
    audio: 'Ainda não consigo ouvir áudio. 🙉',
    image: 'Ainda não consigo ler imagem. 🙈',
    video: 'Ainda não consigo ver vídeo. 🎬',
    document: 'Ainda não consigo abrir arquivo. 📄',
    sticker: 'Figurinha eu até curto, mas não sei anotar. 😄',
    location: 'Localização eu não sei anotar. 📍',
    contacts: 'Contato eu não sei anotar. 👤',
  }[tipo] || 'Só consigo entender mensagem escrita. 📝';

  return `${abertura}

Me manda escrito que eu anoto na hora:
💸 _"paguei 30 no mercado"_
💰 _"recebi 500 do freela"_

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

async function replyWhatsApp(to, body) {
  await axios.post(
    `https://graph.facebook.com/${META_API_VERSION || 'v21.0'}/${META_PHONE_NUMBER_ID}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
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

    await replyWhatsApp(phone, `Seu código de verificação do Guará: ${code}\nVálido por 10 minutos. Não compartilhe com ninguém.`);
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
    if (!phone || !code) return res.status(400).json({ error: 'Dados incompletos.' });

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
      const msg = upsertError.message.includes('duplicate') ? 'Esse número já está vinculado a outra conta.' : upsertError.message;
      return res.status(400).json({ error: msg });
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
