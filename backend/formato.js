// Como um número, uma data e uma lista viram texto na tela.
//
// Separado do index.js porque é a camada mais reusada do sistema — o WhatsApp
// e o painel exibem os mesmos valores — e porque nada aqui toca banco, rede ou
// estado. Função que só transforma entrada em saída é a mais fácil de conferir
// e a que mais dói quando está enterrada no meio de mil linhas de orquestração.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// "2026-09-01" -> "setembro/2026"
function nomeDoMes(dueMonth) {
  const [ano, mes] = dueMonth.split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

const currency = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NL = String.fromCharCode(10);

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

function listaDeCarteiras(carteiras, ativa) {
  return carteiras.map((c) => (c === ativa ? `• *${c}* ← você está aqui` : `• ${c}`)).join(NL);
}

function avisoDeData(saved) {
  const dias = saved.map((i) => Number(i.diasAtras) || 0).filter((d) => d > 0);
  if (dias.length === 0) return '';

  const quando = new Date(Date.now() - Math.max(...dias) * 24 * 60 * 60 * 1000);
  const dia = String(quando.getUTCDate()).padStart(2, '0');
  const mes = String(quando.getUTCMonth() + 1).padStart(2, '0');
  return `${NL}_(lancei em ${dia}/${mes})_`;
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

module.exports = {
  MESES,
  nomeDoMes,
  currency,
  NL,
  rotuloPeriodo,
  formatLine,
  formatConfirmation,
  formatConfirmationPorCarteira,
  listarOpcoes,
  listaDeCarteiras,
  avisoDeData,
  avisoDeLeituraSimples,
};
