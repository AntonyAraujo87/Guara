'use client';

// A tela que aparece quando algo quebra dentro do painel.
//
// Sem este arquivo, o Next mostra uma página em branco: o React desmonta a
// árvore inteira e não sobra nada. Para quem está olhando, o app simplesmente
// sumiu — e a reação natural é fechar e não voltar.
//
// O botão de tentar de novo não é enfeite: a maioria das quebras aqui vem de
// uma consulta que falhou por conexão instável, e refazer resolve. Quando não
// resolve, o link do WhatsApp continua valendo — o Guará funciona inteiro por
// lá, e dizer isso é mais útil do que pedir desculpa.

import { useEffect } from 'react';
import { RefreshCw, MessageCircle } from 'lucide-react';

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Registra no console do navegador, que é onde se investiga um erro de
    // cliente. Não mandamos pra lugar nenhum: seria começar a coletar dado de
    // uso sem ter dito isso na política de privacidade.
    console.error('Erro no painel do Guará:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[var(--areia)] flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-[var(--creme)] border-2 border-[var(--borda)] rounded-2xl p-7 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local, sem ganho em usar next/image */}
        <img src="/logo.png" alt="" className="w-14 h-14 rounded-xl mx-auto mb-5" />

        <h1 className="titulo text-2xl text-[var(--tinta)] mb-3">Algo quebrou por aqui</h1>

        <p className="text-base text-[var(--tinta-media)] leading-relaxed mb-6">
          Não foi culpa sua, e nenhum dos seus dados se perdeu. Quase sempre é a conexão
          tropeçando no meio de uma consulta.
        </p>

        <button
          onClick={reset}
          className="rotulo w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[var(--ferrugem)] text-[var(--sobre-cor)] hover:opacity-90 transition mb-3"
        >
          <RefreshCw size={17} /> Tentar de novo
        </button>

        <a
          href="https://wa.me/555180562381"
          className="rotulo w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border-2 border-[var(--borda-forte)] text-[var(--tinta-media)] hover:bg-[var(--areia)] transition"
        >
          <MessageCircle size={17} /> Usar pelo WhatsApp
        </a>

        <p className="text-sm text-[var(--tinta-media)] mt-5">
          O Guará funciona inteiro pelo WhatsApp — anotar, consultar e corrigir, tudo por lá.
        </p>

        {/* O digest é o identificador que o Next gera pro erro. Serve pra ligar
            o que a pessoa viu ao que ficou no log do servidor. */}
        {error.digest && (
          <p className="text-xs text-[var(--tinta-media)] mt-4 font-mono opacity-70">
            código: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
