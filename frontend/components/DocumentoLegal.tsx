import Link from 'next/link';

export type Secao = {
  titulo: string;
  /** Cada item vira um parágrafo. Listas entram como <ul> quando o item é array. */
  paragrafos: (string | string[])[];
};

/**
 * Casca compartilhada da política de privacidade e dos termos de uso.
 *
 * Existe para os dois documentos não divergirem visualmente com o tempo: quando
 * um ganha um ajuste de leitura, o outro ganha junto. E porque documento legal
 * que parece "outra parte do site" passa a impressão de ter sido colado de
 * qualquer lugar — que é exatamente o que não queremos aqui.
 */
export default function DocumentoLegal({
  titulo,
  atualizado,
  resumo,
  secoes,
  outroDocumento,
}: {
  titulo: string;
  atualizado: string;
  resumo: string;
  secoes: Secao[];
  outroDocumento: { href: string; rotulo: string };
}) {
  return (
    <main className="min-h-screen bg-[var(--areia)] px-4 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bloco px-7 py-8 mb-4" style={{ backgroundColor: 'var(--ferrugem)' }}>
          <h1 className="titulo text-4xl sm:text-5xl leading-none">{titulo}</h1>
          <p className="text-lg mt-4 opacity-95">{resumo}</p>
          <p className="rotulo text-xs mt-5 opacity-85">Atualizado em {atualizado}</p>
        </div>

        <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-7 sm:p-9">
          <div className="space-y-9">
            {secoes.map((secao) => (
              <section key={secao.titulo}>
                <h2 className="titulo text-xl text-[var(--tinta)] mb-3">{secao.titulo}</h2>
                <div className="space-y-3">
                  {secao.paragrafos.map((p, i) =>
                    Array.isArray(p) ? (
                      <ul key={i} className="space-y-2 pl-1">
                        {p.map((item) => (
                          <li
                            key={item}
                            className="text-lg text-[var(--tinta-media)] leading-relaxed pl-4 border-l-2 border-[var(--borda)]"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p key={i} className="text-lg text-[var(--tinta-media)] leading-relaxed">
                        {p}
                      </p>
                    )
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

        <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link
            href={outroDocumento.href}
            className="rotulo text-sm text-[var(--tinta-media)] underline underline-offset-4"
          >
            {outroDocumento.rotulo}
          </Link>
          <Link href="/" className="rotulo text-sm text-[var(--tinta-media)] underline underline-offset-4">
            Voltar para o Guará
          </Link>
        </nav>
      </div>
    </main>
  );
}
