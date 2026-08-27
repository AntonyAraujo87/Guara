-- Índices para as consultas que o Guará faz o tempo todo.
--
-- Hoje o banco tem poucas linhas e tudo parece instantâneo: o Postgres varre a
-- tabela inteira e ninguém percebe. Isso vira lentidão silenciosa conforme os
-- lançamentos se acumulam — primeiro na navegação entre meses, que filtra por
-- data, e depois em tudo. Criar agora é barato; criar depois é sob pressão.
--
-- Seguro rodar mais de uma vez: todo comando é "if not exists".
-- Onde rodar: painel do Supabase -> SQL Editor -> colar tudo -> Run.

-- ─────────────────────────────────────────────────────────────────────
-- 1. transactions — a mais consultada de todas
-- ─────────────────────────────────────────────────────────────────────
-- O painel filtra por mês (created_at >= início e < fim) sempre dentro de um
-- telefone, e ordena do mais recente pro mais antigo. O índice composto atende
-- o filtro e a ordenação de uma vez, sem passo extra de ordenação.
create index if not exists transactions_phone_data_idx
  on public.transactions (user_phone, created_at desc);

-- Perguntas por categoria ("quanto gastei com comida") filtram categoria dentro
-- do telefone. Sem isso, o Postgres pega tudo da pessoa e descarta o resto.
create index if not exists transactions_phone_categoria_idx
  on public.transactions (user_phone, category);

-- ─────────────────────────────────────────────────────────────────────
-- 2. debts — sempre filtrado por pendente
-- ─────────────────────────────────────────────────────────────────────
-- Combinados quitados nunca aparecem nas consultas, mas continuam na tabela e
-- vão se acumulando. O índice deixa o Postgres pular os quitados direto.
create index if not exists debts_phone_status_idx
  on public.debts (user_phone, status);

-- ─────────────────────────────────────────────────────────────────────
-- 3. recurring — lido a cada cadastro e a cada correção
-- ─────────────────────────────────────────────────────────────────────
create index if not exists recurring_phone_ativo_idx
  on public.recurring (user_phone, active);

-- ─────────────────────────────────────────────────────────────────────
-- 4. installments — já tem (user_phone, due_month); falta o resto
-- ─────────────────────────────────────────────────────────────────────
-- As consultas de parcela em aberto filtram paid = false antes da data.
create index if not exists installments_phone_pago_mes_idx
  on public.installments (user_phone, paid, due_month);

-- Apagar um parcelamento inteiro busca todas as linhas do mesmo purchase_id.
create index if not exists installments_compra_idx
  on public.installments (purchase_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. profiles — consultado a CADA mensagem recebida
-- ─────────────────────────────────────────────────────────────────────
-- isPhoneLinked() roda antes de responder qualquer coisa. É a consulta mais
-- frequente do sistema inteiro e hoje varre a tabela.
create index if not exists profiles_phone_idx
  on public.profiles (phone);

-- ─────────────────────────────────────────────────────────────────────
-- Conferência: lista o que existe agora.
-- ─────────────────────────────────────────────────────────────────────
select
  tablename  as tabela,
  indexname  as indice
from pg_indexes
where schemaname = 'public'
  and tablename in ('transactions', 'debts', 'recurring', 'installments', 'savings', 'profiles', 'categories')
order by tablename, indexname;
