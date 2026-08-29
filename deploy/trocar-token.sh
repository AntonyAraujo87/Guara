#!/usr/bin/env bash
#
# Troca o token da Meta. Feito pra ser rodado por quem nao quer mexer em nano.
#
# O que ele garante, nessa ordem:
#   1. o token novo e valido, e permanente, e alcanca o nosso numero
#   2. so depois disso o .env e tocado
#   3. se o backend nao subir, volta o token velho sozinho
#
# Nada aqui imprime o token nem grava ele em arquivo temporario.

set -uo pipefail

DEPLOY="$HOME/guara/deploy"
ENV="$DEPLOY/.env"
APP_ID=2434516347037410
AJUDA="bash ~/guara/deploy/trocar-token.sh"

ruim() { printf '\033[1;31m%s\033[0m\n' "$*"; }
bom()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
nota() { printf '\033[2m%s\033[0m\n' "$*"; }

if [ ! -f "$ENV" ]; then ruim "Nao achei $ENV"; exit 1; fi

APP_SECRET=$(grep '^META_APP_SECRET=' "$ENV" | cut -d= -f2-)
PHONE_ID=$(grep '^META_PHONE_NUMBER_ID=' "$ENV" | cut -d= -f2-)

if [ -z "$APP_SECRET" ] || [ -z "$PHONE_ID" ]; then
  ruim "O .env esta sem META_APP_SECRET ou META_PHONE_NUMBER_ID."
  exit 1
fi

echo ""
echo "============================================"
echo "  Trocar o token da Meta"
echo "============================================"
echo ""
echo "Cole o token e aperte Enter."
nota "Ele NAO vai aparecer na tela. E proposital: cole e confie."
echo ""
printf 'token: '
read -rs TOKEN
echo ""
echo ""

TOKEN=$(printf '%s' "${TOKEN:-}" | tr -d '[:space:]')

if [ ${#TOKEN} -lt 100 ]; then
  ruim "Isso tem so ${#TOKEN} caracteres. Um token da Meta passa de 200."
  nota "A colagem provavelmente nao pegou. Rode de novo: $AJUDA"
  exit 1
fi

case "$TOKEN" in
  EA*) ;;
  *) ruim "Token da Meta comeca com EA. Esse comeca diferente."
     nota "Nada foi mudado."
     exit 1 ;;
esac

# --- 1. perguntar pra propria Meta o que e esse token -----------------------
echo "1/5  Perguntando pra Meta o que e esse token..."

VEREDITO=$(curl -s --max-time 25 \
  "https://graph.facebook.com/debug_token?input_token=${TOKEN}&access_token=${APP_ID}%7C${APP_SECRET}" \
  | TOKEN_APP="$APP_ID" python3 "$DEPLOY/token-veredito.py")

