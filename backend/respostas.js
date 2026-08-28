// O que o Guará responde sobre dinheiro: saldo, extrato, parcelas, cofrinho,
// carteiras, e as confirmações de tudo que ele grava.
//
// Todas as funções aqui são PURAS no sentido que importa: leem o banco e
// devolvem texto. Nenhuma manda mensagem, nenhuma decide fluxo. Quem recebe o
// texto e escolhe o que fazer com ele é o index.js.
//
// Essa separação é o que permite o painel e o WhatsApp mostrarem exatamente a
// mesma resposta: as duas pontas chamam a mesma função e só diferem no meio de
// entrega.

const {
  sumTransactions,
  listRecentTransactions,
  sumOpenDebts,
  deleteLastEntry,
  saveInstallments,
  upcomingInstallments,
  savingsSummary,
  savingsByJar,
  getGoal,
  saveGoal,
  getCategories,
  markInstallmentPaid,
  saveRecurring,
  listRecurring,
  updateRecurring,
  converterUltimoEmParcelamento,
  converterUltimoEmRecorrente,
  moverUltimoParaCarteira,
  desmarcarParcela,
  quitarDivida,
  apagarItem,
  editarLancamento,
  renomearCofrinho,
  criarCategoria,
  apagarCategoria,
  contextoDeCarteira,
  criarCarteira,
  trocarCarteira,
  renomearCarteira,
  apagarCarteira,
  CARTEIRA_PADRAO
} = require('./db-service');
const {
  NL,
  currency,
  nomeDoMes,
  rotuloPeriodo,
  listarOpcoes,
  listaDeCarteiras
} = require('./formato');
const {
  PAINEL_URL
} = require('./mensagens');

