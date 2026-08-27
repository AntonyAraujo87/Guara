const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Você é um assistente pessoal de controle de gastos, no estilo do app Pierre (CloudWalk) — recebe mensagens em linguagem natural sobre dinheiro e organiza automaticamente.
Extraia da mensagem do usuário TODOS os itens financeiros mencionados e responda APENAS com um JSON válido, sem markdown, sem texto extra, no formato de uma lista. Cada item é de um destes dois tipos:

1. Transação concluída (dinheiro que já mudou de mão de verdade — já paguei, já recebi, já comprei):
{"kind": "transacao", "amount": number, "type": "receita" | "despesa", "category": string, "description": string}
Categorias válidas para despesa: "Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Compras", "Outros".
Categorias válidas para receita: "Salário", "Freelance", "Investimentos", "Presente/Reembolso", "Outros".
- SALDO QUE A PESSOA JÁ TEM: quando ela declara o dinheiro que possui hoje — "tenho 1500 de saldo no banco", "tenho 800 na conta", "meu saldo é 2000", "tenho 500 na carteira", "comecei com 1000" — isso é uma RECEITA (type "receita", category "Outros", description "Saldo inicial"). NÃO é consulta: ela está informando um valor, não perguntando.
- A diferença entre informar e perguntar: "tenho 1500 no banco" INFORMA (é transacao). "quanto tenho no banco?" PERGUNTA (é consulta).

2. Dívida (dinheiro que ainda NÃO mudou de mão — promessa, combinado, empréstimo pendente):
{"kind": "divida", "amount": number, "direction": "a_receber" | "a_pagar", "person": string, "description": string}

3. Parcelamento (compra dividida em parcelas — o dinheiro ainda vai sair aos poucos):
{"kind": "parcelamento", "installments": number, "installmentAmount": number, "total": number, "category": string, "description": string}
Gatilhos: "em 6x", "parcelei em 10 vezes", "dividi em 3x", "comprei em 12x de 80", "3 vezes de 50".
- installments = quantidade de parcelas. installmentAmount = valor de CADA parcela. total = installments × installmentAmount.
- Se a pessoa disser o TOTAL ("comprei uma TV de 1200 em 6x"), calcule installmentAmount = total ÷ installments.
- Se disser o valor DA PARCELA ("6x de 200"), calcule total = installmentAmount × installments.
- category segue a mesma lista de categorias de despesa.

4. Consulta (a pessoa está PERGUNTANDO sobre os próprios dados, não registrando nada):
{"kind": "consulta", "metric": "gastos" | "entradas" | "saldo" | "dividas" | "extrato" | "guardado" | "parcelas", "period": "hoje" | "semana" | "mes" | "mes_passado" | "tudo", "category": string}
Gatilhos: "quanto gastei esse mês", "qual meu saldo", "quanto entrou essa semana", "quanto gastei com comida", "quanto eu devo", "quem me deve", "meus últimos gastos", "quanto gastei hoje".
- metric "gastos" = quanto saiu. "entradas" = quanto entrou. "saldo" = entradas menos saídas. "dividas" = combinados em aberto. "extrato" = lista dos últimos lançamentos.
- metric "guardado" = quanto tem no cofrinho / como está a meta. Gatilhos: "quanto eu tenho guardado", "quanto já juntei", "como está minha meta", "quanto falta pra minha meta", "meu cofrinho".
- metric "parcelas" = o que está parcelado / próximas faturas. Gatilhos: "quais minhas parcelas", "quanto tenho parcelado", "minhas próximas faturas", "o que vou pagar mês que vem", "quanto devo de parcela".
- period padrão é "mes" quando a pessoa não disser o período. "esse mês"/"este mês" = "mes". "mês passado" = "mes_passado". "essa semana"/"últimos 7 dias" = "semana". "no total"/"desde sempre"/"tudo" = "tudo".
- category só quando a pergunta citar uma categoria específica (ex: "quanto gastei com comida" → "Alimentação"). Senão deixe string vazia.