CASO=${VEREDITO%%|*}
RECADO=${VEREDITO#*|}

if [ "$CASO" = "ERRO" ]; then
  ruim "     $RECADO"
  echo ""
  nota "Nada foi mudado. O token antigo continua valendo."
  exit 1
fi

if [ "$CASO" = "TEMPORARIO" ]; then
  ruim "     $RECADO"
  echo ""
  nota "No Business Manager, na hora de gerar, o campo de validade precisa"
  nota "estar em 'Nunca' ANTES de clicar em gerar token."
  echo ""
  printf 'Aplicar assim mesmo? (digite SIM pra continuar): '
  read -r INSISTE
  if [ "$INSISTE" != "SIM" ]; then
    nota "Nada foi mudado."
    exit 1
  fi
  EH_PERMANENTE=nao
else
  EH_PERMANENTE=sim
  bom "     valido, expira NUNCA, permissoes certas"
fi

# --- 2. ele alcanca mesmo o nosso numero? ----------------------------------
echo "2/5  Testando se ele acessa o numero do Guara..."

NUMERO=$(curl -s --max-time 25 \
  "https://graph.facebook.com/v21.0/${PHONE_ID}?fields=display_phone_number,verified_name&access_token=${TOKEN}" \
  | python3 "$DEPLOY/token-numero.py")

if [ "${NUMERO%%|*}" = "ERRO" ]; then
  ruim "     ${NUMERO#*|}"
  echo ""
  nota "Nada foi mudado. Esse token nao alcanca o numero do Guara."
  exit 1
fi
bom "     ${NUMERO#*|}"

# --- 3. guardar o de antes, e so entao trocar ------------------------------
QUANDO=$(date +%Y%m%d-%H%M%S)
BACKUP="$DEPLOY/.env.antes-$QUANDO"
cp "$ENV" "$BACKUP"
chmod 600 "$BACKUP"
echo "3/5  Copia do .env guardada."

TOKEN_NOVO="$TOKEN" python3 "$DEPLOY/token-gravar.py" "$ENV"
GRAVOU=$?
unset TOKEN

if [ "$GRAVOU" != "0" ]; then
  ruim "     Nao consegui gravar o .env. Voltando o de antes."
  cp "$BACKUP" "$ENV"
  exit 1
fi

CONFERE=$(grep -c '^META_ACCESS_TOKEN=EA' "$ENV")
LINHAS=$(wc -l < "$ENV")
if [ "$CONFERE" != "1" ]; then
  ruim "     O .env ficou estranho ($CONFERE linhas de token). Voltando o de antes."
  cp "$BACKUP" "$ENV"
  exit 1
fi
nota "     .env com $LINHAS linhas, 1 token"

# --- 4. subir com o token novo ---------------------------------------------
echo "4/5  Reiniciando o backend..."
cd "$DEPLOY" || exit 1
sudo docker compose restart backend >/dev/null 2>&1

for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  ESTADO=$(sudo docker inspect -f '{{.State.Status}}' controle-financeiro-backend 2>/dev/null)
  if [ "$ESTADO" = "running" ]; then break; fi
done

QUEDAS=$(sudo docker inspect -f '{{.RestartCount}}' controle-financeiro-backend 2>/dev/null)
sleep 5
ESTADO=$(sudo docker inspect -f '{{.State.Status}}' controle-financeiro-backend 2>/dev/null)
QUEDAS2=$(sudo docker inspect -f '{{.RestartCount}}' controle-financeiro-backend 2>/dev/null)

if [ "$ESTADO" != "running" ] || [ "$QUEDAS" != "$QUEDAS2" ]; then
  ruim "     O backend nao ficou de pe. VOLTANDO O TOKEN ANTIGO."
  cp "$BACKUP" "$ENV"
  sudo docker compose restart backend >/dev/null 2>&1
  sleep 8
  ruim "     Voltou pro estado de antes. O Guara segue no ar com o token velho."
  echo ""
  nota "Ultimas linhas do log, pra entender o que houve:"
  sudo docker compose logs --tail 15 backend
  exit 1
fi
bom "     backend de pe"

# --- 5. prova final: o container fala com a Meta ---------------------------
echo "5/5  Conferindo por dentro do container..."
# O node roda um script vindo da stdin. Assim nao e preciso rebuildar a imagem
# so pra ter um arquivo de teste dentro dela.
PROVA=$(sudo docker compose exec -T backend node < "$DEPLOY/prova-token.js" 2>/dev/null | tr -d '\r')

case "$PROVA" in
  OK*) bom "     o container esta usando o token novo: ${PROVA#OK }" ;;
  *)   ruim "     ${PROVA:-nao consegui conferir por dentro}"
       ruim "     VOLTANDO O TOKEN ANTIGO."
       cp "$BACKUP" "$ENV"
       sudo docker compose restart backend >/dev/null 2>&1
       sleep 8
       ruim "     Voltou. O Guara segue no ar com o token velho."
       exit 1 ;;
esac

echo ""
# O texto tem que dizer a verdade sobre o que entrou. Anunciar "permanente"
# depois de a pessoa ter forcado um token com prazo faria ela parar de vigiar
# justamente o que ainda vai vencer.
if [ "${EH_PERMANENTE:-sim}" = "sim" ]; then
  bom "============================================"
  bom "  Pronto. Token permanente no ar."
  bom "============================================"
else
  bom "============================================"
  bom "  Token novo no ar."
  bom "============================================"
  echo ""
  ruim "  ATENCAO: esse token TEM PRAZO. Vai vencer, e"
  ruim "  quando vencer o Guara para de responder no WhatsApp."
  ruim "  Gere um permanente quando puder."
fi
echo ""
echo "Manda uma mensagem pro Guara no WhatsApp pra ver de olho."
echo ""
nota "A copia do .env antigo ficou em:"
nota "  $BACKUP"
nota "Ela tem o token velho dentro. Depois de testar, apague com:"
echo "  rm $BACKUP"
echo ""
