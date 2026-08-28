// Endereço que não existe.
//
// O 404 padrão do Next é uma linha preta em fundo branco, sem saída. Quem cai
// aqui geralmente errou um link ou guardou um endereço antigo — e o que essa
// pessoa precisa é de um caminho de volta, não de um número.

import Link from 'next/link';

export const metadata = {
  title: 'Página não encontrada — Guará',
};

export default function NaoEncontrada() {
  return (
    <main className="min-h-screen bg-[var(--areia)] flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-[var(--creme)] border-2 border-[var(--borda)] rounded-2xl p-7 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local, sem ganho em usar next/image */}
        <img src="/logo.png" alt="" className="w-14 h-14 rounded-xl mx-auto mb-5" />

        <h1 className="titulo text-2xl text-[var(--tinta)] mb-3">Essa página não existe</h1>

        <p className="text-base text-[var(--tinta-media)] leading-relaxed mb-6">
          Ou o endereço mudou, ou tem um caractere a mais no link. Nenhum dos dois é problema
          seu.
        </p>

        <Link
          href="/"
          className="rotulo block w-full px-5 py-3.5 rounded-xl bg-[var(--ferrugem)] text-[var(--sobre-cor)] hover:opacity-90 transition mb-3"
        >
          Ir pro meu painel
        </Link>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-[var(--tinta-media)] mt-5">
          <Link href="/instalar" className="underline underline-offset-2">Instalar no celular</Link>
          <Link href="/privacidade" className="underline underline-offset-2">Privacidade</Link>
          <Link href="/termos" className="underline underline-offset-2">Termos</Link>
        </div>
      </div>
    </main>
  );
}
