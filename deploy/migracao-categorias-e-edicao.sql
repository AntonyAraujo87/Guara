-- ═══════════════════════════════════════════════════════════════════
-- Guará — categorias personalizadas e edição de lançamentos
-- Rodar uma vez no SQL Editor do Supabase. Seguro re-executar.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. CATEGORIAS PERSONALIZADAS ───────────────────────────────────
-- As categorias fixas ficam no código; aqui entram só as que a pessoa criar.
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_phone text not null,
  name text not null,
  kind text not null check (kind in ('despesa', 'receita')),
  created_at timestamptz not null default now(),
  unique (user_phone, name, kind)
);

create index if not exists categories_phone_idx on public.categories (user_phone);

alter table public.categories enable row level security;

drop policy if exists categories_select_own on public.categories;
create policy categories_select_own on public.categories for select to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories for insert to public
  with check (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories for delete to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));


-- ── 2. PODER EDITAR ────────────────────────────────────────────────
-- Faltavam políticas de UPDATE: sem elas, editar um lançamento ou marcar
-- uma parcela como paga era bloqueado pelo RLS.
drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions for update to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

drop policy if exists savings_update_own on public.savings;
create policy savings_update_own on public.savings for update to public
  using (user_phone = (select profiles.phone from profiles where profiles.id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- Pronto. Nenhum dado existente foi tocado.
-- ═══════════════════════════════════════════════════════════════════