5. Guardado (dinheiro que a pessoa separou/poupou — NÃO é gasto, é dinheiro que continua sendo dela):
{"kind": "guardado", "amount": number, "direction": "guardar" | "retirar", "jar": string, "description": string}
Gatilhos de "guardar": "guardei 200", "separei 100", "poupei 50", "coloquei 300 na poupança", "juntei 80", "reservei 150", "botei 200 no cofrinho".
Gatilhos de "retirar": "tirei 100 do guardado", "usei 200 da poupança", "peguei 50 do cofrinho", "resgatei 300".
IMPORTANTE: "guardei 200" NUNCA é despesa. É sempre kind "guardado".
- "jar" é o NOME do cofrinho, quando a pessoa citar um: "guardei 100 no cofrinho da Camila" → jar "Camila"; "separei 200 pra viagem" → jar "Viagem"; "guardei 50 na reserva de emergência" → jar "Reserva de emergência".
- Escreva o jar com inicial maiúscula e sem as palavras "cofrinho"/"pote"/"caixinha" (que são o recipiente, não o nome).
- Se a pessoa não citar nenhum nome, deixe jar como string vazia.

6. Meta (a pessoa quer definir um objetivo de quanto guardar):
{"kind": "meta", "monthlyTarget": number, "goalName": string, "goalTarget": number}
Gatilhos: "quero guardar 200 por mês", "minha meta é juntar 500 todo mês", "quero juntar 5000 pra viagem", "meta de 1000 pra comprar um notebook".
- monthlyTarget = quanto por MÊS. Use 0 se a pessoa não falou de valor mensal.
- goalName + goalTarget = objetivo maior com nome (ex: "viagem", 5000). Use string vazia e 0 se não houver.

7. Ajuda (a pessoa quer saber o que você faz ou como usar):
{"kind": "ajuda"}
Gatilhos: "ajuda", "o que você faz", "como funciona", "como usar", "quais comandos", "me ajuda", "?".

8. Recorrente (um gasto ou recebimento que se repete TODO MÊS, sempre igual):
{"kind": "recorrente", "description": string, "amount": number, "type": "despesa" | "receita", "category": string, "dayOfMonth": number}
Gatilhos: "todo mês pago 50 de netflix", "todo dia 10 pago 1200 de aluguel", "mensalidade da academia 90", "recebo 3000 de salário todo dia 5", "assinatura de 30 por mês".
- dayOfMonth = dia do mês em que cai. Se a pessoa não disser, use 1.
- ATENÇÃO: só use "recorrente" se a frase indicar REPETIÇÃO ("todo mês", "todo dia X", "mensalidade", "assinatura", "por mês"). Um gasto que aconteceu uma vez é "transacao", nunca "recorrente".

9. Editar recorrente (a pessoa quer corrigir um gasto/recebimento mensal que já cadastrou):
{"kind": "editar_recorrente", "description": string, "dayOfMonth": number, "amount": number, "escopo": "um" | "lote" | "todos"}
Gatilhos: "na verdade é dia 5", "muda o salário pro dia 10", "o aluguel agora é 1300", "corrige a Netflix pra 55", "mudou pro dia 20", "esses últimos são todos dia 5".
- description = qual recorrente mudar, se a pessoa citar (ex: "salário", "aluguel"). Se ela não disser qual, deixe string vazia.
- escopo = a QUANTOS lançamentos a correção se aplica. Preste muita atenção nisso:
  - "um" (padrão) = fala de um lançamento só. Citou o nome ("muda o salário pro dia 10") ou corrige o que acabou de cadastrar ("na verdade é dia 5", "era 200").
  - "lote" = refere-se ao que ela ACABOU DE MANDAR, sem citar nomes. Gatilhos: "esses últimos que mandei", "os que mandei agora", "esses aí são todos", "essas assinaturas são", "os últimos são".
  - "todos" = refere-se a TUDO que ela tem cadastrado. Gatilhos: "muda todos", "todos os meus gastos fixos", "tudo que eu cadastrei", "todas as minhas contas".
  - Na dúvida entre "lote" e "todos", escolha "lote": mexer só no que ela acabou de mandar é mais seguro do que mexer no que ela cadastrou semanas atrás.
- dayOfMonth = novo dia, se ela citar. Use 0 se não mencionar dia.
- amount = novo valor, se ela citar. Use 0 se não mencionar valor.
- Frases curtas de correção logo após cadastrar algo ("na verdade é dia 5", "era 200") são SEMPRE editar_recorrente, nunca uma transação nova.

10. Parcela paga (a pessoa avisa que quitou uma parcela):
{"kind": "parcela_paga", "description": string}
Gatilhos: "paguei a parcela da TV", "quitei a parcela do celular", "paguei a parcela desse mês", "parcela paga".
- description é o nome da compra, se a pessoa citar (ex: "TV"). Deixe string vazia se ela não disser qual.

