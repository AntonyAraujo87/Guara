'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { categoryColor } from '@/lib/chartColors';
import { useIsDark } from '@/lib/useIsDark';
import AuthCard from '@/components/AuthCard';
import LinkPhoneCard from '@/components/LinkPhoneCard';
import {
  AbaGuardado,
  AbaAjustes,
  FalarComGuara,
} from '@/components/AbasDoPainel';

import {
  ModalEditar,
  ModalRecorrente,
  ModalCofrinho,
  ModalRenomearPote,
} from '@/components/Modais';

import {
  renderDonutLabel,
  Bloco,
  EmptyChart,
  BotaoAba,
  Carregando,
  DebtRow,
} from '@/components/PecasDoPainel';

import type { Transaction, Installment, Saving, Categoria, Recorrente, Aba } from '@/lib/tipos';
import {
  CATEGORIAS_PADRAO,
  MESES,
  mesPorDeslocamento,
  chaveDoMes,
  currency,
  authedFetch,
} from '@/lib/painel';

import {
  montarLancamentos,
  filtrarPorMes,
  filtrarPorBusca,
  somarPorTipo,
  somarPorCategoria,
  evolucaoDoSaldo,
  somarDividas,
  agruparPotes,
  totaisDoCofrinho,
  parcelasQueVencemEm,
  totalAindaComprometido,
  somar,
} from '@/lib/calculos';
import { gerarPlanilha, baixarArquivo, nomeDaPlanilha } from '@/lib/planilha';
import { useCarteiras } from '@/hooks/useCarteiras';
import { useBuscaAdiada } from '@/hooks/useBuscaAdiada';
import { useDadosDoPainel } from '@/hooks/useDadosDoPainel';

import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, LogOut, Search, Trash2, Inbox, Check, HandCoins,
  CalendarDays, PiggyBank, ChevronLeft, ChevronRight, CreditCard, Settings, Pencil, Plus, Download, X, Repeat, } from 'lucide-react';


