-- ═══════════════════════════════════════════════════════════════════
-- Guará — parcelas com vencimento e cofrinho com metas
-- Rodar uma vez no SQL Editor do Supabase. Seguro re-executar.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. PARCELAS ────────────────────────────────────────────────────
-- Uma linha por parcela, com o mês em que ela cai. É isso que deixa
-- navegar pros meses da frente e ver o que já está comprometido.
create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  user_phone text not null,
  purchase_id uuid not null,              -- agrupa as parcelas da mesma compra
  description text not null,
  category text not null default 'Outros',
  installment_number int not null,        -- 1, 2, 3...
  installments_total int not null,        -- de quantas
  amount numeric(12,2) not null,          -- valor desta parcela
  due_month date not null,                -- sempre dia 1 do mês de vencimento
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists installments_phone_month_idx
  on public.installments (user_phone, due_month);

alter table public.installments enable row level security;

drop policy if exists installments_select_own on public.installments;
create policy installments_select_own on public.installments for select to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists installments_insert_own on public.installments;
create policy installments_insert_own on public.installments for insert to public
  with check (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists installments_update_own on public.installments;
create policy installments_update_own on public.installments for update to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists installments_delete_own on public.installments;
create policy installments_delete_own on public.installments for delete to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));


-- ── 2. COFRINHO ────────────────────────────────────────────────────
-- Guardar dinheiro não é gastar: fica em um caixa separado.
-- amount positivo = guardou, negativo = tirou de volta.
create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  user_phone text not null,
  amount numeric(12,2) not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists savings_phone_date_idx
  on public.savings (user_phone, created_at desc);

alter table public.savings enable row level security;

drop policy if exists savings_select_own on public.savings;
create policy savings_select_own on public.savings for select to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists savings_insert_own on public.savings;
create policy savings_insert_own on public.savings for insert to public
  with check (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists savings_delete_own on public.savings;
create policy savings_delete_own on public.savings for delete to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));


-- ── 3. METAS ───────────────────────────────────────────────────────
-- Uma meta mensal ("guardar 200 por mês") e, opcionalmente, um objetivo
-- maior com nome ("juntar 5000 pra viagem").
create table if not exists public.goals (
  user_phone text primary key,
  monthly_target numeric(12,2),
  goal_name text,
  goal_target numeric(12,2),
  updated_at timestamptz not null default now()
);

alter table public.goals enable row level security;

drop policy if exists goals_select_own on public.goals;
create policy goals_select_own on public.goals for select to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists goals_insert_own on public.goals;
create policy goals_insert_own on public.goals for insert to public
  with check (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists goals_update_own on public.goals;
create policy goals_update_own on public.goals for update to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- Pronto. Nenhum dado existente foi tocado.
-- ═══════════════════════════════════════════════════════════════════
