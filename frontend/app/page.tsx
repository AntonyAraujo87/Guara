'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { categoryColor } from '@/lib/chartColors';
import { useIsDark } from '@/lib/useIsDark';
import Turnstile from '@/components/Turnstile';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, LogOut, Search, Trash2, Inbox, Check, HandCoins,
  CalendarDays, PiggyBank, ChevronLeft, ChevronRight, CreditCard, Target,
  Settings, Pencil, Download, Tags, X, Repeat,
} from 'lucide-react';

type Transaction = {
  id: string;
  user_phone: string;
  amount: number;
  type: 'receita' | 'despesa';
  category: string;
  description: string | null;
  created_at: string;
};

// Uma transação comum, ou um lançamento do cofrinho apresentado como tal.
// A origem diz de qual tabela ele veio, pra editar e apagar acertarem o alvo.
type Lancamento = Transaction & { origem?: 'guardado' | 'parcela' };

type Debt = {
  id: string;
  user_phone: string;
  amount: number;
  direction: 'a_receber' | 'a_pagar';
  person: string | null;
  description: string | null;
  status: 'pendente' | 'quitada';
  created_at: string;
};

type Installment = {
  id: string;
  user_phone: string;
  purchase_id: string;
  description: string;
  category: string;
  installment_number: number;
  installments_total: number;
  amount: number;
  due_month: string;
  paid: boolean;
  paid_at: string | null;
};

type Saving = {
  id: string;
  user_phone: string;
  amount: number;
  jar: string | null;
  description: string | null;
  created_at: string;
};

type Goal = {
  user_phone: string;
  monthly_target: number | null;
  goal_name: string | null;
  goal_target: number | null;
};

type Categoria = {
  id: string;
  user_phone: string;
  name: string;
  kind: 'despesa' | 'receita';
};

type Recorrente = {
  id: string;
  user_phone: string;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  category: string;
  day_of_month: number;
  active: boolean;
};

type Aba = 'mes' | 'guardado' | 'ajustes';