async function responderConsulta(phone, consulta) {
  const { metric, period, category } = consulta;

  if (metric === 'dividas') {
    const { aReceber, aPagar, linhas } = await sumOpenDebts(phone);
    if (linhas.length === 0) return '🤝 Você não tem nenhum combinado em aberto. Tudo quitado! 🎉';

    const partes = ['*🤝 SEUS COMBINADOS EM ABERTO*', ''];
    if (aReceber > 0) {
      partes.push(`💰 *Tem a receber:* R$ ${currency.format(aReceber)}`);
      for (const d of linhas.filter((l) => l.direction === 'a_receber')) {
        partes.push(`   • R$ ${currency.format(Number(d.amount))}${d.person ? ` — ${d.person}` : ''}`);
      }
      partes.push('');
    }
    if (aPagar > 0) {
      partes.push(`💸 *Tem a pagar:* R$ ${currency.format(aPagar)}`);
      for (const d of linhas.filter((l) => l.direction === 'a_pagar')) {
        partes.push(`   • R$ ${currency.format(Number(d.amount))}${d.person ? ` — ${d.person}` : ''}`);
      }
    }
    return partes.join('\n');
  }

  if (metric === 'guardado') {
    const { total, noMes } = await savingsSummary(phone);
    const meta = await getGoal(phone);

    if (total === 0 && !meta) {
      return 'Você ainda não guardou nada. 🐷\n\nQuando guardar, me fala: _"guardei 200"_\nE se quiser uma meta: _"quero guardar 300 por mês"_';
    }

    const partes = ['*🐷 SEU COFRINHO*', '', `Total guardado: *R$ ${currency.format(total)}*`];
    partes.push(`Guardado neste mês: R$ ${currency.format(noMes)}`);

    // Só vale listar os potes quando existe mais de um — com um só, seria repetir o total.
    const potes = await savingsByJar(phone);
    if (potes.length > 1) {
      partes.push('', '*Seus cofrinhos:*');
      for (const p of potes) {
        partes.push(`   🫙 ${p.nome}: R$ ${currency.format(p.total)}`);
      }
    }

    const alvo = Number(meta?.monthly_target) || 0;
    if (alvo > 0) {
      const falta = alvo - noMes;
      const pct = Math.max(0, Math.min(100, Math.round((noMes / alvo) * 100)));
      partes.push('', `🎯 *Meta do mês:* R$ ${currency.format(alvo)} (${pct}%)`);
      partes.push(falta <= 0 ? '✅ Meta batida! 🎉' : `Faltam R$ ${currency.format(falta)}.`);
    }

    const objetivo = Number(meta?.goal_target) || 0;
    if (objetivo > 0) {
      const pct = Math.min(100, Math.round((total / objetivo) * 100));
      const falta = objetivo - total;
      partes.push('', `🏁 *${meta.goal_name || 'Objetivo'}:* R$ ${currency.format(objetivo)} (${pct}%)`);
      if (falta > 0) partes.push(`Faltam R$ ${currency.format(falta)}.`);
      else partes.push('✅ Objetivo alcançado! 🎉');
    }

    return partes.join('\n');
  }

  if (metric === 'parcelas') {
    const meses = await upcomingInstallments(phone, 12);
    if (meses.length === 0) {
      return 'Você não tem nenhuma parcela em aberto. 🎉\n\nQuando parcelar algo, me fala: _"comprei uma TV em 6x de 200"_';
    }

    const totalGeral = meses.reduce((s, m) => s + m.total, 0);
    const partes = ['*💳 SUAS PRÓXIMAS PARCELAS*', '', `Total comprometido: *R$ ${currency.format(totalGeral)}*`, ''];

    for (const m of meses.slice(0, 6)) {
      partes.push(`*${nomeDoMes(m.mes)}* — R$ ${currency.format(m.total)}`);
      for (const p of m.parcelas) {
        partes.push(`   • ${p.description} (${p.installment_number}/${p.installments_total}): R$ ${currency.format(Number(p.amount))}`);
      }
      partes.push('');
    }
    if (meses.length > 6) partes.push(`_...e mais ${meses.length - 6} meses._`, '');
    partes.push(`Ver tudo mês a mês 👉 ${PAINEL_URL}`);
    return partes.join('\n');
  }

  if (metric === 'extrato') {
    const linhas = await listRecentTransactions(phone, 5);
    if (linhas.length === 0) return 'Você ainda não tem nenhum lançamento. Me conta um gasto que eu anoto! 😊';

    const itens = linhas.map((t) => {
      const sinal = t.type === 'receita' ? '+' : '−';
      const data = new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return `${sinal}R$ ${currency.format(Number(t.amount))} — ${t.description || t.category} _(${data})_`;
    });
    return `*📋 SEUS ÚLTIMOS LANÇAMENTOS*\n\n${itens.join('\n')}\n\nVer tudo 👉 ${PAINEL_URL}`;
  }

  const r = await sumTransactions(phone, period, category);
  const doQue = category ? ` com *${category}*` : '';

  if (r.quantidade === 0) {
    return `Não achei nenhum lançamento${doQue} ${r.label}. 🤔\n\nMe conta um gasto que eu anoto na hora!`;
  }

  if (metric === 'entradas') {
    return `*💰 ENTRADAS ${r.label.toUpperCase()}*\n\nR$ ${currency.format(r.entradas)}`;
  }

  if (metric === 'gastos') {
    const partes = [`*💸 GASTOS ${r.label.toUpperCase()}*${doQue ? `\n_(só ${category})_` : ''}`, '', `R$ ${currency.format(r.saidas)}`];
    if (!category && r.topCategorias.length > 0) {
      partes.push('', '*Onde foi:*');
      for (const c of r.topCategorias) {
        partes.push(`   • ${c.nome}: R$ ${currency.format(c.valor)}`);
      }
    }
    return partes.join('\n');
  }

  // saldo (padrão)
  const emoji = r.saldo >= 0 ? '🟢' : '🔴';
  const recado = r.saldo >= 0 ? 'Você está no azul! 🎉' : 'Você gastou mais do que entrou. 😬';
  return [
    `*${emoji} SEU SALDO ${r.label.toUpperCase()}*`,
    '',
    `R$ ${currency.format(r.saldo)}`,
    '',
    `💰 Entrou: R$ ${currency.format(r.entradas)}`,
    `💸 Saiu: R$ ${currency.format(r.saidas)}`,
    '',
    recado,
  ].join('\n');
}

async function responderDesfazer(phone) {
  const apagado = await deleteLastEntry(phone);
  if (!apagado) return 'Não achei nenhum registro seu pra apagar. 🤔';

  const { tipo, reg } = apagado;
  const valor = currency.format(Math.abs(Number(reg.amount)));
  let linha;

  if (tipo === 'transacao') {
    const sinal = reg.type === 'receita' ? '+' : '−';
    linha = `${reg.description || reg.category}\n${sinal}R$ ${valor} (${reg.category})`;
  } else if (tipo === 'guardado') {
    linha = `${Number(reg.amount) > 0 ? 'Guardado' : 'Retirada'} de R$ ${valor} do cofrinho`;
  } else if (tipo === 'divida') {
    linha = `${reg.direction === 'a_receber' ? 'A receber' : 'A pagar'}: R$ ${valor}${reg.person ? ` (${reg.person})` : ''}`;
  } else {
    linha = `${reg.description} — parcelamento inteiro (${reg.installments_total}x)`;
  }

  return `↩️ *Apaguei:*\n${linha}\n\nPode mandar de novo do jeito certo. 😉`;
}

