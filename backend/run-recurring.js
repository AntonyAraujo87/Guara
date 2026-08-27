// Lança os gastos e recebimentos mensais que vencem hoje.
// Roda uma vez por dia pelo cron da VM (deploy/recorrentes.sh).
require('dotenv').config();
const { runRecurringForToday } = require('./db-service');

(async () => {
  try {
    const lancados = await runRecurringForToday();
    if (lancados.length === 0) {
      console.log(`[${new Date().toISOString()}] nenhum recorrente vencendo hoje.`);
      return;
    }
    console.log(`[${new Date().toISOString()}] ${lancados.length} recorrente(s) lançado(s):`);
    for (const r of lancados) {
      console.log(`  ${r.user_phone}  ${r.description}  R$ ${r.amount}  (dia ${r.day_of_month})`);
    }
  } catch (err) {
    console.error('Erro ao lançar recorrentes:', err.message);
    process.exit(1);
  }
})();
