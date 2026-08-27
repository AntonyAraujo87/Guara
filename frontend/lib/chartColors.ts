// Paleta categórica de 8 slots, em ordem fixa. A ORDEM é o mecanismo de
// segurança, não enfeite: os slots vizinhos são os que precisam se distinguir
// para quem tem daltonismo, e foram validados nessa sequência contra as duas
// superfícies do painel. Trocar a ordem exige revalidar.
const CATEGORICAL_LIGHT = [
  '#2a78d6', // 1 azul
  '#eb6834', // 2 laranja
  '#1baf7a', // 3 água
  '#eda100', // 4 amarelo
  '#e87ba4', // 5 magenta
  '#008300', // 6 verde
  '#4a3aa7', // 7 violeta
  '#e34948', // 8 vermelho
];

const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

// Mesmos verde/carmim dos blocos do painel (globals.css), para gráfico e UI falarem a mesma língua
export const STATUS = {
  good: '#0b6e3a',
  critical: '#b3122b',
};

// Mapeamento fixo categoria -> slot: a mesma categoria tem sempre a mesma cor,
// independente do tamanho da fatia ou de quais outras aparecem no gráfico.
//
// "Guardado" entrou antes de "Outros" de propósito. Ela é uma categoria de
// verdade e costuma ser grande; "Outros" é o balde do que sobra e fica por
// último. Antes desta lista ter 8 nomes, "Guardado" caía fora dela e era
// grampeada no último slot — saindo exatamente com a cor de "Outros".
const DESPESA_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Moradia',
  'Saúde',
  'Lazer',
  'Compras',
  'Guardado',
  'Outros',
];

const RECEITA_CATEGORIES = [
  'Salário',
  'Freelance',
  'Investimentos',
  'Presente/Reembolso',
  'Outros',
];

// Espalha as categorias criadas pela pessoa pelos slots, de forma estável.
// Sem isso todas caíam no mesmo, e duas categorias personalizadas saíam
// idênticas no gráfico. O hash é determinístico: o mesmo nome dá sempre a
// mesma cor, mesmo depois de recarregar ou em outro aparelho.
function hashSlot(texto: string, total: number): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % total;
}

export function categoryColor(category: string, type: 'receita' | 'despesa', isDark: boolean): string {
  const ramp = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const list = type === 'despesa' ? DESPESA_CATEGORIES : RECEITA_CATEGORIES;
  const idx = list.indexOf(category);
  const slot = idx === -1 ? hashSlot(category, ramp.length) : idx;
  return ramp[Math.min(slot, ramp.length - 1)];
}

export function seriesColor(index: number, isDark: boolean): string {
  const ramp = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  return ramp[index % ramp.length];
}