async function responderMeta(phone, item) {
  if (item.monthlyTarget <= 0 && item.goalTarget <= 0) {
    return 'Não entendi o valor da meta. 🤔\nTenta assim: _"quero guardar 200 por mês"_ ou _"quero juntar 5000 pra viagem"_.';
  }

  const salva = await saveGoal(phone, item);
  const { total } = await savingsSummary(phone);

  const partes = ['🎯 *Meta anotada!*', ''];
  if (Number(salva.monthly_target) > 0) {
    partes.push(`📅 Guardar *R$ ${currency.format(Number(salva.monthly_target))}* por mês.`);
  }
  if (Number(salva.goal_target) > 0) {
    const pct = Math.min(100, Math.round((total / Number(salva.goal_target)) * 100));
    partes.push(`🏁 Juntar *R$ ${currency.format(Number(salva.goal_target))}*${salva.goal_name ? ` pra ${salva.goal_name}` : ''}.`);
    partes.push(`Você já tem R$ ${currency.format(total)} (${pct}%).`);
  }
  partes.push('', 'Quando guardar, é só me falar: _"guardei 200"_ 🐷');
  return partes.join('\n');
}

async function responderParcelaPaga(phone, itens) {
  const lista = itens?.length ? itens : [{ description: '' }];
  const pagas = [];
  const naoAchadas = [];

  for (const item of lista) {
    const paga = await markInstallmentPaid(phone, item.description);
    if (paga) pagas.push(paga);
    else naoAchadas.push(item.description || '');
  }

  if (pagas.length === 0) {
    const nome = naoAchadas.find(Boolean);
    return nome
      ? `Não achei nenhuma parcela em aberto de "${nome}". 🤔\nManda *"quais minhas parcelas"* que eu te mostro o que tem.`
      : 'Você não tem nenhuma parcela em aberto. 🎉';
  }

  const restantes = await upcomingInstallments(phone, 24);
  const total = restantes.reduce((s, m) => s + m.total, 0);

  const partes = [];
  if (pagas.length === 1) {
    const p = pagas[0];
    partes.push(
      '✅ *Parcela paga!*',
      `${p.description} — parcela ${p.installment_number} de ${p.installments_total}`,
      `R$ ${currency.format(Number(p.amount))}`
    );
  } else {
    partes.push(`✅ *${pagas.length} parcelas pagas!*`, '');
    for (const p of pagas) {
      partes.push(`• ${p.description} — ${p.installment_number}/${p.installments_total} — R$ ${currency.format(Number(p.amount))}`);
    }
  }

  // Quitar uma e ignorar a outra em silêncio deixaria a pessoa achando que
  // estava tudo certo até dar de cara com a parcela em aberto no painel.
  const perdidas = naoAchadas.filter(Boolean);
  if (perdidas.length) {
    partes.push('', `⚠️ Não achei parcela em aberto de: *${perdidas.join('*, *')}*`);
  }

  partes.push('', total > 0
    ? `Ainda faltam R$ ${currency.format(total)} em parcelas.`
    : 'Era a última! Você não tem mais nada parcelado. 🎉');

  // Parcela paga sai do saldo do mês em que vence. Dizer aqui evita a pessoa
  // ver o número mudar depois, no painel, sem entender o motivo.
  const { saldo } = await sumTransactions(phone, 'mes');
  partes.push(`*Saldo do mês:* R$ ${currency.format(saldo)}`);
  return partes.join('\n');
}

async function responderConverter(phone, item) {
  const ehParcela = item.para === 'parcelamento';

  // Faltou o número: PERGUNTA, em vez de errar um palpite. A resposta curta
  // ("6x", "dia 10") volta como converter_ultimo e cai aqui completa.
  if (ehParcela && item.installments <= 0) {
    return `Beleza, vou marcar como parcelado. 💳

*Em quantas vezes?*
Me responde só o número, tipo: _"6x"_`;
  }
  if (!ehParcela && item.dayOfMonth <= 0 && item.amount <= 0) {
    return `Entendi, é uma conta que se repete todo mês. 🔁

*Cai em que dia?*
Me responde tipo: _"dia 10"_

Se não souber o dia certo, é só dizer _"não sei"_ que eu uso o de hoje.`;
  }

  const r = ehParcela
    ? await converterUltimoEmParcelamento(phone, item)
    : await converterUltimoEmRecorrente(phone, item);

  if (!r) {
    return `Não achei nenhum lançamento recente pra converter. 🤔

Me manda o gasto primeiro, tipo _"IPTU 200"_, e aí me diz que é parcelado.`;
  }

  if (ehParcela) {
    const total = r.valorParcela * r.installments;
    const proximas = await upcomingInstallments(phone, 3);
    const partes = [
      '💳 *Convertido em parcelamento!*',
      '',
      `${r.origem.description || r.origem.category} — ${r.installments}x de R$ ${currency.format(r.valorParcela)}`,
      `Total: R$ ${currency.format(total)}`,
      '',
      'Espalhei as parcelas nos próximos meses. 📅',
    ];
    if (proximas.length > 0) {
      partes.push('', `Próxima em ${nomeDoMes(proximas[0].mes)}: R$ ${currency.format(proximas[0].total)}`);
    }
    partes.push('', `Veja mês a mês no painel 👉 ${PAINEL_URL}`);
    return partes.join('\n');
  }

  const rec = r.recorrente;
  return [
    '🔁 *Virou conta mensal!*',
    '',
    `${rec.description} — R$ ${currency.format(Number(rec.amount))}`,
    `Todo dia *${rec.day_of_month}* eu lanço sozinho pra você. 😉`,
    '',
    '_O lançamento de agora continua valendo: ele é o deste mês._',
  ].join('\n');
}

