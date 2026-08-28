// Os modais de edição: corrigir um lançamento, um recorrente, um cofrinho, ou
// renomear um pote.
//
// Juntos porque têm a mesma anatomia — abrem sobre a tela, editam UMA coisa,
// fecham. Em quatro arquivos separados seriam quatro arquivos de cinquenta
// linhas repetindo a mesma estrutura.

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Transaction, Recorrente, Saving } from '@/lib/tipos';
import { campoClasse, rotuloClasse, botaoClasse } from '@/lib/painel';
import { CaixaModal } from '@/components/PecasDoPainel';

export function ModalEditar({
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

export function ModalRecorrente({
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

export function ModalCofrinho({
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

export function ModalRenomearPote({
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
