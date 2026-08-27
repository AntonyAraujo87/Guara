-- APAGA TUDO. Não tem desfazer.
--
-- Zera as 10 tabelas do Guará e remove as contas de acesso. Serve pra recomeçar
-- do zero — testar o cadastro de ponta a ponta, limpar dados de teste antes de
-- alguém de verdade usar.
--
-- ANTES DE RODAR, FAÇA UM BACKUP NA MÃO:
--   bash /home/ubuntu/guara/deploy/backup.sh
-- O automático roda às 6h. Resetar às 22h sem isso perde o dia inteiro.
--
-- O QUE MAIS ACONTECE:
--   - Sua conta some junto (delete from auth.users). Depois é preciso criar
--     conta de novo, confirmar o e-mail e vincular o telefone outra vez.
--     Não é efeito colateral: é o que "resetar tudo" significa.
--   - A ordem importa. profiles referencia auth.users, então sai primeiro;
--     ao contrário, a chave estrangeira recusa.
--   - "restart identity" não faz nada aqui, e tudo bem: as tabelas usam
--     identificador aleatório em vez de contador, então não há sequência.
--
-- Onde rodar: painel do Supabase -> SQL Editor.

truncate table
  public.transactions,
  public.debts,
  public.installments,
  public.savings,
  public.goals,
  public.recurring,
  public.categories,
  public.phone_verifications
restart identity;

delete from public.users;
delete from public.profiles;
delete from auth.users;

-- Conferência: tudo deve voltar zero.
select 'transactions' as tabela, count(*) from public.transactions
union all select 'debts',              count(*) from public.debts
union all select 'installments',       count(*) from public.installments
union all select 'savings',            count(*) from public.savings
union all select 'goals',              count(*) from public.goals
union all select 'recurring',          count(*) from public.recurring
union all select 'categories',         count(*) from public.categories
union all select 'phone_verifications', count(*) from public.phone_verifications
union all select 'users',              count(*) from public.users
union all select 'profiles',           count(*) from public.profiles
union all select 'auth.users',         count(*) from auth.users
order by tabela;