async function responderRecorrente(phone, itens) {
  const validos = (itens || []).filter((i) => i.amount > 0);
  if (validos.length === 0) {
    return 'Não entendi o valor. 🤔\nTenta assim: _"todo mês pago 50 de Netflix"_';
  }

  const salvos = [];
  for (const item of validos) {
    try {
      salvos.push(await saveRecurring(phone, item));
    } catch (err) {
      console.error('Falha ao salvar recorrente:', item.description, err.message);
    }
  }
  if (salvos.length === 0) {
    return 'Não consegui anotar agora. 😕\nTenta de novo daqui a pouco, por favor.';
  }

  const partes = [];
  if (salvos.length === 1) {
    const s = salvos[0];
    const verbo = s.type === 'receita' ? 'Recebimento' : 'Gasto';
    partes.push(
      s.atualizado ? `🔁 *${verbo} mensal atualizado!*` : `🔁 *${verbo} mensal anotado!*`,
      '',
      `${s.description} — R$ ${currency.format(Number(s.amount))}`,
      `Todo dia *${s.day_of_month}* eu lanço sozinho pra você. 😉`
    );
  } else {
    const novos = salvos.filter((s) => !s.atualizado).length;
    const mexidos = salvos.length - novos;
    const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;
    const titulo = mexidos === 0 ? `${salvos.length} lançamentos mensais anotados!`
      : novos === 0 ? `${salvos.length} lançamentos mensais atualizados!`
      : `${plural(novos, 'anotado', 'anotados')} e ${plural(mexidos, 'atualizado', 'atualizados')}!`;
    partes.push(`🔁 *${titulo}*`, '');
    for (const s of salvos) {
      partes.push(`${s.type === 'receita' ? '💰' : '💸'} ${s.description} — R$ ${currency.format(Number(s.amount))} _(dia ${s.day_of_month})_`);
    }
    partes.push('', 'Eu lanço todos sozinho, no dia certo. 😉');
  }

  // Separar gasto de entrada: somar tudo junto daria um número que não significa nada.
  const lista = await listRecurring(phone);
  const soma = (tipo) => lista.filter((r) => r.type === tipo).reduce((s, r) => s + Number(r.amount), 0);
  const despesas = lista.filter((r) => r.type === 'despesa');
  const receitas = lista.filter((r) => r.type === 'receita');

  if (lista.length > salvos.length) {
    partes.push('', '*📋 SEU MÊS FIXO*');
    if (despesas.length) partes.push(`💸 ${despesas.length} gasto${despesas.length > 1 ? 's' : ''} — R$ ${currency.format(soma('despesa'))}`);
    if (receitas.length) partes.push(`💰 ${receitas.length} entrada${receitas.length > 1 ? 's' : ''} — R$ ${currency.format(soma('receita'))}`);
    const sobra = soma('receita') - soma('despesa');
    if (receitas.length && despesas.length) {
      partes.push(sobra >= 0
        ? `✅ Sobram R$ ${currency.format(sobra)} por mês`
        : `⚠️ Faltam R$ ${currency.format(Math.abs(sobra))} por mês`);
    }
  }
  return partes.join('\n');
}

