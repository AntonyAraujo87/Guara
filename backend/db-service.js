const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function ensureUser(phone) {
  // upsert atômico: cria o usuário se for a 1ª mensagem, e sempre marca quando foi a última
  // mensagem recebida (usado pra saber se a conversa está "aberta" pra fins de política do WhatsApp)
  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert({ phone, last_message_at: new Date().toISOString() }, { onConflict: 'phone' })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

async function saveTransaction(phone, transaction) {
  await ensureUser(phone);

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      user_phone: phone,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      description: transaction.description,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function saveDebt(phone, debt) {
  await ensureUser(phone);

  const { data, error } = await supabaseAdmin
    .from('debts')
    .insert({
      user_phone: phone,
      amount: debt.amount,
      direction: debt.direction,
      person: debt.person,
      description: debt.description,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Diz se esse número já está ligado a uma conta do painel — decide se mandamos
// o onboarding completo ou só uma ajuda curta.
async function isPhoneLinked(phone) {
  const { data } = await supabaseAdmin.from('profiles').select('id').eq('phone', phone).maybeSingle();
  return Boolean(data);
}

// O Brasil está em UTC-3 o ano todo (sem horário de verão desde 2019). Sem isso,
// "esse mês" viraria o mês em UTC e erraria a virada perto da meia-noite.
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;

function agoraBR() {
  return new Date(Date.now() - BR_OFFSET_MS);
}

function paraUTC(dataBR) {
  return new Date(dataBR.getTime() + BR_OFFSET_MS);
}

// Devolve { start, end } em ISO (UTC) para o período pedido, calculado no fuso de Brasília.
function periodBounds(period) {
  const agora = agoraBR();
  const inicioDoDia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));

  switch (period) {
    case 'hoje':
      return { start: paraUTC(inicioDoDia).toISOString(), end: null, label: 'hoje' };
    case 'semana': {
      const inicio = new Date(inicioDoDia);
      inicio.setUTCDate(inicio.getUTCDate() - 6);
      return { start: paraUTC(inicio).toISOString(), end: null, label: 'nos últimos 7 dias' };
    }
    case 'mes_passado': {
      const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
      const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
      return { start: paraUTC(inicio).toISOString(), end: paraUTC(fim).toISOString(), label: 'no mês passado' };
    }
    case 'tudo':
      return { start: null, end: null, label: 'no total' };
    case 'mes':
    default: {
      const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
      return { start: paraUTC(inicio).toISOString(), end: null, label: 'neste mês' };
    }
  }
}

function aplicarPeriodo(query, { start, end }) {
  if (start) query = query.gte('created_at', start);
  if (end) query = query.lt('created_at', end);
  return query;
}

const CATEGORIA_GUARDADO = 'Guardado';

// Guardar dinheiro sai do saldo como qualquer outra despesa, então os
// lançamentos do cofrinho entram nas contas junto com as transações. Continuam
// na tabela savings; aqui só ganham a forma de transação.
//
// Valor positivo é depósito (saída do saldo); negativo é retirada (volta pra ele).
function guardadoComoTransacao(linha) {
  const valor = Number(linha.amount);
  return {
    amount: Math.abs(valor),
    type: valor > 0 ? 'despesa' : 'receita',
    category: CATEGORIA_GUARDADO,
    description: (linha.jar || '').trim()
      ? `${valor > 0 ? 'Guardei' : 'Tirei'} — ${(linha.jar || '').trim()}`
      : valor > 0 ? 'Guardei' : 'Tirei do guardado',
    created_at: linha.created_at,
  };
}

async function buscarGuardadoComoTransacoes(phone, bounds, category) {
  // Filtrar por outra categoria exclui o cofrinho: ele só aparece em "Guardado".
  if (category && category !== CATEGORIA_GUARDADO) return [];
  let q = supabaseAdmin.from('savings').select('amount, jar, description, created_at').eq('user_phone', phone);
  q = aplicarPeriodo(q, bounds);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(guardadoComoTransacao);
}

// Soma entradas e saídas do período, opcionalmente filtrando por categoria.
async function sumTransactions(phone, period, category) {
  const bounds = periodBounds(period);
  let query = supabaseAdmin.from('transactions').select('amount, type, category').eq('user_phone', phone);
  query = aplicarPeriodo(query, bounds);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw error;

  const linhas = [...(data || []), ...(await buscarGuardadoComoTransacoes(phone, bounds, category))];
  const entradas = linhas.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
  const saidas = linhas.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);

  // Ranking de categorias de saída, para o Guará dizer onde o dinheiro foi.
  const porCategoria = {};
  for (const t of linhas) {
    if (t.type !== 'despesa') continue;
    porCategoria[t.category] = (porCategoria[t.category] || 0) + Number(t.amount);
  }
  const topCategorias = Object.entries(porCategoria)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 3);

  return { entradas, saidas, saldo: entradas - saidas, quantidade: linhas.length, topCategorias, label: bounds.label };
}

async function listRecentTransactions(phone, limit = 5) {
  const [transacoes, guardado] = await Promise.all([
    supabaseAdmin
      .from('transactions')
      .select('amount, type, category, description, created_at')
      .eq('user_phone', phone)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('savings')
      .select('amount, jar, description, created_at')
      .eq('user_phone', phone)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);
  if (transacoes.error) throw transacoes.error;
  if (guardado.error) throw guardado.error;

  // Busca "limit" de cada tabela e corta depois de juntar: pegar menos de uma
  // delas poderia esconder um lançamento mais recente do que os que sobraram.
  return [...(transacoes.data || []), ...(guardado.data || []).map(guardadoComoTransacao)]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

async function sumOpenDebts(phone) {
  const { data, error } = await supabaseAdmin
    .from('debts')
    .select('amount, direction, person')
    .eq('user_phone', phone)
    .eq('status', 'pendente');
  if (error) throw error;

  const linhas = data || [];
  const aReceber = linhas.filter((d) => d.direction === 'a_receber').reduce((s, d) => s + Number(d.amount), 0);
  const aPagar = linhas.filter((d) => d.direction === 'a_pagar').reduce((s, d) => s + Number(d.amount), 0);
  return { aReceber, aPagar, linhas };
}

// Apaga o último registro do usuário, seja ele qual for — o "errei, apaga isso" do
// chat. Olhar só a tabela transactions apagava a coisa errada: quem tivesse acabado
// de guardar dinheiro ou parcelar uma compra veria sumir um gasto antigo sem relação.
async function deleteLastEntry(phone) {
  const ultimoDe = async (tabela, campos) => {
    const { data } = await supabaseAdmin
      .from(tabela)
      .select(campos)
      .eq('user_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  };

  const [transacao, poupanca, divida, parcela] = await Promise.all([
    ultimoDe('transactions', 'id, created_at, amount, type, category, description'),
    ultimoDe('savings', 'id, created_at, amount, description'),
    ultimoDe('debts', 'id, created_at, amount, direction, person, description'),
    ultimoDe('installments', 'id, created_at, purchase_id, amount, description, installments_total'),
  ]);

  const candidatos = [
    transacao && { tipo: 'transacao', reg: transacao },
    poupanca && { tipo: 'guardado', reg: poupanca },
    divida && { tipo: 'divida', reg: divida },
    parcela && { tipo: 'parcelamento', reg: parcela },
  ].filter(Boolean);

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => new Date(b.reg.created_at) - new Date(a.reg.created_at));
  const alvo = candidatos[0];

  if (alvo.tipo === 'parcelamento') {
    // Apaga a compra inteira: sobrar parcelas soltas não ajuda ninguém.
    await supabaseAdmin.from('installments').delete().eq('purchase_id', alvo.reg.purchase_id);
  } else {
    const tabela = alvo.tipo === 'transacao' ? 'transactions' : alvo.tipo === 'guardado' ? 'savings' : 'debts';
    await supabaseAdmin.from(tabela).delete().eq('id', alvo.reg.id);
  }

  return alvo;
}

// ── PARCELAS ───────────────────────────────────────────────────────
// Uma compra em 6x vira 6 linhas, uma por mês, começando no mês que vem
// (a primeira parcela quase sempre cai na fatura seguinte).
async function saveInstallments(phone, { description, category, installments, installmentAmount }) {
  const agora = agoraBR();
  const linhas = [];
  const purchaseId = crypto.randomUUID();

  for (let n = 1; n <= installments; n++) {
    const vencimento = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + n, 1));
    linhas.push({
      user_phone: phone,
      purchase_id: purchaseId,
      description,
      category: category || 'Outros',
      installment_number: n,
      installments_total: installments,
      amount: installmentAmount,
      due_month: vencimento.toISOString().slice(0, 10),
    });
  }

  const { error } = await supabaseAdmin.from('installments').insert(linhas);
  if (error) throw error;
  return { purchaseId, primeiroVencimento: linhas[0].due_month };
}

// Parcelas que vencem num mês específico (aceita "2026-09" ou um Date).
async function installmentsForMonth(phone, ano, mes) {
  const inicio = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('installments')
    .select('*')
    .eq('user_phone', phone)
    .eq('due_month', inicio)
    .order('amount', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Tudo que ainda vai vencer, agrupado por mês — a "próximas faturas" do Nubank.
async function upcomingInstallments(phone, meses = 12) {
  const agora = agoraBR();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('installments')
    .select('*')
    .eq('user_phone', phone)
    .eq('paid', false)
    .gte('due_month', inicio)
    .order('due_month', { ascending: true });
  if (error) throw error;

  const porMes = {};
  for (const p of data || []) {
    (porMes[p.due_month] ||= []).push(p);
  }
  return Object.entries(porMes)
    .slice(0, meses)
    .map(([mes, parcelas]) => ({
      mes,
      total: parcelas.reduce((s, p) => s + Number(p.amount), 0),
      parcelas,
    }));
}

// ── COFRINHO ───────────────────────────────────────────────────────
async function saveSaving(phone, { amount, direction, description, jar }) {
  const valor = direction === 'retirar' ? -Math.abs(amount) : Math.abs(amount);
  const { error } = await supabaseAdmin.from('savings').insert({
    user_phone: phone,
    amount: valor,
    jar: jar || null,
    description: description || null,
  });
  if (error) throw error;
}

// Agrupa o cofrinho por nome. O que não tem nome cai em "Geral", senão sumiria da lista.
async function savingsByJar(phone) {
  const { data, error } = await supabaseAdmin
    .from('savings')
    .select('amount, jar')
    .eq('user_phone', phone);
  if (error) throw error;

  const potes = {};
  for (const l of data || []) {
    const nome = (l.jar || '').trim() || 'Geral';
    potes[nome] = (potes[nome] || 0) + Number(l.amount);
  }
  return Object.entries(potes)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);
}

async function savingsSummary(phone) {
  const { data, error } = await supabaseAdmin
    .from('savings')
    .select('amount, created_at')
    .eq('user_phone', phone);
  if (error) throw error;

  const linhas = data || [];
  const total = linhas.reduce((s, l) => s + Number(l.amount), 0);

  // Quanto o cofrinho CRESCEU no mês (depósitos menos saques). Contar só depósitos
  // inflaria a meta: guardar 200 e sacar 100 no mesmo mês guardou 100, não 200.
  const bounds = periodBounds('mes');
  const noMes = linhas
    .filter((l) => l.created_at >= bounds.start)
    .reduce((s, l) => s + Number(l.amount), 0);

  return { total, noMes, quantidade: linhas.length };
}

async function listRecentSavings(phone, limit = 10) {
  const { data, error } = await supabaseAdmin
    .from('savings')
    .select('*')
    .eq('user_phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ── CATEGORIAS PERSONALIZADAS ──────────────────────────────────────
async function getCategories(phone) {
  const { data } = await supabaseAdmin
    .from('categories')
    .select('name, kind')
    .eq('user_phone', phone);
  return data || [];
}

// ── MARCAR PARCELA COMO PAGA ───────────────────────────────────────
// Sem descrição, marca a parcela em aberto mais antiga (a que vence primeiro).
async function markInstallmentPaid(phone, descricao) {
  let query = supabaseAdmin
    .from('installments')
    .select('id, description, installment_number, installments_total, amount, due_month')
    .eq('user_phone', phone)
    .eq('paid', false)
    .order('due_month', { ascending: true })
    .limit(1);

  if (descricao) query = query.ilike('description', `%${descricao}%`);

  const { data, error } = await query;
  if (error) throw error;
  const alvo = data?.[0];
  if (!alvo) return null;

  const { error: upError } = await supabaseAdmin
    .from('installments')
    .update({ paid: true })
    .eq('id', alvo.id);
  if (upError) throw upError;
  return alvo;
}

// ── GASTOS RECORRENTES ─────────────────────────────────────────────
async function saveRecurring(phone, { description, amount, type, category, dayOfMonth }) {
  const campos = {
    user_phone: phone,
    description,
    amount,
    type: type || 'despesa',
    category: category || 'Outros',
    day_of_month: Math.min(31, Math.max(1, Math.round(dayOfMonth) || 1)),
  };

  // Repetir "Netflix 59,90" não pode criar uma segunda Netflix: o lançamento
  // automático rodaria duas vezes todo mês, cobrando em dobro no painel.
  // Mesma descrição = a pessoa está corrigindo o valor ou o dia, não criando outro.
  const { data: iguais } = await supabaseAdmin
    .from('recurring')
    .select('id')
    .eq('user_phone', phone)
    .eq('active', true)
    .ilike('description', description)
    .order('created_at', { ascending: false })
    .limit(1);

  if (iguais && iguais.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('recurring')
      .update(campos)
      .eq('id', iguais[0].id)
      .select()
      .single();
    if (error) throw error;
    return { ...data, atualizado: true };
  }

  const { data, error } = await supabaseAdmin.from('recurring').insert(campos).select().single();
  if (error) throw error;
  return data;
}

async function listRecurring(phone) {
  const { data } = await supabaseAdmin
    .from('recurring')
    .select('*')
    .eq('user_phone', phone)
    .eq('active', true)
    .order('day_of_month');
  return data || [];
}

// Corrige um recorrente já cadastrado. Sem descrição, mexe no último criado — que é
// o caso de "na verdade é dia 5" logo depois de cadastrar.
// Janela que define "o que eu acabei de mandar": lançamentos criados perto uns dos
// outros vieram da mesma mensagem, então uma correção em lote deve pegar todos eles.
const JANELA_LOTE_MS = 5 * 60 * 1000;

async function updateRecurring(phone, { description, dayOfMonth, amount, escopo }) {
  const mudancas = {};
  if (dayOfMonth > 0) mudancas.day_of_month = Math.min(31, Math.max(1, Math.round(dayOfMonth)));
  if (amount > 0) mudancas.amount = amount;

  let busca = supabaseAdmin
    .from('recurring')
    .select('*')
    .eq('user_phone', phone)
    .eq('active', true)
    .order('created_at', { ascending: false });

  // Nome citado sempre vence o escopo: "muda a Netflix" mexe na Netflix, e só nela.
  if (description) busca = busca.ilike('description', `%${description}%`).limit(1);
  else if (escopo === 'todos' || escopo === 'lote') busca = busca.limit(50);
  else busca = busca.limit(1);

  const { data, error } = await busca;
  if (error) throw error;
  if (!data || data.length === 0) return null;

  let alvos = data;
  if (!description && escopo === 'lote') {
    // Só o que veio junto do mais recente — não arrasta o que foi cadastrado antes.
    const corte = new Date(data[0].created_at).getTime() - JANELA_LOTE_MS;
    alvos = data.filter((r) => new Date(r.created_at).getTime() >= corte);
  }

  if (Object.keys(mudancas).length === 0) return { alvos, mudancas: null };

  const { error: upError } = await supabaseAdmin
    .from('recurring')
    .update(mudancas)
    .in('id', alvos.map((r) => r.id));
  if (upError) throw upError;

  return { alvos: alvos.map((r) => ({ ...r, ...mudancas })), mudancas };
}

// Roda uma vez por dia. Lança o que vence hoje e ainda não foi lançado neste mês.
// O campo last_run guarda "2026-09" — é o que impede lançar duas vezes se o cron
// rodar de novo, e o que faz o dia 31 cair no último dia de um mês curto.
async function runRecurringForToday() {
  const agora = agoraBR();
  const dia = agora.getUTCDate();
  const mesAtual = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
  const ultimoDiaDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();

  const { data, error } = await supabaseAdmin
    .from('recurring')
    .select('*')
    .eq('active', true);
  if (error) throw error;

  const lancados = [];
  for (const r of data || []) {
    if (r.last_run === mesAtual) continue;
    // Dia 31 num mês de 30 dias vira o último dia, senão nunca lançaria.
    const diaEfetivo = Math.min(r.day_of_month, ultimoDiaDoMes);
    if (dia < diaEfetivo) continue;

    await supabaseAdmin.from('transactions').insert({
      user_phone: r.user_phone,
      amount: r.amount,
      type: r.type,
      category: r.category,
      description: r.description,
    });
    await supabaseAdmin.from('recurring').update({ last_run: mesAtual }).eq('id', r.id);
    lancados.push(r);
  }
  return lancados;
}

// ── METAS ──────────────────────────────────────────────────────────
async function getGoal(phone) {
  const { data } = await supabaseAdmin.from('goals').select('*').eq('user_phone', phone).maybeSingle();
  return data || null;
}

async function saveGoal(phone, { monthlyTarget, goalName, goalTarget }) {
  const atual = await getGoal(phone);
  const registro = {
    user_phone: phone,
    // Só sobrescreve o que veio preenchido — definir um objetivo não apaga a meta mensal.
    monthly_target: monthlyTarget > 0 ? monthlyTarget : atual?.monthly_target ?? null,
    goal_name: goalName || atual?.goal_name || null,
    goal_target: goalTarget > 0 ? goalTarget : atual?.goal_target ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from('goals').upsert(registro, { onConflict: 'user_phone' });
  if (error) throw error;
  return registro;
}

module.exports = {
  saveTransaction,
  saveDebt,
  ensureUser,
  isPhoneLinked,
  sumTransactions,
  listRecentTransactions,
  sumOpenDebts,
  deleteLastEntry,
  saveInstallments,
  installmentsForMonth,
  upcomingInstallments,
  saveSaving,
  savingsSummary,
  savingsByJar,
  listRecentSavings,
  getCategories,
  markInstallmentPaid,
  saveRecurring,
  listRecurring,
  updateRecurring,
  runRecurringForToday,
  getGoal,
  saveGoal,
  periodBounds,
  supabaseAdmin,
};
