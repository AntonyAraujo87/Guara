#!/bin/bash
# Restaura os dados de um backup.
#
# Existiu backup desde o começo do projeto, mas nunca um jeito de voltar dele.
# Backup que ninguém sabe restaurar é esperança, não plano — e a hora de
# descobrir que não funciona não pode ser a hora em que se precisa dele.
#
#   ./restaurar.sh 2026-08-28              # confere o que tem, não muda nada
#   ./restaurar.sh 2026-08-28 --aplicar    # restaura de verdade
#
# Restaura por upsert, então rodar duas vezes dá o mesmo resultado. Linhas
# criadas DEPOIS do backup continuam onde estão: isto repõe o que sumiu, não
# devolve o banco no tempo.
set -e
cd "$(dirname "$0")"
source ./.env

DATA="${1:-}"
APLICAR="${2:-}"
PASTA="/home/ubuntu/guara-backups"

if [ -z "$DATA" ]; then
  echo "uso: ./restaurar.sh AAAA-MM-DD [--aplicar]"
  echo ""
  echo "backups disponíveis nesta VM:"
  ls "$PASTA" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort -ur | sed 's/^/  /'
  exit 1
fi

# A ordem importa: users antes de tudo (as outras tabelas apontam pro telefone),
# e profiles depois de users.
TABELAS="users profiles transactions debts installments savings goals recurring categories"

echo "═══ backup de $DATA ═══"
if [ "$APLICAR" != "--aplicar" ]; then
  echo "MODO CONFERÊNCIA — nada será alterado. Use --aplicar para restaurar."
fi
echo ""

TOTAL=0
FALHAS=0

for TABELA in $TABELAS; do
  ARQUIVO="$PASTA/${TABELA}_${DATA}.json"

  # Sem cópia local, busca a de fora. É pra isso que ela existe: o caso real de
  # restauração é a VM ter sido perdida.
  if [ ! -f "$ARQUIVO" ]; then
    ARQUIVO=$(mktemp)
    HTTP=$(curl -s -w "%{http_code}" -o "$ARQUIVO" \
      "$SUPABASE_URL/storage/v1/object/backups/${DATA}/${TABELA}.json" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
    if [ "$HTTP" != "200" ]; then
      printf "  %-14s sem backup nesta data\n" "$TABELA"
      rm -f "$ARQUIVO"
      continue
    fi
    echo "  (baixado do Storage)"
  fi

  N=$(python3 -c "import json;print(len(json.load(open('$ARQUIVO'))))" 2>/dev/null || echo erro)
  if [ "$N" = "erro" ]; then
    printf "  %-14s ARQUIVO ILEGÍVEL\n" "$TABELA"
    FALHAS=$((FALHAS + 1))
    continue
  fi

  if [ "$APLICAR" != "--aplicar" ]; then
    printf "  %-14s %s registro(s) prontos para restaurar\n" "$TABELA" "$N"
    TOTAL=$((TOTAL + N))
    continue
  fi

  if [ "$N" = "0" ]; then
    printf "  %-14s vazio, nada a fazer\n" "$TABELA"
    continue
  fi

  # merge-duplicates faz o upsert: quem já existe é atualizado, quem sumiu volta.
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/rest/v1/$TABELA" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    --data-binary "@$ARQUIVO")
  HTTP=$(echo "$RESP" | tail -1)

  if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ] || [ "$HTTP" = "204" ]; then
    printf "  %-14s %s registro(s) restaurados\n" "$TABELA" "$N"
    TOTAL=$((TOTAL + N))
  else
    printf "  %-14s FALHOU (HTTP %s): %s\n" "$TABELA" "$HTTP" "$(echo "$RESP" | head -1 | cut -c1-90)"
    FALHAS=$((FALHAS + 1))
  fi
done

echo ""
if [ "$APLICAR" = "--aplicar" ]; then
  echo "  $TOTAL registro(s) restaurados, $FALHAS falha(s)"
else
  echo "  $TOTAL registro(s) seriam restaurados"
  echo "  para valer: ./restaurar.sh $DATA --aplicar"
fi
[ "$FALHAS" -eq 0 ]
