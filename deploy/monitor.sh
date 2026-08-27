#!/bin/bash
# Checa se o dashboard do Guará está no ar. Se falhar 3 vezes seguidas, manda um alerta por WhatsApp
# pro próprio número do dono (evita alerta por uma falha passageira de rede).
set -e
cd "$(dirname "$0")"
source ./.env

STATE_FILE="/tmp/guara-monitor-fails"
FAILS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://168-138-141-214.sslip.io/ || echo 000)

if [ "$CODE" = "200" ]; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE_FILE"

if [ "$FAILS" -eq 3 ]; then
  curl -s -X POST "https://graph.facebook.com/v21.0/$META_PHONE_NUMBER_ID/messages" \
    -H "Authorization: Bearer $META_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"messaging_product\":\"whatsapp\",\"to\":\"$OWNER_PHONE\",\"type\":\"text\",\"text\":{\"body\":\"⚠️ Guará: o dashboard não está respondendo (HTTP $CODE). Confere a VM.\"}}" \
    > /dev/null
fi
