-- Guarda QUANDO a parcela foi paga.
--
-- Até aqui a tabela só sabia se a parcela estava paga (sim/não), e o gasto era
-- atribuído ao mês do vencimento. Só que o dinheiro sai da conta no dia em que
-- se paga: adiantar em agosto uma parcela de setembro tira de agosto.
--
-- Sem esta coluna não há como saber a diferença.
--
-- Seguro rodar mais de uma vez.
-- Onde rodar: painel do Supabase -> SQL Editor -> colar tudo -> Run.

alter table public.installments
  add column if not exists paid_at timestamptz;

-- Índice para o filtro por período: as consultas de saldo passam a buscar
-- parcelas pelo mês em que foram pagas.
create index if not exists installments_phone_pagoem_idx
  on public.installments (user_phone, paid_at);

-- As parcelas já marcadas como pagas não têm data registrada. Assume-se agora:
-- foram marcadas recentemente, e sem isso ficariam invisíveis para o saldo.
update public.installments
   set paid_at = now()
 where paid = true
   and paid_at is null;

-- Conferência.
select
  description                            as compra,
  installment_number || '/' || installments_total as parcela,
  amount                                 as valor,
  due_month                              as vence,
  paid                                   as paga,
  paid_at                                as paga_em
from public.installments
order by due_month, description
limit 20;
