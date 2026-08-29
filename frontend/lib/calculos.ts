// As contas do painel.
//
// Tudo aqui é função pura: mesmas entradas, mesma saída, sem tocar em tela nem
// em banco. Estavam dentro de `useMemo` no meio do componente, o que fazia
// duas coisas ruins — obrigava a ler 1300 linhas de JSX pra achar como o saldo
// é calculado, e tornava impossível conferir uma conta sem renderizar o app.
//
// A regra que rege este arquivo: dinheiro é somado num lugar só. Quando saldo,
// gráfico, extrato e planilha derivam da MESMA lista, eles não podem discordar
// entre si — que é o pior defeito possível num app de finanças.

import type { Debt, Installment, Lancamento, Saving, Transaction } from './tipos';

export type Mes = { ano: number; mes: number };

// Junta as três tabelas numa lista só, em formato de lançamento.
//
// Guardar dinheiro sai do saldo como qualquer outra despesa, e parcela paga é
// dinheiro que saiu de verdade. Mesclar aqui, na raiz da cadeia, faz o saldo,
// os gastos, o gráfico, o extrato e a planilha herdarem o comportamento sem
// precisar repetir a regra em cada cálculo depois.
//
// As linhas continuam vivendo em `savings` e `installments` — o campo `origem`
// existe pra editar e apagar irem parar na tabela certa.
export function montarLancamentos(
  transactions: Transaction[],
  savings: Saving[],
  installments: Installment[]
): Lancamento[] {
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
        : guardou
          ? 'Guardei'
          : 'Tirei do guardado',
      created_at: s.created_at,
      origem: 'guardado',
    };
  });

  // O dinheiro sai no dia em que se PAGA, não no dia em que vence: adiantar em
  // agosto uma parcela de setembro tira de agosto. O rótulo entre parênteses
  // existe pra que o mês não pareça errado pra quem lembra do vencimento.
  const dasParcelas: Lancamento[] = installments
    .filter((p) => p.paid)
    .map((p) => {
      const vence = String(p.due_month).slice(0, 7);
      const pagouEm = String(p.paid_at || '').slice(0, 7);
      const ritmo =
        pagouEm && pagouEm < vence
          ? ' (adiantada)'
          : pagouEm && pagouEm > vence
            ? ' (atrasada)'
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
}

export function filtrarPorMes(lancamentos: Lancamento[], { ano, mes }: Mes): Lancamento[] {
  return lancamentos.filter((t) => {
    const d = new Date(t.created_at);
    return d.getFullYear() === ano && d.getMonth() === mes;
  });
}

export function filtrarPorBusca(lancamentos: Lancamento[], busca: string): Lancamento[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) return lancamentos;
  return lancamentos.filter(
    (t) =>
      t.category.toLowerCase().includes(termo) ||
      (t.description || '').toLowerCase().includes(termo)
  );
}

export function somarPorTipo(lancamentos: Lancamento[]) {
  let receitas = 0;
  let despesas = 0;
  for (const t of lancamentos) {
    if (t.type === 'receita') receitas += Number(t.amount);
    else despesas += Number(t.amount);
  }
  return { receitas, despesas, saldo: receitas - despesas };
}

export function somarPorCategoria(lancamentos: Lancamento[]) {
  const porCategoria: Record<string, number> = {};
  for (const t of lancamentos) {
    if (t.type !== 'despesa') continue;
    porCategoria[t.category] = (porCategoria[t.category] || 0) + Number(t.amount);
  }
  return Object.entries(porCategoria)
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
}

// Saldo acumulado ao longo do mês, na ordem em que as coisas aconteceram.
//
// Acumula empurrando no array. A versão anterior fazia `[...acc, novo]` dentro
// de um reduce, o que recopia a lista inteira a cada item — num mês com 400
// lançamentos são 80 mil cópias pra montar um gráfico de 400 pontos.
export function evolucaoDoSaldo(lancamentos: Lancamento[]) {
  const emOrdem = [...lancamentos].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const pontos: { date: string; saldo: number }[] = [];
  let saldo = 0;
  for (const t of emOrdem) {
    saldo += t.type === 'receita' ? Number(t.amount) : -Number(t.amount);
    pontos.push({
      date: new Date(t.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
      saldo,
    });
  }
  return pontos;
}

export function somarDividas(debts: Debt[]) {
  let aReceber = 0;
  let aPagar = 0;
  for (const d of debts) {
    if (d.direction === 'a_receber') aReceber += Number(d.amount);
    else aPagar += Number(d.amount);
  }
  return { aReceber, aPagar };
}

// Agrupa o cofrinho por pote. Lançamento sem nome cai em "Geral", senão sumiria
// da tela sem deixar rastro do dinheiro.
export function agruparPotes(savings: Saving[]) {
  const mapa: Record<string, number> = {};
  for (const l of savings) {
    const nome = (l.jar || '').trim() || 'Geral';
    mapa[nome] = (mapa[nome] || 0) + Number(l.amount);
  }
  return Object.entries(mapa)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);
}

export function totaisDoCofrinho(savings: Saving[], mesCorrente: Mes) {
  let totalGuardado = 0;
  // Líquido do mês (depósitos menos saques): o quanto o cofrinho cresceu.
  let guardadoNoMes = 0;
  for (const l of savings) {
    const valor = Number(l.amount);
    totalGuardado += valor;
    const d = new Date(l.created_at);
    if (d.getFullYear() === mesCorrente.ano && d.getMonth() === mesCorrente.mes) {
      guardadoNoMes += valor;
    }
  }
  return { totalGuardado, guardadoNoMes };
}

export function parcelasQueVencemEm(installments: Installment[], chaveDoMes: string) {
  return installments.filter((p) => p.due_month === chaveDoMes);
}

// Tudo que ainda vai vencer, do mês corrente pra frente.
export function totalAindaComprometido(installments: Installment[], chaveDoMesCorrente: string) {
  return installments
    .filter((p) => !p.paid && p.due_month >= chaveDoMesCorrente)
    .reduce((s, p) => s + Number(p.amount), 0);
}

export function somar(valores: { amount: number }[]) {
  return valores.reduce((s, v) => s + Number(v.amount), 0);
}
