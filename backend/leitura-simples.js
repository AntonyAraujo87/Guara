// Lê o gasto sem IA nenhuma.
//
// Existe porque a IA pode sumir: a cota gratuita do Gemini é diária, e quando
// ela acaba — ou quando a Google tem um pico — o Guará ficava mudo pra tudo.
// Aconteceu de verdade, e o custo é alto: a pessoa manda "paguei 30 no
// mercado", não recebe nada, e conclui que o app não funciona.
//
// Isto NÃO substitui a IA. Cobre só o caso mais comum e mais óbvio — um valor
// e uma descrição curta — e desiste de qualquer coisa ambígua. Preferir não
// entender a entender errado: um gasto perdido a pessoa remanda; um gasto
// inventado ela não descobre.

// ── VALOR ──────────────────────────────────────────────────────────
// Aceita 30 | 30,50 | 30.50 | R$30 | 1.200,50 | 1200.50 | 1,5k | 2 mil
function semAcento(t) {
  return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const ESCALAS = { k: 1e3, mil: 1e3, mi: 1e6, 'milhão': 1e6, 'milhoes': 1e6, 'milhões': 1e6 };

function acharValor(texto) {
  // Números com escala primeiro: "1,5k" e "2 mil" perderiam o multiplicador
  // se o padrão simples pegasse antes.
  const comEscala = texto.match(/(\d+(?:[.,]\d+)?)\s*(k|mil|mi|milh(?:ão|ao|ões|oes))\b/i);
  if (comEscala) {
    const base = Number(comEscala[1].replace(',', '.'));
    const chave = comEscala[2].toLowerCase();
    const fator = ESCALAS[chave] ?? (chave.startsWith('milh') ? 1e6 : 1e3);
    return Number.isFinite(base) ? base * fator : null;
  }

  const todos = [...texto.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)];
  if (todos.length !== 1) return null; // dois números = frase composta, deixa pra IA

  const bruto = todos[0][0];
  // 1.200,50 -> 1200.50   |   1.200 -> 1200   |   30,50 -> 30.50
  const normalizado = bruto.includes(',')
    ? bruto.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(bruto)
      ? bruto.replace(/\./g, '')
      : bruto;

  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 && n < 1e9 ? n : null;
}

// ── DIREÇÃO ────────────────────────────────────────────────────────
const RECEITA = /\b(recebi|caiu|entrou|ganhei|pingou|creditou|faturei|embolsei|me pagaram|me pagou|salário|salario|pagamento|freela|bico|vendi|reembols\w*|estorn\w*|cashback)\b/i;
const DESPESA = /\b(paguei|gastei|comprei|torrei|saiu|custou|desembolsei|abasteci|almocei|jantei|lanchei|perdi|queimei|投)\b/i;
const GUARDAR = /\b(guardei|separei|poupei|juntei|reservei|economizei)\b/i;
const RETIRAR = /\b(saquei|resgatei|retirei|tirei)\b.*\b(guardad\w+|poupança|poupanca|reserva|cofre|cofrinho)\b/i;

// ── CATEGORIA ──────────────────────────────────────────────────────
// Só o que é inequívoco. Na dúvida, "Outros": categoria errada é pior que
// categoria genérica, porque some do gráfico onde a pessoa foi procurar.
const CATEGORIAS = [
  [/\b(mercado|merc[aã]o|supermercado|feira|sacol[ãa]o|quitanda|padaria|padoca|açougue|acougue|hortifruti)\b/i, 'Alimentação'],
  [/\b(lanche|rango|almo[çc]o|janta|jantar|comida|pizza|hamburguer|hambúrguer|ifood|restaurante|bar|boteco|cerveja|breja|caf[ée])\b/i, 'Alimentação'],
  [/\b(uber|99|taxi|táxi|busão|busao|ônibus|onibus|metr[ôo]|passagem|gasolina|gasosa|combust[íi]vel|[áa]lcool|etanol|estacionamento|ped[áa]gio)\b/i, 'Transporte'],
  [/\b(aluguel|condom[íi]nio|luz|[áa]gua|g[áa]s|internet|net|wifi|iptu|faxina)\b/i, 'Moradia'],
  [/\b(farm[áa]cia|rem[ée]dio|m[ée]dico|consulta|dentista|exame|plano de sa[úu]de|academia)\b/i, 'Saúde'],
  [/\b(cinema|netflix|spotify|show|balada|rol[êe]|festa|jogo|viagem|hotel)\b/i, 'Lazer'],
  [/\b(roupa|t[êe]nis|sapato|camisa|shopping|celular|notebook|presente)\b/i, 'Compras'],
];

function acharCategoria(texto) {
  for (const [padrao, nome] of CATEGORIAS) if (padrao.test(texto)) return nome;
  return 'Outros';
}

// ── DESCRIÇÃO ──────────────────────────────────────────────────────
const RUIDO = /\b(paguei|gastei|comprei|recebi|caiu|entrou|ganhei|guardei|separei|torrei|saiu|custou|foi|deu|de|do|da|no|na|em|com|por|pra|para|um|uma|o|a|os|as|reais|real|pila|conto|contos|mango|mangos|hoje|agora|r\$)\b/gi;