async function responderEditarRecorrente(phone, itens) {
  const pedidos = (itens || []).filter((i) => i.dayOfMonth > 0 || i.amount > 0);
  if (pedidos.length === 0) {
    return 'Não entendi o que mudar. 🤔\nTenta assim: _"muda o salário pro dia 5"_ ou _"o aluguel agora é 1300"_.';
  }

  // "muda a Netflix, o Prime e a Vivo pro dia 11" chega como três pedidos.
  // Cada um mexe no seu, e o Set evita contar duas vezes se dois pedidos
  // acabarem caindo no mesmo lançamento.
  const alvos = [];
  const vistos = new Set();
  const naoAchados = [];

  for (const pedido of pedidos) {
    let r;
    try {
      r = await updateRecurring(phone, pedido);
    } catch (err) {
      console.error('Falha ao editar recorrente:', pedido.description, err.message);
      naoAchados.push(pedido.description || '');
      continue;
    }
    if (!r) {
      naoAchados.push(pedido.description || '');
      continue;
    }
    for (const a of r.alvos) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      alvos.push(a);
    }
  }

  if (alvos.length === 0) {
    const nome = naoAchados.find(Boolean);
    return nome
      ? `Não achei nenhum lançamento mensal de "${nome}". 🤔`
      : 'Você ainda não tem nenhum lançamento mensal cadastrado.\nPra criar: _"todo mês pago 50 de Netflix"_';
  }

  const partes = [];
  if (alvos.length === 1) {
    const a = alvos[0];
    partes.push(
      '✏️ *Corrigido!*',
      '',
      `${a.description} — R$ ${currency.format(Number(a.amount))}`,
      `Agora eu lanço todo dia *${a.day_of_month}*. 😉`
    );
  } else {
    // Em lote a pessoa não vê o que foi tocado — listar tudo é o que deixa ela
    // perceber na hora se eu peguei um lançamento que não era pra pegar.
    partes.push(`✏️ *${alvos.length} lançamentos corrigidos!*`, '');
    for (const a of alvos) {
      partes.push(`${a.type === 'receita' ? '💰' : '💸'} ${a.description} — R$ ${currency.format(Number(a.amount))} _(dia ${a.day_of_month})_`);
    }
    partes.push('', 'Se peguei algum sem querer, é só me falar qual. 😉');
  }

  // Mudar três de quatro e só confirmar os três é o bug que estamos corrigindo.
  const perdidos = naoAchados.filter(Boolean);
  if (perdidos.length) {
    partes.push('', `⚠️ Não achei lançamento mensal de: *${perdidos.join('*, *')}*`);
  }
  return partes.join('\n');
}

async function responderCarteira(phone, item, ativa) {
  const { acao, nome, novoNome } = item;

  if (acao === 'listar') {
    const { carteiras } = await contextoDeCarteira(phone);
    if (carteiras.length === 1) {
      return [
        `Você tem uma carteira só: *${carteiras[0]}*. 👛`,
        '',
        'Dá pra separar o dinheiro do trabalho do dinheiro de casa, se quiser. É só dizer:',
        '_"cria uma carteira da empresa"_',
        '',
        '_Cada carteira tem saldo, gastos e cofrinhos próprios._',
      ].join(NL);
    }
    return [
      '👛 *Suas carteiras*',
      '',
      listaDeCarteiras(carteiras, ativa),
      '',
      'Pra mudar: _"muda pra ' + carteiras.find((c) => c !== ativa) + '"_',
      'Pra lançar sem mudar: _"gastei 50 na ' + carteiras.find((c) => c !== ativa) + '"_',
    ].join(NL);
  }

  if (acao === 'criar') {
    if (!nome) {
      return [
        'Boa ideia! 👛 Como você quer chamar a carteira nova?',
        '',
        'Me diz tipo: _"cria a carteira Empresa"_',
      ].join(NL);
    }
    const r = await criarCarteira(phone, nome);
    if (r.erro === 'ja_existe') return `Você já tem a carteira *${r.nome}*. 😉 Pra ir pra ela: _"muda pra ${r.nome}"_`;
    if (r.erro === 'demais') {
      return [
        `Você já tem ${r.carteiras.length} carteiras, que é o máximo. 😅`,
        '',
        listaDeCarteiras(r.carteiras, ativa),
        '',
        'Apaga uma que não usa pra abrir espaço — o dinheiro dela não some, volta pra *' + CARTEIRA_PADRAO + '*.',
      ].join(NL);
    }
    if (r.erro) return 'Como você quer chamar a carteira? Me diz tipo: _"cria a carteira Empresa"_';

    // Criar não troca de contexto, e isso precisa ficar explícito: quem achasse
    // que entrou nela mandaria o próximo gasto pensando que vai pra lá.
    return [
      `👛 *Carteira ${r.nome} criada!*`,
      '',
      `Você continua na *${ativa}* — nada mudou de lugar.`,
      '',
      `Pra lançar nela: _"gastei 50 na ${r.nome.toLowerCase()}"_`,
      `ou _"nessa mesma carteira, gastei 50"_`,
      `Pra ficar nela: _"muda pra ${r.nome.toLowerCase()}"_`,
    ].join(NL);
  }

  if (acao === 'trocar') {
    const r = await trocarCarteira(phone, nome);
    if (r.erro === 'nao_achei') {
      return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
    }
    if (r.jaEstava) return `Você já está na *${r.nome}*. 👛`;
    return [
      `👛 Agora você está na carteira *${r.nome}*.`,
      '',
      'Tudo que você mandar daqui pra frente cai aqui.',
    ].join(NL);
  }

  if (acao === 'renomear') {
    const r = await renomearCarteira(phone, nome, novoNome);
    if (r.erro === 'sem_nome') return 'Qual o nome novo? Me diz tipo: _"renomeia a carteira empresa pra loja"_';
    if (r.erro === 'ja_existe') return `Você já tem uma carteira chamada *${r.nome}*. Escolhe outro nome.`;
    if (r.erro) return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
    return `👛 A carteira *${r.de}* agora se chama *${r.para}*.${NL}${NL}Nada foi movido — só o nome mudou.`;
  }

  // apagar
  const r = await apagarCarteira(phone, nome);
  if (r.erro === 'e_a_padrao') return `A *${CARTEIRA_PADRAO}* não dá pra apagar — é onde tudo cai por padrão. 🙂`;
  if (r.erro === 'ultima') return 'Essa é sua única carteira, não dá pra apagar. 🙂';
  if (r.erro) return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
  return [
    `👛 Carteira *${r.nome}* apagada.`,
    '',
    r.movidos > 0
      ? `Os ${r.movidos} lançamentos dela foram pra *${CARTEIRA_PADRAO}* — nada foi perdido.`
      : 'Ela estava vazia, então não movi nada.',
  ].join(NL);
}

