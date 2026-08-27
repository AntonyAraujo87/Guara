'use client';

import { useEffect } from 'react';

// O Chrome oferece instalar sozinho, com um banner por cima do site, assim que
// a página cumpre os requisitos de PWA. Ninguém pediu por isso, e aparece
// justamente quando a pessoa está tentando ver as contas.
//
// Capturar o evento e chamar preventDefault silencia esse banner. A instalação
// continua possível — só deixa de ser empurrada: quem quiser encontra em
// /instalar, e lá o convite abre porque este componente guardou o evento.
//
// Sem guardar, o convite se perderia: o navegador dispara uma vez só.
declare global {
  interface Window {
    __conviteDeInstalacao?: Event;
  }
}

export default function SemInsistencia() {
  useEffect(() => {
    const guardar = (e: Event) => {
      e.preventDefault();
      window.__conviteDeInstalacao = e;
    };
    window.addEventListener('beforeinstallprompt', guardar);
    return () => window.removeEventListener('beforeinstallprompt', guardar);
  }, []);

  return null;
}