function acharDescricao(texto, valor) {
  const limpo = texto
    .replace(/r\$\s*/gi, ' ')
    .replace(String(valor).replace('.', ','), ' ')
    .replace(/\d[\d.,]*/g, ' ')
    .replace(RUIDO, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo ? limpo.slice(0, 40) : '';
}

// O que este leitor NÃO sabe fazer, e por isso precisa reconhecer pra desistir.
// Sem estas guardas ele transforma dívida em despesa e conta mensal em gasto
// avulso — dois erros que a pessoa só descobre com o saldo já errado.
const NAO_E_PRA_MIM = [
  /\b(todo|toda)\s+(m[êe]s|dia|semana|ano)\b/i,                    // recorrente
  /\bmensal\w*|\bsemanal\w*|\bsempre\s+(no|na|dia)\b|\bpor m[êe]s\b/i,
  /\b\d+\s*x\b|\bem\s+\d+\s+vezes\b|\bparcel\w+/i,                 // parcelamento
  /\bdevo\b|\bdeve\b|\bdevendo\b|\bemprest\w+|\bfiado\b/i,          // dívida
  /\bmeta\b|\bquero\s+(guardar|juntar)\b/i,                        // meta
  /\bapag\w+|\bdesfaz\w+|\bcancel\w+|\bmuda\b|\bmudar\b|\baltera\w*|\bcorrig\w+/i,
  /\bcarteira\b|\bconta da empresa\b|\bcria\w*\b/i,                 // carteira
];

// Frase longa ou com pontuação de lista quase sempre traz mais de uma coisa,
// e aí só a IA dá conta. Aqui a régua é curta de propósito.
const LIMITE_PALAVRAS = 10;

// A carteira citada, quando a pessoa tem mais de uma. É o único pedaço em que
// este leitor precisa saber algo de fora — e é barato: os nomes vêm prontos, e
// achar um deles no texto é comparação de string, não adivinhação.
//
// Sem isto, "gastei 12 na abacate" durante uma queda da IA caía na carteira
// errada em silêncio, que é exatamente o erro que não pode acontecer.
function acharCarteiraCitada(texto, carteiras) {
  if (!carteiras || carteiras.length < 2) return '';

  // Comparação por palavras soltas, não por regex: o nome da carteira vem da
  // pessoa e pode ter parênteses, ponto ou acento — montar um padrão com isso
  // dentro exigiria escapar tudo certinho, e um escape errado quebra o arquivo
  // inteiro em vez de só errar a busca.
  const palavras = new Set(
    semAcento(texto.toLowerCase()).split(/[^a-z0-9]+/i).filter(Boolean)
  );

  const achada = carteiras.find((c) => {
    const nome = semAcento(String(c).toLowerCase()).trim();
    // Nome de duas letras ou menos acha demais ("PJ" dentro de qualquer coisa).
    return nome.length >= 3 && palavras.has(nome);
  });
  return achada || '';
}

/**
 * Devolve UM item, ou null quando não dá pra ter certeza.
 * Nunca chuta: null significa "não sei", e quem chama trata isso.
 *
 * `carteiras` é opcional: só serve pra reconhecer o nome de uma delas no texto.
 */
function lerSemIA(textoBruto, carteiras = []) {
  const texto = String(textoBruto || '').trim();
  if (!texto) return null;
  if (texto.split(/\s+/).length > LIMITE_PALAVRAS) return null;
  if (/[;\n]| e | mais /i.test(texto)) return null; // provável lista

  // Pergunta não é registro, e é fácil de reconhecer sem IA.
  if (/\?|^\s*(quanto|qual|quais|como|onde|quando|tenho|sobrou)\b/i.test(texto)) return null;

  if (NAO_E_PRA_MIM.some((padrao) => padrao.test(texto))) return null;

  const valor = acharValor(texto);
  if (valor === null) return null;

  const carteira = acharCarteiraCitada(texto, carteiras);

  if (RETIRAR.test(texto)) {
    return { kind: 'guardado', amount: valor, direction: 'retirar', jar: '', jarVago: false,
      carteira, description: acharDescricao(texto, valor) || 'Retirada', simples: true };
  }
  if (GUARDAR.test(texto)) {
    return { kind: 'guardado', amount: valor, direction: 'guardar', jar: '', jarVago: false,
      carteira, description: acharDescricao(texto, valor) || 'Guardado', simples: true };
  }

  // "+50" e "-50" são inequívocos e vale reconhecer antes dos verbos.
  const sinal = texto.match(/^\s*([+-])\s*\d/);
  const ehReceita = sinal ? sinal[1] === '+' : RECEITA.test(texto);
  const temVerbo = sinal || RECEITA.test(texto) || DESPESA.test(texto);

  // Sem verbo e sem sinal, "30 mercado" ainda é claro: valor + lugar. Mas
  // "30" sozinho não é — pode ser resposta a uma pergunta minha.
  const descricao = acharDescricao(texto, valor);
  if (!temVerbo && !descricao) return null;

  return {
    kind: 'transacao',
    amount: valor,
    type: ehReceita ? 'receita' : 'despesa',
    category: ehReceita ? 'Outros' : acharCategoria(texto),
    description: descricao || (ehReceita ? 'Entrada' : 'Gasto'),
    diasAtras: 0,
    assinatura: false,
    carteira,
    simples: true,
  };
}

module.exports = { lerSemIA };
