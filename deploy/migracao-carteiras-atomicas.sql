-- ═══════════════════════════════════════════════════════════════════
-- CARTEIRAS ATÔMICAS
-- ═══════════════════════════════════════════════════════════════════
--
-- Encontrado numa auditoria. Duas falhas com a mesma raiz: mexer nas
-- carteiras eram VÁRIAS operações separadas, e entre uma e outra o
-- mundo podia mudar.
--
--   1) RENOMEAR percorria seis tabelas e só depois atualizava a lista.
--      Falhando na quarta, três tabelas ficavam com o nome novo e a
--      lista com o antigo — e o dinheiro renomeado sumia da tela, num
--      nome de carteira que não existia mais em lugar nenhum.
--
--   2) CRIAR e APAGAR liam a lista, mexiam e gravavam de volta. Duas
--      requisições ao mesmo tempo (o painel e o WhatsApp, ou dois
--      toques no botão) faziam uma sobrescrever a outra em silêncio.
--
-- Função plpgsql roda numa transação implícita: ou tudo acontece, ou
-- nada acontece. E o `for update` segura a linha do usuário enquanto
-- isso, então duas chamadas simultâneas viram uma fila em vez de uma
-- corrida.
--
-- Roda inteira, quantas vezes quiser.

begin;

-- ── CRIAR ─────────────────────────────────────────────────────────
create or replace function public.guara_criar_carteira(
  p_phone text,
  p_nome text,
  p_limite int default 10
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista text[];
  v_nome text := btrim(p_nome);
begin
  if v_nome = '' then
    return jsonb_build_object('erro', 'sem_nome');
  end if;
  v_nome := left(v_nome, 24);
  v_nome := upper(left(v_nome, 1)) || substr(v_nome, 2);

  -- Segura a linha: outra chamada para o mesmo telefone espera aqui.
  select wallets into v_lista from public.users where phone = p_phone for update;
  if v_lista is null then
    v_lista := array['Pessoal'];
  end if;

  if exists (select 1 from unnest(v_lista) c where lower(c) = lower(v_nome)) then
    return jsonb_build_object('erro', 'ja_existe', 'nome', v_nome);
  end if;

  if cardinality(v_lista) >= p_limite then
    return jsonb_build_object('erro', 'demais', 'carteiras', to_jsonb(v_lista));
  end if;

  v_lista := v_lista || v_nome;
  update public.users set wallets = v_lista where phone = p_phone;

  return jsonb_build_object('nome', v_nome, 'carteiras', to_jsonb(v_lista));
end;
$$;

-- ── RENOMEAR ──────────────────────────────────────────────────────
-- As seis tabelas e a lista mudam juntas, ou nenhuma muda.
create or replace function public.guara_renomear_carteira(
  p_phone text,
  p_de text,
  p_para text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista text[];
  v_ativa text;
  v_alvo text;
  v_novo text := btrim(p_para);
begin
  if v_novo = '' then
    return jsonb_build_object('erro', 'sem_nome');
  end if;
  v_novo := left(v_novo, 24);
  v_novo := upper(left(v_novo, 1)) || substr(v_novo, 2);

  select wallets, active_wallet into v_lista, v_ativa
    from public.users where phone = p_phone for update;
  if v_lista is null then
    return jsonb_build_object('erro', 'nao_achei', 'carteiras', to_jsonb(array['Pessoal']));
  end if;

  -- Nome exato primeiro; só depois por pedaço, pra "empresa" achar "Empresa"
  -- sem que "a" ache qualquer coisa.
  select c into v_alvo from unnest(v_lista) c where lower(c) = lower(btrim(p_de)) limit 1;
  if v_alvo is null then
    select c into v_alvo from unnest(v_lista) c
     where lower(c) like '%' || lower(btrim(p_de)) || '%' limit 1;
  end if;
  if v_alvo is null then
    return jsonb_build_object('erro', 'nao_achei', 'carteiras', to_jsonb(v_lista));
  end if;

  if exists (select 1 from unnest(v_lista) c where c <> v_alvo and lower(c) = lower(v_novo)) then
    return jsonb_build_object('erro', 'ja_existe', 'nome', v_novo);
  end if;

  update public.transactions set wallet = v_novo where user_phone = p_phone and wallet = v_alvo;
  update public.debts        set wallet = v_novo where user_phone = p_phone and wallet = v_alvo;
  update public.installments set wallet = v_novo where user_phone = p_phone and wallet = v_alvo;
  update public.savings      set wallet = v_novo where user_phone = p_phone and wallet = v_alvo;
  update public.recurring    set wallet = v_novo where user_phone = p_phone and wallet = v_alvo;
  update public.goals        set wallet = v_novo where user_phone = p_phone and wallet = v_alvo;

  v_lista := array_replace(v_lista, v_alvo, v_novo);
  update public.users
     set wallets = v_lista,
         active_wallet = case when active_wallet = v_alvo then v_novo else active_wallet end
   where phone = p_phone;

  return jsonb_build_object('de', v_alvo, 'para', v_novo, 'carteiras', to_jsonb(v_lista));
end;
$$;

-- ── APAGAR ────────────────────────────────────────────────────────
-- Nunca apaga dinheiro: devolve tudo pra carteira padrão.
create or replace function public.guara_apagar_carteira(
  p_phone text,
  p_nome text,
  p_padrao text default 'Pessoal'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista text[];
  v_ativa text;
  v_alvo text;
  v_movidos int := 0;
  v_n int;
begin
  select wallets, active_wallet into v_lista, v_ativa
    from public.users where phone = p_phone for update;
  if v_lista is null then
    return jsonb_build_object('erro', 'nao_achei', 'carteiras', to_jsonb(array[p_padrao]));
  end if;

  select c into v_alvo from unnest(v_lista) c where lower(c) = lower(btrim(p_nome)) limit 1;
  if v_alvo is null then
    select c into v_alvo from unnest(v_lista) c
     where lower(c) like '%' || lower(btrim(p_nome)) || '%' limit 1;
  end if;
  if v_alvo is null then
    return jsonb_build_object('erro', 'nao_achei', 'carteiras', to_jsonb(v_lista));
  end if;
  if v_alvo = p_padrao then
    return jsonb_build_object('erro', 'e_a_padrao');
  end if;
  if cardinality(v_lista) <= 1 then
    return jsonb_build_object('erro', 'ultima');
  end if;

  update public.transactions set wallet = p_padrao where user_phone = p_phone and wallet = v_alvo;
  get diagnostics v_n = row_count; v_movidos := v_movidos + v_n;
  update public.debts set wallet = p_padrao where user_phone = p_phone and wallet = v_alvo;
  get diagnostics v_n = row_count; v_movidos := v_movidos + v_n;
  update public.installments set wallet = p_padrao where user_phone = p_phone and wallet = v_alvo;
  get diagnostics v_n = row_count; v_movidos := v_movidos + v_n;
  update public.savings set wallet = p_padrao where user_phone = p_phone and wallet = v_alvo;
  get diagnostics v_n = row_count; v_movidos := v_movidos + v_n;
  update public.recurring set wallet = p_padrao where user_phone = p_phone and wallet = v_alvo;
  get diagnostics v_n = row_count; v_movidos := v_movidos + v_n;

  -- goals tem chave (user_phone, wallet): mover pra padrão colidiria com a
  -- meta que já existe lá. A da carteira apagada sai.
  delete from public.goals where user_phone = p_phone and wallet = v_alvo;

  v_lista := array_remove(v_lista, v_alvo);
  update public.users
     set wallets = v_lista,
         active_wallet = case when active_wallet = v_alvo then p_padrao else active_wallet end
   where phone = p_phone;

  return jsonb_build_object('nome', v_alvo, 'movidos', v_movidos, 'carteiras', to_jsonb(v_lista));
end;
$$;

-- Só o backend (service_role) chama estas funções. O painel passa pelo
-- /api/carteiras, que confere o login antes.
revoke execute on function public.guara_criar_carteira(text, text, int) from public, anon, authenticated;
revoke execute on function public.guara_renomear_carteira(text, text, text) from public, anon, authenticated;
revoke execute on function public.guara_apagar_carteira(text, text, text) from public, anon, authenticated;

commit;

-- ── Conferência ───────────────────────────────────────────────────
select proname as funcao, pg_get_function_identity_arguments(oid) as argumentos
  from pg_proc
 where proname like 'guara_%carteira%'
 order by proname;
