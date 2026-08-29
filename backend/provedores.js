// Quem pode responder por este app, e em que ordem.
//
// O Guará usa IA pra UMA coisa: virar "gastei 50 no mercado" num JSON. É tarefa
// fácil — um modelo de 8B faz bem. Isso é o que torna esta ideia possível:
// não precisamos de modelo de fronteira, então dá pra empilhar várias camadas
// gratuitas e ter, na prática, cota de sobra.
//
// A REGRA DESTE ARQUIVO: provedor sem chave no .env simplesmente não existe.
// Sem nenhuma chave nova, o comportamento é exatamente o de antes — só a Gemini.
// Isso é de propósito: acrescentar opção não pode mudar o que já funciona.
//
// Quase todos falam o MESMO protocolo (chat-completions da OpenAI), então um
// adaptador só atende Groq, Cerebras, GitHub Models, Cloudflare e OpenRouter.
// A Gemini é a exceção, porque tem SDK próprio e é a única que lê áudio e foto.
//
// ⚠️ Endereços e nomes de modelo mudam. Todos são sobrescrevíveis por variável
// de ambiente, e `node testes/provedores-vivos.js` confere quais realmente
// respondem — não confie nesta lista, confie no teste.

const ORDEM_PADRAO = ['gemini', 'groq', 'cerebras', 'github', 'cloudflare', 'openrouter'];

// Cada provedor declara: como se chama, que protocolo fala, onde mora, qual
// variável guarda a chave, e quais modelos usar (em ordem de preferência).
//
// `tentativas` é por modelo, e não por acaso: repetir três vezes num modelo com
// cota diária de 20 queima 15% do dia numa mensagem só. Modelo folgado ganha
// três chances; modelo apertado ganha uma.
const CATALOGO = {
  gemini: {
    tipo: 'gemini',
    chaveEnv: 'GEMINI_API_KEY',
    modelos: [
      { nome: 'gemini-flash-lite-latest', tentativas: 3, timeout: 45_000 },
      // Cota diária medida em 29/08/2026: 20 requisições. Uma tentativa só.
      { nome: 'gemini-flash-latest', tentativas: 1, timeout: 100_000 },
    ],
  },

  groq: {
    tipo: 'openai',
    base: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    chaveEnv: 'GROQ_API_KEY',
    modelos: [
      { nome: process.env.GROQ_MODELO || 'llama-3.3-70b-versatile', tentativas: 2, timeout: 30_000 },
    ],
  },

  cerebras: {
    tipo: 'openai',
    base: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    chaveEnv: 'CEREBRAS_API_KEY',
    modelos: [
      { nome: process.env.CEREBRAS_MODELO || 'llama-3.3-70b', tentativas: 2, timeout: 30_000 },
    ],
  },

  // Não exige cadastro novo: usa a mesma conta do GitHub que já publica as
  // imagens. A chave é um token com permissão de modelos.
  github: {
    tipo: 'openai',
    base: process.env.GITHUB_MODELS_BASE_URL || 'https://models.github.ai/inference',
    chaveEnv: 'GITHUB_MODELS_TOKEN',
    modelos: [
      { nome: process.env.GITHUB_MODELS_MODELO || 'openai/gpt-4o-mini', tentativas: 1, timeout: 45_000 },
    ],
  },

  // O endereço embute o id da conta, então este é o único que precisa de duas
  // variáveis. Sem o id, o provedor fica de fora mesmo com a chave presente.
  cloudflare: {
    tipo: 'openai',
    base: process.env.CLOUDFLARE_ACCOUNT_ID
      ? `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`
      : null,
    chaveEnv: 'CLOUDFLARE_API_TOKEN',
    modelos: [
      { nome: process.env.CLOUDFLARE_MODELO || '@cf/meta/llama-3.1-8b-instruct', tentativas: 2, timeout: 45_000 },
    ],
  },

  // Agregador: uma chave, vários modelos de vários lugares. Os terminados em
  // ":free" não cobram, mas costumam ser os mais disputados — por isso fica por
  // último na ordem padrão.
  openrouter: {
    tipo: 'openai',
    base: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    chaveEnv: 'OPENROUTER_API_KEY',
    modelos: [
      { nome: process.env.OPENROUTER_MODELO || 'meta-llama/llama-3.3-70b-instruct:free', tentativas: 1, timeout: 60_000 },
    ],
  },
};

// A ordem da fila pode ser trocada sem mexer em código: ORDEM_IA=groq,gemini
// põe o Groq na frente. Nome desconhecido é ignorado em silêncio — errar a
// digitação de uma variável não pode derrubar o app.
function ordemConfigurada() {
  const bruto = String(process.env.ORDEM_IA || '').trim();
  if (bruto) {
    const pedidos = bruto.split(',').map((n) => n.trim().toLowerCase()).filter((n) => CATALOGO[n]);
    if (pedidos.length > 0) {
      // Quem não foi citado vai pro fim, na ordem padrão: assim configurar um
      // favorito não desliga os outros sem querer.
      const resto = ORDEM_PADRAO.filter((n) => !pedidos.includes(n));
      return [...pedidos, ...resto];
    }
  }
  return ordemComGeminiDeReserva();
}

