#!/bin/bash
# Avisa antes que alguma credencial vença e o Guará pare sozinho.
#
# Existe por causa de uma auditoria: o token da Meta tem prazo de validade, e
# no dia em que vencer o WhatsApp para inteiro — sem erro no log, sem alerta,
# sem nada. O monitor do painel não pega isso, porque o site continua de pé; é
# só o Guará que emudece.
#
# O mesmo vale pro certificado HTTPS. O Caddy renova sozinho, mas "sozinho"
# falha em silêncio quando falha.
#
# Roda uma vez por semana. Avisa a 30, 14, 7, 3 e 1 dia — perto do fim insiste
# mais, porque renovar token da Meta leva alguns minutos de painel e é fácil
# deixar pra depois.
set -e
cd "$(dirname "$0")"
source ./.env

APP_ID=2434516347037410
AVISAR_EM="30 14 7 3 1"
HOJE=$(date +%s)

avisar() {
  local MSG="$1"
  curl -s -X POST "https://graph.facebook.com/v21.0/$META_PHONE_NUMBER_ID/messages" \
    -H "Authorization: Bearer $META_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"messaging_product":"whatsapp","to":"%s","type":"text","text":{"body":"%s"}}' "$OWNER_PHONE" "$MSG")" \
    > /dev/null
}

# Só avisa nos marcos, e não todo dia: alerta que repete vira ruído, e ruído
# a gente aprende a ignorar justamente antes de precisar dele.
esta_no_marco() {
  local DIAS=$1
  for M in $AVISAR_EM; do
    [ "$DIAS" -eq "$M" ] && return 0
  done
  return 1
}

# ── 1. Token da Meta ──────────────────────────────────────────────
EXP=$(curl -s "https://graph.facebook.com/debug_token?input_token=$META_ACCESS_TOKEN&access_token=${APP_ID}|${META_APP_SECRET}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('expires_at',0))" 2>/dev/null || echo 0)

if [ "$EXP" != "0" ] && [ -n "$EXP" ]; then
  DIAS=$(( (EXP - HOJE) / 86400 ))
  echo "token da Meta vence em $DIAS dia(s)"
  if [ "$DIAS" -le 0 ]; then
    avisar "🚨 Guará: o token da Meta VENCEU. O WhatsApp parou de funcionar. Gere um novo em business.facebook.com e atualize o .env na VM."
  elif esta_no_marco "$DIAS"; then
    avisar "⏰ Guará: o token da Meta vence em $DIAS dia(s). Quando vencer, o WhatsApp para de responder. Gere um token permanente de usuário do sistema em business.facebook.com e troque no .env da VM."
  fi
else
  echo "token da Meta: permanente"
fi

# ── 2. Certificado HTTPS ──────────────────────────────────────────
FIM=$(echo | openssl s_client -connect guarapp.duckdns.org:443 -servername guarapp.duckdns.org 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

if [ -n "$FIM" ]; then
  FIM_TS=$(date -d "$FIM" +%s 2>/dev/null || echo 0)
  if [ "$FIM_TS" != "0" ]; then
    DIAS_CERT=$(( (FIM_TS - HOJE) / 86400 ))
    echo "certificado vence em $DIAS_CERT dia(s)"
    # O Caddy renova aos 30 dias do fim. Abaixo de 10 significa que a renovação
    # automática não aconteceu, e aí é problema de verdade.
    if [ "$DIAS_CERT" -le 10 ]; then
      avisar "🚨 Guará: o certificado HTTPS vence em $DIAS_CERT dia(s) e o Caddy não renovou sozinho. Confira os logs: sudo docker logs guara-caddy"
    fi
  fi
fi

# ── 3. Espaço em disco ────────────────────────────────────────────
# Disco cheio derruba tudo de uma vez e sem aviso: o Postgres para, o Docker
# não consegue publicar, e o backup falha calado.
USO=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
echo "disco em $USO%"
if [ "$USO" -ge 85 ]; then
  avisar "⚠️ Guará: o disco da VM está em ${USO}%. Rode: sudo docker system prune -af"
fi
