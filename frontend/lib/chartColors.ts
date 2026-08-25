// Paleta categórica validada (ordem fixa, nunca ciclada por rank)
const CATEGORICAL_LIGHT = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
];

const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
];

export const STATUS = {
  good: '#0ca30c',
  critical: '#d03b3b',
};

// Mapeamento fixo categoria -> slot (a mesma categoria sempre a mesma cor)
const DESPESA_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Moradia',
  'Saúde',
  'Lazer',
  'Compras',
  'Outros',
];

const RECEITA_CATEGORIES = [
  'Salário',
  'Freelance',
  'Investimentos',
  'Presente/Reembolso',
  'Outros',
];

function slotFor(category: string, list: string[]): number {
  const idx = list.indexOf(category);
  return idx === -1 ? list.length : idx;
}

export function categoryColor(category: string, type: 'receita' | 'despesa', isDark: boolean): string {
  const ramp = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const list = type === 'despesa' ? DESPESA_CATEGORIES : RECEITA_CATEGORIES;
  const slot = slotFor(category, list);
  return ramp[Math.min(slot, ramp.length - 1)];
}

export function seriesColor(index: number, isDark: boolean): string {
  const ramp = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  return ramp[index % ramp.length];
}