// Provedores que sabem ler áudio e foto. Hoje só a Gemini — os gratuitos de
// inferência rápida servem texto e mais nada.
const MULTIMODAIS = new Set(['gemini']);

// A cota da Gemini vale MAIS que a dos outros, e por um motivo concreto: ela é
// a única que lê recado de voz e foto de comprovante. Uma chamada dela gasta em
// texto — que qualquer um da fila faria — é uma chamada roubada de algo que só
// ela faz.
//
// Então, assim que existir outro provedor com chave, a Gemini vai pro FIM da
// fila de TEXTO. Ela continua sendo a primeira (e única) para mídia, porque ali
// não há escolha. Se as outras acabarem, o texto cai nela normalmente — é
// reserva, não aposentadoria.
//
// Sozinha, nada muda: não faz sentido "poupar" o único provedor que existe.
function ordemComGeminiDeReserva() {
  const comChave = ORDEM_PADRAO.filter((nome) => {
    const p = CATALOGO[nome];
    if (!process.env[p.chaveEnv]) return false;
    if (p.tipo === 'openai' && !p.base) return false;
    return true;
  });

  const outros = comChave.filter((n) => !MULTIMODAIS.has(n));
  if (outros.length === 0) return ORDEM_PADRAO;

  const reservados = ORDEM_PADRAO.filter((n) => MULTIMODAIS.has(n));
  const resto = ORDEM_PADRAO.filter((n) => !MULTIMODAIS.has(n));
  return [...resto, ...reservados];
}

// Os provedores que de fato podem ser chamados agora: têm chave, e (no caso da
// Cloudflare) têm o endereço completo montado.
function provedoresAtivos() {
  return ordemConfigurada()
    .map((nome) => ({ nome, ...CATALOGO[nome] }))
    .filter((p) => {
      const chave = process.env[p.chaveEnv];
      if (!chave) return false;
      if (p.tipo === 'openai' && !p.base) return false;
      return true;
    })
    .map((p) => ({ ...p, chave: process.env[p.chaveEnv] }));
}

// A fila achatada: cada entrada é uma tentativa concreta. Achatar aqui, em vez
// de aninhar três laços na hora da chamada, mantém a ordem explícita e legível.
function filaDeTentativas() {
  return provedoresAtivos().flatMap((p) =>
    p.modelos.flatMap((m) =>
      Array.from({ length: m.tentativas }, (_, n) => ({
        provedor: p.nome,
        tipo: p.tipo,
        base: p.base,
        chave: p.chave,
        modelo: m.nome,
        timeout: m.timeout,
        tentativa: n + 1,
        deQuantas: m.tentativas,
        // Identidade única pro disjuntor: dois provedores podem servir modelos
        // de mesmo nome, e bloquear um não pode bloquear o outro.
        id: `${p.nome}:${m.nome}`,
      }))
    )
  );
}

// Chama qualquer provedor que fale chat-completions e devolve o TEXTO da
// resposta. Sem SDK: são todos o mesmo POST, e uma dependência a menos é uma
// dependência a menos pra atualizar, auditar e caber na imagem.
async function chamarOpenAICompativel({ base, chave, modelo, timeout }, sistema, usuario) {
  const resposta = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      // Zero porque a tarefa é extração, não criação: queremos o mesmo JSON
      // pra mesma frase, sempre.
      temperature: 0,
      // Teto generoso, mas teto: sem ele, um modelo que entra em laço gasta
      // tokens e tempo até o timeout.
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!resposta.ok) {
    // O corpo do erro é onde vem "quota exceeded", "rate limit" e afins — o
    // disjuntor precisa dessa frase pra saber se desliga o modelo pelo dia.
    const corpo = await resposta.text().catch(() => '');
    const erro = new Error(`${resposta.status} ${resposta.statusText}: ${corpo.slice(0, 300)}`);
    erro.status = resposta.status;
    throw erro;
  }

  const dados = await resposta.json();
  const texto = dados?.choices?.[0]?.message?.content;
  if (typeof texto !== 'string') {
    throw new Error('Resposta sem conteúdo: ' + JSON.stringify(dados).slice(0, 200));
  }
  return texto;
}

// Quem, dos ativos, sabe ler audio e foto. Se der [], midia nao funciona —
// e isso precisa aparecer no boot, nao ser descoberto por um usuario mandando
// um recado de voz e levando "nao consegui ouvir".
function multimodaisAtivos() {
  return provedoresAtivos().filter((p) => MULTIMODAIS.has(p.nome)).map((p) => p.nome);
}

module.exports = {
  CATALOGO,
  MULTIMODAIS,
  multimodaisAtivos,
  ORDEM_PADRAO,
  ordemConfigurada,
  provedoresAtivos,
  filaDeTentativas,
  chamarOpenAICompativel,
};
