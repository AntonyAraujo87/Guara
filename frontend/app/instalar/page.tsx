'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share, MoreVertical, Check, Smartphone } from 'lucide-react';

// O evento que o Chrome dispara quando a página é instalável. Não está nos
// tipos do TypeScript porque só existe em navegadores baseados em Chromium.
type EventoDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Aparelho = 'android' | 'ios' | 'computador' | 'indefinido';

export default function Instalar() {
  const [aparelho, setAparelho] = useState<Aparelho>('indefinido');
  const [convite, setConvite] = useState<EventoDeInstalacao | null>(null);
  const [jaInstalado, setJaInstalado] = useState(false);

  // Tudo aqui depende de APIs que só existem no navegador (userAgent,
  // matchMedia, beforeinstallprompt). Não há como ler isso durante a
  // renderização no servidor, então o efeito é o lugar correto.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const ua = navigator.userAgent;
    // iPad moderno se apresenta como Mac; o toque é o que o denuncia.
    const ehIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setAparelho(ehIOS ? 'ios' : /Android/.test(ua) ? 'android' : 'computador');

    // Quando aberto pelo atalho, o app roda fora da aba do navegador.
    setJaInstalado(window.matchMedia('(display-mode: standalone)').matches);

    // O Chrome só dispara isto se a página cumprir os requisitos de instalação.
    // Guardar o evento é o que permite abrir o convite no clique do botão —
    // navegador não deixa abrir sem um gesto da pessoa.
    const guardar = (e: Event) => {
      e.preventDefault();
      setConvite(e as EventoDeInstalacao);
    };
    window.addEventListener('beforeinstallprompt', guardar);
    window.addEventListener('appinstalled', () => setJaInstalado(true));
    return () => window.removeEventListener('beforeinstallprompt', guardar);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function instalar() {
    if (!convite) return;
    await convite.prompt();
    const { outcome } = await convite.userChoice;
    if (outcome === 'accepted') setJaInstalado(true);
    // O convite só vale uma vez.
    setConvite(null);
  }

  const cartao = 'bg-[var(--creme)] border-2 border-[var(--borda)] rounded-2xl p-6';
  const passo = 'flex gap-3 items-start';
  const numero =
    'shrink-0 w-7 h-7 rounded-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] grid place-items-center rotulo text-sm mt-0.5';

  return (
    <main className="min-h-screen bg-[var(--areia)] px-4 py-10 flex justify-center">
      <div className="w-full max-w-md flex flex-col gap-6">
        <header className="text-center flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- ícone local, next/image não traz ganho aqui */}
          <img src="/icone-192.png" alt="" className="w-20 h-20 rounded-2xl" />
          <h1 className="titulo text-4xl text-[var(--ferrugem)] leading-none">Guará</h1>
          <p className="text-lg text-[var(--tinta-media)]">
            Deixe o painel na tela inicial, como qualquer app.
          </p>
        </header>

        {jaInstalado ? (
          <div className={`${cartao} text-center flex flex-col items-center gap-3`}>
            <div className="w-12 h-12 rounded-full bg-[var(--verde)] grid place-items-center">
              <Check size={26} className="text-[var(--sobre-cor)]" aria-hidden="true" />
            </div>
            <h2 className="titulo text-2xl text-[var(--tinta)]">Já está instalado</h2>
            <p className="text-base text-[var(--tinta-media)]">
              Você está usando o Guará como app. Ele fica na sua tela inicial.
            </p>
            <Link
              href="/"
              className="rotulo mt-2 w-full text-center bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl"
            >
              Abrir meu painel
            </Link>
          </div>
        ) : (
          <>
            {/* Android com o convite pronto: um toque resolve. */}
            {convite && (
              <div className={`${cartao} flex flex-col gap-4`}>
                <p className="text-base text-[var(--tinta-media)]">
                  Seu celular já reconheceu o Guará como app. É só tocar:
                </p>
                <button
                  type="button"
                  onClick={instalar}
                  className="rotulo w-full flex items-center justify-center gap-2 bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition"
                >
                  <Smartphone size={20} aria-hidden="true" />
                  Instalar o Guará
                </button>
              </div>
            )}

            {/* iPhone não tem instalação automática: o caminho é manual, e é o
                motivo desta página existir — quase ninguém conhece esse menu. */}
            {aparelho === 'ios' && (
              <div className={`${cartao} flex flex-col gap-4`}>
                <h2 className="titulo text-2xl text-[var(--tinta)]">No iPhone</h2>
                <div className={passo}>
                  <span className={numero}>1</span>
                  <p className="text-base text-[var(--tinta)]">
                    Toque em{' '}
                    <Share size={17} className="inline align-text-bottom text-[var(--ferrugem)]" aria-hidden="true" />{' '}
                    <strong>Compartilhar</strong>, na barra de baixo do Safari.
                  </p>
                </div>
                <div className={passo}>
                  <span className={numero}>2</span>
                  <p className="text-base text-[var(--tinta)]">
                    Role a lista e escolha <strong>Adicionar à Tela de Início</strong>.
                  </p>
                </div>
                <div className={passo}>
                  <span className={numero}>3</span>
                  <p className="text-base text-[var(--tinta)]">
                    Confirme em <strong>Adicionar</strong>. Pronto — o ícone aparece junto dos seus apps.
                  </p>
                </div>
                <p className="text-sm text-[var(--tinta-media)] border-t-2 border-[var(--borda)] pt-3">
                  Precisa ser pelo <strong>Safari</strong>. Se você abriu direto do WhatsApp, toque nos três
                  pontinhos e escolha <em>Abrir no Safari</em>.
                </p>
              </div>
            )}

            {/* Android sem o convite: já instalado noutro momento, ou o navegador
                ainda não liberou. O caminho manual sempre funciona. */}
            {aparelho === 'android' && !convite && (
              <div className={`${cartao} flex flex-col gap-4`}>
                <h2 className="titulo text-2xl text-[var(--tinta)]">No Android</h2>
                <div className={passo}>
                  <span className={numero}>1</span>
                  <p className="text-base text-[var(--tinta)]">
                    Toque em{' '}
                    <MoreVertical size={17} className="inline align-text-bottom text-[var(--ferrugem)]" aria-hidden="true" />{' '}
                    <strong>três pontinhos</strong>, no canto do Chrome.
                  </p>
                </div>
                <div className={passo}>
                  <span className={numero}>2</span>
                  <p className="text-base text-[var(--tinta)]">
                    Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
                  </p>
                </div>
                <p className="text-sm text-[var(--tinta-media)] border-t-2 border-[var(--borda)] pt-3">
                  Se abriu direto do WhatsApp, toque nos três pontinhos e escolha{' '}
                  <em>Abrir no Chrome</em> primeiro.
                </p>
              </div>
            )}

            {aparelho === 'computador' && (
              <div className={`${cartao} flex flex-col gap-4`}>
                <h2 className="titulo text-2xl text-[var(--tinta)]">No computador</h2>
                <p className="text-base text-[var(--tinta)]">
                  Procure o ícone de instalação na barra de endereço do Chrome ou Edge — fica à direita,
                  parecido com uma tela pequena com uma seta.
                </p>
                <p className="text-sm text-[var(--tinta-media)] border-t-2 border-[var(--borda)] pt-3">
                  O Guará foi feito pensando no celular, mas funciona igual aqui.
                </p>
              </div>
            )}
          </>
        )}

        <div className={`${cartao} flex flex-col gap-3`}>
          <h2 className="titulo text-xl text-[var(--tinta)]">Por que instalar</h2>
          <ul className="flex flex-col gap-2 text-base text-[var(--tinta-media)]">
            <li>📱 Abre direto da tela inicial, sem digitar endereço</li>
            <li>🖥️ Ocupa a tela toda, sem a barra do navegador</li>
            <li>🔒 Continua sendo o mesmo painel — nada novo pra baixar ou permitir</li>
          </ul>
        </div>

        <Link
          href="/"
          className="text-center text-base text-[var(--tinta-media)] underline underline-offset-4"
        >
          Só quero abrir no navegador
        </Link>
      </div>
    </main>
  );
}
