'use client';

// Carteiras: separam o dinheiro de casa do dinheiro do trabalho.
//
// Fica num hook porque a carteira ativa não é estado de tela — é estado do
// SISTEMA. O WhatsApp lê a mesma coluna (`users.active_wallet`), e já houve um
// bug em que o painel trocava só localmente: a tela mostrava Empresa e o
// WhatsApp continuava lançando na Pessoal. Duas verdades sobre "onde eu estou"
// é uma a mais.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CARTEIRA_PADRAO, authedFetch } from '@/lib/painel';

export function useCarteiras(phone: string | null, aoFalhar: (msg: string) => void) {
  const [carteiras, setCarteiras] = useState<string[]>([CARTEIRA_PADRAO]);
  const [carteira, setCarteira] = useState<string>(CARTEIRA_PADRAO);

  // De qual telefone a lista carregada é. Guardar isto, em vez de um booleano
  // "já carregou", faz a trava se desarmar sozinha quando a conta muda — sem
  // precisar de um setState no corpo do efeito só pra zerar no logout.
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null);

  // Enquanto isto for falso ninguém sabe QUAL carteira está valendo, e buscar
  // dados seria buscar os da carteira errada. Antes não existia: o painel
  // carregava tudo da Pessoal, descobria que a ativa era outra, e recarregava
  // tudo de novo — sete consultas jogadas fora em toda abertura.
  const carteirasProntas = phone !== null && carregadoPara === phone;

  const buscarCarteiras = useCallback(async () => {
    if (!phone) return;
    const { data } = await supabase.from('users').select('active_wallet, wallets').maybeSingle();
    const lista = Array.isArray(data?.wallets) && data.wallets.length ? data.wallets : [CARTEIRA_PADRAO];
    setCarteiras(lista);
    // Abre na mesma carteira em que a conversa do WhatsApp parou. Abrir noutra
    // faria a tela discordar do chat logo de cara.
    setCarteira(data?.active_wallet && lista.includes(data.active_wallet) ? data.active_wallet : lista[0]);
    setCarregadoPara(phone);
  }, [phone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-dependency-change, the sanctioned data-fetching pattern
    buscarCarteiras();
  }, [buscarCarteiras]);

  // Trocar de carteira no painel muda a carteira DE VERDADE, no banco — a mesma
  // que o WhatsApp usa.
  //
  // A tela muda ANTES da resposta do servidor, porque esperar meio segundo por
  // um clique de aba é ruim. Mas se o servidor recusar, a tela VOLTA: deixá-la
  // no novo nome recriaria exatamente o bug que este hook existe pra impedir —
  // painel dizendo Empresa, WhatsApp lançando na Pessoal.
  const trocarDeCarteira = useCallback(
    async (nome: string) => {
      const anterior = carteira;
      setCarteira(nome);
      const { ok, json } = await authedFetch('/api/carteiras', { acao: 'trocar', nome });
      if (!ok) {
        setCarteira(anterior);
        aoFalhar(json.error || 'Não consegui trocar de carteira.');
        return;
      }
      setCarteiras(json.carteiras);
    },
    [carteira, aoFalhar]
  );

  // Criar, renomear e apagar chamam o backend, que chama as MESMAS funções do
  // WhatsApp. As regras (limite, nome repetido, não apagar a padrão) ficam num
  // lugar só em vez de serem reescritas aqui.
  const mexerNaCarteira = useCallback(
    async (acao: string, nome: string, novoNome?: string) => {
      const { ok, json } = await authedFetch('/api/carteiras', { acao, nome, novoNome });
      if (!ok) {
        aoFalhar(json.error || 'Não consegui fazer isso.');
        return false;
      }
      setCarteiras(json.carteiras);
      // Renomear a carteira em que se está muda o nome dela por baixo; sem isto
      // o painel ficaria apontando pra um nome que não existe mais.
      //
      // Criar NÃO troca: quem cria está arrumando a casa, não mudando de
      // assunto, e ser jogado pra outra carteira sem pedir faz o próximo
      // lançamento cair no lugar errado.
      setCarteira((atual) => (json.carteiras.includes(atual) ? atual : json.ativa));
      return true;
    },
    [aoFalhar]
  );

  return {
    carteiras,
    carteira,
    carteirasProntas,
    buscarCarteiras,
    trocarDeCarteira,
    mexerNaCarteira,
  };
}
