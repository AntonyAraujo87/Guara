'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share, MoreVertical, Check, Smartphone, ChevronDown } from 'lucide-react';

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
  const [verPassos, setVerPassos] = useState(false);

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

    // O convite pode já ter sido capturado pelo SemInsistencia, que silencia o
    // banner do Chrome em todo o site. O navegador dispara o evento uma vez só,
    // então sem reaproveitá-lo o botão daqui nunca apareceria.
    if (window.__conviteDeInstalacao) {
      setConvite(window.__conviteDeInstalacao as EventoDeInstalacao);
    }

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
    setConvite(null);
  }

  const cartao = 'bg-[var(--creme)] border-2 border-[var(--borda)] rounded-2xl p-6';
  const botaoCheio =
    'rotulo w-full flex items-center justify-center gap-2 bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition';
  const botaoVazio =
    'rotulo w-full flex items-center justify-center gap-2 border-2 border-[var(--borda-forte)] text-[var(--tinta)] text-base py-4 rounded-xl hover:bg-[var(--creme)] transition';
  const passo = 'flex gap-3 items-start';
  const numero =
    'shrink-0 w-7 h-7 rounded-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] grid place-items-center rotulo text-sm mt-0.5';

  // Instruções manuais: só para quem pediu. Aparecem fechadas, porque abertas
  // de cara a página vira um manual que a pessoa sente que precisa seguir.
  const instrucoes =
    aparelho === 'ios' ? (
      <div className="flex flex-col gap-4 pt-4">
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
            Confirme em <strong>Adicionar</strong>.
          </p>
        </div>
        <p className="text-sm text-[var(--tinta-media)]">
          Precisa ser pelo <strong>Safari</strong>. Se abriu pelo WhatsApp, toque nos três pontinhos e
          escolha <em>Abrir no Safari</em>.
        </p>
      </div>
    ) : aparelho === 'computador' ? (
      <div className="flex flex-col gap-3 pt-4">
        <p className="text-base text-[var(--tinta)]">
          Procure o ícone de instalação na barra de endereço do Chrome ou Edge — fica à direita,
          parecido com uma tela pequena com uma seta.
        </p>
      </div>
    ) : (
      <div className="flex flex-col gap-4 pt-4">
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
        <p className="text-sm text-[var(--tinta-media)]">
          Se abriu pelo WhatsApp, toque nos três pontinhos e escolha <em>Abrir no Chrome</em> primeiro.
        </p>
      </div>
    );

  return (
    <main className="min-h-screen bg-[var(--areia)] px-4 py-10 flex justify-center">
      <div className="w-full max-w-md flex flex-col gap-6">
        <header className="text-center flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- ícone local, next/image não traz ganho aqui */}
          <img src="/icone-192.png" alt="" className="w-20 h-20 rounded-2xl" />
          <h1 className="titulo text-4xl text-[var(--ferrugem)] leading-none">Guará</h1>
        </header>

        {jaInstalado ? (
          <div className={`${cartao} text-center flex flex-col items-center gap-3`}>
            <div className="w-12 h-12 rounded-full bg-[var(--verde)] grid place-items-center">
              <Check size={26} className="text-[var(--sobre-cor)]" aria-hidden="true" />
            </div>
            <h2 className="titulo text-2xl text-[var(--tinta)]">Já está instalado</h2>
            <p className="text-base text-[var(--tinta-media)]">
              Você está usando o Guará como app.
            </p>
            <Link href="/" className={`${botaoCheio} mt-2`}>
              Abrir meu painel
            </Link>
          </div>
        ) : (
          <>
            {/* Abrir o painel vem PRIMEIRO e em destaque. Instalar é conveniência,
                não pedágio — quem chegou aqui pelo WhatsApp quer ver as contas,
                não passar por uma etapa antes disso. */}
            <div className={`${cartao} flex flex-col gap-4`}>
              <p className="text-lg text-[var(--tinta)] text-center">
                Seu painel está pronto pra usar, aqui mesmo no navegador.
              </p>
              <Link href="/" className={botaoCheio}>
                Abrir meu painel
              </Link>
            </div>

            <div className={`${cartao} flex flex-col gap-4`}>
              <div className="text-center flex flex-col gap-1">
                <h2 className="titulo text-2xl text-[var(--tinta)]">Se quiser, deixe na tela inicial</h2>
                <p className="text-base text-[var(--tinta-media)]">
                  Fica junto dos seus apps e abre com um toque. É opcional — o painel funciona igual
                  sem isso.
                </p>
              </div>

              {convite ? (
                <button type="button" onClick={instalar} className={botaoVazio}>
                  <Smartphone size={20} aria-hidden="true" />
                  Deixar na tela inicial
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVerPassos((v) => !v)}
                    aria-expanded={verPassos}
                    className={botaoVazio}
                  >
                    Ver como faz
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={`transition-transform ${verPassos ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {verPassos && instrucoes}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