// "Esse foi da empresa" logo depois de lançar. Sem isto, consertar exigia
// apagar e redigitar — e ninguém faz isso, deixa errado.
async function responderMoverCarteira(phone, item, ativa) {
  if (!item.para) {
    const { carteiras } = await contextoDeCarteira(phone);
    return ['Pra qual carteira?', '', listaDeCarteiras(carteiras, ativa)].join(NL);
  }

  const r = await moverUltimoParaCarteira(phone, item.para);
  if (r.erro === 'nao_achei') {
    return ['Não achei essa carteira. 🤔 Você tem:', '', listaDeCarteiras(r.carteiras, ativa)].join(NL);
  }
  if (r.erro === 'nada_recente') {
    return 'Não achei nenhum lançamento recente pra mover. 🤔';
  }
  if (r.jaEstava) return `Esse já está na *${r.alvo}*. 👛`;

  const nome = r.reg.description || r.reg.person || 'o lançamento';
  return [
    '👛 *Movido!*',
    '',
    `${nome} — R$ ${currency.format(Number(r.reg.amount))}`,
    `${r.de} → *${r.para}*`,
  ].join(NL);
}

async function responderEditarLancamento(phone, item) {
  const r = await editarLancamento(phone, item);

  if (r.semMudanca) {
    return [
      'Entendi que você quer corrigir, mas não achei o que mudar. 🤔',
      '',
      'Me diz o valor novo, tipo: _"aquele mercado era 45"_',
    ].join(NL);
  }
  if (r.opcoes.length > 0) return listarOpcoes(r.opcoes, 'corrigir');
  if (!r.depois) {
    return [
      `Não achei nenhum lançamento com esse nome. 🤔`,
      '',
      'Tenta me dizer do jeito que você anotou, ou peça _"meus últimos gastos"_ pra ver a lista.',
    ].join(NL);
  }

  const { antes, depois } = r;
  const mudou = [];
  if (Number(antes.amount) !== Number(depois.amount)) {
    mudou.push(`R$ ${currency.format(Number(antes.amount))} → *R$ ${currency.format(Number(depois.amount))}*`);
  }
  if (antes.category !== depois.category) mudou.push(`${antes.category} → *${depois.category}*`);
  if (antes.description !== depois.description) mudou.push(`${antes.description} → *${depois.description}*`);

  return ['✏️ *Corrigido!*', '', depois.description, ...mudou].join(NL);
}

async function responderApagarItem(phone, item) {
  const r = await apagarItem(phone, item.tipo, item.description);
  if (r.opcoes.length > 0) return listarOpcoes(r.opcoes, 'apagar');

  const rotulo = NOME_DO_TIPO[item.tipo] || 'lançamento';
  if (!r.alvo) {
    return [
      `Não achei nenhum(a) ${rotulo} com esse nome. 🤔`,
      '',
      'Confere o nome e me manda de novo — ou digite *ajuda* pra ver o que dá pra fazer.',
    ].join(NL);
  }

  const nome = r.alvo.description || r.alvo.person || r.alvo.jar || rotulo;
  const valor = `R$ ${currency.format(Number(r.alvo.amount))}`;

  if (item.tipo === 'recorrente') {
    return `🚫 *${nome}* cancelado.${NL}${NL}Não lanço mais os ${valor} todo mês. O que já foi lançado antes continua no histórico.`;
  }
  if (item.tipo === 'parcelamento') {
    return `🚫 Parcelamento de *${nome}* cancelado.${NL}${NL}Tirei as ${r.alvo.installments_total} parcelas de ${valor}.`;
  }
  return `🗑️ Apaguei: *${nome}* — ${valor}.`;
}

