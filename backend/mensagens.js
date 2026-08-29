// Tudo que o Guará diz quando não está respondendo sobre dinheiro: boas-vindas,
// ajuda, convites, avisos de erro.
//
// Ficam juntas de propósito. O tom do Guará é uma decisão de produto, e revisar
// o tom espalhado por duas mil linhas de código é como revisar um texto com as
// frases embaralhadas.

const PAINEL_URL = 'https://guarapp.duckdns.org';

// Canal oficial de contato, o mesmo publicado na política e nos termos.
// Fica em constante porque estava escrito no meio de duas mensagens: numa
// troca de endereço, uma delas ficaria pra trás sem ninguém notar.
const EMAIL_CONTATO = 'guarafinancas@gmail.com';

// Mensagem 1: curta de propósito. O objetivo dela não é ensinar tudo — é fazer a
// pessoa RESPONDER. Quem responde já entrou; o resto ela descobre usando.
const MSG_APRESENTACAO = `Oii! 👋 Eu sou o *Guará* 🐺

Anoto seus gastos por aqui mesmo, no WhatsApp. Sem planilha, sem app pra baixar, sem complicação. 💙

*Experimenta agora:* me conta um gasto recente, do seu jeito.
Tipo: _"paguei 30 no mercado"_

Pode escrever torto, sem acento, com abreviação — eu entendo. 😉

_Preferir falar? Manda áudio. Tem o comprovante? Manda a foto._`;

// Mensagem 2: a conta é OPCIONAL e isso precisa ficar claro. Ela não é um pedágio
// pra usar o Guará — é o que destrava os gráficos. As regras de senha e formato de
// telefone ficam de fora: a própria tela já mostra cada uma na hora certa.
const MSG_CRIAR_CONTA = `*Ah, e fica tranquilo:* você *não precisa* criar conta pra me usar. 😊

Pode conversar comigo pra sempre assim, do jeito que está. Eu anoto tudo, respondo suas perguntas e nunca vou te cobrar cadastro.

*📊 O QUE A CONTA ADICIONA*

Se um dia quiser, ela destrava no site:
📈 Gráficos de pra onde seu dinheiro vai
📅 Navegar mês a mês, e ver o que já está parcelado
✏️ Editar e apagar lançamentos com o dedo
📗 Baixar tudo em planilha

*Se quiser criar (2 minutos, de graça):*
👉 ${PAINEL_URL}

1️⃣ Toque em *Criar conta*
2️⃣ Confirme o e-mail que eu mando _(olhe o spam 📬)_
3️⃣ Digite seu número e o código que eu te envio ✅

Sem pressa nenhuma. Pode ir me mandando seus gastos enquanto isso. 🐺

*📱 E se quiser o Guará na tela inicial:*
👉 ${PAINEL_URL}/instalar
_Dois toques, sem loja e sem ocupar espaço._

_Seus dados são só seus. O que eu guardo e por quê:_ ${PAINEL_URL}/privacidade`;

// Para quem já tem conta ligada e mandou algo que não era financeiro.
const MSG_NAO_ENTENDI = `Oi! 🐺 Não achei nenhum valor nessa mensagem.

Me conta assim que eu anoto na hora:
💸 "paguei 30 no xis"
💰 "recebi 500 do freela"
🤝 "devo 50 pro João"

Ou me pergunte: _"quanto gastei esse mês?"_
Digite *ajuda* pra ver tudo que eu faço. 😉`;

// Quem escreve "quero instalar o app" já decidiu. Abrir com "não precisa
// baixar nada" é discutir com o pedido da pessoa — ela perguntou COMO, não SE.
//
// O "não precisa de loja" continua aqui, mas como alívio depois da instrução,
// não como resposta no lugar dela.
const MSG_INSTALAR = `📱 *Bora deixar o Guará na sua tela inicial!*

Abre aqui que eu te mostro o passo a passo:
👉 ${PAINEL_URL}/instalar

A página reconhece se você está no Android ou no iPhone e mostra só os passos do seu — são dois toques.

Depois ele abre igual qualquer outro app, sem digitar endereço. 😉

_Não passa por loja nenhuma, não ocupa espaço, e você pode tirar quando quiser._`;