// Categorias que vêm de fábrica — as do banco são as que a pessoa criar.
const CATEGORIAS_PADRAO = {
  despesa: ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Compras', 'Outros'],
  receita: ['Salário', 'Freelance', 'Investimentos', 'Presente/Reembolso', 'Outros'],
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Deslocamento em meses a partir do mês atual: 0 = agora, -1 = mês passado, +1 = próximo.
function mesPorDeslocamento(offset: number) {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

function chaveDoMes({ ano, mes }: { ano: number; mes: number }) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const RADIAN = Math.PI / 180;

type DonutLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
};

function renderDonutLabel({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 }: DonutLabelProps) {
  if (!percent || percent <= 0.08) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={14}
      fontWeight={800}
      fill="#fff"
      paintOrder="stroke"
      stroke="rgba(0,0,0,0.45)"
      strokeWidth={3.5}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [savings, setSavings] = useState<Saving[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [recurring, setRecurring] = useState<Recorrente[]>([]);
  const [editando, setEditando] = useState<Transaction | null>(null);
  const [editandoRec, setEditandoRec] = useState<Recorrente | null>(null);
  const [editandoPote, setEditandoPote] = useState<Saving | null>(null);
  // Guarda o nome do cofrinho sendo renomeado (não o lançamento: renomear
  // atinge todos os lançamentos daquele pote de uma vez).
  const [renomeandoPote, setRenomeandoPote] = useState<string | null>(null);
  // Sem isso, uma operação que o banco recusa não muda a tela nem diz nada —
  // a pessoa clica de novo achando que não pegou.
  const [avisoErro, setAvisoErro] = useState<string | null>(null);

  // Some sozinho depois de um tempo. Oito segundos dá pra ler com calma sem o
  // aviso virar parte da tela; quem quiser tirar antes tem o botão de fechar.
  useEffect(() => {
    if (!avisoErro) return;
    const t = setTimeout(() => setAvisoErro(null), 8000);
    return () => clearTimeout(t);
  }, [avisoErro]);
  const [exportando, setExportando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
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

  async function fetchProfile(userId: string) {
    setProfileLoading(true);
    try {
      const { data } = await supabase.from('profiles').select('phone').eq('id', userId).maybeSingle();
      setPhone(data?.phone || null);
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local phone state on logout, mirrors external auth state
      setPhone(null);
      return;
    }
    fetchProfile(session.user.id);
  }, [session]);

  // Busca só o mês pedido. Carregar "os últimos 500" quebrava a navegação:
  // quem passasse de 500 lançamentos veria meses antigos vazios.
  async function fetchTransactions(ano: number, mes: number) {
    setLoading(true);
    try {
      const inicio = new Date(ano, mes, 1).toISOString();
      const fim = new Date(ano, mes + 1, 1).toISOString();
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', inicio)
        .lt('created_at', fim)
        .order('created_at', { ascending: false });
      if (!error && data) setTransactions(data as Transaction[]);
    } catch (err) {
      console.error('Erro ao buscar transações:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDebts() {
    try {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false });
      if (!error && data) setDebts(data as Debt[]);
    } catch (err) {
      console.error('Erro ao buscar dívidas:', err);
    }
  }

  async function fetchInstallments() {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .order('due_month', { ascending: true });
    if (!error && data) setInstallments(data as Installment[]);
  }

  async function fetchSavings() {
    const { data, error } = await supabase
      .from('savings')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setSavings(data as Saving[]);
  }

  async function fetchGoal() {
    const { data } = await supabase.from('goals').select('*').maybeSingle();
    setGoal((data as Goal) || null);
  }

  async function fetchRecurring() {
    const { data, error } = await supabase.from('recurring').select('*').eq('active', true).order('day_of_month');
    if (!error && data) setRecurring(data as Recorrente[]);
  }

  async function fetchCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (!error && data) setCategories(data as Categoria[]);
  }

  useEffect(() => {
    if (!phone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    fetchDebts();
    fetchInstallments();
    fetchSavings();
    fetchGoal();
    fetchCategories();
    fetchRecurring();
  }, [phone]);

  // Recarrega os lançamentos sempre que muda o mês selecionado.
  useEffect(() => {
    if (!phone) return;
    const { ano, mes } = mesPorDeslocamento(monthOffset);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    fetchTransactions(ano, mes);
  }, [phone, monthOffset]);

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
    setTransactions([]);
    setDebts([]);
    setInstallments([]);
    setSavings([]);
    setGoal(null);
    setRecurring([]);
  }

  const mesAtivo = useMemo(() => mesPorDeslocamento(monthOffset), [monthOffset]);
  const ehFuturo = monthOffset > 0;

  // Lançamentos do mês selecionado — a navegação é sempre por mês inteiro.
  // Guardar dinheiro tira do saldo como qualquer outra saída, então os
  // lançamentos do cofrinho entram na MESMA lista das transações. Mesclar aqui,
  // na raiz da cadeia, faz o saldo, os gastos, o gráfico e o extrato herdarem o
  // comportamento sem precisar mexer em cada cálculo depois.
  //
  // Continuam vivendo na tabela savings — o campo origem existe pra editar e
  // apagar irem parar na tabela certa.
  const lancamentos = useMemo<Lancamento[]>(() => {
    const doCofrinho: Lancamento[] = savings.map((s) => {
      const valor = Number(s.amount);
      const guardou = valor > 0;
      const pote = (s.jar || '').trim();
      return {
        id: s.id,
        user_phone: s.user_phone,
        amount: Math.abs(valor),
        // Guardar sai do saldo; tirar do cofrinho volta pra ele.
        type: guardou ? 'despesa' : 'receita',
        category: 'Guardado',
        description: pote
          ? `${guardou ? 'Guardei' : 'Tirei'} — ${pote}`
          : guardou ? 'Guardei' : 'Tirei do guardado',
        created_at: s.created_at,
        origem: 'guardado',
      };
    });
    // Parcela paga é dinheiro que saiu de verdade. Entra no mês do VENCIMENTO,
    // não no dia em que foi marcada: é a mesma lógica da fatura do cartão, e é
    // como o painel já agrupa as parcelas em todo o resto da tela.
    const dasParcelas: Lancamento[] = installments
      .filter((p) => p.paid)
      .map((p) => {
        // O dinheiro sai no dia em que se paga, não no dia em que vence:
        // adiantar em agosto uma parcela de setembro tira de agosto.
        const vence = String(p.due_month).slice(0, 7);
        const pagouEm = String(p.paid_at || '').slice(0, 7);
        const ritmo =
          pagouEm && pagouEm < vence ? ' (adiantada)'
          : pagouEm && pagouEm > vence ? ' (atrasada)'
          : '';

        return {
          id: p.id,
          user_phone: p.user_phone,
          amount: Number(p.amount),
          type: 'despesa' as const,
          category: p.category,
          description: `${p.description} — parcela ${p.installment_number}/${p.installments_total}${ritmo}`,
          // Sem paid_at (linha antiga), cai no vencimento ao meio-dia: sem hora
          // fixa, "2026-09-01" vira 31 de agosto no fuso do Brasil.
          created_at: p.paid_at || `${p.due_month}T12:00:00`,
          origem: 'parcela' as const,
        };
      });

    return [...transactions, ...doCofrinho, ...dasParcelas].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [transactions, savings, installments]);

  const dateFiltered = useMemo(() => {
    return lancamentos.filter((t) => {
      const d = new Date(t.created_at);
      return d.getFullYear() === mesAtivo.ano && d.getMonth() === mesAtivo.mes;
    });
  }, [lancamentos, mesAtivo]);

  // Parcelas que vencem no mês selecionado.
  const parcelasDoMes = useMemo(() => {
    const chave = chaveDoMes(mesAtivo);
    return installments.filter((p) => p.due_month === chave);
  }, [installments, mesAtivo]);

  const totalParcelasDoMes = useMemo(
    () => parcelasDoMes.reduce((s, p) => s + Number(p.amount), 0),
    [parcelasDoMes]
  );

  // Tudo que ainda vai vencer do mês corrente pra frente.
  const totalComprometido = useMemo(() => {
    const inicio = chaveDoMes(mesPorDeslocamento(0));
    return installments
      .filter((p) => !p.paid && p.due_month >= inicio)
      .reduce((s, p) => s + Number(p.amount), 0);
  }, [installments]);

  const { totalGuardado, guardadoNoMes } = useMemo(() => {
    const total = savings.reduce((s, l) => s + Number(l.amount), 0);
    const agora = mesPorDeslocamento(0);
    // Líquido do mês (depósitos menos saques): é o quanto o cofrinho realmente cresceu.
    const noMes = savings
      .filter((l) => {
        const d = new Date(l.created_at);
        return d.getFullYear() === agora.ano && d.getMonth() === agora.mes;
      })
      .reduce((s, l) => s + Number(l.amount), 0);
    return { totalGuardado: total, guardadoNoMes: noMes };
  }, [savings]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return dateFiltered;
    return dateFiltered.filter(
      (t) =>
        t.category.toLowerCase().includes(term) ||
        (t.description || '').toLowerCase().includes(term)
    );
  }, [dateFiltered, search]);

  const { receitas, despesas, saldo } = useMemo(() => {
    const receitas = filtered.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
    const despesas = filtered.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);
    return { receitas, despesas, saldo: receitas - despesas };
  }, [filtered]);

  const expensesByCategory = useMemo(() => {
    const byCategory: Record<string, number> = {};
    for (const t of filtered) {
      if (t.type !== 'despesa') continue;
      byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount);
    }
    return Object.entries(byCategory)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const balanceTrend = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return sorted.reduce<{ date: string; saldo: number }[]>((acc, t) => {
      const prevSaldo = acc.length ? acc[acc.length - 1].saldo : 0;
      const delta = t.type === 'receita' ? Number(t.amount) : -Number(t.amount);
      return [
        ...acc,
        {
          date: new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          saldo: prevSaldo + delta,
        },
      ];
    }, []);
  }, [filtered]);

  const { aReceber, aPagar } = useMemo(() => {
    const aReceber = debts.filter((d) => d.direction === 'a_receber').reduce((s, d) => s + Number(d.amount), 0);
    const aPagar = debts.filter((d) => d.direction === 'a_pagar').reduce((s, d) => s + Number(d.amount), 0);
    return { aReceber, aPagar };
  }, [debts]);

  // Agrupa o cofrinho por pote. Lançamento sem nome cai em "Geral", senão sumiria.
  //
  // Precisa ficar ACIMA dos returns antecipados logo abaixo. Estava depois, e o
  // resultado era que quem não estava logado renderizava 21 hooks e quem estava
  // renderizava 22 — o React exige a mesma quantidade em toda renderização e
  // derrubava o app inteiro (erro #310) assim que a sessão carregava.
  const potes = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const l of savings) {
      const nome = (l.jar || '').trim() || 'Geral';
      mapa[nome] = (mapa[nome] || 0) + Number(l.amount);
    }
    return Object.entries(mapa)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [savings]);

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

  // Planilha .xlsx de verdade, com largura de coluna, cabeçalho estilizado e valores
  // em formato de moeda. O ExcelJS entra por import dinâmico: ~800 KB que só carregam
  // quando alguém clica em exportar, sem pesar a abertura do painel.
  async function exportarPlanilha() {
    if (exportando) return;
    setExportando(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Guará';
      wb.created = new Date();

      const ws = wb.addWorksheet(`${MESES[mesAtivo.mes]} ${mesAtivo.ano}`, {
        views: [{ state: 'frozen', ySplit: 3 }],
      });

      const FERRUGEM = 'FFC4400D';
      const VERDE = 'FF0B6E3A';
      const CARMIM = 'FFB3122B';
      const AREIA = 'FFEFE3D2';

      // Título
      ws.mergeCells('A1:E1');
      const titulo = ws.getCell('A1');
      titulo.value = `Guará · ${MESES[mesAtivo.mes]} de ${mesAtivo.ano}`;
      titulo.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FERRUGEM } };
      titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 30;

      ws.getRow(2).height = 6;

      // Cabeçalho
      const cab = ws.getRow(3);
      cab.values = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'];
      cab.eachCell((c) => {
        c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF191007' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AREIA } };
        c.alignment = { vertical: 'middle' };
        c.border = { bottom: { style: 'medium', color: { argb: FERRUGEM } } };
      });
      cab.height = 22;

      // Linhas
      for (const t of filtered) {
        const entrada = t.type === 'receita';
        const linha = ws.addRow([
          new Date(t.created_at),
          entrada ? 'Entrada' : 'Saída',
          t.category,
          t.description || '',
          entrada ? Number(t.amount) : -Number(t.amount),
        ]);
        linha.getCell(1).numFmt = 'dd/mm/yyyy';
        linha.getCell(5).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
        linha.getCell(2).font = { color: { argb: entrada ? VERDE : CARMIM }, bold: true };
        linha.getCell(5).font = { color: { argb: entrada ? VERDE : CARMIM }, bold: true };
      }

      // Totais
      ws.addRow([]);
      const tot = ws.addRow(['', '', '', 'Saldo do mês', receitas - despesas]);
      tot.getCell(4).font = { bold: true };
      tot.getCell(5).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
      tot.getCell(5).font = { bold: true, size: 12, color: { argb: receitas - despesas >= 0 ? VERDE : CARMIM } };
      tot.getCell(4).border = { top: { style: 'thin' } };
      tot.getCell(5).border = { top: { style: 'thin' } };

      const ent = ws.addRow(['', '', '', 'Entradas', receitas]);
      ent.getCell(5).numFmt = 'R$ #,##0.00';
      ent.getCell(5).font = { color: { argb: VERDE } };
      const sai = ws.addRow(['', '', '', 'Saídas', despesas]);
      sai.getCell(5).numFmt = 'R$ #,##0.00';
      sai.getCell(5).font = { color: { argb: CARMIM } };

      // Larguras — sem isso o Excel mostra ##### nas datas, que foi o que aconteceu
      ws.columns = [
        { width: 12 }, { width: 11 }, { width: 18 }, { width: 38 }, { width: 15 },
      ];
      ws.autoFilter = { from: 'A3', to: 'E3' };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `guara-${mesAtivo.ano}-${String(mesAtivo.mes + 1).padStart(2, '0')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao gerar planilha:', err);
      alert('Não consegui gerar a planilha. Tente de novo.');
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

        {aba === 'ajustes' ? (
          <AbaAjustes
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

function CaixaModal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[var(--creme)] border-2 border-[var(--borda)] rounded-t-2xl sm:rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <h2 className="titulo text-2xl text-[var(--tinta)]">{titulo}</h2>
          <button type="button" onClick={onFechar} className="p-2 rounded-lg text-[var(--tinta-media)] hover:bg-[var(--areia)]" aria-label="Fechar">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const campoClasse =
  'w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 text-lg focus:outline-none focus:border-[var(--ferrugem)]';
const rotuloClasse = 'block text-base font-semibold text-[var(--tinta)] mb-2';
const botaoClasse =
  'rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition mt-2';

function ModalRecorrente({
  recorrente, categorias, onSalvar, onFechar,
}: {
  recorrente: Recorrente;
  categorias: (kind: 'despesa' | 'receita') => string[];
  onSalvar: (r: Recorrente) => void;
  onFechar: () => void;
}) {
  const [descricao, setDescricao] = useState(recorrente.description);
  const [valor, setValor] = useState(String(recorrente.amount));
  const [dia, setDia] = useState(String(recorrente.day_of_month));
  const [categoria, setCategoria] = useState(recorrente.category);
  const lista = categorias(recorrente.type);

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(valor.replace(',', '.'));
    const d = Math.min(31, Math.max(1, Number(dia) || 1));
    if (!Number.isFinite(n) || n <= 0 || !descricao.trim()) return;
    onSalvar({ ...recorrente, description: descricao.trim(), amount: n, day_of_month: d, category: categoria });
  }

  return (
    <CaixaModal titulo="Editar lançamento mensal" onFechar={onFechar}>
      <form onSubmit={submeter}>
        <label htmlFor="rec-desc" className={rotuloClasse}>Nome</label>
        <input id="rec-desc" type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={`${campoClasse} mb-4`} />

        <label htmlFor="rec-valor" className={rotuloClasse}>Valor</label>
        <input id="rec-valor" type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campoClasse} mb-4 tabular`} />

        <label htmlFor="rec-dia" className={rotuloClasse}>Dia do mês</label>
        <input id="rec-dia" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} className={`${campoClasse} mb-1 tabular`} />
        <p className="text-sm text-[var(--tinta-media)] mb-4">
          Em meses mais curtos, o dia 31 cai no último dia do mês.
        </p>

        <label htmlFor="rec-cat" className={rotuloClasse}>Categoria</label>
        <select id="rec-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${campoClasse} mb-6`}>
          {lista.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <button type="submit" className={botaoClasse}>Salvar alterações</button>
      </form>
    </CaixaModal>
  );
}

