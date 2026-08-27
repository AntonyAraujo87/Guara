#!/bin/bash
# Publica a versão mais recente na VM.
#
# As imagens vêm prontas do GitHub Actions — o servidor só baixa e troca o
# container, em cerca de um minuto e sem tirar o site do ar.
set -e
cd "$(dirname "$0")"

echo "Baixando as imagens mais recentes..."
sudo docker compose pull

echo ""
echo "Trocando os containers..."
sudo docker compose up -d

echo ""
sudo docker compose ps --format '{{.Name}}  {{.Status}}'

echo ""
echo "Limpando imagens antigas..."
sudo docker image prune -f > /dev/null
echo "Pronto."
