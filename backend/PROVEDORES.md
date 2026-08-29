# Empilhar IAs gratuitas

O Guará usa IA pra **uma coisa**: virar `"gastei 50 no mercado"` num JSON. É tarefa
fácil — um modelo de 8B faz bem. Por isso dá pra empilhar camadas gratuitas e ter,
na prática, cota de sobra.

A fila hoje, sem nenhuma chave nova:

```
gemini-flash-lite (3 tentativas) → gemini-flash (1) → leitura sem IA
```

Cada chave que você acrescentar entra na fila **antes** da leitura sem IA. Nenhuma
chave nova = nada muda.

## A Gemini é reserva, não titular

Assim que existir **qualquer outro provedor com chave**, a Gemini vai automaticamente
pro **fim** da fila de texto:

```
groq → cerebras → github → cloudflare → gemini → leitura sem IA
```

O motivo é concreto: **a Gemini é a única que lê áudio e foto**. Uma chamada dela
gasta em texto — coisa que qualquer um da fila faria — é uma chamada roubada de algo
que só ela faz. Ela continua sendo a primeira e única para mídia, porque ali não há
escolha.

Se as outras acabarem a cota, o texto cai nela normalmente. É reserva, não
aposentadoria.

Sozinha, nada muda: não faz sentido poupar o único provedor que existe.

Para forçar outra ordem, use `ORDEM_IA` — ela manda mais que o automático.


---

## O que foi MEDIDO em 29/08/2026

Todos os nomes de modelo do catálogo original deram 404 ou 410. Os atuais foram
descobertos consultando o `/models` de cada provedor. **Confie no teste, não na
tabela** — rode `node testes/provedores-vivos.js`.

| provedor | veredito |
|---|---|
| **Cloudflare** | ✅ funciona — `@cf/openai/gpt-oss-120b` |
| **Gemini** | ✅ funciona — é a reserva, e a única multimodal |
| OpenRouter | ⚠️ chave OK, modelos `:free` vivem sobrecarregados |
| Groq | ❌ teto de **8.000 tokens/min na organização**, qualquer modelo |
| Cerebras | ❌ `payment_required` — free tier agora exige cartão |
| GitHub Models | ❌ aposentado pela GitHub (`410 retirement_brownout`) |

### O prompt é o gargalo

O SYSTEM_PROMPT do Guará tem **~16.430 tokens**. É isso que barra a maioria das
camadas gratuitas — o Groq era o mais rápido de todos (859ms num teste pequeno) e
foi excluído só por tamanho.

Se um dia o prompt for enxugado pela metade, Groq volta a valer. O banco de ~130
exemplos resolvidos é a maior parte dele — e é justamente o que faz a compreensão
funcionar, então encolher tem custo real.

---

## Como conferir o que está valendo

```bash
cd ~/guara/deploy && sudo docker compose logs backend | grep -E "IA para (TEXTO|AUDIO)"
```

Ou, dentro da pasta `backend` na sua máquina:

```bash
set -a; . ./.env; set +a
node testes/provedores-vivos.js
```

Esse teste faz **uma chamada por modelo** e diz quem responde, em quantos segundos,
e se acertou a tarefa. É ele que manda — não o que está escrito aqui. Endereço de
API e nome de modelo mudam sem aviso.

---

## Onde pegar cada chave

Todos têm camada gratuita. **Não confie nos números de cota que você ler em blog** —
meça com `node testes/provedores-vivos.js --cota` (isso gasta a cota do dia de
propósito; não rode contra a chave que está em produção).

### Groq

Inferência muito rápida, modelos Llama. Costuma ser a cota gratuita mais folgada.

1. https://console.groq.com — entrar com Google ou GitHub
2. **API Keys** → **Create API Key**
3. No `.env`: `GROQ_API_KEY=gsk_...`

### Cerebras

Mesma ideia, também muito rápido.

1. https://cloud.cerebras.ai
2. **API Keys** → gerar
3. No `.env`: `CEREBRAS_API_KEY=csk-...`

### GitHub Models

**Não precisa de cadastro novo** — usa a conta que já publica as imagens do Guará.

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. Marcar apenas o escopo de **models**
3. No `.env`: `GITHUB_MODELS_TOKEN=ghp_...`

### Cloudflare Workers AI

Precisa de **duas** variáveis: a chave e o id da conta.

1. https://dash.cloudflare.com → o id da conta aparece na URL e na barra lateral
2. **My Profile → API Tokens** → token com permissão de **Workers AI**
3. No `.env`:
   ```
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```

Sem o `ACCOUNT_ID` o provedor fica de fora mesmo com a chave — o endereço da API
embute o id, então não dá pra montar sem ele.

### OpenRouter

Agregador: uma chave, vários modelos de vários lugares. Os terminados em `:free`
não cobram, mas são os mais disputados — por isso fica por último na fila padrão.

1. https://openrouter.ai/keys
2. No `.env`: `OPENROUTER_API_KEY=sk-or-...`

---

## Ajustes finos

**Trocar a ordem da fila** — sem mexer em código:

```
ORDEM_IA=groq,gemini
```

Quem não for citado vai pro fim, na ordem padrão. Configurar um favorito não
desliga os outros sem querer.

**Trocar o modelo de um provedor:**

```
GROQ_MODELO=llama-3.1-8b-instant
CEREBRAS_MODELO=llama3.1-8b
GITHUB_MODELS_MODELO=openai/gpt-4o-mini
CLOUDFLARE_MODELO=@cf/meta/llama-3.1-8b-instruct
OPENROUTER_MODELO=meta-llama/llama-3.3-70b-instruct:free
```

**Trocar o endereço**, se a API mudar de casa:

```
GROQ_BASE_URL=...
CEREBRAS_BASE_URL=...
GITHUB_MODELS_BASE_URL=...
OPENROUTER_BASE_URL=...
```

---

## Depois de mexer no `.env`

```bash
cd ~/guara/deploy && sudo docker compose restart backend
```

E confira quem entrou:

```bash
sudo docker compose logs backend | grep -E "IA para (TEXTO|AUDIO)"
```

---

## O que NÃO muda de provedor

**Áudio e foto continuam só na Gemini.** Os outros gratuitos falam texto; ler
comprovante e transcrever recado precisa de modelo multimodal. Se a Gemini estiver
fora, áudio e imagem falham e o Guará pede pra pessoa escrever — o texto, esse
sim, passa por qualquer provedor da fila.

## E se todos falharem

Entra `leitura-simples.js`: lê valor e descrição por regex, sem IA nenhuma. Ele
desiste de propósito de frase com dois números, pergunta, recorrente, parcelamento,
dívida, meta, edição e carteira — tudo que leria errado. **Preferir não entender a
entender errado.**
