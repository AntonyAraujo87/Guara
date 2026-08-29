// COMO RODAR (da pasta backend):
//
//   set -a; . ./.env; set +a
//   export SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY ../frontend/.env.local | cut -d= -f2-)
//   node testes/rls-red-team.js
//
// AVISO: roda contra o banco DE VERDADE. Ele cria duas contas de mentira
// (telefones 5500999900xx), ataca uma a partir da outra, e apaga tudo no fim —
// inclusive se falhar no meio. Ja foi rodado: 29 ataques, 0 vazamentos, 0
// linhas deixadas pra tras. Rode de novo depois de mexer em politica de RLS.
//
// Red team do RLS: dois usuários reais, um tentando alcançar o outro.
//
// Ler a política diz o que ela PRETENDE. Só o ataque diz o que ela FAZ. Este
// teste cria duas contas de mentira, dá dados a cada uma, e então usa o token
// legítimo da primeira pra tentar ler, mudar e apagar as coisas da segunda —
// exatamente o que alguém faria com a anon_key aberta no F12.
//
// O alvo principal é o caminho que o painel usa: .delete().eq('id', id), sem
// nenhum filtro de dono. Se o RLS falhar aí, saber um id é possuir a linha.
//
// Tudo que ele cria, ele apaga no fim, inclusive se falhar no meio.

const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL || !SERVICE || !ANON) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Telefones obviamente falsos, pra ninguém confundir com dado real e pra
// limpeza poder varrer por prefixo se algo escapar.
const MARCA = '55009999';
const A = { email: `guara-redteam-a-${Date.now()}@exemplo.invalido`, phone: MARCA + '0001', senha: 'S3nh4-teste-redteam-A!' };
const B = { email: `guara-redteam-b-${Date.now()}@exemplo.invalido`, phone: MARCA + '0002', senha: 'S3nh4-teste-redteam-B!' };

const criados = { usuarios: [], linhas: [] };

let bloqueados = 0;
let vazamentos = [];

function registrar(nome, conseguiu, detalhe = '') {
  if (conseguiu) {
    vazamentos.push(nome + (detalhe ? ' — ' + detalhe : ''));
    console.log(`  ✗ VAZOU   ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`);
  } else {
    bloqueados++;
    console.log(`  ✓ negado  ${nome}`);
  }
}

// O Turnstile bloqueia signInWithPassword. O caminho é magic link + verifyOtp,
// que não passa por captcha.
async function tokenDe(user) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  if (error) throw new Error('generateLink: ' + error.message);
  const publico = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sessao, error: e2 } = await publico.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  });
  if (e2) throw new Error('verifyOtp: ' + e2.message);
  return sessao.session.access_token;
}

function comoUsuario(token) {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function preparar(user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email, password: user.senha, email_confirm: true,
  });
  if (error) throw new Error('createUser: ' + error.message);
  const idNovo = data.user.id;
  criados.usuarios.push(idNovo);
  Object.assign(user, { id: idNovo });

  // O profile é o que liga a conta ao telefone. Toda política do sistema
  // resolve o dono por aqui.
  const { error: ep } = await admin.from('profiles').upsert({ id: user.id, phone: user.phone });
  if (ep) throw new Error('profiles: ' + ep.message);

  await admin.from('users').upsert({ phone: user.phone });

  const linhas = {};
  const inserir = async (tabela, corpo) => {
    const { data: d, error: e } = await admin.from(tabela).insert(corpo).select().single();
    if (e) { console.log(`     (não consegui semear ${tabela}: ${e.message})`); return null; }
    criados.linhas.push([tabela, d.id ?? d.user_phone]);
    return d;
  };

  linhas.transaction = await inserir('transactions', {
    user_phone: user.phone, amount: 123.45, type: 'despesa',
    category: 'Mercado', description: 'segredo de ' + user.phone,
  });
  linhas.debt = await inserir('debts', {
    user_phone: user.phone, amount: 500, direction: 'a_receber',
    person: 'Fulano', status: 'pendente',
  });
  linhas.saving = await inserir('savings', {
    user_phone: user.phone, amount: 999, jar: 'Cofre de ' + user.phone,
  });
  linhas.installment = await inserir('installments', {
    user_phone: user.phone, purchase_id: crypto.randomUUID(), description: 'TV secreta',
    category: 'Casa', installment_number: 1, installments_total: 3,
    amount: 100, due_month: '2026-09-01', paid: false,
  });
  linhas.categoria = await inserir('categories', {
    user_phone: user.phone, name: 'Categoria de ' + user.phone, kind: 'despesa',
  });
  linhas.recorrente = await inserir('recurring', {
    user_phone: user.phone, description: 'Fixo secreto', amount: 77,
    type: 'despesa', category: 'Casa', day_of_month: 5, active: true,
  });
  Object.assign(user, { linhas });
}

async function limpar() {
  console.log('\n─── limpando ───');
  for (const [tabela, id] of criados.linhas.reverse()) {
    const col = tabela === 'goals' ? 'user_phone' : 'id';
    await admin.from(tabela).delete().eq(col, id);
  }
  for (const p of [A.phone, B.phone]) {
    for (const t of ['transactions', 'debts', 'savings', 'installments', 'categories', 'recurring', 'goals', 'users']) {
      await admin.from(t).delete().eq(t === 'users' ? 'phone' : 'user_phone', p);
    }
    await admin.from('profiles').delete().eq('phone', p);
  }
  for (const id of criados.usuarios) {
    await admin.auth.admin.deleteUser(id);
  }
  // Confere que sumiu mesmo.
  const { count } = await admin.from('transactions')
    .select('*', { count: 'exact', head: true }).like('user_phone', MARCA + '%');
  console.log(`  sobrou ${count ?? '?'} linha(s) de teste em transactions`);
}

