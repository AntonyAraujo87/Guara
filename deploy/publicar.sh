#!/bin/bash
# Publica a versão mais recente na VM.
#
# As imagens vêm prontas do GitHub Actions — a VM só baixa e troca o container.
# Leva ~1 minuto e o site continua respondendo, em vez dos ~10 minutos de build
# local que deixavam o site em 19s de resposta.
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
