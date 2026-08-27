#!/bin/bash
# Publica uma nova versão do Guará.
#
# Roda o build com prioridade baixa (nice 19) porque o build e o site dividem a
# mesma VM de 952 MB: sem isso o compilador do Next toma a CPU e o site passa a
# responder em ~20s, a ponto do navegador desistir e mostrar "página não carregou".
# Com nice, quem está usando o site sempre ganha da compilação.
set -e
cd "$(dirname "$0")"

ALVO="${1:-backend frontend}"
echo "Publicando: $ALVO"
echo "(build em prioridade baixa — o site continua respondendo normalmente)"

sudo nice -n 19 docker compose up -d --build $ALVO

echo ""
sudo docker compose ps --format '{{.Name}}  {{.Status}}'