(async () => {
  try {
    console.log('─── preparando duas contas ───');
    await preparar(A);
    await preparar(B);
    console.log(`  A = ${A.phone}   B = ${B.phone}`);

    const token = await tokenDe(A);
    const comoA = comoUsuario(token);
    console.log('  token legítimo de A obtido\n');

    console.log('═══ A tenta LER as coisas de B ═══');
    for (const [tabela, linha] of Object.entries({
      transactions: B.linhas.transaction, debts: B.linhas.debt, savings: B.linhas.saving,
      installments: B.linhas.installment, categories: B.linhas.categoria, recurring: B.linhas.recorrente,
    })) {
      if (!linha) continue;
      const { data } = await comoA.from(tabela).select('*').eq('id', linha.id);
      registrar(`select ${tabela} de B pelo id`, (data || []).length > 0,
        (data || []).length ? JSON.stringify(data[0]).slice(0, 60) : '');
    }
    {
      const { data } = await comoA.from('users').select('*').eq('phone', B.phone);
      registrar('select users de B', (data || []).length > 0);
      const { data: d2 } = await comoA.from('profiles').select('*').eq('phone', B.phone);
      registrar('select profiles de B', (d2 || []).length > 0);
    }

    console.log('\n═══ A tenta APAGAR as coisas de B (o caminho do painel) ═══');
    for (const [tabela, linha] of Object.entries({
      transactions: B.linhas.transaction, debts: B.linhas.debt, savings: B.linhas.saving,
      installments: B.linhas.installment, categories: B.linhas.categoria, recurring: B.linhas.recorrente,
    })) {
      if (!linha) continue;
      await comoA.from(tabela).delete().eq('id', linha.id);
      // O RLS não devolve erro ao apagar zero linhas — a prova é a linha ainda existir.
      const { data: ainda } = await admin.from(tabela).select('id').eq('id', linha.id);
      registrar(`delete ${tabela} de B pelo id`, (ainda || []).length === 0);
    }

    console.log('\n═══ A tenta ALTERAR as coisas de B ═══');
    if (B.linhas.transaction) {
      await comoA.from('transactions').update({ amount: 1 }).eq('id', B.linhas.transaction.id);
      const { data } = await admin.from('transactions').select('amount').eq('id', B.linhas.transaction.id).maybeSingle();
      registrar('update transactions de B', Number(data?.amount) === 1, `virou ${data?.amount}`);
    }
    if (B.linhas.installment) {
      await comoA.from('installments').update({ paid: true }).eq('id', B.linhas.installment.id);
      const { data } = await admin.from('installments').select('paid').eq('id', B.linhas.installment.id).maybeSingle();
      registrar('marcar parcela de B como paga', data?.paid === true);
    }

    console.log('\n═══ escalada: A tenta VIRAR B ═══');
    {
      await comoA.from('profiles').update({ phone: B.phone }).eq('id', A.id);
      const { data } = await admin.from('profiles').select('phone').eq('id', A.id).maybeSingle();
      registrar('mudar o próprio profile pro telefone de B', data?.phone === B.phone, `ficou ${data?.phone}`);
      if (data?.phone !== A.phone) await admin.from('profiles').update({ phone: A.phone }).eq('id', A.id);
    }
    if (A.linhas.transaction) {
      await comoA.from('transactions').update({ user_phone: B.phone }).eq('id', A.linhas.transaction.id);
      const { data } = await admin.from('transactions').select('user_phone').eq('id', A.linhas.transaction.id).maybeSingle();
      registrar('mover o próprio lançamento pra conta de B', data?.user_phone === B.phone);
    }
    {
      const { error } = await comoA.from('transactions').insert({
        user_phone: B.phone, amount: 1, type: 'despesa', category: 'Falso', description: 'plantado',
      });
      const { count } = await admin.from('transactions')
        .select('*', { count: 'exact', head: true }).eq('user_phone', B.phone).eq('description', 'plantado');
      registrar('plantar lançamento na conta de B', (count || 0) > 0, error ? '' : 'sem erro');
    }
    {
      await comoA.from('users').update({ wallets: ['Invadida'] }).eq('phone', B.phone);
      const { data } = await admin.from('users').select('wallets').eq('phone', B.phone).maybeSingle();
      registrar('trocar as carteiras de B', JSON.stringify(data?.wallets || []).includes('Invadida'));
    }

    console.log('\n═══ sem token nenhum (anon puro, o F12) ═══');
    {
      const anon = createClient(URL, ANON, { auth: { persistSession: false } });
      for (const t of ['transactions', 'debts', 'savings', 'installments', 'categories', 'recurring', 'users', 'profiles', 'goals']) {
        const { data } = await anon.from(t).select('*').limit(3);
        registrar(`anon lê ${t}`, (data || []).length > 0, (data || []).length ? `${data.length} linha(s)` : '');
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log(`  ${bloqueados} ataques bloqueados, ${vazamentos.length} vazamento(s)`);
    if (vazamentos.length) {
      console.log('\n  VAZAMENTOS:');
      for (const v of vazamentos) console.log('   • ' + v);
    }
  } catch (e) {
    console.error('\nERRO no teste:', e.message);
  } finally {
    await limpar();
    process.exit(vazamentos.length ? 1 : 0);
  }
})();