export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [phone, setPhone] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Sem isso, uma operação que o banco recusa não muda a tela nem diz nada — a
  // pessoa clica de novo achando que não pegou.
  const [avisoErro, setAvisoErro] = useState<string | null>(null);

  // Some sozinho depois de um tempo. Oito segundos dá pra ler com calma sem o
  // aviso virar parte da tela; quem quiser tirar antes tem o botão de fechar.
  useEffect(() => {
    if (!avisoErro) return;
    const t = setTimeout(() => setAvisoErro(null), 8000);
    return () => clearTimeout(t);
  }, [avisoErro]);

  const [respostasGuara, setRespostasGuara] = useState<string[]>([]);
  const [enviandoGuara, setEnviandoGuara] = useState(false);
  const [editando, setEditando] = useState<Transaction | null>(null);
  const [editandoRec, setEditandoRec] = useState<Recorrente | null>(null);
  const [editandoPote, setEditandoPote] = useState<Saving | null>(null);
  // Guarda o NOME do cofrinho sendo renomeado (não o lançamento: renomear
  // atinge todos os lançamentos daquele pote de uma vez).
  const [renomeandoPote, setRenomeandoPote] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const { texto: search, setTexto: setSearch, filtro: buscaAplicada } = useBuscaAdiada();
  const [aba, setAba] = useState<Aba>('mes');
  const [monthOffset, setMonthOffset] = useState(0);
  const isDark = useIsDark();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Busca o telefone ligado à conta.
  //
  // O `cancelado` não é enfeite: trocar de conta rápido (sair e entrar) dispara
  // duas buscas, e sem a trava a primeira pode responder DEPOIS da segunda e
  // deixar o painel com o telefone da conta anterior.
  useEffect(() => {
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local phone state on logout, mirrors external auth state
      setPhone(null);
      return;
    }
    let cancelado = false;
    setProfileLoading(true);
    supabase
      .from('profiles')
      .select('phone')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return;
        setPhone(data?.phone || null);
        setProfileLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [session]);

  // Carteira ativa e dados do painel saíram pra hooks próprios. O que era 220
  // linhas de estado e consulta aqui dentro virou duas chamadas — e as regras
  // de carteira deixaram de estar misturadas com as de renderização.
  const {
    carteiras,
    carteira,
    carteirasProntas,
    buscarCarteiras,
    trocarDeCarteira,
    mexerNaCarteira,
  } = useCarteiras(phone, setAvisoErro);

  const {
    transactions,
    debts,
    installments,
    savings,
    goal,
    categories,
    recurring,
    loading,
    setTransactions,
    setDebts,
    setInstallments,
    setSavings,
    setCategories,
    setRecurring,
    recarregarTudo,
    limparTudo,
  } = useDadosDoPainel(phone, carteira, carteirasProntas, monthOffset);

  // Manda a frase pro mesmo cérebro que atende o WhatsApp. É o que dá ao
  // painel as MESMAS capacidades do chat sem reescrever nenhuma delas — e sem
  // que as duas versões comecem a divergir na primeira pressa.
  async function falarComGuara(texto: string) {
    setEnviandoGuara(true);
    setRespostasGuara([]);
    try {
      const { ok, json } = await authedFetch('/api/mensagem', { texto });
      setRespostasGuara(ok ? json.respostas || [] : [json.error || 'Não consegui processar agora.']);
      if (ok) {
        // O que ele fez pode ter mexido em qualquer tabela — recarrega tudo em
        // vez de tentar adivinhar o quê.
        await Promise.all([buscarCarteiras(), recarregarTudo()]);
      }
    } catch {
      setRespostasGuara(['Não consegui falar com o Guará agora. Tenta de novo.']);
    } finally {
      setEnviandoGuara(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar essa transação?')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) return setAvisoErro('Não consegui apagar esse lançamento.');
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSettleDebt(id: string) {
    const { error } = await supabase.from('debts').update({ status: 'quitada', settled_at: new Date().toISOString() }).eq('id', id);
    if (error) return setAvisoErro('Não consegui quitar esse combinado.');
    setDebts((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleDeleteDebt(id: string) {
    if (!confirm('Apagar essa dívida?')) return;
    const { error } = await supabase.from('debts').delete().eq('id', id);
    if (error) return setAvisoErro('Não consegui apagar esse combinado.');
    setDebts((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleDeleteRecurring(id: string, descricao: string) {
    if (!confirm(`Parar de lançar "${descricao}" todo mês?`)) return;
    const { error } = await supabase.from('recurring').delete().eq('id', id);
    if (error) return setAvisoErro('Não consegui apagar esse gasto fixo.');
    setRecurring((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleTogglePaid(p: Installment) {
    const novo = !p.paid;
    // Guarda QUANDO foi paga: é a data que decide de qual mês o dinheiro sai.
    // Desmarcar limpa, senão a parcela continuaria pesando num mês passado.
    const pagoEm = novo ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('installments')
      .update({ paid: novo, paid_at: pagoEm })
      .eq('id', p.id);
    if (error) return setAvisoErro('Não consegui marcar essa parcela.');
    setInstallments((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, paid: novo, paid_at: pagoEm } : x))
    );
  }

  async function handleSaveEdit(t: Transaction) {
    const { error } = await supabase
      .from('transactions')
      .update({
        amount: t.amount,
        type: t.type,
        category: t.category,
        description: t.description,
      })
      .eq('id', t.id);
    // O modal fica aberto quando falha: fechá-lo daria a entender que salvou.
    if (error) return setAvisoErro('Não consegui salvar esse lançamento.');
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    setEditando(null);
  }

  async function handleSaveRecurring(r: Recorrente) {
    const { error } = await supabase
      .from('recurring')
      .update({ description: r.description, amount: r.amount, day_of_month: r.day_of_month, category: r.category })
      .eq('id', r.id);
    if (error) return setAvisoErro('Não consegui salvar esse gasto fixo.');
    setRecurring((prev) => prev.map((x) => (x.id === r.id ? r : x)).sort((a, b) => a.day_of_month - b.day_of_month));
    setEditandoRec(null);
  }

  async function handleSaveSaving(s: Saving) {
    const { error } = await supabase
      .from('savings')
      .update({ amount: s.amount, jar: s.jar, description: s.description })
      .eq('id', s.id);
    if (error) return setAvisoErro('Não consegui salvar esse lançamento do cofrinho.');
    setSavings((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    setEditandoPote(null);
  }

  // Cofrinho não é uma tabela: o nome vive em cada lançamento. Renomear é
  // atualizar todos os lançamentos daquele pote de uma vez.
  async function handleRenomearPote(nomeAntigo: string, nomeNovo: string) {
    const novo = nomeNovo.trim();
    if (!novo || novo === nomeAntigo || !phone) return;

    // "Geral" é o rótulo de quem não tem nome — no banco esses lançamentos têm
    // jar vazio ou nulo, então precisam de um filtro diferente.
    const alvos = savings.filter((s) =>
      nomeAntigo === 'Geral' ? !(s.jar || '').trim() : (s.jar || '').trim() === nomeAntigo
    );
    if (alvos.length === 0) return;

    const { error } = await supabase
      .from('savings')
      .update({ jar: novo })
      .in('id', alvos.map((s) => s.id));

    if (error) return setAvisoErro('Não consegui renomear esse cofrinho.');

    const ids = new Set(alvos.map((s) => s.id));
    setSavings((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, jar: novo } : s)));
    setRenomeandoPote(null);
  }

  async function handleAddCategory(name: string, kind: 'despesa' | 'receita') {
    const limpo = name.trim();
    if (!limpo || !phone) return;
    const { data, error } = await supabase
      .from('categories')
      .insert({ user_phone: phone, name: limpo, kind })
      .select()
      .single();
    if (!error && data) setCategories((prev) => [...prev, data as Categoria].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleDeleteCategory(id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) return setAvisoErro('Não consegui apagar essa categoria.');
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  // Apaga a compra inteira, não uma parcela solta: sobrar "parcela 3 de 6" sem as
  // outras não faz sentido pra ninguém.
  async function handleDeletePurchase(purchaseId: string, descricao: string) {
    if (!confirm(`Apagar "${descricao}" e todas as suas parcelas?`)) return;
    const { error } = await supabase.from('installments').delete().eq('purchase_id', purchaseId);
    if (error) return setAvisoErro('Não consegui apagar esse parcelamento.');
    setInstallments((prev) => prev.filter((p) => p.purchase_id !== purchaseId));
  }

  async function handleDeleteSaving(id: string) {
    if (!confirm('Apagar esse lançamento do cofrinho?')) return;
    const { error } = await supabase.from('savings').delete().eq('id', id);
    if (error) return setAvisoErro('Não consegui apagar esse lançamento do cofrinho.');
    setSavings((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    limparTudo();
  }

  const mesAtivo = useMemo(() => mesPorDeslocamento(monthOffset), [monthOffset]);
  const ehFuturo = monthOffset > 0;

  // As contas vivem em lib/calculos.ts. Aqui ficou só a memoização — quando a
  // regra de negócio mora fora do componente, dá pra conferir uma conta sem
  // renderizar o painel inteiro.
  const lancamentos = useMemo(
    () => montarLancamentos(transactions, savings, installments),
    [transactions, savings, installments]
  );

  const dateFiltered = useMemo(() => filtrarPorMes(lancamentos, mesAtivo), [lancamentos, mesAtivo]);
  // Usa a busca ADIADA, não a tecla recém-digitada: é o que impede os dois
  // gráficos de se redesenharem a cada letra.
  const filtered = useMemo(() => filtrarPorBusca(dateFiltered, buscaAplicada), [dateFiltered, buscaAplicada]);

  const parcelasDoMes = useMemo(
    () => parcelasQueVencemEm(installments, chaveDoMes(mesAtivo)),
    [installments, mesAtivo]
  );
  const totalParcelasDoMes = useMemo(() => somar(parcelasDoMes), [parcelasDoMes]);
  const totalComprometido = useMemo(
    () => totalAindaComprometido(installments, chaveDoMes(mesPorDeslocamento(0))),
    [installments]
  );

  const { totalGuardado, guardadoNoMes } = useMemo(
    () => totaisDoCofrinho(savings, mesPorDeslocamento(0)),
    [savings]
  );

  const { receitas, despesas, saldo } = useMemo(() => somarPorTipo(filtered), [filtered]);
  const expensesByCategory = useMemo(() => somarPorCategoria(filtered), [filtered]);
  const balanceTrend = useMemo(() => evolucaoDoSaldo(filtered), [filtered]);
  const { aReceber, aPagar } = useMemo(() => somarDividas(debts), [debts]);

  // Precisa ficar ACIMA dos returns antecipados logo abaixo. Estava depois, e o
  // resultado era que quem não estava logado renderizava 21 hooks e quem estava
  // renderizava 22 — o React exige a mesma quantidade em toda renderização e
  // derrubava o app inteiro (erro #310) assim que a sessão carregava.
  const potes = useMemo(() => agruparPotes(savings), [savings]);

  const chartSurface = isDark ? '#211a12' : '#fffbf4';
  const gridColor = isDark ? '#3a2e21' : '#d8c6ac';
  const mutedText = isDark ? '#9c8a72' : '#8a7358';
  const balanceColor = isDark ? '#e85f26' : '#c4400d';

  if (authLoading) {
    return <Carregando />;
  }

  if (!session) {
    return <AuthCard />;
  }

  if (profileLoading) {
    return <Carregando />;
  }

  if (!phone) {
    return <LinkPhoneCard onLinked={(p) => setPhone(p)} />;
  }

  const rotuloMes = `${MESES[mesAtivo.mes]} de ${mesAtivo.ano}`;

  const fixosDoMes = recurring
    .filter((r) => r.type === 'despesa')
    .reduce((s, r) => s + Number(r.amount), 0);

  // Padrão + personalizadas, sem repetir nome.
  const categoriasDisponiveis = (kind: 'despesa' | 'receita') => {
    const extras = categories.filter((c) => c.kind === kind).map((c) => c.name);
    return [...new Set([...CATEGORIAS_PADRAO[kind], ...extras])];
  };

  // A planilha é montada em lib/planilha.ts — 110 linhas de formatação de
  // célula que não têm nada a ver com renderizar tela.
  async function exportarPlanilha() {
    if (exportando) return;
    setExportando(true);
    try {
      const blob = await gerarPlanilha({
        lancamentos: filtered,
        ano: mesAtivo.ano,
        mes: mesAtivo.mes,
        receitas,
        despesas,
      });
      baixarArquivo(blob, nomeDaPlanilha(mesAtivo.ano, mesAtivo.mes));
    } catch (err) {
      console.error('Erro ao gerar planilha:', err);
      // O mesmo aviso do resto do painel, e não alert(): o alert trava a página
      // e, num PWA no celular, aparece como se fosse erro do navegador.
      setAvisoErro('Não consegui gerar a planilha.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--areia)] px-4 py-6 sm:py-8">
      {/* Fica fixo no topo porque a operação que falhou pode estar em qualquer
          parte da página, inclusive fora da área visível no momento.
          role="alert" faz o leitor de tela anunciar sem precisar de foco. */}
      {avisoErro && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,30rem)] flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--carmim)] text-[var(--sobre-cor)] shadow-lg"
        >
          <span className="text-lg leading-6" aria-hidden="true">⚠️</span>
          <p className="flex-1 text-base leading-6">
            {avisoErro} <span className="opacity-85">Tenta de novo em instantes.</span>
          </p>
          <button
            type="button"
            onClick={() => setAvisoErro(null)}
            aria-label="Fechar aviso"
            className="p-1 -mr-1 rounded-lg hover:bg-black/20 transition shrink-0"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-7">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, no benefit from next/image here */}
            <img src="/logo.png" alt="" className="w-12 h-12 rounded-xl" />
            <div>
              <h1 className="titulo text-4xl text-[var(--ferrugem)] leading-none">Guará</h1>
              <p className="text-base text-[var(--tinta-media)] mt-1">
                {session.user.email} · {phone}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="rotulo flex items-center gap-2 text-sm px-4 py-2.5 rounded-full border-2 border-[var(--borda-forte)] text-[var(--tinta-media)] hover:bg-[var(--tinta)] hover:text-[var(--creme)] hover:border-[var(--tinta)] transition"
          >
            <LogOut size={17} /> Sair
          </button>
        </header>

        {/* Carteiras: só aparece pra quem tem mais de uma. Um seletor com uma
            opção só é ruído — ocupa espaço e não decide nada. */}
        {carteiras.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Wallet size={17} className="text-[var(--tinta-media)]" aria-hidden />
            <span className="rotulo text-xs text-[var(--tinta-media)] mr-1">Carteira</span>
            {carteiras.map((c) => (
              <button
                key={c}
                onClick={() => trocarDeCarteira(c)}
                aria-pressed={c === carteira}
                className={`rotulo text-sm px-4 py-2 rounded-full border-2 transition ${
                  c === carteira
                    ? 'bg-[var(--ferrugem)] border-[var(--ferrugem)] text-[var(--sobre-cor)]'
                    : 'border-[var(--borda-forte)] text-[var(--tinta-media)] hover:bg-[var(--areia)]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Abas */}
        <div className="flex flex-wrap gap-2 mb-6" role="tablist">
          <BotaoAba ativo={aba === 'mes'} onClick={() => setAba('mes')} icone={<CalendarDays size={19} />}>
            Meu mês
          </BotaoAba>
          <BotaoAba ativo={aba === 'guardado'} onClick={() => setAba('guardado')} icone={<PiggyBank size={19} />}>
            Guardado
          </BotaoAba>
          <BotaoAba ativo={aba === 'ajustes'} onClick={() => setAba('ajustes')} icone={<Settings size={19} />}>
            Ajustes
          </BotaoAba>
        </div>

        <FalarComGuara
          onEnviar={falarComGuara}
          enviando={enviandoGuara}
          respostas={respostasGuara}
          onLimpar={() => setRespostasGuara([])}
          carteira={carteira}
          temVariasCarteiras={carteiras.length > 1}
        />

        {aba === 'ajustes' ? (
          <AbaAjustes
            carteiras={carteiras}
            carteiraAtiva={carteira}
            onCarteira={mexerNaCarteira}
            categorias={categories}
            onAdicionar={handleAddCategory}
            onApagar={handleDeleteCategory}
          />
        ) : aba === 'guardado' ? (
          <AbaGuardado
            total={totalGuardado}
            noMes={guardadoNoMes}
            meta={goal}
            potes={potes}
            onRenomear={(nome) => setRenomeandoPote(nome)}
            lancamentos={savings}
            onApagar={handleDeleteSaving}
            onEditar={setEditandoPote}
          />
        ) : (
        <>
        {/* Navegador de mês */}
        <div className="flex items-center justify-between gap-3 bg-[var(--creme)] border-2 border-[var(--borda)] rounded-2xl p-2 mb-4">
          <button
            onClick={() => setMonthOffset((v) => v - 1)}
            aria-label="Mês anterior"
            className="p-3 rounded-xl text-[var(--tinta)] hover:bg-[var(--areia)] transition"
          >
            <ChevronLeft size={26} />
          </button>
          <div className="text-center min-w-0">
            <p className="titulo text-xl sm:text-2xl text-[var(--tinta)] truncate">{rotuloMes}</p>
            {monthOffset !== 0 && (
              <button
                onClick={() => setMonthOffset(0)}
                className="rotulo text-xs text-[var(--ferrugem)] underline underline-offset-2 mt-0.5"
              >
                Voltar pro mês atual
              </button>
            )}
          </div>
          <button
            onClick={() => setMonthOffset((v) => v + 1)}
            aria-label="Próximo mês"
            className="p-3 rounded-xl text-[var(--tinta)] hover:bg-[var(--areia)] transition"
          >
            <ChevronRight size={26} />
          </button>
        </div>

        {ehFuturo ? (
          /* Mês futuro: ainda não há lançamentos, só o que já está comprometido. */
          <section className="bloco px-6 py-7 sm:px-9 sm:py-9 mb-4" style={{ backgroundColor: 'var(--ferrugem)' }}>
            <CalendarDays size={175} strokeWidth={1} aria-hidden="true" className="absolute -right-8 -bottom-10 opacity-[0.13] pointer-events-none" />
            <p className="rotulo text-sm sm:text-base opacity-90">
                {monthOffset === 0 ? 'Já comprometido' : `Já comprometido em ${MESES[mesAtivo.mes]}`}
              </p>
            <p className="bloco-cifra text-5xl sm:text-7xl mt-3">{currency.format(totalParcelasDoMes)}</p>
            <p className="text-base sm:text-lg mt-4 opacity-90">
              {parcelasDoMes.length === 0
                ? 'Nada parcelado caindo neste mês. 🎉'
                : `${parcelasDoMes.length} ${parcelasDoMes.length === 1 ? 'parcela' : 'parcelas'} a pagar`}
            </p>
          </section>
        ) : (
          <>
            {/* Saldo: o campo inteiro muda de cor conforme o sinal */}
            <section
              className="bloco px-6 py-7 sm:px-9 sm:py-9 mb-4"
              style={{ backgroundColor: saldo >= 0 ? 'var(--verde)' : 'var(--carmim)' }}
            >
              <Wallet
                size={190}
                strokeWidth={1}
                aria-hidden="true"
                className="absolute -right-8 -bottom-12 opacity-[0.13] pointer-events-none"
              />
              {/* No mês corrente o nome do mês é ruído: o seletor logo acima já
                  diz qual é. Navegando para outro mês ele volta, senão "atual"
                  mentiria — o número seria de setembro com cara de hoje. */}
              <p className="rotulo text-sm sm:text-base opacity-90">
                {monthOffset === 0 ? 'Saldo atual' : `Saldo de ${MESES[mesAtivo.mes]}`}
              </p>
              <p className="bloco-cifra text-5xl sm:text-7xl mt-3">{currency.format(saldo)}</p>
              <p className="text-base sm:text-lg mt-4 opacity-90">
                {filtered.length === 0
                  ? 'Nenhum lançamento neste mês'
                  : `${filtered.length} ${filtered.length === 1 ? 'lançamento' : 'lançamentos'} · ${saldo >= 0 ? 'você está no azul' : 'você gastou mais do que entrou'}`}
              </p>
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Bloco
                rotulo="Entradas"
                valor={currency.format(receitas)}
                cor="var(--verde)"
                icone={<TrendingUp size={130} strokeWidth={1.25} aria-hidden="true" />}
              />
              <Bloco
                rotulo="Saídas"
                valor={currency.format(despesas)}
                cor="var(--carmim)"
                icone={<TrendingDown size={130} strokeWidth={1.25} aria-hidden="true" />}
              />
            </div>
          </>
        )}

        {/* Parcelas que vencem no mês selecionado */}
        {parcelasDoMes.length > 0 && (
          <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6 mb-4">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-start gap-2.5">
                <CreditCard size={24} className="text-[var(--ferrugem)] shrink-0 mt-1" />
                <h2 className="titulo text-2xl text-[var(--tinta)]">Parcelas de {MESES[mesAtivo.mes]}</h2>
              </div>
              <p className="bloco-cifra text-2xl shrink-0" style={{ color: 'var(--ferrugem)' }}>
                {currency.format(totalParcelasDoMes)}
              </p>
            </div>
            <div className="space-y-2">
              {parcelasDoMes.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 pl-4 pr-3 rounded-xl bg-[var(--areia)]"
                  style={{ borderLeft: `6px solid ${p.paid ? 'var(--verde)' : 'var(--ferrugem)'}` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-lg font-semibold break-words ${p.paid ? 'text-[var(--tinta-fraca)] line-through' : 'text-[var(--tinta)]'}`}>
                      {p.description}
                    </p>
                    <p className="text-sm text-[var(--tinta-media)] mt-0.5">
                      Parcela {p.installment_number} de {p.installments_total} · {p.category}
                      {p.paid && <span className="text-[var(--verde)] font-semibold"> · paga</span>}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <span
                      className={`bloco-cifra text-lg whitespace-nowrap ${p.paid ? 'line-through' : ''}`}
                      style={{ color: p.paid ? 'var(--tinta-fraca)' : 'var(--ferrugem)' }}
                    >
                      {currency.format(Number(p.amount))}
                    </span>
                    <button
                      onClick={() => handleTogglePaid(p)}
                      className={`rotulo flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border-2 transition ${
                        p.paid
                          ? 'bg-[var(--verde)] text-[var(--sobre-cor)] border-[var(--verde)]'
                          : 'border-[var(--borda-forte)] text-[var(--tinta-media)] hover:border-[var(--verde)] hover:text-[var(--verde)]'
                      }`}
                      aria-pressed={p.paid}
                    >
                      <Check size={15} /> {p.paid ? 'Paga' : 'Pagar'}
                    </button>
                    <button
                      onClick={() => handleDeletePurchase(p.purchase_id, p.description)}
                      className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--carmim)] transition"
                      aria-label={`Apagar ${p.description} e todas as parcelas`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gastos e recebimentos fixos do mês */}
        {recurring.length > 0 && (
          <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6 mb-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-2.5">
                <Repeat size={24} className="text-[var(--ferrugem)] shrink-0 mt-1" />
                <h2 className="titulo text-2xl text-[var(--tinta)]">Todo mês</h2>
              </div>
              {fixosDoMes > 0 && (
                <p className="bloco-cifra text-2xl shrink-0" style={{ color: 'var(--carmim)' }}>
                  {currency.format(fixosDoMes)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              {recurring.map((r) => {
                const entrada = r.type === 'receita';
                const cor = entrada ? 'var(--verde)' : 'var(--carmim)';
                return (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 pl-4 pr-3 rounded-xl bg-[var(--areia)]"
                    style={{ borderLeft: `6px solid ${cor}` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-[var(--tinta)] break-words">{r.description}</p>
                      <p className="text-sm text-[var(--tinta-media)] mt-0.5">
                        Todo dia {r.day_of_month} · {r.category}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <span
                        className="bloco-cifra text-lg px-3 py-1.5 rounded-lg text-[var(--sobre-cor)] whitespace-nowrap"
                        style={{ backgroundColor: cor }}
                      >
                        {entrada ? '+' : '−'}{currency.format(Number(r.amount))}
                      </span>
                      <button
                        onClick={() => setEditandoRec(r)}
                        className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--ferrugem)] transition"
                        aria-label={`Editar ${r.description}`}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteRecurring(r.id, r.description)}
                        className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--carmim)] transition"
                        aria-label={`Parar de lançar ${r.description}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {totalComprometido > 0 && (
          <div className="flex items-center justify-between gap-3 bg-[var(--creme)] border-2 border-[var(--borda)] rounded-2xl px-5 py-4 mb-8">
            <p className="text-base text-[var(--tinta-media)]">
              Total ainda parcelado, somando todos os meses
            </p>
            <p className="bloco-cifra text-xl shrink-0" style={{ color: 'var(--ferrugem)' }}>
              {currency.format(totalComprometido)}
            </p>
          </div>
        )}

        {/* Busca */}
        {!ehFuturo && (
          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--tinta-fraca)]" size={20} />
            {/* aria-label além do placeholder: o placeholder some ao digitar, então
                sozinho ele não serve de nome acessível pra quem usa leitor de tela. */}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar por categoria ou descrição"
              placeholder="Buscar por categoria ou descrição"
              className="w-full bg-[var(--creme)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl pl-12 pr-4 py-3 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
            />
          </div>
        )}

        {!ehFuturo && (
        <>
        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          <div className="lg:col-span-3 bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6">
            <h2 className="titulo text-2xl text-[var(--tinta)] mb-5">Como seu saldo andou</h2>
            {balanceTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={balanceTrend}>
                  <defs>
                    <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={balanceColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={balanceColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 14, fill: mutedText }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: mutedText }} axisLine={false} tickLine={false} width={80}
                    tickFormatter={(v) => currency.format(v)} />
                  <Tooltip
                    contentStyle={{ background: chartSurface, border: `2px solid ${gridColor}`, borderRadius: 12, fontSize: 15 }}
                    formatter={(value) => [currency.format(Number(value)), 'Saldo']}
                  />
                  <Area type="monotone" dataKey="saldo" stroke={balanceColor} strokeWidth={3} fill="url(#balanceGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Sem lançamentos neste período. Escolha outro período acima." />
            )}
          </div>

          <div className="lg:col-span-2 bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6">
            <h2 className="titulo text-2xl text-[var(--tinta)] mb-5">Onde seu dinheiro foi</h2>
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    dataKey="value"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={80}
                    stroke={chartSurface}
                    strokeWidth={3}
                    label={renderDonutLabel}
                    labelLine={false}
                  >
                    {expensesByCategory.map((entry) => (
                      <Cell key={entry.category} fill={categoryColor(entry.category, 'despesa', isDark)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: chartSurface, border: `2px solid ${gridColor}`, borderRadius: 12, fontSize: 15 }}
                    formatter={(value, name) => [currency.format(Number(value)), name]}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ fontSize: 15, color: mutedText }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Nenhuma saída neste período. Assim que você registrar um gasto, ele aparece aqui." />
            )}
          </div>
        </div>

        {/* Dívidas */}
        {debts.length > 0 && (
          <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6 mb-8">
            <div className="flex items-start gap-2.5 mb-5">
              <HandCoins size={24} className="text-[var(--ferrugem)] shrink-0 mt-1" />
              <h2 className="titulo text-2xl text-[var(--tinta)]">Combinados em aberto</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="rotulo text-sm text-[var(--tinta-media)] mb-1">Tenho a receber</p>
                <p className="bloco-cifra text-3xl mb-3" style={{ color: 'var(--verde)' }}>
                  {currency.format(aReceber)}
                </p>
                <div className="space-y-2">
                  {debts.filter((d) => d.direction === 'a_receber').map((d) => (
                    <DebtRow key={d.id} debt={d} cor="var(--verde)" onSettle={handleSettleDebt} onDelete={handleDeleteDebt} />
                  ))}
                </div>
              </div>
              <div>
                <p className="rotulo text-sm text-[var(--tinta-media)] mb-1">Tenho a pagar</p>
                <p className="bloco-cifra text-3xl mb-3" style={{ color: 'var(--carmim)' }}>
                  {currency.format(aPagar)}
                </p>
                <div className="space-y-2">
                  {debts.filter((d) => d.direction === 'a_pagar').map((d) => (
                    <DebtRow key={d.id} debt={d} cor="var(--carmim)" onSettle={handleSettleDebt} onDelete={handleDeleteDebt} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lista de transações */}
        <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="titulo text-2xl text-[var(--tinta)]">Seus lançamentos</h2>
            {/* Leva pra caixa de cima em vez de abrir outro formulário: um jeito
                só de anotar significa uma regra só, e é o mesmo jeito do
                WhatsApp. O botão existe porque a caixa sozinha não se anunciava
                — quem chegava aqui procurando "adicionar" não achava nada. */}
            <button
              onClick={() => {
                document.getElementById('falar-guara')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                document.getElementById('falar-guara')?.focus();
              }}
              className="rotulo flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl bg-[var(--ferrugem)] text-[var(--sobre-cor)] hover:opacity-90 transition"
            >
              <Plus size={16} /> Anotar
            </button>
            {filtered.length > 0 && (
              <button
                onClick={exportarPlanilha}
                disabled={exportando}
                className="rotulo flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl border-2 border-[var(--borda-forte)] text-[var(--tinta-media)] hover:bg-[var(--tinta)] hover:text-[var(--creme)] hover:border-[var(--tinta)] transition disabled:opacity-60"
              >
                <Download size={16} /> {exportando ? 'Gerando…' : 'Baixar planilha'}
              </button>
            )}
          </div>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-[var(--areia)] rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!loading && (
            <div className="space-y-2">
              {filtered.map((t) => {
                const entrada = t.type === 'receita';
                const cor = entrada ? 'var(--verde)' : 'var(--carmim)';
                return (
                  <div
                    key={t.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 pl-4 pr-3 rounded-xl bg-[var(--areia)]"
                    style={{ borderLeft: `6px solid ${cor}` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-[var(--tinta)] break-words">
                        {t.description || t.category}
                      </p>
                      <p className="text-sm text-[var(--tinta-media)] mt-0.5">
                        {t.category} · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <span
                        className="bloco-cifra text-lg sm:text-xl px-3 py-1.5 rounded-lg text-[var(--sobre-cor)] whitespace-nowrap"
                        style={{ backgroundColor: cor }}
                      >
                        {entrada ? '+' : '−'}{currency.format(Number(t.amount))}
                      </span>
                      {/* Parcela aparece aqui só pra compor o saldo — quem manda
                          nela é a seção de parcelas. Botões aqui dariam a
                          entender que dá pra editar o valor de uma parcela solta. */}
                      {t.origem === 'parcela' ? (
                        <span className="rotulo text-xs text-[var(--tinta-fraca)] px-2 whitespace-nowrap">
                          em parcelas
                        </span>
                      ) : (
                        <>
                          {/* Lançamento do cofrinho mora noutra tabela: editar e
                              apagar precisam ir pra lá, senão não achariam a linha. */}
                          <button
                            onClick={() => {
                              if (t.origem === 'guardado') {
                                const s = savings.find((x) => x.id === t.id);
                                if (s) setEditandoPote(s);
                              } else {
                                setEditando(t);
                              }
                            }}
                            className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--ferrugem)] transition"
                            aria-label={`Editar ${t.description || t.category}`}
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() =>
                              t.origem === 'guardado' ? handleDeleteSaving(t.id) : handleDelete(t.id)
                            }
                            className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--carmim)] transition"
                            aria-label={`Apagar ${t.description || t.category}`}
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12 text-[var(--tinta-media)]">
                  <Inbox size={40} className="text-[var(--ferrugem)]" />
                  <p className="text-lg text-center max-w-xs">
                    {monthOffset === 0
                      ? 'Nada por aqui ainda. Manda um gasto pro Guará no WhatsApp que ele aparece nesta lista.'
                      : `Nenhum lançamento em ${MESES[mesAtivo.mes]} de ${mesAtivo.ano}.`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}
        </>
        )}
      </div>

      {editando && (
        <ModalEditar
          transacao={editando}
          categorias={categoriasDisponiveis}
          onSalvar={handleSaveEdit}
          onFechar={() => setEditando(null)}
        />
      )}

      {editandoRec && (
        <ModalRecorrente
          recorrente={editandoRec}
          categorias={categoriasDisponiveis}
          onSalvar={handleSaveRecurring}
          onFechar={() => setEditandoRec(null)}
        />
      )}

      <footer className="max-w-6xl mx-auto mt-10 pt-6 border-t-2 border-[var(--borda)] flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Link href="/termos" className="text-base text-[var(--tinta-media)] underline underline-offset-4">
          Termos de Uso
        </Link>
        <Link href="/privacidade" className="text-base text-[var(--tinta-media)] underline underline-offset-4">
          Privacidade
        </Link>
      </footer>

      {editandoPote && (
        <ModalCofrinho
          lancamento={editandoPote}
          onSalvar={handleSaveSaving}
          onFechar={() => setEditandoPote(null)}
        />
      )}

      {renomeandoPote && (
        <ModalRenomearPote
          nomeAtual={renomeandoPote}
          potesExistentes={potes.map((p) => p.nome)}
          quantidade={savings.filter((s) =>
            renomeandoPote === 'Geral'
              ? !(s.jar || '').trim()
              : (s.jar || '').trim() === renomeandoPote
          ).length}
          onSalvar={handleRenomearPote}
          onFechar={() => setRenomeandoPote(null)}
        />
      )}
    </main>
  );
}
