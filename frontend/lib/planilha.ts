// Geração da planilha .xlsx do mês.
//
// Vive fora do painel porque são ~110 linhas de formatação de célula que não
// têm nada a ver com renderizar tela — e porque montar a planilha é uma função
// pura de (lançamentos, mês, totais), coisa que dá pra conferir sem abrir o
// navegador.
//
// O ExcelJS entra por import dinâmico: ~800 KB que só carregam quando alguém
// clica em exportar, sem pesar a abertura do painel.

import type { Lancamento } from './tipos';
import { MESES } from './painel';

// Cores em ARGB, que é o formato do ExcelJS — as mesmas da identidade do app.
const FERRUGEM = 'FFC4400D';
const VERDE = 'FF0B6E3A';
const CARMIM = 'FFB3122B';
const AREIA = 'FFEFE3D2';
const BRANCO = 'FFFFFFFF';
const TINTA = 'FF191007';

const MOEDA_COM_NEGATIVO = 'R$ #,##0.00;[Red]-R$ #,##0.00';
const MOEDA = 'R$ #,##0.00';

export type DadosDaPlanilha = {
  lancamentos: Lancamento[];
  ano: number;
  mes: number;
  receitas: number;
  despesas: number;
};

export async function gerarPlanilha({
  lancamentos,
  ano,
  mes,
  receitas,
  despesas,
}: DadosDaPlanilha): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Guará';
  wb.created = new Date();

  const ws = wb.addWorksheet(`${MESES[mes]} ${ano}`, {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  ws.mergeCells('A1:E1');
  const titulo = ws.getCell('A1');
  titulo.value = `Guará · ${MESES[mes]} de ${ano}`;
  titulo.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BRANCO } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FERRUGEM } };
  titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 30;

  ws.getRow(2).height = 6;

  const cab = ws.getRow(3);
  cab.values = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'];
  cab.eachCell((c) => {
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: TINTA } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AREIA } };
    c.alignment = { vertical: 'middle' };
    c.border = { bottom: { style: 'medium', color: { argb: FERRUGEM } } };
  });
  cab.height = 22;

  for (const t of lancamentos) {
    const entrada = t.type === 'receita';
    const cor = entrada ? VERDE : CARMIM;
    const linha = ws.addRow([
      new Date(t.created_at),
      entrada ? 'Entrada' : 'Saída',
      t.category,
      t.description || '',
      entrada ? Number(t.amount) : -Number(t.amount),
    ]);
    linha.getCell(1).numFmt = 'dd/mm/yyyy';
    linha.getCell(5).numFmt = MOEDA_COM_NEGATIVO;
    linha.getCell(2).font = { color: { argb: cor }, bold: true };
    linha.getCell(5).font = { color: { argb: cor }, bold: true };
  }

  ws.addRow([]);

  const saldo = receitas - despesas;
  const tot = ws.addRow(['', '', '', 'Saldo do mês', saldo]);
  tot.getCell(4).font = { bold: true };
  tot.getCell(4).border = { top: { style: 'thin' } };
  tot.getCell(5).numFmt = MOEDA_COM_NEGATIVO;
  tot.getCell(5).font = { bold: true, size: 12, color: { argb: saldo >= 0 ? VERDE : CARMIM } };
  tot.getCell(5).border = { top: { style: 'thin' } };

  const ent = ws.addRow(['', '', '', 'Entradas', receitas]);
  ent.getCell(5).numFmt = MOEDA;
  ent.getCell(5).font = { color: { argb: VERDE } };

  const sai = ws.addRow(['', '', '', 'Saídas', despesas]);
  sai.getCell(5).numFmt = MOEDA;
  sai.getCell(5).font = { color: { argb: CARMIM } };

  // Sem largura definida o Excel mostra ##### nas datas — já aconteceu.
  ws.columns = [{ width: 12 }, { width: 11 }, { width: 18 }, { width: 38 }, { width: 15 }];
  ws.autoFilter = { from: 'A3', to: 'E3' };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Entrega o arquivo pro navegador.
//
// Três detalhes que parecem paranoia e não são:
//   - o <a> precisa estar NO DOM: o Firefox ignora .click() em elemento solto;
//   - revogar a URL na hora corre com o download e o Safari cancela — daí o
//     atraso de um minuto, tempo de sobra pro navegador ter lido o blob;
//   - o link é removido logo, senão sobra lixo invisível a cada exportação.
export function baixarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function nomeDaPlanilha(ano: number, mes: number): string {
  return `guara-${ano}-${String(mes + 1).padStart(2, '0')}.xlsx`;
}