// A planilha sai do painel, não daqui: o arquivo é montado no navegador com os
// dados que já estão na tela. Mandar por WhatsApp exigiria gerar o arquivo no
// servidor e subir como mídia — e a pessoa ia receber um anexo que o WhatsApp
// abre mal. O link resolve, e ainda deixa ela escolher o mês.
// Quando a IA está fora e a frase é complicada demais pro leitor simples.
// Dizer O QUE dá pra fazer agora vale mais do que pedir desculpa: a pessoa
// consegue registrar do jeito curto e não perde o gasto.
const MSG_IA_FORA = `Tive um problema pra entender essa frase. 😕

*Enquanto isso, do jeito curto eu anoto:*
_"paguei 30 no mercado"_
_"recebi 500"_
_"guardei 200"_

Frases mais compridas eu volto a entender já já.`;

const MSG_SEM_COTA = `Bati o limite de mensagens do dia pra entender frase complicada. 😅

*Mas do jeito curto eu continuo anotando:*
_"paguei 30 no mercado"_
_"recebi 500"_
_"guardei 200"_

Amanhã cedo volto ao normal — e nada do que você já mandou se perdeu.`;

const MSG_CONVERSA = `Tô por aqui! 🐺

Manda o gasto quando quiser, do seu jeito — escrito, por áudio, ou foto do comprovante.

Digite *ajuda* pra ver tudo que eu faço.`;

const MSG_PLANILHA = `📗 *Sua planilha está no painel*

Abre aqui e toca em *Baixar planilha*:
👉 ${PAINEL_URL}

Vem tudo: gastos, entradas, dívidas, parcelas e cofrinhos — do mês que você escolher.

_Precisa da conta criada pra abrir o painel._`;

const MSG_APAGAR_CONFIRMA = `⚠️ *Isso apaga tudo, e não tem volta.*

Vou remover todos os seus lançamentos, dívidas, parcelas, cofrinhos, metas e categorias. O vínculo com o painel também sai.

Se tiver certeza, responda exatamente:
*APAGAR TUDO*

Qualquer outra coisa cancela.

_Quer levar seus dados antes? Baixe a planilha no painel:_ ${PAINEL_URL}`;

const MSG_APAGAR_CANCELADO = `Tudo certo, não apaguei nada. 😌

Seus dados continuam onde estavam.`;

const MSG_AJUDA = `*🐺 O QUE EU SEI FAZER*

*💸 Anotar seus gastos*
"paguei 30 no xis"
"gastei 55 no mercado"
"uber 22 reais"

*💰 Anotar o que entrou*
"recebi 500 do freela"
"caiu meu salário de 2000"

*🤝 Anotar combinados*
"o João me deve 50"
"devo 120 pra Maria"

*🔁 Gastos que se repetem*
"todo mês pago 50 de Netflix"
"todo dia 10 pago 1200 de aluguel"
"muda o salário pro dia 5"

*💳 Anotar parcelamentos*
"comprei uma TV em 6x de 200"
"parcelei o celular em 10x de 150"
"paguei a parcela da TV"

*🐷 Guardar dinheiro*
"guardei 200"
"guardei 100 no cofrinho da viagem"
"tirei 100 do guardado"

*🎯 Definir metas*
"quero guardar 300 por mês"
"quero juntar 5000 pra viagem"

*📊 Responder suas perguntas*
"quanto gastei esse mês?"
"qual meu saldo?"
"quanto gastei com comida?"
"quanto entrou essa semana?"
"quanto eu devo?"
"quanto tenho guardado?"
"quais minhas parcelas?"
"meus últimos gastos"

*🔄 Reclassificar o que já mandou*
"está parcelado" _(eu pergunto em quantas vezes)_
"isso é todo mês"

*↩️ Corrigir e apagar*
"apaga o último"
"aquele mercado era 45"
"apaga o gasto do mercado"
"cancela a Netflix"
"cancela o parcelamento da TV"
"não paguei aquela parcela"

*🤝 Quando a dívida é paga*
"o João me pagou"
"quitei a dívida da Maria"

*🏷️ Suas categorias*
"cria a categoria Pets"
"apaga a categoria Viagem"

*🐷 Organizar os cofrinhos*
"renomeia o secador pra casa nova"

*🎧 Mandar áudio ou foto*
Grava um áudio contando o gasto
Manda foto do comprovante, nota ou print do PIX

*👛 Separar trabalho de pessoal*
"cria uma carteira da empresa"
"muda pra empresa"
"gastei 200 na empresa"
"esse foi da empresa" _(move o último)_
"quais minhas carteiras"

*📗 Levar seus dados*
"me manda a planilha"

*📱 Ter o app no celular*
"tem app?"
"quero instalar no celular"

*🗑️ Apagar tudo que tenho de você*
"quero apagar meus dados"

Pode falar do seu jeito, sem acento e com abreviação — eu entendo. 😉

Seu painel: ${PAINEL_URL}
Privacidade: ${PAINEL_URL}/privacidade`;

