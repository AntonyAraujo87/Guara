'use client';

// Separa o que a pessoa está DIGITANDO do que o painel está FILTRANDO.
//
// Antes eram a mesma coisa: cada tecla recalculava os lançamentos do mês,
// reagrupava por categoria, refazia a série do saldo e mandava os dois gráficos
// do recharts desenharem de novo. Num celular, digitar "mercado" são sete
// recálculos completos em menos de um segundo — é o que faz o campo de busca
// "engasgar" enquanto se digita.
//
// O campo continua respondendo na hora (`texto`); só o filtro espera a pessoa
// parar. Duzentos milissegundos é abaixo do que se percebe como demora e acima
// do intervalo entre teclas de quem digita rápido.

import { useEffect, useState } from 'react';

const ESPERA_MS = 200;

export function useBuscaAdiada() {
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    // Limpar é imediato: quem apaga a busca quer ver tudo agora, e esperar
    // 200ms pra lista voltar parece travamento.
    if (texto === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o filtro com o campo, que é o propósito do hook
      setFiltro('');
      return;
    }
    const t = setTimeout(() => setFiltro(texto), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  return { texto, setTexto, filtro };
}