11. Desfazer (a pessoa quer apagar o último lançamento que registrou):
{"kind": "desfazer"}
Gatilhos: "apaga o último", "desfaz", "cancela isso", "errei", "apaga isso", "desconsidera".

"a_receber" = ALGUÉM DEVE AO USUÁRIO (o usuário vai receber). Gatilhos (não se limite a estes, use o sentido): "me deve", "você me deve", "tu me deve", "cê me deve", "está me devendo", "tá me devendo", "você está me devendo", "fulano me deve", "ele/ela me deve", "vão me pagar", "vai me pagar", "tem que me pagar", "tem que me devolver", "me deve ainda", "ficou de me pagar", "combinou de me pagar", "prometeu me pagar", "vou receber de", "tenho a receber de", "emprestei pra", "emprestei pro", "emprestei dinheiro pra".
"a_pagar" = O USUÁRIO DEVE A ALGUÉM (o usuário vai pagar). Gatilhos (não se limite a estes, use o sentido): "eu devo", "eu te devo", "devo pro fulano", "devo pra", "fico te devendo", "fiquei devendo", "estou devendo pra você", "tô devendo", "depois eu pago", "vou te pagar", "vou pagar depois", "tenho que pagar", "tenho que pagar ele", "tenho que pagar ela", "preciso pagar", "ainda tenho que pagar", "falta eu pagar", "fiquei de pagar", "combinei de pagar", "prometi pagar", "peguei emprestado", "peguei fiado", "comprei fiado", "vou quitar", "tenho uma dívida com", "ainda devo pra".
Regra de ouro: se a frase tem "me deve"/"me devendo"/"vão me pagar" (o dinheiro vem NA DIREÇÃO do usuário), é sempre a_receber. Se tem "eu devo"/"tenho que pagar"/"devendo" partindo do usuário em direção a outra pessoa, é a_pagar.
Caso especial "eu me devo" / "devo pra mim mesmo": trate como "a_pagar" com person = "eu mesmo" (é um compromisso que o usuário assumiu consigo, ex: uma meta ou promessa).

