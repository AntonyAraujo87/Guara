'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { categoryColor, seriesColor, STATUS } from '@/lib/chartColors';
import { useIsDark } from '@/lib/useIsDark';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, LogOut, Search, Trash2, Receipt, Inbox, Check, HandCoins,
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

type DateFilter = 'all' | 'today' | '7d' | '30d' | 'month';

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
      fontSize={12}
      fontWeight={700}
      fill="#fff"
      paintOrder="stroke"
      stroke="rgba(0,0,0,0.35)"
      strokeWidth={3}
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
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
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

  async function fetchTransactions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
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

  useEffect(() => {
    if (!phone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    fetchTransactions();
    fetchDebts();
  }, [phone]);

  async function handleDelete(id: string) {
    if (!confirm('Apagar essa transação?')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSettleDebt(id: string) {
    const { error } = await supabase.from('debts').update({ status: 'quitada', settled_at: new Date().toISOString() }).eq('id', id);
    if (!error) setDebts((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleDeleteDebt(id: string) {
    if (!confirm('Apagar essa dívida?')) return;
    const { error } = await supabase.from('debts').delete().eq('id', id);
    if (!error) setDebts((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setTransactions([]);
    setDebts([]);
  }

  const dateFiltered = useMemo(() => {
    if (dateFilter === 'all') return transactions;
    const now = new Date();
    const cutoff = new Date();
    if (dateFilter === 'today') cutoff.setHours(0, 0, 0, 0);
    else if (dateFilter === '7d') cutoff.setDate(now.getDate() - 7);
    else if (dateFilter === '30d') cutoff.setDate(now.getDate() - 30);
    else if (dateFilter === 'month') cutoff.setDate(1);
    return transactions.filter((t) => new Date(t.created_at) >= cutoff);
  }, [transactions, dateFilter]);

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

  const chartSurface = isDark ? '#1a1a19' : '#fcfcfb';
  const gridColor = isDark ? '#2c2c2a' : '#e1e0d9';
  const mutedText = '#898781';
  const balanceColor = seriesColor(0, isDark);

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d0d0d]">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 dark:border-white/20 border-t-blue-600 animate-spin" />
      </main>
    );
  }

  if (!session) {
    return <AuthCard />;
  }

  if (profileLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d0d0d]">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 dark:border-white/20 border-t-blue-600 animate-spin" />
      </main>
    );
  }

  if (!phone) {
    return <LinkPhoneCard userId={session.user.id} onLinked={(p) => setPhone(p)} />;
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d] px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Dashboard Financeiro</h1>
            <p className="text-sm text-gray-500 dark:text-[#c3c2b7]">{session.user.email} • WhatsApp {phone}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-gray-500 dark:text-[#c3c2b7] hover:text-red-600 text-sm">
            <LogOut size={16} /> Sair
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por categoria ou descrição..."
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#1a1a19] dark:text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="border border-gray-200 dark:border-white/10 dark:bg-[#1a1a19] dark:text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todo o período</option>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="month">Este mês</option>
          </select>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Receitas" value={currency.format(receitas)} color={STATUS.good} icon={<TrendingUp size={26} />} />
          <StatCard label="Despesas" value={currency.format(despesas)} color={STATUS.critical} icon={<TrendingDown size={26} />} />
          <StatCard label="Saldo" value={currency.format(saldo)} color={saldo >= 0 ? STATUS.good : STATUS.critical} icon={<Wallet size={26} />} />
          <StatCard label="Transações" value={String(filtered.length)} color={balanceColor} icon={<Receipt size={26} />} />
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          <div className="lg:col-span-3 bg-white dark:bg-[#1a1a19] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Evolução do Saldo</h2>
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
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: mutedText }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} width={70}
                    tickFormatter={(v) => currency.format(v)} />
                  <Tooltip
                    contentStyle={{ background: chartSurface, border: `1px solid ${gridColor}`, borderRadius: 8 }}
                    formatter={(value) => [currency.format(Number(value)), 'Saldo']}
                  />
                  <Area type="monotone" dataKey="saldo" stroke={balanceColor} strokeWidth={2} fill="url(#balanceGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Sem dados no período selecionado." />
            )}
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-[#1a1a19] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Despesas por Categoria</h2>
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
                    strokeWidth={2}
                    label={renderDonutLabel}
                    labelLine={false}
                  >
                    {expensesByCategory.map((entry) => (
                      <Cell key={entry.category} fill={categoryColor(entry.category, 'despesa', isDark)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: chartSurface, border: `1px solid ${gridColor}`, borderRadius: 8 }}
                    formatter={(value, name) => [currency.format(Number(value)), name]}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ fontSize: 12, color: mutedText }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Sem despesas no período selecionado." />
            )}
          </div>
        </div>

        {/* Dívidas */}
        {debts.length > 0 && (
          <div className="bg-white dark:bg-[#1a1a19] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <HandCoins size={20} className="text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Dívidas pendentes</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 dark:text-[#c3c2b7] mb-2">
                  A receber <span className="font-semibold" style={{ color: STATUS.good }}>{currency.format(aReceber)}</span>
                </p>
                <div className="space-y-2">
                  {debts.filter((d) => d.direction === 'a_receber').map((d) => (
                    <DebtRow key={d.id} debt={d} onSettle={handleSettleDebt} onDelete={handleDeleteDebt} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-[#c3c2b7] mb-2">
                  A pagar <span className="font-semibold" style={{ color: STATUS.critical }}>{currency.format(aPagar)}</span>
                </p>
                <div className="space-y-2">
                  {debts.filter((d) => d.direction === 'a_pagar').map((d) => (
                    <DebtRow key={d.id} debt={d} onSettle={handleSettleDebt} onDelete={handleDeleteDebt} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lista de transações */}
        <div className="bg-white dark:bg-[#1a1a19] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Transações</h2>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          )}
          {!loading && (
            <div className="divide-y divide-gray-100 dark:divide-white/10">
              {filtered.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: categoryColor(t.category, t.type, isDark) }}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 dark:text-white truncate">{t.description || t.category}</p>
                      <p className="text-xs text-gray-400 dark:text-[#898781]">
                        {t.category} • {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-semibold ${t.type === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.type === 'receita' ? '+' : '-'}{currency.format(Number(t.amount))}
                    </span>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition"
                      title="Apagar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-400 dark:text-[#898781]">
                  <Inbox size={32} />
                  <p className="text-sm">Nenhuma transação encontrada.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
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

function AuthCard() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
        else if (!data.session) setNotice('Conta criada! Confira seu email para confirmar o cadastro.');
      }
    } finally {
      setBusy(false);
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
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d0d0d] px-4">
      <div className="w-full max-w-sm bg-white dark:bg-[#1a1a19] p-8 rounded-2xl shadow-lg border border-gray-100 dark:border-white/10">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">Controle Financeiro</h1>
        <p className="text-sm text-gray-500 dark:text-[#c3c2b7] mb-6">Seus gastos e receitas, organizados por IA</p>

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-white/10 rounded-lg py-2 font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-white/5 transition mb-4"
        >
          <GoogleIcon /> Entrar com Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
          <span className="text-xs text-gray-400 dark:text-[#898781]">ou</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700 dark:text-[#c3c2b7] mb-2">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            className="w-full border border-gray-300 dark:border-white/10 dark:bg-[#0d0d0d] dark:text-white rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="block text-sm font-medium text-gray-700 dark:text-[#c3c2b7] mb-2">Senha</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-gray-300 dark:border-white/10 dark:bg-[#0d0d0d] dark:text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {notice && <p className="text-sm text-green-600 mb-3">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
          >
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="text-sm text-gray-500 dark:text-[#c3c2b7] mt-4 text-center">
          {mode === 'signin' ? 'Não tem conta?' : 'Já tem conta?'}{' '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}
            className="text-blue-600 font-medium hover:underline"
          >
            {mode === 'signin' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </div>
    </main>
  );
}

function LinkPhoneCard({ userId, onLinked }: { userId: string; onLinked: (phone: string) => void }) {
  const [inputPhone, setInputPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = inputPhone.replace(/\D/g, '');
    if (!cleaned) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.from('profiles').upsert({ id: userId, phone: cleaned });
    setBusy(false);
    if (error) {
      setError(error.message.includes('duplicate') ? 'Esse número já está vinculado a outra conta.' : error.message);
      return;
    }
    onLinked(cleaned);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d0d0d] px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-[#1a1a19] p-8 rounded-2xl shadow-lg border border-gray-100 dark:border-white/10">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white mb-1">Quase lá!</h1>
        <p className="text-sm text-gray-500 dark:text-[#c3c2b7] mb-6">
          Vincule o número de WhatsApp que você usa pra mandar mensagens ao Guará.
        </p>
        <label className="block text-sm font-medium text-gray-700 dark:text-[#c3c2b7] mb-2">Seu número de WhatsApp</label>
        <input
          type="tel"
          value={inputPhone}
          onChange={(e) => setInputPhone(e.target.value)}
          placeholder="5511999999999"
          className="w-full border border-gray-300 dark:border-white/10 dark:bg-[#0d0d0d] dark:text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
          Vincular
        </button>
      </form>
    </main>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1a1a19] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-6 flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm text-gray-500 dark:text-[#c3c2b7]">{label}</p>
        <p className="text-2xl font-bold truncate" style={{ color }}>{value}</p>
      </div>
      <div style={{ color }}>{icon}</div>
    </div>
  );
}

function DebtRow({ debt, onSettle, onDelete }: { debt: Debt; onSettle: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-2 group">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
          {currency.format(Number(debt.amount))}{debt.person ? ` — ${debt.person}` : ''}
        </p>
        {debt.description && (
          <p className="text-xs text-gray-400 dark:text-[#898781] truncate">{debt.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onSettle(debt.id)}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-green-600 transition"
          title="Marcar como paga"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => onDelete(debt.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-400 hover:text-red-600 transition"
          title="Apagar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-[#898781]">
      <Inbox size={28} />
      <p className="text-sm">{text}</p>
    </div>
  );
}
