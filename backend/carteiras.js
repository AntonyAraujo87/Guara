// Carteiras: separar o dinheiro pessoal do dinheiro do trabalho.
//
// Saiu do db-service.js porque é a única parte da camada de dados que não fala
// de dinheiro — fala de ONDE o dinheiro mora. As 200 linhas daqui não são
// chamadas por nenhuma das outras 1200, o que faz deste o único corte do
// arquivo que não cria dependência circular.
//
// A conexão, a carteira da vez e o `semAcento` vêm de db-base.js. Pegá-los do
// db-service faria um ciclo: ele reexporta este arquivo.

const {
  supabaseAdmin,
  CARTEIRA_PADRAO,
  semAcento,
  JANELA_CONVERSAO_MS,
} = require('./db-base');

// ── CARTEIRAS ──────────────────────────────────────────────────────
// Separar o dinheiro pessoal do dinheiro do trabalho. Ideia de um usuário:
// quem é autônomo mistura os dois, e um saldo que soma o mercado com o
// pagamento de um cliente não serve pra decidir nada.
//
// Nenhum CPF nem CNPJ é pedido: seria dado sensível sem função. São dois
// nomes, e só.

// Dez porque o seletor do painel é uma fila de botões: além disso ele quebra
// em várias linhas e escolher vira caçada. Não é limite técnico — é o ponto
// onde a tela para de ajudar.
const LIMITE_CARTEIRAS = 10;

// "Nessa mesma carteira" é uma referência, e a IA não tem memória da mensagem
// anterior — ela veria "essa mesma" e sairia procurando uma carteira com esse
// nome. Então quem lembra é o servidor.
//
// Guardado em memória, não no banco: é uma dica de dez minutos, não um dado.
// Perder isso num restart custa uma pergunta a mais; uma coluna nova custa uma
// migração e mais uma coisa pra manter em pé pra sempre.
const MEMORIA_CARTEIRA_MS = 10 * 60 * 1000;
const ultimaCarteiraFalada = new Map();

function lembrarCarteira(phone, nome) {
  if (!nome) return;
  ultimaCarteiraFalada.set(phone, { nome, quando: Date.now() });
  // Sem isto o Map cresce pra sempre num processo de longa duração.
  if (ultimaCarteiraFalada.size > 500) {
    const limite = Date.now() - MEMORIA_CARTEIRA_MS;
    for (const [k, v] of ultimaCarteiraFalada) if (v.quando < limite) ultimaCarteiraFalada.delete(k);
  }
}

function carteiraLembrada(phone) {
  const r = ultimaCarteiraFalada.get(phone);
  if (!r) return null;
  if (Date.now() - r.quando > MEMORIA_CARTEIRA_MS) {
    ultimaCarteiraFalada.delete(phone);
    return null;
  }
  return r.nome;
}

// Palavras com que a pessoa aponta pra uma carteira em vez de nomeá-la.
const APONTA_PRA_CARTEIRA = /^(essa|esta|nessa|nesta|nela|na mesma|essa mesma|nessa mesma|a mesma|mesma|ela|essa ai|essa aí|a de agora|a nova|a que criei|a recem criada|a recém-criada)( carteira| conta)?$/i;

// Resolve o nome que a pessoa disse — inclusive quando ela apontou em vez de
// nomear. Devolve null quando não dá pra ter certeza.
function resolverCarteira(phone, dito, carteiras, ativa) {
  const bruto = String(dito || '').trim();
  if (!bruto) return null;

  if (APONTA_PRA_CARTEIRA.test(semAcento(bruto.toLowerCase()))
      || APONTA_PRA_CARTEIRA.test(bruto)) {
    // A que ela acabou de mencionar; se a lembrança expirou, a mais recente
    // que ela criou; e por último a em que está.
    const lembrada = carteiraLembrada(phone);
    if (lembrada && carteiras.includes(lembrada)) return lembrada;
    return carteiras[carteiras.length - 1] || ativa;
  }

  const alvo = bruto.toLowerCase();
  return carteiras.find((c) => c.toLowerCase() === alvo)
    || carteiras.find((c) => c.toLowerCase().includes(alvo) || alvo.includes(c.toLowerCase()))
    || null;
}

// Qual carteira está valendo agora, e quais existem. Uma consulta só: as duas
// respostas vêm da mesma linha, e o bot precisa das duas em toda mensagem.
async function contextoDeCarteira(phone) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('active_wallet, wallets')
    .eq('phone', phone)
    .maybeSingle();

  // Sem linha ainda, ou banco antigo sem as colunas: cai no padrão. Quem
  // nunca pediu uma segunda carteira não pode quebrar por causa disto.
  const lista = Array.isArray(data?.wallets) && data.wallets.length ? data.wallets : [CARTEIRA_PADRAO];
  const ativa = data?.active_wallet || CARTEIRA_PADRAO;
  return { ativa: lista.includes(ativa) ? ativa : lista[0], carteiras: lista };
}

