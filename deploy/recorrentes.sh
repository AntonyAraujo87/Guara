#!/bin/bash
# Lança os gastos/recebimentos mensais que vencem hoje.
# Roda dentro do container do backend, que já tem as credenciais no ambiente.
# Agendado pra 09:00 no horário de Brasília (12:00 UTC).
set -e
sudo docker exec controle-financeiro-backend node run-recurring.js
