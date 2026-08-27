// Lança os gastos e recebimentos mensais que vencem hoje.
// Roda uma vez por dia pelo cron da VM (deploy/recorrentes.sh).
require('dotenv').config();
const { runRecurringForToday } = require('./db-service');

const agora = () => new Date().toISOString();

(async () => {
  try {
    const { lancados, falhas } = await runRecurringForToday();

    if (lancados.length === 0 && falhas.length === 0) {
      console.log(`[${agora()}] nenhum recorrente vencendo hoje.`);
      return;
    }

    if (lancados.length > 0) {
      console.log(`[${agora()}] ${lancados.length} recorrente(s) lançado(s):`);
      for (const r of lancados) {
        console.log(`  ${r.description}  R$ ${r.amount}  (dia ${r.day_of_month})`);
      }
    }

    // Sair com erro faz o cron registrar a falha, em vez de a rotina parecer
    // que correu bem só porque os outros lançamentos passaram.
    if (falhas.length > 0) {
      console.error(`[${agora()}] ${falhas.length} recorrente(s) FALHARAM:`);
      for (const f of falhas) {
        console.error(`  ${f.description} (${f.id}): ${f.erro}`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error(`[${agora()}] Erro ao lançar recorrentes:`, err.message);
    process.exit(1);
  }
})();
