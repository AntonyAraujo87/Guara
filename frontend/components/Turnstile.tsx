'use client';

import { useEffect, useRef } from 'react';

const SITE_KEY = '0x4AAAAAAEdT7UbJ2ZA_3ymu';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

// Carrega o script uma única vez, mesmo que dois widgets peçam ao mesmo tempo.
function carregarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT_URL;
    tag.async = true;
    tag.defer = true;
    tag.onload = () => resolve();
    tag.onerror = () => {
      scriptPromise = null;
      reject(new Error('falha ao carregar o Turnstile'));
    };
    document.head.appendChild(tag);
  });
  return scriptPromise;
}

/**
 * Widget do Cloudflare Turnstile.
 *
 * O token é de uso único: depois de enviado ao Supabase ele queima, dê certo ou
 * errado. Por isso o pai incrementa `resetSignal` a cada tentativa, pra pedir um
 * token novo — sem isso, a segunda tentativa falha sempre.
 */
export default function Turnstile({
  onToken,
  onFalha,
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  onFalha?: (falhou: boolean) => void;
  resetSignal?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // As funções de retorno ficam em ref pra que o widget só seja montado uma vez:
  // se entrassem nas dependências do efeito abaixo, cada renderização do pai
  // recriaria o CAPTCHA e o usuário perderia o desafio no meio.
  const onTokenRef = useRef(onToken);
  const onFalhaRef = useRef(onFalha);

  // Atualizar a ref precisa acontecer depois da renderização, não durante:
  // escrever em .current no corpo do componente quebra o modo concorrente do
  // React, onde uma renderização pode ser descartada antes de virar tela.
  useEffect(() => {
    onTokenRef.current = onToken;
    onFalhaRef.current = onFalha;
  });

  useEffect(() => {
    let cancelado = false;

    carregarScript()
      .then(() => {
        if (cancelado || !container.current || !window.turnstile) return;
        if (widgetId.current) return;

        widgetId.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          theme: 'auto',
          language: 'pt-br',
          callback: (token: string) => {
            onFalhaRef.current?.(false);
            onTokenRef.current(token);
          },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            // Sem isso a pessoa ficaria olhando um botão morto, sem explicação.
            onFalhaRef.current?.(true);
            onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        onFalhaRef.current?.(true);
        onTokenRef.current(null);
      });

    return () => {
      cancelado = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      onTokenRef.current(null);
    }
  }, [resetSignal]);

  return <div ref={container} className="mb-4 flex justify-center" />;
}
