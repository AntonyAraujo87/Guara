// O chão comum da camada de dados: a conexão, a carteira da vez, e as duas
// funções de comparar texto do jeito que gente fala.
//
// Existe pra quebrar o db-service.js sem criar ciclo de require. As carteiras
// precisam da conexão e do `semAcento`; se elas pegassem isso do db-service, e
// o db-service reexportasse as carteiras, o Node entregaria um dos dois pela
// metade — e módulo meio carregado é o tipo de falha que só aparece em
// produção, num caminho que ninguém testou.
//
// Nada aqui importa outro módulo do projeto. É o que garante que a base
// continue sendo base.

const { createClient } = require('@supabase/supabase-js');
const { AsyncLocalStorage } = require('async_hooks');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// A carteira de quem nunca pediu uma segunda. O nome aparece pra pessoa, e
// está aqui em vez de espalhado porque trocá-lo é uma decisão de produto, não
// uma caçada por trinta arquivos.
const CARTEIRA_PADRAO = 'Pessoal';

// Qual carteira vale nesta mensagem. Fica em AsyncLocalStorage, e não numa
// variável de módulo, porque duas pessoas podem estar sendo atendidas ao mesmo
// tempo: uma variável solta faria o gasto de uma cair na carteira da outra —
// o pior bug possível num app de dinheiro.
//
// A alternativa era arrastar `carteira` por 34 chamadas e mais de vinte
// assinaturas no index.js. Isso funcionaria, mas bastaria esquecer UMA para
// gravar na carteira errada em silêncio.
const contextoDaMensagem = new AsyncLocalStorage();

function carteiraAtual() {
  return contextoDaMensagem.getStore()?.carteira || CARTEIRA_PADRAO;
}

// Roda `fn` inteira — awaits inclusive — enxergando esta carteira.
function comCarteira(carteira, fn) {
  return contextoDaMensagem.run({ carteira: carteira || CARTEIRA_PADRAO }, fn);
}

// Ate onde uma frase de acompanhamento alcanca.
//
// Quase ninguem diz tudo de uma vez: a pessoa manda "IPTU 200" e so depois
// lembra de dizer que esta parcelado, ou que foi na carteira da empresa. As
// 24h evitam que uma frase solta de hoje mexa num lancamento de semanas atras.
//
// Mora aqui porque tanto os lancamentos quanto as carteiras decidem por ela, e
// duas copias da mesma janela viram duas janelas diferentes na primeira vez que
// alguem mudar uma so.
const JANELA_CONVERSAO_MS = 24 * 60 * 60 * 1000;

function semAcento(t) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Compara do jeito que a pessoa fala: sem acento, sem maiúscula, por pedaço.
// "mercado" tem que achar "Mercado Extra", senão ela precisa lembrar do nome
// exato que digitou — e ninguém lembra.
function parecido(a, b) {
  const x = semAcento(String(a || '').toLowerCase().trim());
  const y = semAcento(String(b || '').toLowerCase().trim());
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

module.exports = {
  JANELA_CONVERSAO_MS,
  supabaseAdmin,
  CARTEIRA_PADRAO,
  contextoDaMensagem,
  carteiraAtual,
  comCarteira,
  semAcento,
  parecido,
};