function ModalCofrinho({
  lancamento, onSalvar, onFechar,
}: {
  lancamento: Saving;
  onSalvar: (s: Saving) => void;
  onFechar: () => void;
}) {
  const guardou = Number(lancamento.amount) > 0;
  const [valor, setValor] = useState(String(Math.abs(Number(lancamento.amount))));
  const [pote, setPote] = useState(lancamento.jar || '');
  const [descricao, setDescricao] = useState(lancamento.description || '');

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(valor.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    // Preserva o sinal: editar o valor não deve virar um saque em depósito.
    onSalvar({
      ...lancamento,
      amount: guardou ? n : -n,
      jar: pote.trim() || null,
      description: descricao.trim() || null,
    });
  }

  return (
    <CaixaModal titulo={guardou ? 'Editar depósito' : 'Editar retirada'} onFechar={onFechar}>
      <form onSubmit={submeter}>
        <label htmlFor="cof-valor" className={rotuloClasse}>Valor</label>
        <input id="cof-valor" type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campoClasse} mb-4 tabular`} />

        <label htmlFor="cof-pote" className={rotuloClasse}>Cofrinho</label>
        <input id="cof-pote" type="text" value={pote} onChange={(e) => setPote(e.target.value)} placeholder="Ex.: Viagem, Reserva" className={`${campoClasse} mb-1`} />
        <p className="text-sm text-[var(--tinta-media)] mb-4">
          Deixe vazio para cair no cofrinho <strong className="text-[var(--tinta)]">Geral</strong>.
        </p>

        <label htmlFor="cof-desc" className={rotuloClasse}>Observação</label>
        <input id="cof-desc" type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" className={`${campoClasse} mb-6`} />

        <button type="submit" className={botaoClasse}>Salvar alterações</button>
      </form>
    </CaixaModal>
  );
}

function ModalRenomearPote({
  nomeAtual, potesExistentes, quantidade, onSalvar, onFechar,
}: {
  nomeAtual: string;
  potesExistentes: string[];
  quantidade: number;
  onSalvar: (nomeAntigo: string, nomeNovo: string) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(nomeAtual);
  const limpo = nome.trim();

  // Renomear para um pote que já existe junta os dois. Não é erro — pode ser
  // exatamente o que a pessoa quer —, mas ela precisa saber antes de salvar.
  const vaiJuntar = limpo !== nomeAtual && potesExistentes.includes(limpo);

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (!limpo) return;
    onSalvar(nomeAtual, limpo);
  }

  return (
    <CaixaModal titulo="Renomear cofrinho" onFechar={onFechar}>
      <form onSubmit={submeter}>
        <label htmlFor="pote-nome" className={rotuloClasse}>Nome do cofrinho</label>
        <input
          id="pote-nome"
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={40}
          autoFocus
          className={`${campoClasse} mb-1`}
        />
        <p className="text-sm text-[var(--tinta-media)] mb-4">
          Vale para {quantidade === 1 ? 'o lançamento' : `os ${quantidade} lançamentos`} deste cofrinho.
        </p>

        {vaiJuntar && (
          <p className="text-base text-[var(--tinta)] bg-[var(--areia)] border-2 border-[var(--borda-forte)] rounded-xl px-4 py-3 mb-4">
            ⚠️ Já existe um cofrinho <strong>{limpo}</strong>. Os dois vão virar um só.
          </p>
        )}

        <button type="submit" disabled={!limpo} className={`${botaoClasse} disabled:opacity-50`}>
          Salvar nome
        </button>
      </form>
    </CaixaModal>
  );
}

function ModalEditar({
  transacao, categorias, onSalvar, onFechar,
}: {
  transacao: Transaction;
  categorias: (kind: 'despesa' | 'receita') => string[];
  onSalvar: (t: Transaction) => void;
  onFechar: () => void;
}) {
  const [valor, setValor] = useState(String(transacao.amount));
  const [tipo, setTipo] = useState<'receita' | 'despesa'>(transacao.type);
  const [categoria, setCategoria] = useState(transacao.category);
  const [descricao, setDescricao] = useState(transacao.description || '');

  // Trocar de tipo pode deixar uma categoria que não existe do outro lado.
  //
  // Derivado durante a renderização, e não corrigido num efeito depois: o efeito
  // pintava uma vez com a categoria inválida e só então consertava, o que dava
  // um piscar no select e uma renderização extra a cada troca de tipo.
  const lista = categorias(tipo);
  const categoriaValida = lista.includes(categoria) ? categoria : lista[0];

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    const numero = Number(valor.replace(',', '.'));
    if (!Number.isFinite(numero) || numero <= 0) return;
    onSalvar({ ...transacao, amount: numero, type: tipo, category: categoriaValida, description: descricao.trim() || null });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label="Editar lançamento"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submeter}
        className="w-full sm:max-w-md bg-[var(--creme)] border-2 border-[var(--borda)] rounded-t-2xl sm:rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <h2 className="titulo text-2xl text-[var(--tinta)]">Editar lançamento</h2>
          <button
            type="button"
            onClick={onFechar}
            className="p-2 rounded-lg text-[var(--tinta-media)] hover:bg-[var(--areia)]"
            aria-label="Fechar"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          {(['despesa', 'receita'] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => setTipo(op)}
              className={`rotulo flex-1 text-sm py-3 rounded-xl border-2 transition ${
                tipo === op
                  ? op === 'receita'
                    ? 'bg-[var(--verde)] text-[var(--sobre-cor)] border-[var(--verde)]'
                    : 'bg-[var(--carmim)] text-[var(--sobre-cor)] border-[var(--carmim)]'
                  : 'border-[var(--borda)] text-[var(--tinta-media)]'
              }`}
            >
              {op === 'receita' ? 'Entrada' : 'Saída'}
            </button>
          ))}
        </div>

        <label htmlFor="ed-valor" className="block text-base font-semibold text-[var(--tinta)] mb-2">Valor</label>
        <input
          id="ed-valor"
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] rounded-xl px-4 py-3.5 mb-4 text-xl tabular focus:outline-none focus:border-[var(--ferrugem)]"
        />

        <label htmlFor="ed-cat" className="block text-base font-semibold text-[var(--tinta)] mb-2">Categoria</label>
        <select
          id="ed-cat"
          value={categoriaValida}
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] rounded-xl px-4 py-3.5 mb-4 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
        >
          {lista.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label htmlFor="ed-desc" className="block text-base font-semibold text-[var(--tinta)] mb-2">Descrição</label>
        <input
          id="ed-desc"
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: almoço no centro"
          className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-6 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
        />

        <button
          type="submit"
          className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition"
        >
          Salvar alterações
        </button>
      </form>
    </div>
  );
}

function AbaAjustes({
  categorias, onAdicionar, onApagar,
}: {
  categorias: Categoria[];
  onAdicionar: (nome: string, kind: 'despesa' | 'receita') => void;
  onApagar: (id: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [kind, setKind] = useState<'despesa' | 'receita'>('despesa');

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    onAdicionar(nome, kind);
    setNome('');
  }

  return (
    <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6">
      <div className="flex items-start gap-2.5 mb-2">
        <Tags size={24} className="text-[var(--ferrugem)] shrink-0 mt-1" />
        <h2 className="titulo text-2xl text-[var(--tinta)]">Suas categorias</h2>
      </div>
      <p className="text-base text-[var(--tinta-media)] mb-6 leading-relaxed">
        As categorias abaixo vêm prontas. Crie as suas e o Guará passa a usá-las quando você
        registrar um gasto pelo WhatsApp.
      </p>

      <form onSubmit={submeter} className="mb-7">
        <div className="flex gap-2 mb-3">
          {(['despesa', 'receita'] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => setKind(op)}
              className={`rotulo flex-1 text-sm py-3 rounded-xl border-2 transition ${
                kind === op
                  ? op === 'receita'
                    ? 'bg-[var(--verde)] text-[var(--sobre-cor)] border-[var(--verde)]'
                    : 'bg-[var(--carmim)] text-[var(--sobre-cor)] border-[var(--carmim)]'
                  : 'border-[var(--borda)] text-[var(--tinta-media)]'
              }`}
            >
              {op === 'receita' ? 'Entrada' : 'Saída'}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-label="Nome da nova categoria"
            placeholder="Nome da categoria. Ex.: Pet, Academia"
            maxLength={40}
            className="flex-1 bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
          />
          <button
            type="submit"
            disabled={!nome.trim()}
            className="rotulo bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-sm px-6 py-3.5 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-50"
          >
            Criar
          </button>
        </div>
      </form>

      {(['despesa', 'receita'] as const).map((tipo) => {
        const minhas = categorias.filter((c) => c.kind === tipo);
        return (
          <div key={tipo} className="mb-6 last:mb-0">
            <p className="rotulo text-sm text-[var(--tinta-media)] mb-3">
              {tipo === 'despesa' ? 'Saídas' : 'Entradas'}
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS_PADRAO[tipo].map((c) => (
                <span
                  key={c}
                  className="text-base px-3.5 py-2 rounded-lg bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta-media)]"
                >
                  {c}
                </span>
              ))}
              {minhas.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1.5 text-base pl-3.5 pr-1.5 py-1.5 rounded-lg text-[var(--sobre-cor)]"
                  style={{ backgroundColor: tipo === 'receita' ? 'var(--verde)' : 'var(--carmim)' }}
                >
                  {c.name}
                  <button
                    onClick={() => onApagar(c.id)}
                    className="p-1 rounded hover:bg-black/25 transition"
                    aria-label={`Apagar categoria ${c.name}`}
                  >
                    <X size={16} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.5 0-14 4.2-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-1.9 14.1-5.3l-6.5-5.5C29.6 34.9 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.9 39.6 16.4 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.5C40.9 36.6 44 30.9 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const PASSWORD_MIN_LENGTH = 8;

function passwordError(password: string): string {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/\d/.test(password)) return 'A senha precisa ter pelo menos 1 número.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'A senha precisa ter pelo menos 1 símbolo (ex: ! @ # $ % *).';
  return '';
}

// Mensagens do Supabase vêm em inglês. Quem usa o app não tem que decifrar isso.
function traduzErroAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('captcha')) return 'A verificação de segurança falhou. Tente de novo.';
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada (e o spam).';
  if (m.includes('user already registered')) return 'Esse e-mail já tem conta. Tente entrar.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas seguidas. Espere um minutinho.';
  if (m.includes('password')) return 'Senha inválida: use 8 caracteres, com 1 número e 1 símbolo.';
  return msg;
}

function AuthCard() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaFalhou, setCaptchaFalhou] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'signup') {
      const pwError = passwordError(password);
      if (pwError) {
        setError(pwError);
        return;
      }
    }

    if (!captchaToken) {
      setError(
        captchaFalhou
          ? 'A verificação de segurança não carregou. Verifique sua conexão e atualize a página.'
          : 'Aguarde a verificação de segurança terminar — leva um segundo.'
      );
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (error) setError(traduzErroAuth(error.message));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            captchaToken,
            emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/confirmado` : undefined,
          },
        });
        if (error) setError(traduzErroAuth(error.message));
        else if (!data.session) setNotice('Conta criada! Confira seu e-mail pra confirmar o cadastro.');
      }
    } finally {
      setBusy(false);
      // O token é de uso único — sem renovar, a próxima tentativa falharia sempre.
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    }
  }

  async function handleGoogle() {
    setError('');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--areia)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bloco px-7 py-8 mb-4" style={{ backgroundColor: 'var(--ferrugem)' }}>
          <Wallet
            size={150}
            strokeWidth={1}
            aria-hidden="true"
            className="absolute -right-10 -top-8 opacity-[0.13] pointer-events-none"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, no benefit from next/image here */}
          <img src="/logo.png" alt="" className="w-14 h-14 rounded-xl mb-4 relative" />
          <h1 className="titulo text-5xl leading-none">Guará</h1>
          <p className="text-lg mt-3 opacity-95">
            Você conta seus gastos no WhatsApp. Eu organizo tudo aqui.
          </p>
        </div>

        <div className="bg-[var(--creme)] p-7 sm:p-8 rounded-2xl border-2 border-[var(--borda)]">
          <h2 className="titulo text-2xl text-[var(--tinta)] mb-5">
            {mode === 'signin' ? 'Entrar na sua conta' : 'Criar sua conta'}
          </h2>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2.5 border-2 border-[var(--borda-forte)] bg-[var(--creme)] rounded-xl py-3.5 text-lg font-semibold text-[var(--tinta)] hover:bg-[var(--areia)] transition mb-5"
          >
            <GoogleIcon /> Continuar com Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-0.5 bg-[var(--borda)]" />
            <span className="rotulo text-xs text-[var(--tinta-fraca)]">ou com e-mail</span>
            <div className="flex-1 h-0.5 bg-[var(--borda)]" />
          </div>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email" className="block text-base font-semibold text-[var(--tinta)] mb-2">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-4 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
            />
            <label htmlFor="senha" className="block text-base font-semibold text-[var(--tinta)] mb-2">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-2 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
            />
            {mode === 'signup' && (
              <p className="text-sm text-[var(--tinta-media)] mb-4 leading-relaxed">
                Pelo menos 8 caracteres, com 1 número e 1 símbolo. Exemplo: <strong>Guara2026!</strong>
              </p>
            )}
            {error && (
              <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--carmim)] rounded-xl px-4 py-3 mb-4">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--verde)] rounded-xl px-4 py-3 mb-4">
                {notice}
              </p>
            )}

            <Turnstile onToken={setCaptchaToken} onFalha={setCaptchaFalhou} resetSignal={captchaReset} />

            <button
              type="submit"
              disabled={busy}
              className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-60 mt-2"
            >
              {mode === 'signin' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="text-base text-[var(--tinta-media)] mt-6 text-center">
            {mode === 'signin' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}
              className="text-[var(--ferrugem)] font-bold underline underline-offset-2"
            >
              {mode === 'signin' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}

const LINK_PHONE_STORAGE_KEY = 'guara_link_phone_state';

// Formato que a Meta manda no webhook pra números brasileiros: DDI(55) + DDD(2) + número(8), SEM o 9 extra do celular.
const BR_PHONE_REGEX = /^55\d{10}$/;

function loadLinkPhoneState(): { step: 'phone' | 'code'; inputPhone: string } {
  if (typeof window === 'undefined') return { step: 'phone', inputPhone: '' };
  try {
    const raw = sessionStorage.getItem(LINK_PHONE_STORAGE_KEY);
    if (!raw) return { step: 'phone', inputPhone: '' };
    const parsed = JSON.parse(raw);
    if (parsed.step === 'code' && parsed.inputPhone) return parsed;
  } catch {
    // sessionStorage indisponível ou dado corrompido — ignora e começa do zero
  }
  return { step: 'phone', inputPhone: '' };
}

function LinkPhoneCard({ onLinked }: { onLinked: (phone: string) => void }) {
  const initial = useState(loadLinkPhoneState)[0];
  const [step, setStep] = useState<'phone' | 'code'>(initial.step);
  const [inputPhone, setInputPhone] = useState(initial.inputPhone);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initial.step === 'code' ? `Código enviado pro número ${initial.inputPhone}.` : '');
  const [busy, setBusy] = useState(false);

  function persist(nextStep: 'phone' | 'code', phone: string) {
    if (typeof window === 'undefined') return;
    if (nextStep === 'code') {
      sessionStorage.setItem(LINK_PHONE_STORAGE_KEY, JSON.stringify({ step: nextStep, inputPhone: phone }));
    } else {
      sessionStorage.removeItem(LINK_PHONE_STORAGE_KEY);
    }
  }

  async function authedFetch(path: string, body: object) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = inputPhone.replace(/\D/g, '');
    if (!cleaned) return;
    if (!BR_PHONE_REGEX.test(cleaned)) {
      setError(
        cleaned.length !== 12
          ? `Esse número tem ${cleaned.length} dígitos, precisa ter 12 (DDI + DDD + número, sem o 9 extra). Ex.: 555180562381.`
          : 'Número inválido. Use DDI 55 + DDD + número, sem o 9 extra. Ex.: 555180562381.'
      );
      return;
    }
    setBusy(true);
    setError('');
    const { ok, json } = await authedFetch('/api/phone/request-code', { phone: cleaned });
    setBusy(false);
    if (!ok) {
      setError(json.error || 'Erro ao enviar código.');
      return;
    }
    setNotice(`Código enviado pro número ${cleaned}.`);
    setStep('code');
    persist('code', cleaned);
  }

  async function handleConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = inputPhone.replace(/\D/g, '');
    setBusy(true);
    setError('');
    const { ok, json } = await authedFetch('/api/phone/verify-code', { phone: cleaned, code: code.trim() });
    setBusy(false);
    if (!ok) {
      setError(json.error || 'Código incorreto.');
      return;
    }
    persist('phone', '');
    onLinked(cleaned);
  }

  if (step === 'code') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--areia)] px-4 py-8">
        <form onSubmit={handleConfirmCode} className="w-full max-w-md bg-[var(--creme)] p-7 sm:p-8 rounded-2xl border-2 border-[var(--borda)]">
          <h1 className="titulo text-3xl text-[var(--tinta)] mb-2">Digite o código</h1>
          <p className="text-lg text-[var(--tinta-media)] mb-6 leading-relaxed">
            {notice} Abra o WhatsApp e copie o código de 6 dígitos que o Guará mandou.
          </p>
          <label htmlFor="codigo" className="block text-base font-semibold text-[var(--tinta)] mb-2">
            Código de 6 dígitos
          </label>
          <input
            id="codigo"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="bloco-cifra w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-4 mb-4 text-center text-4xl tracking-[0.25em] focus:outline-none focus:border-[var(--ferrugem)]"
          />
          {error && (
            <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--carmim)] rounded-xl px-4 py-3 mb-4">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-60"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => { setStep('phone'); setError(''); setNotice(''); setCode(''); persist('phone', ''); }}
            className="w-full text-base text-[var(--tinta-media)] mt-4 underline underline-offset-2"
          >
            Usar outro número
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--areia)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bloco px-7 py-7 mb-4" style={{ backgroundColor: 'var(--ferrugem)' }}>
          <h1 className="titulo text-4xl leading-none">Falta um passo</h1>
          <p className="text-lg mt-3 opacity-95">
            Vamos vincular seu número à sua conta, pra seus gastos caírem aqui.
          </p>
        </div>

        <form onSubmit={handleSendCode} className="bg-[var(--creme)] p-7 sm:p-8 rounded-2xl border-2 border-[var(--borda)]">
          <ol className="space-y-4 mb-7">
            <PassoLista numero={1}>
              Abra o WhatsApp e mande qualquer mensagem (pode ser só &quot;oi&quot;) para o Guará no{' '}
              <strong className="text-[var(--tinta)]">+55 51 8056-2381</strong>, usando o celular que você quer ligar aqui.
            </PassoLista>
            <PassoLista numero={2}>Volte para esta tela e digite esse mesmo número no campo abaixo.</PassoLista>
            <PassoLista numero={3}>O Guará te manda um código pelo WhatsApp. Você digita ele na próxima tela e pronto.</PassoLista>
          </ol>

          <label htmlFor="telefone" className="block text-base font-semibold text-[var(--tinta)] mb-2">
            Seu número de telefone
          </label>
          <input
            id="telefone"
            type="tel"
            value={inputPhone}
            onChange={(e) => setInputPhone(e.target.value)}
            placeholder="555180562381"
            className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-2 text-xl tabular focus:outline-none focus:border-[var(--ferrugem)]"
          />
          <p className="text-sm text-[var(--tinta-media)] mb-5 leading-relaxed">
            DDI 55 + DDD + número, <strong className="text-[var(--tinta)]">sem o 9 extra</strong>, sem espaço nem traço.
            São 12 dígitos ao todo. Exemplo: <strong className="text-[var(--tinta)] tabular">555180562381</strong>.
          </p>
          {error && (
            <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--carmim)] rounded-xl px-4 py-3 mb-4">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-60"
          >
            Enviar código
          </button>
        </form>
      </div>
    </main>
  );
}

