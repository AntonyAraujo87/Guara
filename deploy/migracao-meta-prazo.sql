-- ═══════════════════════════════════════════════════════════════════
-- PRAZO NA META
-- ═══════════════════════════════════════════════════════════════════
--
-- "Preciso juntar 5 mil até novembro" guardava "novembro" como NOME da
-- meta. O nome respondia bonito na tela, mas a informação que importava
-- — a data — se perdia. Sem ela, "quanto preciso guardar por mês?" não
-- tem resposta possível: falta o denominador.
--
-- Uma coluna resolve. Fica como date e não como texto porque o cálculo
-- é aritmética de calendário, e guardar data como texto é adiar a
-- conversão pro lugar mais caro: o meio da conta.

begin;

alter table public.goals add column if not exists goal_deadline date;

-- Metas antigas onde o mês virou nome. Converte o que dá pra converter
-- sem chutar: só nomes de mês puros, e sempre a próxima ocorrência dele.
--
-- "novembro" em agosto de 2026 vira 30/11/2026. Já "novembro" em
-- dezembro de 2026 viraria 30/11/2027 — o que é o certo: quem fala de
-- novembro em dezembro está falando do ano que vem.
do $$
declare
  r record;
  v_mes int;
  v_ano int;
  MESES text[] := array['janeiro','fevereiro','março','abril','maio','junho',
                        'julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  for r in select user_phone, wallet, lower(btrim(goal_name)) as nome
             from public.goals
            where goal_deadline is null and goal_name is not null
  loop
    v_mes := array_position(MESES, r.nome);
    if v_mes is null then
      continue;
    end if;

    v_ano := extract(year from current_date)::int;
    -- Mês que já passou neste ano é do ano que vem.
    if v_mes < extract(month from current_date)::int then
      v_ano := v_ano + 1;
    end if;

    -- Último dia do mês: a pessoa disse "até novembro", não "dia 1º".
    update public.goals
       set goal_deadline = (make_date(v_ano, v_mes, 1) + interval '1 month - 1 day')::date
     where user_phone = r.user_phone and wallet = r.wallet;
  end loop;
end $$;

commit;

-- ── Conferência ───────────────────────────────────────────────────
select user_phone, wallet, goal_name, goal_target, goal_deadline,
       case when goal_deadline is null then null
            else (goal_deadline - current_date) end as dias_restantes
  from public.goals
 order by user_phone;
