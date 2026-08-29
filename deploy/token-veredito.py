# Le a resposta do debug_token da Meta e devolve UMA linha: CASO|recado.
#
# Existe como arquivo separado porque embutir python dentro de bash dentro de
# ssh e onde nasce metade dos bugs de escape deste projeto.

import json
import sys
import os
import datetime

try:
    dados = json.load(sys.stdin).get("data", {})
except Exception:
    print("ERRO|A Meta nao respondeu direito. Cheque a internet e tente de novo.")
    raise SystemExit

if not dados.get("is_valid"):
    print("ERRO|A Meta diz que esse token nao e valido. Gere outro no Business Manager.")
    raise SystemExit

esperado = os.environ.get("TOKEN_APP", "")
if str(dados.get("app_id")) != esperado:
    print("ERRO|Esse token e de outro app (id " + str(dados.get("app_id")) + "). Precisa ser do app do Guara.")
    raise SystemExit

escopos = dados.get("scopes", [])
precisa = ("whatsapp_business_messaging", "whatsapp_business_management")
falta = [s for s in precisa if s not in escopos]
if falta:
    print("ERRO|Faltou marcar a permissao: " + ", ".join(falta))
    raise SystemExit

# expires_at 0 e o jeito que a Meta diz "nunca expira".
expira = dados.get("expires_at", 0)
if expira:
    quando = datetime.datetime.utcfromtimestamp(expira).strftime("%d/%m/%Y")
    print("TEMPORARIO|Esse token expira em " + quando + ". Nao e permanente.")
    raise SystemExit

print("OK|permanente")
