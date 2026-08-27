#!/bin/bash
# Backup diário das tabelas do Guará.
#
# Salva em dois lugares de propósito:
#   1) na própria VM (rápido de consultar, 14 dias)
#   2) no Supabase Storage (sobrevive à VM ser perdida — que é o risco real,
#      já que a Oracle recicla instância free tier ociosa)
#
# Backup no mesmo disco do que está sendo salvo não é backup, é cópia.
set -e
cd "$(dirname "$0")"
source ./.env

BACKUP_DIR="/home/ubuntu/guara-backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y-%m-%d)
TABLES="transactions debts profiles users installments savings goals categories"
FALHAS=0

for TABLE in $TABLES; do
  ARQUIVO="$BACKUP_DIR/${TABLE}_${DATE}.json"

  HTTP=$(curl -s -w "%{http_code}" "$SUPABASE_URL/rest/v1/$TABLE?select=*" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -o "$ARQUIVO")

  if [ "$HTTP" != "200" ]; then
    echo "FALHA ao baixar $TABLE (HTTP $HTTP)"
    FALHAS=$((FALHAS + 1))
    continue
  fi

  # Sobe a cópia para fora da VM. upsert=true deixa reexecutar no mesmo dia.
  UP=$(curl -s -w "%{http_code}" -o /dev/null \
    -X POST "$SUPABASE_URL/storage/v1/object/backups/${DATE}/${TABLE}.json" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "x-upsert: true" \
    --data-binary "@$ARQUIVO")

  if [ "$UP" != "200" ]; then
    echo "FALHA ao enviar $TABLE para o Storage (HTTP $UP)"
    FALHAS=$((FALHAS + 1))
  fi
done

# Limpeza local: 14 dias
find "$BACKUP_DIR" -name "*.json" -mtime +14 -delete

# Limpeza remota: apaga a pasta de 30 dias atrás (o Storage free tier é 1GB)
ANTIGO=$(date -d "30 days ago" +%Y-%m-%d)
for TABLE in $TABLES; do
  curl -s -o /dev/null -X DELETE \
    "$SUPABASE_URL/storage/v1/object/backups/${ANTIGO}/${TABLE}.json" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" || true
done

if [ "$FALHAS" -gt 0 ]; then
  echo "Backup $DATE terminou com $FALHAS falha(s)."
  exit 1
fi
echo "Backup $DATE OK — local e Supabase Storage."
