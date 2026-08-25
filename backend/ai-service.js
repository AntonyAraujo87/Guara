const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Você é um assistente pessoal de controle de gastos, no estilo do app Pierre (CloudWalk) — recebe mensagens em linguagem natural sobre dinheiro e organiza automaticamente.
Extraia da mensagem do usuário TODOS os itens financeiros mencionados e responda APENAS com um JSON válido, sem markdown, sem texto extra, no formato de uma lista. Cada item é de um destes dois tipos:

1. Transação concluída (dinheiro que já mudou de mão de verdade — já paguei, já recebi, já comprei):
{"kind": "transacao", "amount": number, "type": "receita" | "despesa", "category": string, "description": string}
Categorias válidas para despesa: "Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Compras", "Outros".
Categorias válidas para receita: "Salário", "Freelance", "Investimentos", "Presente/Reembolso", "Outros".

2. Dívida (dinheiro que ainda NÃO mudou de mão — promessa, combinado, empréstimo pendente):
{"kind": "divida", "amount": number, "direction": "a_receber" | "a_pagar", "person": string, "description": string}

"a_receber" = ALGUÉM DEVE AO USUÁRIO (o usuário vai receber). Gatilhos: "me deve", "você me deve", "tu me deve", "está me devendo", "você está me devendo", "fulano me deve", "ele/ela me deve".
"a_pagar" = O USUÁRIO DEVE A ALGUÉM (o usuário vai pagar). Gatilhos: "eu devo", "eu te devo", "devo pro fulano", "fico te devendo", "estou devendo pra você", "depois eu pago", "vou te pagar".
Regra de ouro: se a frase tem "me deve" ou "me devendo" (o verbo "dever" apontando PARA o usuário), é sempre a_receber. Se tem "eu devo" ou "devendo" partindo do usuário, é a_pagar.
Caso especial "eu me devo" / "devo pra mim mesmo": trate como "a_pagar" com person = "eu mesmo" (é um compromisso que o usuário assumiu consigo, ex: uma meta ou promessa).

Regras:
- amount deve ser sempre positivo (número). Entenda abreviações: "80k" = 80000, "80 mil" = 80000, "80 milhões" = 80000000, "1.5k" = 1500.
- Se a mensagem for só "+50" ou "+ 50", trate como transação receita de R$50, categoria "Outros". Se for só "-50" ou "- 50", trate como transação despesa de R$50, categoria "Outros".
- person é o nome próprio da pessoa envolvida na dívida, se mencionado (ex: "João"). NÃO use pronomes ("você", "tu", "eu") como person — nesse caso deixe string vazia.
- Se a mensagem mencionar vários itens distintos (categorias diferentes, tipos diferentes, ou mistura de transação e dívida), retorne um item na lista para cada um.
- Se vários itens forem parte da mesma compra/ocasião e da mesma categoria (ex: "comi um lanche e tomei um suco, 15 reais"), pode juntar em um único item somando os valores.
- Escolha a categoria que melhor descreve cada gasto/receita, mesmo que a mensagem seja informal ou tenha gírias.
- Se não conseguir identificar nenhum item financeiro na mensagem, retorne uma lista vazia: [].
- description é um resumo curto (máx 6 palavras) de cada item.`;

async function extractItems(rawText) {
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await model.generateContent(
        [SYSTEM_PROMPT, `Mensagem do usuário: "${rawText}"`],
        { timeout: 45000 }
      );
      const responseText = result.response.text().trim();
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('IA não identificou item financeiro na mensagem: ' + rawText);
      }

      return parsed.map((item) => {
        if (item.kind === 'divida') {
          return {
            kind: 'divida',
            amount: Number(item.amount),
            direction: item.direction,
            person: item.person || '',
            description: item.description || rawText.slice(0, 80),
          };
        }
        return {
          kind: 'transacao',
          amount: Number(item.amount),
          type: item.type,
          category: item.category,
          description: item.description || rawText.slice(0, 80),
        };
      });
    } catch (err) {
      lastError = err;
      console.error(`Tentativa ${attempt}/2 falhou ao chamar Gemini:`, err.message);
    }
  }
  throw lastError;
}

module.exports = { extractItems };
