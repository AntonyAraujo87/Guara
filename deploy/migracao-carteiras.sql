-- ═══════════════════════════════════════════════════════════════════
-- CARTEIRAS: separar o dinheiro pessoal do dinheiro do trabalho
-- ═══════════════════════════════════════════════════════════════════
--
-- Ideia de um usuário: quem é autônomo mistura os dois, e um saldo que
-- soma o mercado com o pagamento de um cliente não serve pra decidir
-- nada. Duas carteiras resolvem, e NÃO exigem CPF nem CNPJ — seria
-- coletar dado sensível sem função nenhuma.
--
-- Desenho:
--   · a carteira é o NOME dela, guardado direto na linha (como o cofrinho
--     em savings.jar). Sem tabela de ligação, sem join, e renomear é um
--     UPDATE só.
--   · todo mundo começa com uma carteira chamada "Pessoal". Quem nunca
--     pedir uma segunda não vê diferença nenhuma — nem no painel, nem no
--     WhatsApp.
--   · categories fica de fora de propósito: "Comida" serve nas duas, e
--     duplicá-la só daria trabalho a quem cria categoria.
--
-- Roda inteira, quantas vezes quiser. Nada aqui apaga dado.

begin;

-- ── 1. A coluna nas tabelas que guardam dinheiro ──────────────────
-- O default preenche as linhas que já existem: tudo que foi lançado até
-- hoje era pessoal, porque não havia outra opção.
alter table public.transactions add column if not exists wallet text not null default 'Pessoal';
alter table public.debts        add column if not exists wallet text not null default 'Pessoal';
alter table public.installments add column if not exists wallet text not null default 'Pessoal';
alter table public.savings      add column if not exists wallet text not null default 'Pessoal';
alter table public.recurring    add column if not exists wallet text not null default 'Pessoal';
alter table public.goals        add column if not exists wallet text not null default 'Pessoal';

-- ── 2. Meta por carteira ──────────────────────────────────────────
-- goals tinha user_phone como chave primária: uma meta por pessoa. Com
-- carteira, a meta da empresa e a de casa são objetivos diferentes e
-- precisam poder coexistir.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.goals'::regclass and contype = 'p'
      and (select count(*) from unnest(conkey)) = 1
  ) then
    alter table public.goals drop constraint goals_pkey;
    alter table public.goals add primary key (user_phone, wallet);
  end if;
end $$;

-- ── 3. Qual carteira está valendo, e quais existem ────────────────
-- active_wallet é o contexto do WhatsApp: sem ele, cada mensagem teria
-- que dizer de novo em qual carteira lançar, o que ninguém faria.
-- A lista fica aqui porque uma carteira recém-criada ainda não tem
-- lançamento nenhum — e sem a lista ela sumiria até o primeiro gasto.
alter table public.users add column if not exists active_wallet text not null default 'Pessoal';
alter table public.users add column if not exists wallets text[] not null default array['Pessoal'];

-- Quem já existia entra com a carteira padrão preenchida.
update public.users
   set wallets = array['Pessoal']
 where wallets is null or cardinality(wallets) = 0;

-- ── 4. Índices ────────────────────────────────────────────────────
-- Toda consulta do painel e do bot agora filtra por carteira junto com o
-- telefone. Sem isto, o Postgres varre as linhas das duas e descarta
-- metade — barato hoje, caro quando alguém tiver dois anos de histórico.
create index if not exists idx_transactions_carteira on public.transactions (user_phone, wallet, created_at desc);
create index if not exists idx_debts_carteira        on public.debts        (user_phone, wallet, status);
create index if not exists idx_installments_carteira on public.installments (user_phone, wallet, due_month);
create index if not exists idx_savings_carteira      on public.savings      (user_phone, wallet, created_at desc);
create index if not exists idx_recurring_carteira    on public.recurring    (user_phone, wallet, active);

-- ── 5. O painel precisa enxergar as carteiras ─────────────────────
-- A lista e a carteira ativa moram em users, que até agora só o backend lia.
-- Sem estas políticas, o seletor no painel viria vazio.
--
-- Só a própria linha, e só as duas colunas que interessam: a política casa o
-- telefone do perfil autenticado com o da linha, igual a todas as outras.
alter table public.users enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users for select to public
  using (phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users for update to public
  using (phone = (select profiles.phone from profiles where profiles.id = auth.uid()))
  with check (phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

commit;

-- ── Conferência ───────────────────────────────────────────────────
select 'transactions' as tabela, wallet, count(*) from public.transactions group by wallet
union all select 'debts',        wallet, count(*) from public.debts        group by wallet
union all select 'installments', wallet, count(*) from public.installments group by wallet
union all select 'savings',      wallet, count(*) from public.savings      group by wallet
union all select 'recurring',    wallet, count(*) from public.recurring    group by wallet
union all select 'goals',        wallet, count(*) from public.goals        group by wallet
order by tabela, wallet;
