#!/bin/bash
# Checa se o painel do Guará está de pé. Se falhar 3 vezes seguidas, manda um
# alerta por WhatsApp pro dono (3 seguidas evita alarme por falha passageira).
#
# Verifica DUAS coisas, e a segunda existe por causa de um incidente real:
#
#   1. o servidor responde 200
#   2. a resposta é a página do Guará de verdade, com o código que a monta
#
# Em 27/08/2026 o painel ficou mais de um dia quebrado devolvendo 200 o tempo
# todo — o servidor entregava a página, e ela morria no navegador. Um monitor
# que só olha o código de status diz "tudo bem" durante uma queda dessas.
set -e
cd "$(dirname "$0")"
source ./.env

URL="https://168-138-141-214.sslip.io/"
STATE_FILE="/tmp/guara-monitor-fails"
FAILS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

CORPO=$(mktemp)
trap 'rm -f "$CORPO"' EXIT
CODE=$(curl -s -o "$CORPO" -w "%{http_code}" --max-time 15 "$URL" || echo 000)

MOTIVO=""
if [ "$CODE" != "200" ]; then
  MOTIVO="o servidor respondeu HTTP $CODE"
elif ! grep -q "_next/static" "$CORPO"; then
  # Sem as tags de script o navegador não tem como montar o painel. Foi assim
  # que o incidente se apresentaria: 200 na mão, página inútil na tela.
  MOTIVO="a página voltou sem o código que monta o painel"
fi

if [ -z "$MOTIVO" ]; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE_FILE"

if [ "$FAILS" -eq 3 ]; then
  MSG="⚠️ Guará: o painel está com problema — $MOTIVO. Já falhou 3 checagens seguidas."
  curl -s -X POST "https://graph.facebook.com/v21.0/$META_PHONE_NUMBER_ID/messages" \
    -H "Authorization: Bearer $META_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"messaging_product":"whatsapp","to":"%s","type":"text","text":{"body":"%s"}}' "$OWNER_PHONE" "$MSG")" \
    > /dev/null
fi
