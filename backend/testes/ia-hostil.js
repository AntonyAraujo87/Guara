// O que acontece quando a IA devolve lixo.
//
// A premissa deste teste é pessimista de propósito: suponha que o modelo foi
// dominado, está alucinando, ou que a resposta chegou corrompida. Nada disso
// pode derrubar o processo, gravar valor absurdo no banco, nem envenenar
// objeto nenhum.
//
// Roda sem tocar na Gemini: o SDK é trocado por um dublê no cache de require,
// antes do ai-service carregar. A cota gratuita é DIÁRIA e já derrubou a
// produção uma vez — teste que gasta cota não é teste, é risco.
//
// COMO RODAR (da pasta backend):  node testes/ia-hostil.js

const Module = require('module');

// ── o dublê ────────────────────────────────────────────────────────
let RESPOSTA = '[]';

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === '@google/generative-ai') {
    return {
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            generateContent: async () => ({ response: { text: () => RESPOSTA } }),
          };
        }
      },
    };
  }
  return originalRequire.apply(this, arguments);
};

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'chave-de-mentira';
const { extractItems } = require('../ai-service');

// ── os ataques ─────────────────────────────────────────────────────
const GRANDAO = 'A'.repeat(100_000);

const ATAQUES = [
  ['texto que não é JSON',            'desculpe, não entendi sua pergunta'],
  ['JSON vazio',                      ''],
  ['só espaços',                      '   \n  '],
  ['objeto em vez de lista',          '{"kind":"transacao","amount":10}'],
  ['número solto',                    '42'],
  ['string JSON',                     '"oi"'],
  ['null',                            'null'],
  ['true',                            'true'],
  ['lista com null e números',        '[null, 5, "texto", [], {"kind":"transacao","amount":10,"type":"despesa","category":"Mercado","description":"pão"}]'],
  ['lista de listas',                 '[[{"kind":"transacao"}]]'],
  ['JSON truncado',                   '[{"kind":"transacao","amount":'],
  ['JSON com vírgula sobrando',       '[{"kind":"transacao","amount":10},]'],
  ['cercado de markdown',             '```json\n[{"kind":"transacao","amount":10,"type":"despesa","category":"Casa","description":"luz"}]\n```'],
  ['kind desconhecido',               '[{"kind":"apagar_o_banco_inteiro","amount":10}]'],
  ['kind ausente',                    '[{"amount":10,"type":"despesa"}]'],
  ['kind não é string',               '[{"kind":{"a":1},"amount":10}]'],
  ['30 itens',                        JSON.stringify(Array.from({length:30},(_,i)=>({kind:'transacao',amount:i+1,type:'despesa',category:'X',description:'i'+i})))],
  ['valor Infinity literal',          '[{"kind":"transacao","amount":1e400,"type":"despesa","category":"X","description":"y"}]'],
  ['valor como string "Infinity"',    '[{"kind":"transacao","amount":"Infinity","type":"despesa","category":"X","description":"y"}]'],
  ['valor NaN',                       '[{"kind":"transacao","amount":"NaN","type":"despesa","category":"X","description":"y"}]'],
  ['valor negativo',                  '[{"kind":"transacao","amount":-500,"type":"despesa","category":"X","description":"y"}]'],
  ['valor astronômico',               '[{"kind":"transacao","amount":99999999999999,"type":"despesa","category":"X","description":"y"}]'],
  ['valor com notação científica',    '[{"kind":"transacao","amount":"1e20","type":"despesa","category":"X","description":"y"}]'],
  ['descrição de 100 mil letras',     JSON.stringify([{kind:'transacao',amount:10,type:'despesa',category:'X',description:GRANDAO}])],
  ['categoria de 100 mil letras',     JSON.stringify([{kind:'transacao',amount:10,type:'despesa',category:GRANDAO,description:'y'}])],
  ['POLUIÇÃO DE PROTÓTIPO',           '[{"kind":"transacao","amount":10,"type":"despesa","category":"X","description":"y","__proto__":{"invadido":true}}]'],
  ['constructor.prototype',           '[{"kind":"transacao","amount":10,"type":"despesa","category":"X","description":"y","constructor":{"prototype":{"invadido2":true}}}]'],
  ['diasAtras absurdo',               '[{"kind":"transacao","amount":10,"type":"despesa","category":"X","description":"y","diasAtras":999999}]'],
  ['diasAtras negativo',              '[{"kind":"transacao","amount":10,"type":"despesa","category":"X","description":"y","diasAtras":-50}]'],
  ['parcelas absurdas',               '[{"kind":"parcelamento","description":"TV","installments":100000,"installmentAmount":10,"category":"Casa"}]'],
  ['parcelas negativas',              '[{"kind":"parcelamento","description":"TV","installments":-6,"installmentAmount":10,"category":"Casa"}]'],
  ['dia do mês inválido',             '[{"kind":"recorrente","description":"net","amount":100,"dayOfMonth":99,"type":"despesa","category":"Casa"}]'],
  ['carteira com ação inventada',     '[{"kind":"carteira","acao":"formatar_disco","nome":"x"}]'],
  ['controle no meio do texto',       '[{"kind":"transacao","amount":10,"type":"despesa","category":"X","description":"pa\\u0000o\\u200bin\\u202evisivel"}]'],
  ['aninhamento profundo',            '[' + '{"kind":"transacao","a":'.repeat(0) + JSON.stringify({kind:'transacao',amount:10,type:'despesa',category:'X',description:'y',extra:JSON.parse('{"a":'.repeat(50)+'1'+'}'.repeat(50))}) + ']'],
];