// As três operações abaixo vivem no Postgres, não aqui. Foram movidas numa
// auditoria, por dois motivos:
//
//   1. Renomear mexe em SEIS tabelas mais a lista de carteiras. Feito daqui,
//      eram sete idas ao banco: falhando na quarta, metade do dinheiro ficava
//      com o nome novo e a lista com o antigo — e o que foi renomeado sumia da
//      tela, num nome de carteira que não existia mais em lugar nenhum.
//
//   2. Criar e apagar liam a lista, mexiam e gravavam de volta. O painel e o
//      WhatsApp ao mesmo tempo faziam um sobrescrever o outro em silêncio.
//
// Dentro do banco, cada função roda numa transação (tudo ou nada) e o
// `for update` segura a linha do usuário, transformando corrida em fila.
//
// O JavaScript continua dono das MENSAGENS: as funções devolvem um código de
// erro seco ('ja_existe', 'demais'), e quem transforma isso em frase é o
// index.js — do mesmo jeito para o WhatsApp e para o painel.

async function chamarCarteira(nomeDaFuncao, args) {
  const { data, error } = await supabaseAdmin.rpc(nomeDaFuncao, args);
  if (error) throw error;
  return data || {};
}

async function criarCarteira(phone, nome) {
  const r = await chamarCarteira('guara_criar_carteira', {
    p_phone: phone,
    p_nome: String(nome || ''),
    p_limite: LIMITE_CARTEIRAS,
  });
  if (!r.erro) lembrarCarteira(phone, r.nome);
  return r;
}

async function renomearCarteira(phone, de, para) {
  const r = await chamarCarteira('guara_renomear_carteira', {
    p_phone: phone,
    p_de: String(de || ''),
    p_para: String(para || ''),
  });
  if (!r.erro) lembrarCarteira(phone, r.para);
  return r;
}

// Trocar não mexe em dado nenhum — muda uma coluna só. Por isso continua
// aqui, e não virou função do banco: transação e trava seriam peso sem motivo.
async function trocarCarteira(phone, nome) {
  const { carteiras, ativa } = await contextoDeCarteira(phone);
  // resolverCarteira entende o nome e também o apontamento ("essa mesma"),
  // que é como a pessoa se refere à carteira recém-criada.
  const alvo = resolverCarteira(phone, nome, carteiras, ativa);
  if (!alvo) return { erro: 'nao_achei', carteiras };
  if (alvo === ativa) return { jaEstava: true, nome: alvo, carteiras };

  const { error } = await supabaseAdmin
    .from('users').update({ active_wallet: alvo }).eq('phone', phone);
  if (error) throw error;
  lembrarCarteira(phone, alvo);
  return { nome: alvo, carteiras };
}

async function apagarCarteira(phone, nome) {
  return chamarCarteira('guara_apagar_carteira', {
    p_phone: phone,
    p_nome: String(nome || ''),
    p_padrao: CARTEIRA_PADRAO,
  });
}

// Move o último lançamento pra outra carteira. É a correção de "caiu no lugar
// errado" — que acontece quando a frase não deixou claro de qual era, ou
// quando a pessoa só percebe depois. Sem isto, o jeito de consertar era apagar
// e redigitar, e ninguém faz isso: deixa errado.
async function moverUltimoParaCarteira(phone, destino) {
  const { carteiras, ativa } = await contextoDeCarteira(phone);
  const alvo = resolverCarteira(phone, destino, carteiras, ativa);
  if (!alvo) return { erro: 'nao_achei', carteiras };
  lembrarCarteira(phone, alvo);

  const desde = new Date(Date.now() - JANELA_CONVERSAO_MS).toISOString();
  const ultimoDe = async (tabela, campos) => {
    const { data } = await supabaseAdmin
      .from(tabela)
      .select(campos)
      .eq('user_phone', phone)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  };

  const [transacao, poupanca, divida, parcela] = await Promise.all([
    ultimoDe('transactions', 'id, created_at, amount, description, wallet'),
    ultimoDe('savings', 'id, created_at, amount, description, wallet'),
    ultimoDe('debts', 'id, created_at, amount, person, description, wallet'),
    ultimoDe('installments', 'id, created_at, purchase_id, amount, description, wallet'),
  ]);

  const candidatos = [
    transacao && { tabela: 'transactions', reg: transacao },
    poupanca && { tabela: 'savings', reg: poupanca },
    divida && { tabela: 'debts', reg: divida },
    parcela && { tabela: 'installments', reg: parcela },
  ].filter(Boolean);
  if (candidatos.length === 0) return { erro: 'nada_recente', carteiras };

  candidatos.sort((a, b) => new Date(b.reg.created_at) - new Date(a.reg.created_at));
  const { tabela, reg } = candidatos[0];
  if (reg.wallet === alvo) return { jaEstava: true, alvo, reg };

  // Parcelamento move a compra inteira: metade das parcelas numa carteira e
  // metade na outra não descreve nada que exista no mundo.
  const consulta = supabaseAdmin.from(tabela).update({ wallet: alvo });
  const { error } = tabela === 'installments'
    ? await consulta.eq('purchase_id', reg.purchase_id)
    : await consulta.eq('id', reg.id);
  if (error) throw error;

  return { de: reg.wallet, para: alvo, reg, tabela };
}

// Quanto guardar por mês pra chegar na meta no prazo.

module.exports = {
  LIMITE_CARTEIRAS,
  lembrarCarteira,
  carteiraLembrada,
  resolverCarteira,
  contextoDeCarteira,
  criarCarteira,
  renomearCarteira,
  trocarCarteira,
  apagarCarteira,
  moverUltimoParaCarteira,
};
