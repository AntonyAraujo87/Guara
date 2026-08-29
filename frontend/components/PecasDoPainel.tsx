import { memo } from 'react';
// As peças do painel: recebem props, desenham, e não sabem de mais nada.
//
// São o oposto do resto do arquivo de onde saíram. Não tocam banco, não têm
// estado próprio, não conhecem carteira nem mês — e por isso são as únicas que
// dá pra ler em dez segundos e ter certeza do que fazem.

import { Inbox, Trash2, Check, X } from 'lucide-react';
import type { Debt } from '@/lib/tipos';
import { currency } from '@/lib/painel';

const RADIAN = Math.PI / 180;

type DonutLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
};

export function renderDonutLabel({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 }: DonutLabelProps) {
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

function BlocoBase({ rotulo, valor, cor, icone }: { rotulo: string; valor: string; cor: string; icone: React.ReactNode }) {
  return (
    <div className="bloco px-6 py-6" style={{ backgroundColor: cor }}>
      <div className="absolute -right-5 -bottom-8 opacity-[0.15] pointer-events-none">{icone}</div>
      <p className="rotulo text-sm opacity-90">{rotulo}</p>
      <p className="bloco-cifra text-3xl sm:text-4xl mt-2.5">{valor}</p>
    </div>
  );
}

function BarraProgressoBase({ pct }: { pct: number }) {
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

function EmptyChartBase({ text }: { text: string }) {
  return (
    <div className="h-[280px] flex flex-col items-center justify-center gap-3 text-[var(--tinta-media)]">
      <Inbox size={34} className="text-[var(--ferrugem)]" />
      <p className="text-base text-center max-w-[16rem]">{text}</p>
    </div>
  );
}

export function BotaoAba({ ativo, onClick, icone, children }: { ativo: boolean; onClick: () => void; icone: React.ReactNode; children: React.ReactNode }) {
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

function CarregandoBase() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--areia)]">
      <div className="h-10 w-10 rounded-full border-4 border-[var(--borda)] border-t-[var(--ferrugem)] animate-spin" />
    </main>
  );
}

export function PassoLista({ numero, children }: { numero: number; children: React.ReactNode }) {
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

function GoogleIconBase() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.5 0-14 4.2-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-1.9 14.1-5.3l-6.5-5.5C29.6 34.9 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.9 39.6 16.4 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.5C40.9 36.6 44 30.9 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function CaixaModal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
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

function DebtRowBase({ debt, cor, onSettle, onDelete }: { debt: Debt; cor: string; onSettle: (id: string) => void; onDelete: (id: string) => void }) {
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

// Folhas memoizadas.
//
// O painel guarda vinte e poucos estados; qualquer um deles mudando
// redesenhava estas pecas de novo, mesmo com os mesmos dados. Sao as unicas
// que recebem so props simples — as que recebem `children` ficam de fora de
// proposito: children e objeto novo a cada render, entao o memo nunca
// acertaria e so somaria o custo da comparacao.
export const Bloco = memo(BlocoBase);
export const BarraProgresso = memo(BarraProgressoBase);
export const EmptyChart = memo(EmptyChartBase);
export const Carregando = memo(CarregandoBase);
export const GoogleIcon = memo(GoogleIconBase);
export const DebtRow = memo(DebtRowBase);
