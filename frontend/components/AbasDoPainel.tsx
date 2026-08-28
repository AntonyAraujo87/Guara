// As abas do painel: guardado, ajustes, e a caixa de conversa.
//
// Cada uma é uma tela inteira, com estado próprio. Ficavam no meio do page.tsx,
// o que obrigava a rolar por todas as outras pra mudar qualquer coisa numa.

import { useRef, useState } from 'react';
import {
  PiggyBank, Wallet, Tags, Pencil, Plus, Trash2, X, MessageCircle, Send, Target,
} from 'lucide-react';
import type { Saving, Categoria, Goal } from '@/lib/tipos';
import { CARTEIRA_PADRAO, CATEGORIAS_PADRAO, currency } from '@/lib/painel';
import { BarraProgresso } from '@/components/PecasDoPainel';

export function AbaGuardado({
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

// Carteiras separam o dinheiro de casa do dinheiro do trabalho. Ficam aqui,
// junto das categorias, porque são a mesma natureza de coisa: organização que
// a pessoa monta uma vez e usa por meses.
export function GerenciarCarteiras({
  carteiras, ativa, onCarteira,
}: {
  carteiras: string[];
  ativa: string;
  onCarteira: (acao: string, nome: string, novoNome?: string) => Promise<boolean>;
}) {
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const limpo = nova.trim();
    if (!limpo || ocupado) return;
    setOcupado(true);
    if (await onCarteira('criar', limpo)) setNova('');
    setOcupado(false);
  }

  async function salvarNome(antigo: string) {
    const limpo = rascunho.trim();
    if (!limpo || limpo === antigo) return setEditando(null);
    setOcupado(true);
    await onCarteira('renomear', antigo, limpo);
    setOcupado(false);
    setEditando(null);
  }

  async function apagar(nome: string) {
    if (!confirm(`Apagar a carteira "${nome}"?\n\nOs lançamentos dela voltam pra ${CARTEIRA_PADRAO} — nada é perdido.`)) return;
    setOcupado(true);
    await onCarteira('apagar', nome);
    setOcupado(false);
  }

  return (
    <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-6 mb-6">
      <div className="flex items-start gap-2.5 mb-2">
        <Wallet size={24} className="text-[var(--ferrugem)] shrink-0 mt-1" />
        <h2 className="titulo text-2xl text-[var(--tinta)]">Suas carteiras</h2>
      </div>
      <p className="text-base text-[var(--tinta-media)] mb-6 leading-relaxed">
        Cada carteira tem saldo, gastos, parcelas e cofrinhos próprios — bom pra separar
        o dinheiro de casa do dinheiro do trabalho. Funciona igual pelo WhatsApp:
        <em> &quot;cria uma carteira da empresa&quot;</em>.
      </p>

      <form onSubmit={criar} className="flex flex-wrap sm:flex-nowrap gap-2 mb-6">
        <label htmlFor="nova-carteira" className="sr-only">Nome da carteira nova</label>
        <input
          id="nova-carteira"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          placeholder="Nome da carteira nova"
          maxLength={24}
          className="flex-1 min-w-0 bg-transparent border-2 border-[var(--borda)] rounded-xl px-4 py-3 text-[var(--tinta)] placeholder:text-[var(--tinta-media)] focus:border-[var(--ferrugem)] focus:outline-none transition"
        />
        <button
          type="submit"
          disabled={ocupado || !nova.trim()}
          className="rotulo flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--ferrugem)] text-[var(--sobre-cor)] disabled:opacity-50 transition"
        >
          <Plus size={17} /> Criar
        </button>
      </form>

      <ul className="space-y-2">
        {carteiras.map((c) => (
          <li
            key={c}
            className="flex items-center gap-2 border-2 border-[var(--borda)] rounded-xl px-4 py-3"
          >
            {editando === c ? (
              <>
                <label htmlFor={`renomear-${c}`} className="sr-only">Novo nome</label>
                <input
                  id={`renomear-${c}`}
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarNome(c);
                    if (e.key === 'Escape') setEditando(null);
                  }}
                  maxLength={24}
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent border-b-2 border-[var(--ferrugem)] text-[var(--tinta)] focus:outline-none"
                />
                <button
                  onClick={() => salvarNome(c)}
                  disabled={ocupado}
                  className="rotulo text-sm px-3 py-1.5 rounded-lg bg-[var(--ferrugem)] text-[var(--sobre-cor)] disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditando(null)}
                  className="rotulo text-sm px-3 py-1.5 rounded-lg text-[var(--tinta-media)]"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 min-w-0 truncate text-[var(--tinta)]">
                  {c}
                  {c === ativa && (
                    <span className="rotulo text-xs text-[var(--ferrugem)] ml-2">em uso</span>
                  )}
                </span>
                <button
                  onClick={() => { setEditando(c); setRascunho(c); }}
                  aria-label={`Renomear ${c}`}
                  className="p-2 rounded-lg text-[var(--tinta-media)] hover:bg-[var(--areia)] transition"
                >
                  <Pencil size={17} />
                </button>
                {c !== CARTEIRA_PADRAO && carteiras.length > 1 && (
                  <button
                    onClick={() => apagar(c)}
                    aria-label={`Apagar ${c}`}
                    disabled={ocupado}
                    className="p-2 rounded-lg text-[var(--tinta-media)] hover:text-[var(--carmim)] hover:bg-[var(--areia)] transition disabled:opacity-50"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-[var(--tinta-media)] mt-4">
        A <strong>{CARTEIRA_PADRAO}</strong> não pode ser apagada — é onde tudo cai por padrão.
        Apagar uma carteira devolve os lançamentos dela pra lá, sem perder nada.
      </p>
    </div>
  );
}

export function AbaAjustes({
  carteiras, carteiraAtiva, onCarteira, categorias, onAdicionar, onApagar,
}: {
  carteiras: string[];
  carteiraAtiva: string;
  onCarteira: (acao: string, nome: string, novoNome?: string) => Promise<boolean>;
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
    <>
    <GerenciarCarteiras carteiras={carteiras} ativa={carteiraAtiva} onCarteira={onCarteira} />
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
    </>
  );
}

// A mesma conversa do WhatsApp, dentro do painel. Não é um atalho bonitinho:
// é o que garante que as duas pontas façam exatamente as mesmas coisas, hoje e
// depois de qualquer funcionalidade nova.
//
// A primeira versão era só um campo com "Escreve do seu jeito" e um botão
// Enviar. Quem já sabia pra que servia demorou a entender — o campo não dizia
// o que fazia, nem que aquilo REGISTRAVA coisa. Agora tem título, uma linha
// explicando, e atalhos que preenchem o campo com um começo de frase: em vez
// de adivinhar o que pode escrever, a pessoa toca e completa.
const ATALHOS = [
  { rotulo: 'Gasto', modelo: 'paguei  no mercado', cursor: 7 },
  { rotulo: 'Entrada', modelo: 'recebi ', cursor: 7 },
  { rotulo: 'Guardar', modelo: 'guardei ', cursor: 8 },
  { rotulo: 'Dívida', modelo: 'devo  pro ', cursor: 5 },
  { rotulo: 'Parcelado', modelo: 'comprei  em 6x de ', cursor: 8 },
  { rotulo: 'Perguntar', modelo: 'quanto gastei esse mês?', cursor: 23 },
];

// O Guará responde com a marcação do WhatsApp (*negrito*, _itálico_). Mostrar
// os asteriscos crus no painel pareceria erro.
function formatarWhats(texto: string) {
  const pedacos = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return pedacos.map((pedaco, n) => {
    if (/^\*[^*\n]+\*$/.test(pedaco)) return <strong key={n}>{pedaco.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(pedaco)) return <em key={n}>{pedaco.slice(1, -1)}</em>;
    return <span key={n}>{pedaco}</span>;
  });
}

export function FalarComGuara({
  onEnviar, enviando, respostas, onLimpar, carteira, temVariasCarteiras,
}: {
  onEnviar: (texto: string) => void;
  enviando: boolean;
  respostas: string[];
  onLimpar: () => void;
  carteira: string;
  temVariasCarteiras: boolean;
}) {
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  function usarAtalho(modelo: string, cursor: number) {
    setTexto(modelo);
    // O cursor vai pro buraco onde falta o número, senão a pessoa precisa
    // caçar o lugar certo com o dedo.
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(cursor, cursor);
    });
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    onEnviar(limpo);
    setTexto('');
  }

  return (
    <div className="bg-[var(--creme)] border-2 border-[var(--borda)] rounded-2xl p-5 mb-6">
      <div className="flex items-start gap-2.5 mb-1.5">
        <MessageCircle size={22} className="text-[var(--ferrugem)] shrink-0 mt-0.5" />
        <h2 className="titulo text-xl text-[var(--tinta)]">Anotar ou perguntar</h2>
      </div>
      <p className="text-sm text-[var(--tinta-media)] mb-4 leading-relaxed">
        Escreva como você falaria no WhatsApp — é o mesmo Guará, e ele faz tudo por aqui
        também.
        {temVariasCarteiras && (
          <> O que você anotar vai pra carteira <strong>{carteira}</strong>.</>
        )}
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {ATALHOS.map((a) => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => usarAtalho(a.modelo, a.cursor)}
            className="rotulo text-xs px-3 py-2 rounded-full border-2 border-[var(--borda)] text-[var(--tinta-media)] hover:border-[var(--ferrugem)] hover:text-[var(--ferrugem)] transition"
          >
            + {a.rotulo}
          </button>
        ))}
      </div>

      <form onSubmit={enviar} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <label htmlFor="falar-guara" className="sr-only">
          Escreva pro Guará
        </label>
        <input
          id="falar-guara"
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'Ex: "paguei 30 no mercado"'}
          maxLength={1000}
          disabled={enviando}
          className="flex-1 min-w-0 bg-transparent border-2 border-[var(--borda)] rounded-xl px-4 py-3 text-[var(--tinta)] placeholder:text-[var(--tinta-media)] focus:border-[var(--ferrugem)] focus:outline-none transition disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="rotulo flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--ferrugem)] text-[var(--sobre-cor)] disabled:opacity-50 transition"
        >
          {enviando ? 'Pensando…' : <><Send size={16} /> Enviar</>}
        </button>
      </form>

      {respostas.length > 0 && (
        <div className="mt-4 space-y-2">
          {respostas.map((r, n) => (
            <div
              key={n}
              className="bg-[var(--areia)] border-2 border-[var(--borda)] rounded-xl px-4 py-3 text-[var(--tinta)] whitespace-pre-wrap break-words"
            >
              {formatarWhats(r)}
            </div>
          ))}
          <button
            onClick={onLimpar}
            className="rotulo text-xs text-[var(--tinta-media)] underline underline-offset-2"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