async function responderQuitarDivida(phone, item) {
  const r = await quitarDivida(phone, item.description);
  if (r.opcoes.length > 0) return listarOpcoes(r.opcoes, 'quitar');
  if (!r.alvo) {
    return [
      'Não achei nenhuma dívida em aberto com esse nome. 🤔',
      '',
      'Pergunta _"quanto eu devo?"_ que eu te mostro as que estão abertas.',
    ].join(NL);
  }

  const { aReceber, aPagar } = await sumOpenDebts(phone);
  const quem = r.alvo.person || 'essa dívida';
  const valor = `R$ ${currency.format(Number(r.alvo.amount))}`;
  const cabeca = r.alvo.direction === 'a_receber'
    ? `🤝 *${quem} te pagou!*${NL}${NL}${valor} quitados.`
    : `🤝 *Dívida quitada!*${NL}${NL}Você pagou ${valor} pra ${quem}.`;

  const sobra = [];
  if (aReceber > 0) sobra.push(`Ainda têm a te pagar: R$ ${currency.format(aReceber)}`);
  if (aPagar > 0) sobra.push(`Você ainda deve: R$ ${currency.format(aPagar)}`);
  return sobra.length ? [cabeca, '', ...sobra].join(NL) : `${cabeca}${NL}${NL}Não sobrou nenhuma dívida em aberto. 🎉`;
}

async function responderDesmarcarParcela(phone, item) {
  const alvo = await desmarcarParcela(phone, item.description);
  if (!alvo) {
    return [
      'Não achei nenhuma parcela marcada como paga pra desmarcar. 🤔',
      '',
      'Pergunta _"quais minhas parcelas?"_ que eu te mostro como estão.',
    ].join(NL);
  }
  return [
    '↩️ *Desmarquei!*',
    '',
    `${alvo.description} — parcela ${alvo.installment_number} de ${alvo.installments_total}`,
    `R$ ${currency.format(Number(alvo.amount))} voltou pra lista de parcelas em aberto.`,
  ].join(NL);
}

async function responderRenomearCofrinho(phone, item) {
  if (!item.para) {
    return 'Como você quer chamar o cofrinho? Me diz tipo: _"renomeia o secador pra casa nova"_';
  }
  const r = await renomearCofrinho(phone, item.de, item.para);
  if (!r) {
    const potes = await savingsByJar(phone);
    if (potes.length === 0) return 'Você ainda não tem nenhum cofrinho. 🐷 Guarde algo primeiro, tipo _"guardei 100 na viagem"_.';
    return [
      'Não achei esse cofrinho. 🤔 Os seus são:',
      '',
      ...potes.map((x) => `• *${x.nome}* — R$ ${currency.format(x.total)}`),
    ].join(NL);
  }
  return `🐷 Pronto! O cofrinho *${r.de}* agora se chama *${r.para}*.${NL}${NL}Os R$ ${currency.format(r.total)} continuam lá.`;
}

async function responderCategoria(phone, item) {
  if (!item.nome) return 'Qual categoria? Me diz tipo: _"cria a categoria Pets"_';

  if (item.acao === 'apagar') {
    const alvo = await apagarCategoria(phone, item.nome);
    if (!alvo) {
      const atuais = await getCategories(phone);
      return atuais.length
        ? ['Não achei essa categoria. 🤔 As suas são:', '', ...atuais.map((c) => `• ${c}`)].join(NL)
        : 'Você ainda não criou nenhuma categoria própria. 🏷️';
    }
    return `🏷️ Categoria *${alvo.name}* apagada.${NL}${NL}_Os lançamentos que estavam nela continuam onde estão._`;
  }

  const r = await criarCategoria(phone, item.nome);
  if (!r) return 'Qual categoria? Me diz tipo: _"cria a categoria Pets"_';
  return r.jaExistia
    ? `Você já tem a categoria *${r.nome}*. 😉 Pode usar à vontade.`
    : `🏷️ Categoria *${r.nome}* criada!${NL}${NL}Agora é só usar: _"paguei 50 em ${r.nome.toLowerCase()}"_`;
}