(async () => {
  let ok = 0;
  const problemas = [];

  for (const [nome, resposta] of ATAQUES) {
    RESPOSTA = resposta;
    let saida, erro = null;
    try {
      saida = await extractItems('gastei 10 no mercado');
    } catch (e) {
      erro = e;
    }

    const derrubou = erro !== null;
    const poluiu = ({}).invadido !== undefined || ({}).invadido2 !== undefined;

    // O contrato: nunca lançar, sempre devolver lista, no máximo 15 itens,
    // nenhum valor fora da faixa, nenhum texto gigante.
    // LANÇAR é contrato, não falha: o index.js pega esse erro e cai na leitura
    // sem IA (leitura-simples.js). O que não pode é lançar coisa estranha, nem
    // deixar passar dado ruim adiante — que é o resto das checagens abaixo.
    const problemasDoCaso = [];
    if (poluiu) problemasDoCaso.push('POLUIU O PROTÓTIPO');
    if (!derrubou) {
      if (!Array.isArray(saida)) problemasDoCaso.push('não devolveu lista: ' + typeof saida);
      else {
        if (saida.length > 15) problemasDoCaso.push(saida.length + ' itens (teto é 15)');
        for (const it of saida) {
          const v = Number(it.amount ?? it.installmentAmount ?? 0);
          if (!Number.isFinite(v)) problemasDoCaso.push('valor não finito: ' + it.amount);
          if (v > 9_999_999_999.99) problemasDoCaso.push('valor acima do teto do banco: ' + v);
          if (v < 0) problemasDoCaso.push('valor negativo: ' + v);
          for (const campo of ['description', 'category', 'nome', 'para']) {
            if (typeof it[campo] === 'string' && it[campo].length > 1000) {
              problemasDoCaso.push(`${campo} com ${it[campo].length} letras`);
            }
          }
          if (it.diasAtras !== undefined && (it.diasAtras < 0 || it.diasAtras > 365)) {
            problemasDoCaso.push('diasAtras fora da faixa: ' + it.diasAtras);
          }
          // 0 é o sentinela de "não deu pra saber" — o index.js transforma isso
          // numa pergunta em vez de gravar. Só valor NEGATIVO ou absurdo é bug.
          if (it.installments !== undefined && (it.installments < 0 || it.installments > 72)) {
            problemasDoCaso.push('parcelas fora da faixa: ' + it.installments);
          }
          if (it.dayOfMonth !== undefined && (it.dayOfMonth < 1 || it.dayOfMonth > 31)) {
            problemasDoCaso.push('dia do mês fora da faixa: ' + it.dayOfMonth);
          }
        }
      }
    }

    if (problemasDoCaso.length === 0) {
      ok++;
      const oque = derrubou ? 'cai na leitura sem IA' : `${saida.length} item(ns)`;
      console.log(`  ✓ ${nome.padEnd(32)} → ${oque}`);
    } else {
      problemas.push(nome + ': ' + problemasDoCaso.join('; '));
      console.log(`  ✗ ${nome.padEnd(32)} → ${problemasDoCaso.join('; ')}`);
    }
  }

  console.log('');
  console.log(`  ${ok}/${ATAQUES.length} respostas hostis tratadas com segurança`);
  if (problemas.length) {
    console.log('');
    for (const p of problemas) console.log('   • ' + p);
  }
  process.exit(problemas.length ? 1 : 0);
})();