// Reação e evento de sistema não são a pessoa falando comigo — responder a um
// "joinha" com "não entendi" seria mais irritante do que ficar quieto.
//
// `request_welcome` chega quando alguém ABRE a conversa pela primeira vez, antes
// de escrever qualquer coisa. Responder "só consigo entender mensagem escrita"
// a isso era a primeira frase que a pessoa lia do Guará — uma reclamação sobre
// uma mensagem que ela nem mandou. O "oi" dela vem logo depois, e a
// apresentação de verdade sai daí.
const TIPOS_IGNORADOS = new Set(['reaction', 'system', 'order', 'request_welcome']);

function msgTipoNaoSuportado(tipo) {
  // audio e image não chegam aqui: são tratados em tratarMidia.
  const abertura = {
    video: 'Ainda não consigo ver vídeo. 🎬',
    document: 'Ainda não consigo abrir arquivo. 📄',
    sticker: 'Figurinha eu até curto, mas não sei anotar. 😄',
    location: 'Localização eu não sei anotar. 📍',
    contacts: 'Contato eu não sei anotar. 👤',
  }[tipo] || 'Só consigo entender mensagem escrita. 📝';

  return `${abertura}

Me manda escrito, por áudio, ou uma foto do comprovante:
💸 _"paguei 30 no mercado"_
🎧 um áudio contando o gasto
📸 foto da nota ou do print do PIX

Digite *ajuda* pra ver tudo que eu faço. 😉`;
}

// Como cada tipo de item se chama quando aparece numa frase.
//
// Fica aqui, e não no index.js, porque quem monta as frases é o respostas.js —
// que não enxerga o index.js. O nome estava lá, e apagar um item pelo chat
// ("apaga o mercado de ontem") estourava ReferenceError.
const NOME_DO_TIPO = {
  lancamento: 'lançamento',
  divida: 'dívida',
  recorrente: 'conta mensal',
  parcelamento: 'parcelamento',
  guardado: 'guardado',
};

// Vai pra quem já pegou o hábito no WhatsApp e ainda não abriu o painel.
//
// Um lembrete só, no quinto lançamento — quem chegou por "oi" já recebeu o
// passo a passo completo na apresentação, e repetir vira insistência. A última
// linha existe pra ninguém achar que precisa migrar pra algum lugar.
const MSG_LEMBRETE_PAINEL = [
  'Você já anotou 5 coisas por aqui. 👏',
  '',
  'Se quiser ver tudo em gráficos, com o mês inteiro na tela:',
  PAINEL_URL,
  '',
  'Continua tudo funcionando pelo WhatsApp do mesmo jeito.',
].join('\n');

module.exports = {
  NOME_DO_TIPO,
  MSG_LEMBRETE_PAINEL,
  PAINEL_URL,
  EMAIL_CONTATO,
  MSG_APRESENTACAO,
  MSG_CRIAR_CONTA,
  MSG_NAO_ENTENDI,
  MSG_INSTALAR,
  MSG_IA_FORA,
  MSG_SEM_COTA,
  MSG_CONVERSA,
  MSG_PLANILHA,
  MSG_APAGAR_CONFIRMA,
  MSG_APAGAR_CANCELADO,
  MSG_AJUDA,
  TIPOS_IGNORADOS,
  msgTipoNaoSuportado,
};
