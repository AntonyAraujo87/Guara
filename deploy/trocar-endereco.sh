#!/bin/bash
# Troca o endereço do Guará em todos os lugares que o gravam.
#
# Uso:  bash deploy/trocar-endereco.sh guara.duckdns.org
#
# Existe porque o endereço aparece em nove arquivos espalhados por dois
# repositórios. Trocar na mão é onde se esquece um — e o esquecido costuma ser
# o que quebra o login, que falha em silêncio e só aparece quando alguém tenta
# criar conta.
#
# O que este script NÃO faz (precisa ser na mão, nos painéis):
#   - Supabase  -> Authentication -> URL Configuration (Site URL e Redirect)
#   - Cloudflare Turnstile -> domínios permitidos do widget
#   - Google Cloud -> OAuth -> URIs de redirecionamento autorizados
set -e

NOVO="$1"
ANTIGO="168-138-141-214.sslip.io"

if [ -z "$NOVO" ]; then
  echo "Falta o endereço novo."
  echo "Uso: bash deploy/trocar-endereco.sh guara.duckdns.org"
  exit 1
fi

case "$NOVO" in
  *.*) ;;
  *) echo "Isso não parece um endereço: $NOVO"; exit 1 ;;
esac

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
MONITOR="$(cd "$RAIZ/../guara-monitor" 2>/dev/null && pwd || true)"

trocar_em() {
  local repo="$1"
  [ -d "$repo" ] || return 0
  echo "── $(basename "$repo") ──"
  # Só arquivos versionados: evita mexer em node_modules e em build.
  (cd "$repo" && git ls-files -z | xargs -0 grep -lI "$ANTIGO" 2>/dev/null || true) | while read -r arq; do
    [ -n "$arq" ] || continue
    (cd "$repo" && sed -i "s|$ANTIGO|$NOVO|g" "$arq")
    echo "   $arq"
  done
}

echo "Trocando $ANTIGO  ->  $NOVO"
echo
trocar_em "$RAIZ"
[ -n "$MONITOR" ] && trocar_em "$MONITOR"

echo
echo "── conferindo ──"
sobrou=0
for repo in "$RAIZ" "$MONITOR"; do
  [ -d "$repo" ] || continue
  n=$(cd "$repo" && git ls-files -z | xargs -0 grep -lI "$ANTIGO" 2>/dev/null | wc -l)
  sobrou=$((sobrou + n))
done
if [ "$sobrou" -eq 0 ]; then
  echo "   nenhuma ocorrência do endereço antigo"
else
  echo "   ATENÇÃO: $sobrou arquivo(s) ainda com o endereço antigo"
  exit 1
fi

echo
echo "Falta fazer nos painéis, na mão:"
echo "  1. Supabase   -> Authentication -> URL Configuration"
echo "                   Site URL:  https://$NOVO"
echo "                   Redirect:  https://$NOVO/**"
echo "  2. Turnstile  -> domínios do widget -> adicionar $NOVO"
echo "  3. Google     -> OAuth -> redirecionamento autorizado"
echo "                   https://$NOVO"
echo
echo "Depois: git push nos dois repositórios, e publicar o Caddyfile na VM."