function Carregando() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--areia)]">
      <div className="h-10 w-10 rounded-full border-4 border-[var(--borda)] border-t-[var(--ferrugem)] animate-spin" />
    </main>
  );
}

function BotaoAba({ ativo, onClick, icone, children }: { ativo: boolean; onClick: () => void; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={`rotulo flex items-center gap-2 text-sm px-5 py-3 rounded-xl border-2 transition ${
        ativo
          ? 'bg-[var(--tinta)] text-[var(--creme)] border-[var(--tinta)]'
          : 'bg-[var(--creme)] text-[var(--tinta-media)] border-[var(--borda)] hover:border-[var(--borda-forte)]'
      }`}
    >
      {icone}
      {children}
    </button>
  );
}

function AbaGuardado({
  total, noMes, meta, potes, lancamentos, onApagar, onEditar, onRenomear,
}: {
  total: number;
  noMes: number;
  meta: Goal | null;
  potes: { nome: string; total: number }[];
  lancamentos: Saving[];
  onApagar: (id: string) => void;
  onEditar: (s: Saving) => void;
  onRenomear: (nome: string) => void;
}) {
  const metaMensal = Number(meta?.monthly_target) || 0;
  const objetivo = Number(meta?.goal_target) || 0;
  const pctMes = metaMensal > 0 ? Math.max(0, Math.min(100, Math.round((noMes / metaMensal) * 100))) : 0;
  const pctObjetivo = objetivo > 0 ? Math.min(100, Math.round((total / objetivo) * 100)) : 0;

  return (
    <>
      <section className="bloco px-6 py-7 sm:px-9 sm:py-9 mb-4" style={{ backgroundColor: 'var(--verde)' }}>
        <PiggyBank size={185} strokeWidth={1} aria-hidden="true" className="absolute -right-8 -bottom-11 opacity-[0.13] pointer-events-none" />
        <p className="rotulo text-sm sm:text-base opacity-90">Você tem guardado</p>
        <p className="bloco-cifra text-5xl sm:text-7xl mt-3">{currency.format(total)}</p>
        <p className="text-base sm:text-lg mt-4 opacity-90">
          {noMes > 0 ? `Guardou ${currency.format(noMes)} neste mês` : 'Nada guardado neste mês ainda'}
        </p>
      </section>

      {potes.length > 0 && (
        <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6 mb-4">
          <h2 className="titulo text-2xl text-[var(--tinta)] mb-1">Seus cofrinhos</h2>
          <p className="text-base text-[var(--tinta-media)] mb-5">
            {potes.length === 1
              ? 'Diga "guardei 100 no cofrinho da viagem" pra separar por objetivo.'
              : `${potes.length} cofrinhos separados.`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {potes.map((p) => (
              <div
                key={p.nome}
                className="flex items-center justify-between gap-2 py-3.5 px-4 rounded-xl bg-[var(--areia)]"
                style={{ borderLeft: `6px solid ${p.total >= 0 ? 'var(--verde)' : 'var(--carmim)'}` }}
              >
                <span className="text-lg font-semibold text-[var(--tinta)] truncate">🫙 {p.nome}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="bloco-cifra text-xl whitespace-nowrap"
                    style={{ color: p.total >= 0 ? 'var(--verde)' : 'var(--carmim)' }}
                  >
                    {currency.format(p.total)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRenomear(p.nome)}
                    aria-label={`Renomear o cofrinho ${p.nome}`}
                    title="Renomear"
                    className="p-2 -mr-1 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--ferrugem)] hover:bg-[var(--creme)] transition"
                  >
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(metaMensal > 0 || objetivo > 0) && (
        <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6 mb-4">
          <div className="flex items-start gap-2.5 mb-5">
            <Target size={24} className="text-[var(--ferrugem)] shrink-0 mt-1" />
            <h2 className="titulo text-2xl text-[var(--tinta)]">Suas metas</h2>
          </div>

          {metaMensal > 0 && (
            <div className="mb-6">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="rotulo text-sm text-[var(--tinta-media)]">Meta deste mês</p>
                <p className="text-base text-[var(--tinta-media)] tabular">
                  {currency.format(noMes)} de {currency.format(metaMensal)}
                </p>
              </div>
              <BarraProgresso pct={pctMes} />
              <p className="text-base text-[var(--tinta-media)] mt-2">
                {noMes >= metaMensal
                  ? '✅ Meta batida neste mês!'
                  : `Faltam ${currency.format(metaMensal - noMes)} pra bater a meta.`}
              </p>
            </div>
          )}

          {objetivo > 0 && (
            <div>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="rotulo text-sm text-[var(--tinta-media)]">{meta?.goal_name || 'Objetivo'}</p>
                <p className="text-base text-[var(--tinta-media)] tabular">
                  {currency.format(total)} de {currency.format(objetivo)}
                </p>
              </div>
              <BarraProgresso pct={pctObjetivo} />
              <p className="text-base text-[var(--tinta-media)] mt-2">
                {total >= objetivo
                  ? '🎉 Objetivo alcançado!'
                  : `Faltam ${currency.format(objetivo - total)}.`}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6">
        <h2 className="titulo text-2xl text-[var(--tinta)] mb-5">Movimentações</h2>
        {lancamentos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-[var(--tinta-media)]">
            <PiggyBank size={40} className="text-[var(--ferrugem)]" />
            <p className="text-lg text-center max-w-sm">
              Seu cofrinho está vazio. Fale <strong className="text-[var(--tinta)]">&quot;guardei 200&quot;</strong> pro Guará
              no WhatsApp e o valor aparece aqui.
            </p>
            <p className="text-base text-center max-w-sm mt-1">
              Para criar uma meta: <strong className="text-[var(--tinta)]">&quot;quero guardar 300 por mês&quot;</strong>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {lancamentos.map((l) => {
              const guardou = Number(l.amount) > 0;
              const cor = guardou ? 'var(--verde)' : 'var(--carmim)';
              return (
                <div
                  key={l.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 pl-4 pr-3 rounded-xl bg-[var(--areia)]"
                  style={{ borderLeft: `6px solid ${cor}` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-[var(--tinta)] break-words">
                      {guardou ? 'Guardou' : 'Retirou'}
                      {l.jar ? ` · 🫙 ${l.jar}` : ''}
                    </p>
                    <p className="text-sm text-[var(--tinta-media)] mt-0.5">
                      {new Date(l.created_at).toLocaleDateString('pt-BR')}
                      {l.description ? ` · ${l.description}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <span
                      className="bloco-cifra text-lg sm:text-xl px-3 py-1.5 rounded-lg text-[var(--sobre-cor)] whitespace-nowrap"
                      style={{ backgroundColor: cor }}
                    >
                      {guardou ? '+' : '−'}{currency.format(Math.abs(Number(l.amount)))}
                    </span>
                    <button
                      onClick={() => onEditar(l)}
                      className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--ferrugem)] transition"
                      aria-label="Editar movimentação do cofrinho"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => onApagar(l.id)}
                      className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--carmim)] transition"
                      aria-label="Apagar movimentação do cofrinho"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function BarraProgresso({ pct }: { pct: number }) {
  return (
    <div
      className="h-4 rounded-full bg-[var(--areia)] border-2 border-[var(--borda)] overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: pct >= 100 ? 'var(--verde)' : 'var(--ferrugem)' }}
      />
    </div>
  );
}

function Bloco({ rotulo, valor, cor, icone }: { rotulo: string; valor: string; cor: string; icone: React.ReactNode }) {
  return (
    <div className="bloco px-6 py-6" style={{ backgroundColor: cor }}>
      <div className="absolute -right-5 -bottom-8 opacity-[0.15] pointer-events-none">{icone}</div>
      <p className="rotulo text-sm opacity-90">{rotulo}</p>
      <p className="bloco-cifra text-3xl sm:text-4xl mt-2.5">{valor}</p>
    </div>
  );
}

function PassoLista({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span
        className="bloco-cifra shrink-0 w-8 h-8 rounded-full grid place-items-center text-base text-[var(--sobre-cor)]"
        style={{ backgroundColor: 'var(--ferrugem)' }}
        aria-hidden="true"
      >
        {numero}
      </span>
      <span className="text-base text-[var(--tinta-media)] leading-relaxed pt-0.5">{children}</span>
    </li>
  );
}

function DebtRow({ debt, cor, onSettle, onDelete }: { debt: Debt; cor: string; onSettle: (id: string) => void; onDelete: (id: string) => void }) {
  const nome = debt.person ? ` — ${debt.person}` : '';
  return (
    <div
      className="flex items-center justify-between gap-2 bg-[var(--areia)] rounded-xl pl-3.5 pr-2 py-2.5"
      style={{ borderLeft: `5px solid ${cor}` }}
    >
      <div className="min-w-0">
        <p className="text-base font-semibold text-[var(--tinta)] truncate tabular">
          {currency.format(Number(debt.amount))}{nome}
        </p>
        {debt.description && (
          <p className="text-sm text-[var(--tinta-media)] truncate">{debt.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onSettle(debt.id)}
          className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--verde)] transition"
          aria-label={`Marcar ${currency.format(Number(debt.amount))}${nome} como quitada`}
        >
          <Check size={18} />
        </button>
        <button
          onClick={() => onDelete(debt.id)}
          className="p-2 rounded-lg text-[var(--tinta-fraca)] hover:text-[var(--sobre-cor)] hover:bg-[var(--carmim)] transition"
          aria-label={`Apagar ${currency.format(Number(debt.amount))}${nome}`}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-[280px] flex flex-col items-center justify-center gap-3 text-[var(--tinta-media)]">
      <Inbox size={34} className="text-[var(--ferrugem)]" />
      <p className="text-base text-center max-w-[16rem]">{text}</p>
    </div>
  );
}
