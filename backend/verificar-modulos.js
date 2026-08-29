// Confere que os módulos CARREGAM, não só que a sintaxe está válida.
//
// Existe por causa de um incidente: uma refatoração apagou uma função sem
// tirá-la do module.exports. `node --check` passou — sintaxe perfeita — e o
// backend só quebrou ao subir em produção, em loop de restart, com o site em
// 503 por dez minutos.
//
// Duas coisas que o --check não vê e esta verificação vê:
//   1. export apontando pra nome que não existe mais
//   2. require destruturado pedindo algo que o outro módulo não exporta
//
// Roda sem rede e sem banco: as variáveis de ambiente são falsas de propósito,
// e nenhum módulo faz chamada externa ao ser carregado.

const fs = require('fs');
const path = require('path');

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-verificacao';
process.env.GEMINI_API_KEY ||= 'chave-de-verificacao';
process.env.META_ACCESS_TOKEN ||= 'token-de-verificacao';

// index.js fica de fora: carregá-lo sobe o servidor e o processo nunca termina.
// Ele é conferido pelo outro caminho, o dos requires destruturados.
const MODULOS = ['formato.js', 'mensagens.js', 'db-service.js', 'ai-service.js', 'media-service.js', 'leitura-simples.js', 'respostas.js'];

let problemas = 0;
const exportados = {};

for (const arquivo of MODULOS) {
  const caminho = path.join(__dirname, arquivo);
  if (!fs.existsSync(caminho)) {
    console.error(`  FALTA    ${arquivo} não existe`);
    problemas++;
    continue;
  }

  let mod;
  try {
    mod = require(caminho);
  } catch (err) {
    console.error(`  QUEBRA   ${arquivo}: ${err.message}`);
    problemas++;
    continue;
  }

  // Export apontando pra nome apagado vira undefined em vez de erro.
  const indefinidos = Object.entries(mod)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);

  if (indefinidos.length) {
    console.error(`  VAZIO    ${arquivo} exporta sem valor: ${indefinidos.join(', ')}`);
    problemas++;
  } else {
    console.log(`  ok       ${arquivo.padEnd(22)} ${Object.keys(mod).length} exports`);
  }

  exportados[`./${arquivo.replace(/\.js$/, '')}`] = new Set(Object.keys(mod));
}

// ── O que o index.js pede aos outros existe mesmo? ─────────────────
// Lido do texto, sem carregar: `const { a, b } = require('./x')`.
const fonte = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const requires = fonte.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(['"](\.\/[^'"]+)['"]\)/g);

for (const [, lista, modulo] of requires) {
  const disponiveis = exportados[modulo];
  if (!disponiveis) continue;

  const pedidos = lista
    .split(',')
    .map((n) => n.split(':')[0].trim())
    .filter((n) => n && !n.startsWith('//'));

  const faltando = pedidos.filter((n) => !disponiveis.has(n));
  if (faltando.length) {
    console.error(`  FALTA    index.js pede de ${modulo}: ${faltando.join(', ')}`);
    problemas++;
  } else {
    console.log(`  ok       index.js pede ${pedidos.length} de ${modulo}`);
  }
}

// ── O DOCKERFILE LISTA OS ARQUIVOS PELO NOME ────────────────────────
//
// Nao e "COPY . ." de proposito: assim .env, node_modules e testes nao entram
// na imagem. O preco e que um arquivo .js novo que ninguem acrescentou aqui
// simplesmente nao existe dentro do container, e o backend entra em loop de
// restart com "Cannot find module" — ja aconteceu, com o WhatsApp fora do ar.
//
// Nenhum lint pega isso: o codigo esta perfeito, so nao foi junto.
// Dentro da imagem construida o Dockerfile nao existe — ele nao e copiado, e
// nem deve ser. Esta checagem e de CI, onde o repositorio inteiro esta em disco;
// rodando dentro do container ela simplesmente nao se aplica.
const caminhoDockerfile = path.join(__dirname, 'Dockerfile');
const dockerfile = fs.existsSync(caminhoDockerfile)
  ? fs.readFileSync(caminhoDockerfile, 'utf8')
  : null;
const naImagem = dockerfile
  ? fs.readdirSync(__dirname).filter((f) => f.endsWith('.js')).filter((f) => !dockerfile.includes(f))
  : [];

if (!dockerfile) {
  console.log('  --       sem Dockerfile por perto (rodando dentro da imagem); pulei essa checagem');
} else if (naImagem.length) {
  console.error(`  FALTA    no Dockerfile: ${naImagem.join(', ')}`);
  console.error('           o container subiria sem esse(s) arquivo(s).');
  problemas += naImagem.length;
} else {
  console.log('  ok       todos os .js estao no COPY do Dockerfile');
}

if (problemas > 0) {
  console.error(`\n  ${problemas} problema(s) — isto derrubaria o backend ao subir.`);
  process.exit(1);
}
console.log('\n  todos os módulos carregam e todos os requires batem');
