'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { categoryColor } from '@/lib/chartColors';
import { useIsDark } from '@/lib/useIsDark';
import Turnstile from '@/components/Turnstile';
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
  PassoLista,
  GoogleIcon,
  DebtRow,
} from '@/components/PecasDoPainel';

import type {
  Transaction,
  Lancamento,
  Debt,
  Installment,
  Saving,
  Goal,
  Categoria,
  Recorrente,
  Aba,
} from '@/lib/tipos';
import {
  CATEGORIAS_PADRAO,
  CARTEIRA_PADRAO,
  MESES,
  mesPorDeslocamento,
  chaveDoMes,
  currency,
  PASSWORD_MIN_LENGTH,
  passwordError,
  traduzErroAuth,
  BR_PHONE_REGEX,
  authedFetch,
} from '@/lib/painel';

import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, LogOut, Search, Trash2, Inbox, Check, HandCoins,
  CalendarDays, PiggyBank, ChevronLeft, ChevronRight, CreditCard, Settings, Pencil, Plus, Download, X, Repeat, } from 'lucide-react';


export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Carteira: separa o dinheiro de casa do dinheiro do trabalho. Quem só tem
  // uma nunca vê o seletor — a barra inteira some, em vez de mostrar uma opção
  // única que não faz nada.
  const [respostasGuara, setRespostasGuara] = useState<string[]>([]);
  const [enviandoGuara, setEnviandoGuara] = useState(false);

  const [carteiras, setCarteiras] = useState<string[]>([CARTEIRA_PADRAO]);
  const [carteira, setCarteira] = useState<string>(CARTEIRA_PADRAO);

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

  // Lê a lista e a que está valendo no WhatsApp, pra o painel abrir no mesmo
  // lugar onde a conversa parou.
  const fetchCarteiras = useCallback(async () => {
    const { data } = await supabase.from('users').select('active_wallet, wallets').maybeSingle();
    const lista = Array.isArray(data?.wallets) && data.wallets.length ? data.wallets : [CARTEIRA_PADRAO];
    setCarteiras(lista);
    // Abre na mesma carteira em que a conversa do WhatsApp parou. Abrir noutra
    // faria a tela discordar do chat logo de cara.
    setCarteira(data?.active_wallet && lista.includes(data.active_wallet) ? data.active_wallet : lista[0]);
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
  const fetchTransactions = useCallback(async (ano: number, mes: number) => {
    setLoading(true);
    try {
      const inicio = new Date(ano, mes, 1).toISOString();
      const fim = new Date(ano, mes + 1, 1).toISOString();
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('wallet', carteira)
        .gte('created_at', inicio)
        .lt('created_at', fim)
        .order('created_at', { ascending: false });
      if (!error && data) setTransactions(data as Transaction[]);
    } catch (err) {
      console.error('Erro ao buscar transações:', err);
    } finally {
      setLoading(false);
    }
  }, [carteira]);

  const fetchDebts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('wallet', carteira)
        .eq('status', 'pendente')
        .order('created_at', { ascending: false });
      if (!error && data) setDebts(data as Debt[]);
    } catch (err) {
      console.error('Erro ao buscar dívidas:', err);
    }
  }, [carteira]);

  const fetchInstallments = useCallback(async () => {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .eq('wallet', carteira)
      .order('due_month', { ascending: true });
    if (!error && data) setInstallments(data as Installment[]);
  }, [carteira]);

  const fetchSavings = useCallback(async () => {
    const { data, error } = await supabase
      .from('savings')
      .select('*')
      .eq('wallet', carteira)
      .order('created_at', { ascending: false });
    if (!error && data) setSavings(data as Saving[]);
  }, [carteira]);

  const fetchGoal = useCallback(async () => {
    const { data } = await supabase.from('goals').select('*').eq('wallet', carteira).maybeSingle();
    setGoal((data as Goal) || null);
  }, [carteira]);

  const fetchRecurring = useCallback(async () => {
    const { data, error } = await supabase
      .from('recurring').select('*').eq('wallet', carteira).eq('active', true).order('day_of_month');
    if (!error && data) setRecurring(data as Recorrente[]);
  }, [carteira]);

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (!error && data) setCategories(data as Categoria[]);
  }, []);

  useEffect(() => {
    if (!phone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    fetchCarteiras();
  }, [phone, fetchCarteiras]);

  // Trocar de carteira recarrega tudo: os dados de uma não valem na outra.
  useEffect(() => {
    if (!phone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    fetchDebts();
    fetchInstallments();
    fetchSavings();
    fetchGoal();
    fetchCategories();
    fetchRecurring();
  }, [phone, fetchDebts, fetchInstallments, fetchSavings, fetchGoal, fetchCategories, fetchRecurring]);

  // Recarrega os lançamentos sempre que muda o mês selecionado.
  useEffect(() => {
    if (!phone) return;
    const { ano, mes } = mesPorDeslocamento(monthOffset);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    fetchTransactions(ano, mes);
  }, [phone, monthOffset, fetchTransactions]);

  // Trocar de carteira no painel muda a carteira DE VERDADE, no banco — a mesma
  // que o WhatsApp usa.
  //
  // Antes isso era só estado local: a tela mostrava Empresa e o WhatsApp
  // continuava lançando na Pessoal. Quem trocava aqui e mandava mensagem via o
  // gasto cair na outra carteira, sem entender por quê. Duas verdades sobre
  // "onde eu estou" é uma a mais.
  async function trocarDeCarteira(nome: string) {
    setCarteira(nome);
    const { ok, json } = await authedFetch('/api/carteiras', { acao: 'trocar', nome });
    if (!ok) {
      setAvisoErro(json.error || 'Não consegui trocar de carteira.');
      return;
    }
    setCarteiras(json.carteiras);
  }

  // Criar, renomear e apagar carteira chamam o backend, que chama as MESMAS
  // funções do WhatsApp. As regras (limite, nome repetido, não apagar a
  // padrão) ficam num lugar só em vez de serem reescritas aqui.
  async function mexerNaCarteira(acao: string, nome: string, novoNome?: string) {
    const { ok, json } = await authedFetch('/api/carteiras', { acao, nome, novoNome });
    if (!ok) {
      setAvisoErro(json.error || 'Não consegui fazer isso.');
      return false;
    }
    setCarteiras(json.carteiras);
    // Renomear a carteira em que se está muda o nome dela por baixo; sem isto
    // o painel ficaria apontando pra um nome que não existe mais.
    //
    // Criar NÃO troca: quem cria está arrumando a casa, não mudando de
    // assunto, e ser jogado pra outra carteira sem pedir faz o próximo
    // lançamento cair no lugar errado.
    setCarteira((atual) => (json.carteiras.includes(atual) ? atual : json.ativa));
    return true;
  }

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
        const { ano, mes } = mesPorDeslocamento(monthOffset);
        await Promise.all([
          fetchCarteiras(), fetchTransactions(ano, mes), fetchDebts(), fetchInstallments(),
          fetchSavings(), fetchGoal(), fetchCategories(), fetchRecurring(),
        ]);
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

          {/* Aparece antes de criar a conta, não depois: é quando a informação
              ainda pode mudar a decisão de alguém. */}
          <p className="text-sm text-[var(--tinta-fraca)] mt-6 text-center leading-relaxed">
            Ao criar conta você aceita os{' '}
            <Link href="/termos" className="underline underline-offset-2 text-[var(--tinta-media)]">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className="underline underline-offset-2 text-[var(--tinta-media)]">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

const LINK_PHONE_STORAGE_KEY = 'guara_link_phone_state';


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