// O gráfico do painel, em texto. Barras de blocos porque é o que o WhatsApp
// desenha igual em qualquer aparelho — emoji e tabela quebram o alinhamento.
async function responderResumo(phone, period) {
  const { saidas, entradas, categorias, label } = await sumTransactions(phone, period || 'mes');
  const cats = (categorias || []).filter((c) => c.valor > 0);

  if (cats.length === 0) {
    return `Ainda não tem gasto nenhum ${rotuloPeriodo(period, label)} pra resumir. 🐺`;
  }

  // Barra de blocos porque é o único desenho que o WhatsApp alinha igual em
  // qualquer aparelho — tabela e emoji quebram dependendo da fonte.
  const LARGURA = 10;
  const maior = cats[0].valor;
  const linhas = cats.slice(0, 8).map(({ nome, valor }) => {
    const cheios = Math.max(1, Math.round((valor / maior) * LARGURA));
    const fatia = saidas > 0 ? Math.round((valor / saidas) * 100) : 0;
    const barra = '▓'.repeat(cheios) + '░'.repeat(LARGURA - cheios);
    return `${barra}  ${fatia}%${NL}*${nome}* — R$ ${currency.format(valor)}`;
  });

  const partes = [
    `*📊 PRA ONDE FOI O DINHEIRO*`,
    `_${rotuloPeriodo(period, label)}_`,
    '',
    linhas.join(NL + NL),
    '',
    `Total que saiu: *R$ ${currency.format(saidas)}*`,
  ];
  if (entradas > 0) partes.push(`Total que entrou: R$ ${currency.format(entradas)}`);
  if (cats.length > 8) partes.push(`_(+ ${cats.length - 8} categorias menores)_`);
  partes.push('', `Gráfico colorido no painel 👉 ${PAINEL_URL}`);
  return partes.join(NL);
}

async function confirmarGuardado(phone, item) {
  const { total, noMes } = await savingsSummary(phone);
  const meta = await getGoal(phone);

  const partes = [];
  const nomePote = (item.jar || '').trim();
  const ondePote = nomePote ? ` no cofrinho *${nomePote}*` : '';
  if (item.direction === 'retirar') {
    partes.push(`↩️ Tirei R$ ${currency.format(item.amount)}${ondePote}.`);
  } else {
    partes.push(`🐷 Guardei R$ ${currency.format(item.amount)}${ondePote}!`);
  }
  partes.push('', `*Você tem guardado:* R$ ${currency.format(total)}`);

  // Guardar tira do saldo do mês. Sem dizer aqui, a pessoa só descobriria
  // olhando o painel, e acharia que sumiu dinheiro.
  const { saldo } = await sumTransactions(phone, 'mes');
  partes.push(`*Saldo do mês:* R$ ${currency.format(saldo)}`);

  const alvo = Number(meta?.monthly_target) || 0;
  if (alvo > 0) {
    const falta = alvo - noMes;
    partes.push('', `🎯 *Meta do mês:* R$ ${currency.format(alvo)}`);
    partes.push(`Já guardou R$ ${currency.format(noMes)} este mês.`);
    partes.push(falta <= 0
      ? '✅ Meta batida! Mandou bem! 🎉'
      : `Faltam R$ ${currency.format(falta)} pra bater. Bora! 💪`);
  }

  const objetivo = Number(meta?.goal_target) || 0;
  if (objetivo > 0) {
    const pct = Math.min(100, Math.round((total / objetivo) * 100));
    partes.push('', `🏁 *${meta.goal_name || 'Objetivo'}:* R$ ${currency.format(total)} de R$ ${currency.format(objetivo)} (${pct}%)`);
  }

  return partes.join('\n');
}

async function perguntaDeAssinatura(phone, saved) {
  if (saved.length !== 1) return '';
  const item = saved[0];
  if (item.kind !== 'transacao' || !item.assinatura) return '';

  // Se já existe recorrente com esse nome, a pergunta seria repetitiva —
  // e a resposta "sim" só sobrescreveria o que já está certo.
  const jaTem = await listRecurring(phone);
  const nome = (item.description || '').toLowerCase();
  if (jaTem.some((r) => nome.includes(r.description.toLowerCase()) || r.description.toLowerCase().includes(nome))) {
    return '';
  }

  return `\n\n_Isso é todo mês?_ Responde *sim* que eu deixo automático. 🔁`;
}

// Cada parcela vira uma linha com o mês em que vence — é isso que permite
// navegar pros meses da frente e ver o que já está comprometido.
async function salvarParcelamento(phone, item) {
  return saveInstallments(phone, {
    description: item.description,
    category: item.category,
    installments: item.installments,
    installmentAmount: item.installmentAmount,
  });
}

module.exports = {
  responderConsulta,
  responderDesfazer,
  responderMeta,
  responderParcelaPaga,
  responderConverter,
  responderRecorrente,
  responderEditarRecorrente,
  responderCarteira,
  responderMoverCarteira,
  responderEditarLancamento,
  responderApagarItem,
  responderQuitarDivida,
  responderDesmarcarParcela,
  responderRenomearCofrinho,
  responderCategoria,
  responderResumo,
  confirmarGuardado,
  perguntaDeAssinatura,
  salvarParcelamento,
};
