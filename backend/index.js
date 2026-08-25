require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { extractItems } = require('./ai-service');
const { saveTransaction, saveDebt } = require('./db-service');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

const webhookLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

const { EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, PORT } = process.env;

const currency = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Evita reprocessar a mesma mensagem se o WhatsApp reconectar e reentregar (in-memory, por processo)
const processedMessageIds = new Set();

app.post('/webhook', webhookLimiter, async (req, res) => {
  if (req.header('x-webhook-secret') !== process.env.WEBHOOK_SECRET) {
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  try {
    if (req.body?.event !== 'messages.upsert') return;

    const data = req.body.data;
    if (data?.key?.fromMe) return;
    if (data?.key?.remoteJid?.endsWith('@g.us')) return; // ignora mensagens de grupo

    const messageId = data?.key?.id;
    if (messageId) {
      if (processedMessageIds.has(messageId)) return;
      processedMessageIds.add(messageId);
      if (processedMessageIds.size > 2000) processedMessageIds.clear();
    }

    const text = data?.message?.conversation || data?.message?.extendedTextMessage?.text;
    if (!text) return;

    const phone = data.key.remoteJid.split('@')[0];

    const items = await extractItems(text);
    const saved = [];
    for (const item of items) {
      try {
        if (item.kind === 'divida') await saveDebt(phone, item);
        else await saveTransaction(phone, item);
        saved.push(item);
      } catch (err) {
        console.error('Erro ao salvar item:', err.message, JSON.stringify(item));
      }
    }
    if (saved.length > 0) await replyWhatsApp(phone, formatConfirmation(saved));
  } catch (err) {
    console.error('Erro ao processar webhook:', err.message);
  }
});

function formatLine(item) {
  if (item.kind === 'divida') {
    const quem = item.person ? ` (${item.person})` : '';
    return item.direction === 'a_receber'
      ? `📝 A receber: R$ ${currency.format(item.amount)}${quem}`
      : `📝 A pagar: R$ ${currency.format(item.amount)}${quem}`;
  }
  const sinal = item.type === 'receita' ? '+' : '-';
  return `${sinal}R$ ${currency.format(item.amount)} (${item.category})`;
}

function formatConfirmation(items) {
  if (items.length === 1) {
    const item = items[0];
    const emoji = item.kind === 'divida' ? '📝' : '✅';
    return `${emoji} ${formatLine(item).replace(/^📝 /, '')}`;
  }

  const linhas = items.map(formatLine);
  const transacoes = items.filter((item) => item.kind === 'transacao');
  const dividas = items.filter((item) => item.kind === 'divida');

  const totais = [];
  if (transacoes.length > 0) {
    const saldo = transacoes.reduce((s, t) => s + (t.type === 'receita' ? t.amount : -t.amount), 0);
    const sinalSaldo = saldo >= 0 ? '+' : '-';
    totais.push(`Total: ${sinalSaldo}R$ ${currency.format(Math.abs(saldo))}`);
  }
  if (dividas.length > 0) {
    const aPagar = dividas.filter((d) => d.direction === 'a_pagar').reduce((s, d) => s + d.amount, 0);
    const aReceber = dividas.filter((d) => d.direction === 'a_receber').reduce((s, d) => s + d.amount, 0);
    if (aPagar > 0) totais.push(`Total a pagar: R$ ${currency.format(aPagar)}`);
    if (aReceber > 0) totais.push(`Total a receber: R$ ${currency.format(aReceber)}`);
  }

  return `✅ ${items.length} registrados:\n${linhas.join('\n')}\n\n${totais.join('\n')}`;
}

async function replyWhatsApp(to, body) {
  await axios.post(
    `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
    { number: to, text: body },
    { headers: { apikey: EVOLUTION_API_KEY } }
  );
}

// Qualquer rota que não seja /webhook cai no dashboard Next.js (mesma porta, sem precisar de firewall novo)
app.use(
  createProxyMiddleware({
    target: process.env.FRONTEND_URL || 'http://frontend:3000',
    changeOrigin: true,
  })
);

app.listen(PORT || 3001, () => console.log(`Servidor rodando na porta ${PORT || 3001}`));
