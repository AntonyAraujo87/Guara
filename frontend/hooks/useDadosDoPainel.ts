'use client';

// Toda a leitura do banco que o painel faz.
//
// Estava espalhada em oito `useCallback` e três `useEffect` no meio do
// componente de 1300 linhas. Junto aqui porque são uma coisa só: "os dados
// desta carteira, neste mês" — e porque quem for mexer em como o painel lê o
// banco não deveria precisar passar por JSX pra chegar lá.
//
// Os setters saem junto de propósito: as ações (apagar, editar, quitar)
// atualizam a lista na hora em vez de recarregar tudo do servidor, que é o que
// faz o painel parecer instantâneo numa conexão ruim.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { mesPorDeslocamento } from '@/lib/painel';
import type {
  Categoria,
  Debt,
  Goal,
  Installment,
  Recorrente,
  Saving,
  Transaction,
} from '@/lib/tipos';

export function useDadosDoPainel(
  phone: string | null,
  carteira: string,
  carteirasProntas: boolean,
  monthOffset: number
) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [savings, setSavings] = useState<Saving[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [recurring, setRecurring] = useState<Recorrente[]>([]);
  const [loading, setLoading] = useState(false);

  // Só carrega quando já se sabe qual carteira está valendo. Sem esta trava, a
  // primeira leva de consultas sai com a carteira padrão e é descartada assim
  // que a verdadeira chega.
  const podeCarregar = Boolean(phone) && carteirasProntas;

  // Busca só o mês pedido. Carregar "os últimos 500" quebrava a navegação:
  // quem passasse de 500 lançamentos veria meses antigos vazios.
  const buscarLancamentos = useCallback(
    async (ano: number, mes: number) => {
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
    },
    [carteira]
  );

  const buscarDividas = useCallback(async () => {
    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .eq('wallet', carteira)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });
    if (!error && data) setDebts(data as Debt[]);
  }, [carteira]);

  const buscarParcelas = useCallback(async () => {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .eq('wallet', carteira)
      .order('due_month', { ascending: true });
    if (!error && data) setInstallments(data as Installment[]);
  }, [carteira]);

  const buscarCofrinho = useCallback(async () => {
    const { data, error } = await supabase
      .from('savings')
      .select('*')
      .eq('wallet', carteira)
      .order('created_at', { ascending: false });
    if (!error && data) setSavings(data as Saving[]);
  }, [carteira]);

  const buscarMeta = useCallback(async () => {
    const { data } = await supabase.from('goals').select('*').eq('wallet', carteira).maybeSingle();
    setGoal((data as Goal) || null);
  }, [carteira]);

  const buscarFixos = useCallback(async () => {
    const { data, error } = await supabase
      .from('recurring')
      .select('*')
      .eq('wallet', carteira)
      .eq('active', true)
      .order('day_of_month');
    if (!error && data) setRecurring(data as Recorrente[]);
  }, [carteira]);

  // Categorias são compartilhadas entre carteiras de propósito: "Mercado" é
  // mercado na Pessoal e na Empresa.
  const buscarCategorias = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (!error && data) setCategories(data as Categoria[]);
  }, []);

  // Trocar de carteira recarrega tudo: os dados de uma não valem na outra.
  useEffect(() => {
    if (!podeCarregar) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    buscarDividas();
    buscarParcelas();
    buscarCofrinho();
    buscarMeta();
    buscarCategorias();
    buscarFixos();
  }, [
    podeCarregar,
    buscarDividas,
    buscarParcelas,
    buscarCofrinho,
    buscarMeta,
    buscarCategorias,
    buscarFixos,
  ]);

  // Recarrega os lançamentos sempre que muda o mês selecionado.
  useEffect(() => {
    if (!podeCarregar) return;
    const { ano, mes } = mesPorDeslocamento(monthOffset);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    buscarLancamentos(ano, mes);
  }, [podeCarregar, monthOffset, buscarLancamentos]);

  // Depois de uma ação que pode ter mexido em qualquer tabela, recarregar tudo
  // é mais barato (em bugs) do que adivinhar o quê.
  const recarregarTudo = useCallback(async () => {
    const { ano, mes } = mesPorDeslocamento(monthOffset);
    await Promise.all([
      buscarLancamentos(ano, mes),
      buscarDividas(),
      buscarParcelas(),
      buscarCofrinho(),
      buscarMeta(),
      buscarCategorias(),
      buscarFixos(),
    ]);
  }, [
    monthOffset,
    buscarLancamentos,
    buscarDividas,
    buscarParcelas,
    buscarCofrinho,
    buscarMeta,
    buscarCategorias,
    buscarFixos,
  ]);

  // Ao sair, a tela precisa esvaziar na hora: dado de conta antiga visível
  // depois do logout é vazamento, mesmo que só até o próximo carregamento.
  const limparTudo = useCallback(() => {
    setTransactions([]);
    setDebts([]);
    setInstallments([]);
    setSavings([]);
    setGoal(null);
    setRecurring([]);
    setCategories([]);
  }, []);

  return {
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
    setGoal,
    setCategories,
    setRecurring,
    recarregarTudo,
    limparTudo,
  };
}