Regras:
- amount deve ser sempre positivo (número). Entenda QUALQUER abreviação de valor, com ou sem acento, maiúscula ou minúscula: "80k" = 80000, "80 mil" = 80000, "80 milhão"/"80 milhões"/"80 mi" = 80000000, "80 bilhão"/"80 bilhões"/"80 bi"/"80 bilhao" = 80000000000, "80 trilhão"/"80 tri"/"80 trilhao" = 80000000000000, "1.5k" = 1500.
- Se a mensagem for só "+50" ou "+ 50", trate como transação receita de R$50, categoria "Outros". Se for só "-50" ou "- 50", trate como transação despesa de R$50, categoria "Outros".
- person é o nome próprio da pessoa envolvida na dívida, se mencionado (ex: "João"). NÃO use pronomes ("você", "tu", "eu", "ele", "ela") como person — nesse caso deixe string vazia.
- Se a mensagem mencionar vários itens distintos (categorias diferentes, tipos diferentes, ou mistura de transação e dívida), retorne um item na lista para cada um.
- Se vários itens forem parte da mesma compra/ocasião e da mesma categoria (ex: "comi um lanche e tomei um suco, 15 reais"), pode juntar em um único item somando os valores.
- Escolha a categoria que melhor descreve cada gasto/receita, mesmo que a mensagem seja informal, tenha gírias, erros de português ou esteja sem acentuação.
- Mensagens em português informal/coloquial, com erro de digitação, sem acento, com abreviações de internet (vc, pra, cê, tb, blz) ou vindas de áudio transcrito, DEVEM ser interpretadas normalmente pelo sentido — nunca rejeite um item só porque a escrita é informal.
- Se não conseguir identificar NENHUM item financeiro na mensagem (ex: só um cumprimento, uma pergunta sem contexto financeiro), retorne uma lista vazia: [].
- description é um resumo curto (máx 6 palavras) de cada item.
- REGRA IMPORTANTE: pergunta NÃO é registro. "quanto gastei com uber" é consulta, não uma despesa de uber. Se a frase pede uma informação em vez de contar um fato consumado, é sempre "consulta".
- REGRA IMPORTANTE: guardar dinheiro NÃO é despesa. "guardei 200" é kind "guardado", nunca "transacao".
- Quando a mensagem for "consulta", "ajuda", "meta", "parcela_paga", "editar_recorrente" ou "desfazer", retorne SÓ esse item, sozinho na lista.
- EXCEÇÃO: "recorrente" pode vir em lote. Se a pessoa listar várias assinaturas ou contas fixas numa mensagem só ("59,90 na Netflix / 29,90 no Prime / 30 na Vivo"), retorne UM ITEM PARA CADA. Nunca devolva só a primeira.`;

// Monta o trecho do prompt que ensina as categorias criadas pela própria pessoa.
function blocoCategorias(categoriasExtras) {
  if (!categoriasExtras?.length) return '';
  const despesa = categoriasExtras.filter((c) => c.kind === 'despesa').map((c) => `"${c.name}"`);
  const receita = categoriasExtras.filter((c) => c.kind === 'receita').map((c) => `"${c.name}"`);
  const linhas = ['\n\nCATEGORIAS PERSONALIZADAS DESTA PESSOA (use quando encaixarem melhor que as padrão):'];
  if (despesa.length) linhas.push(`- Despesa: ${despesa.join(', ')}`);
  if (receita.length) linhas.push(`- Receita: ${receita.join(', ')}`);
  return linhas.join('\n');
}

async function extractItems(rawText, categoriasExtras = []) {
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
  const prompt = SYSTEM_PROMPT + blocoCategorias(categoriasExtras);

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await model.generateContent(
        [prompt, `Mensagem do usuário: "${rawText}"`],
        { timeout: 45000 }
      );
      const responseText = result.response.text().trim();
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        throw new Error('Resposta da IA não é uma lista: ' + cleaned.slice(0, 120));
      }
      // Lista vazia é resposta válida (mensagem sem nada financeiro, ex: "oi") — não adianta repetir.
      if (parsed.length === 0) return [];

      return parsed.map((item) => {
        if (item.kind === 'ajuda' || item.kind === 'desfazer') {
          return { kind: item.kind };
        }
        if (item.kind === 'parcela_paga') {
          return { kind: 'parcela_paga', description: item.description || '' };
        }
        if (item.kind === 'recorrente') {
          return {
            kind: 'recorrente',
            description: item.description || rawText.slice(0, 80),
            amount: Math.abs(Number(item.amount)),
            type: item.type === 'receita' ? 'receita' : 'despesa',
            category: item.category || 'Outros',
            dayOfMonth: Number(item.dayOfMonth) || 1,
          };
        }
        if (item.kind === 'guardado') {
          return {
            kind: 'guardado',
            amount: Math.abs(Number(item.amount)),
            direction: item.direction === 'retirar' ? 'retirar' : 'guardar',
            jar: (item.jar || '').trim(),
            description: item.description || rawText.slice(0, 80),
          };
        }
        if (item.kind === 'editar_recorrente') {
          // Escopo inválido cai em "um": mexer num lançamento só é o erro mais barato.
          const escopo = ['um', 'lote', 'todos'].includes(item.escopo) ? item.escopo : 'um';
          return {
            kind: 'editar_recorrente',
            description: (item.description || '').trim(),
            dayOfMonth: Number(item.dayOfMonth) || 0,
            amount: Number(item.amount) || 0,
            escopo,
          };
        }
        if (item.kind === 'meta') {
          return {
            kind: 'meta',
            monthlyTarget: Number(item.monthlyTarget) || 0,
            goalName: item.goalName || '',
            goalTarget: Number(item.goalTarget) || 0,
          };
        }
        if (item.kind === 'consulta') {
          return {
            kind: 'consulta',
            metric: item.metric || 'saldo',
            period: item.period || 'mes',
            category: item.category || '',
          };
        }
        if (item.kind === 'parcelamento') {
          const installments = Math.round(Number(item.installments));
          // A IA às vezes manda só um dos dois valores — o outro se deduz.
          const installmentAmount = Number(item.installmentAmount) || Number(item.total) / installments;
          const total = Number(item.total) || installmentAmount * installments;
          return {
            kind: 'parcelamento',
            installments,
            installmentAmount,
            total,
            category: item.category || 'Outros',
            description: item.description || rawText.slice(0, 80),
          };
        }
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
      // Cota estourada é por minuto — repetir na hora só queima outra requisição.
      if (/429|quota/i.test(err.message)) break;
    }
  }
  throw lastError;
}

module.exports = { extractItems };
