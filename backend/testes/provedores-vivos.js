// Quais provedores REALMENTE respondem, e com que qualidade.
//
// Existe porque endereço de API e nome de modelo mudam sem aviso, e porque cota
// gratuita anunciada num blog não é cota gratuita medida. Este teste não confia
// em nada escrito em provedores.js: ele bate na porta de cada um e vê quem abre.
//
// Faz UMA chamada por provedor configurado. Só isso — a cota é o recurso escasso
// aqui, e um teste que a consome não serve pra diagnosticar quando ela acabar.
//
// Com --cota, ele insiste até tomar um 429 e diz quantas chamadas aguentou.
// Isso GASTA a cota do dia de propósito, e só deve ser usado quando você quer
// saber o número exato. Nunca contra a chave que está em produção.
//
// COMO RODAR (da pasta backend):
//   set -a; . ./.env; set +a
//   node testes/provedores-vivos.js
//   node testes/provedores-vivos.js --cota      (gasta a cota; cuidado)

const { provedoresAtivos, chamarOpenAICompativel } = require('../provedores');

const MEDIR_COTA = process.argv.includes('--cota');

// A mesma tarefa que o Guará faz de verdade, no menor tamanho possível. Serve
// pra medir duas coisas de uma vez: se o provedor responde, e se o modelo
// entende a tarefa — um que responda rápido e erre o JSON não serve.
const SISTEMA =
  'Você extrai informação financeira de mensagens em português e responde APENAS ' +
  'com um JSON válido, sem markdown e sem texto extra, no formato de uma lista. ' +
  'Cada item tem: kind ("transacao"), amount (número), type ("despesa" ou "receita"), ' +
  'category (texto), description (texto).';

const PERGUNTA = 'gastei 47,90 no mercado extra ontem';

function avaliar(texto) {
  const limpo = String(texto || '').replace(/```json|```/g, '').trim();
  let dados;
  try {
    dados = JSON.parse(limpo);
  } catch {
    return { ok: false, motivo: 'não devolveu JSON: ' + limpo.slice(0, 70) };
  }
  if (!Array.isArray(dados)) return { ok: false, motivo: 'devolveu ' + typeof dados + ', não lista' };
  if (dados.length === 0) return { ok: false, motivo: 'lista vazia' };
  const item = dados[0];
  const valor = Number(item.amount);
  if (Math.abs(valor - 47.9) > 0.01) return { ok: false, motivo: 'errou o valor: ' + item.amount };
  if (item.type !== 'despesa') return { ok: false, motivo: 'errou o tipo: ' + item.type };
  return { ok: true, resumo: `R$ ${valor} · ${item.category} · ${String(item.description).slice(0, 24)}` };
}

// A Gemini tem SDK próprio; o resto fala chat-completions. Aqui a Gemini entra
// pelo mesmo caminho de todos porque o que interessa é a resposta, não o SDK.
async function chamarGemini(passo, sistema, pergunta) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(passo.chave);
  const model = genAI.getGenerativeModel({ model: passo.modelo });
  const r = await model.generateContent([sistema, pergunta], { timeout: passo.timeout });
  return r.response.text();
}

async function testar(passo) {
  const inicio = Date.now();
  const texto = passo.tipo === 'gemini'
    ? await chamarGemini(passo, SISTEMA, PERGUNTA)
    : await chamarOpenAICompativel(passo, SISTEMA, PERGUNTA);
  return { texto, ms: Date.now() - inicio };
}

async function medirCota(passo) {
  let n = 0;
  for (;;) {
    try {
      await testar(passo);
      n += 1;
    } catch (e) {
      const limite = /429|quota|rate.?limit/i.test(e.message);
      return { chamadas: n, parouPor: limite ? e.message.slice(0, 90) : 'erro: ' + e.message.slice(0, 60) };
    }
    if (n >= 300) return { chamadas: n, parouPor: 'parei em 300 sem tomar limite' };
  }
}

(async () => {
  const ativos = provedoresAtivos();

  if (ativos.length === 0) {
    console.log('');
    console.log('  Nenhum provedor configurado. Coloque ao menos uma chave no .env:');
    console.log('');
    console.log('    GEMINI_API_KEY=...        (já deve estar lá)');
    console.log('    GROQ_API_KEY=...');
    console.log('    CEREBRAS_API_KEY=...');
    console.log('    GITHUB_MODELS_TOKEN=...');
    console.log('    CLOUDFLARE_API_TOKEN=...  + CLOUDFLARE_ACCOUNT_ID=...');
    console.log('    OPENROUTER_API_KEY=...');
    console.log('');
    process.exit(1);
  }

  console.log('');
  console.log(`  ${ativos.length} provedor(es) com chave configurada.`);
  if (MEDIR_COTA) console.log('  MODO COTA: vou gastar a cota de hoje de cada um. Última chance de Ctrl+C.');
  console.log('');

  let funcionam = 0;

  for (const p of ativos) {
    for (const m of p.modelos) {
      const passo = { tipo: p.tipo, base: p.base, chave: p.chave, modelo: m.nome, timeout: m.timeout };
      const rotulo = `${p.nome}:${m.nome}`;

      try {
        const { texto, ms } = await testar(passo);
        const nota = avaliar(texto);
        if (nota.ok) {
          funcionam += 1;
          console.log(`  ✓ ${rotulo}`);
          console.log(`      ${(ms / 1000).toFixed(1)}s · ${nota.resumo}`);
        } else {
          console.log(`  ~ ${rotulo}`);
          console.log(`      respondeu em ${(ms / 1000).toFixed(1)}s mas ${nota.motivo}`);
        }
      } catch (e) {
        console.log(`  ✗ ${rotulo}`);
        console.log(`      ${e.message.slice(0, 140)}`);
        continue;
      }

      if (MEDIR_COTA) {
        const { chamadas, parouPor } = await medirCota(passo);
        console.log(`      cota medida: ${chamadas + 1} chamadas até parar`);
        console.log(`      motivo: ${parouPor}`);
      }
    }
  }

  console.log('');
  console.log(`  ${funcionam} modelo(s) respondendo e acertando a tarefa.`);
  if (funcionam === 0) {
    console.log('  Nenhum funcionou — confira as chaves e os endereços em provedores.js.');
  }
  console.log('');
  process.exit(funcionam ? 0 : 1);
})();
