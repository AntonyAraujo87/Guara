const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function ensureUser(phone) {
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({ phone })
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

module.exports = { saveTransaction, saveDebt, ensureUser };
