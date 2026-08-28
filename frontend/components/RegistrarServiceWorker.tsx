'use client';

// Liga o service worker, que é o que faz o app abrir sem internet.
//
// Componente separado, e não um script no layout, por dois motivos: o registro
// precisa rodar no navegador (o layout é servidor), e desligar isso um dia deve
// ser apagar uma linha, não caçar código no meio de outra coisa.
//
// O registro espera a página terminar de carregar. Instalar service worker
// disputa banda com o que a pessoa está esperando ver, e ninguém abre o painel
// querendo instalar um service worker.

import { useEffect } from 'react';

export default function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch((erro) => {
        // Falhar aqui não quebra nada: o app funciona igual, só não abre
        // offline. Não vale interromper ninguém por causa disso.
        console.warn('Service worker não registrou:', erro);
      });
    };

    if (document.readyState === 'complete') {
      registrar();
    } else {
      window.addEventListener('load', registrar, { once: true });
      return () => window.removeEventListener('load', registrar);
    }
  }, []);

  return null;
}
