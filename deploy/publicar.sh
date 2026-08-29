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
# --force-recreate porque o `up -d` sozinho ja disse "Running" e NAO trocou a
# imagem, mesmo com a nova ja baixada — o compose comparou a configuracao,
# achou igual, e deixou o container velho de pe. O deploy passa despercebido:
# tudo responde 200, com o codigo antigo.
#
# So backend e frontend. O caddy fica de fora de proposito: e ele que serve a
# pagina "Ja volto" durante a troca, entao reinicia-lo tiraria justamente a
# rede que cobre o buraco.
sudo docker compose up -d --force-recreate backend frontend

echo ""
sudo docker compose ps --format '{{.Name}}  {{.Status}}'

echo ""
echo "Limpando imagens antigas..."
sudo docker image prune -f > /dev/null
echo "Pronto."
