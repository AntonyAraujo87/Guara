# Le a resposta da Meta sobre o numero do WhatsApp. Devolve CASO|recado.
#
# O ponto deste teste: um token pode ser valido e permanente e ainda assim nao
# alcancar o nosso numero, se foi gerado com o ativo errado marcado. Sem esta
# checagem, o erro so apareceria quando um cliente mandasse mensagem.

import json
import sys

try:
    dados = json.load(sys.stdin)
except Exception:
    print("ERRO|A Meta respondeu algo que nao da pra ler.")
    raise SystemExit

if "error" in dados:
    print("ERRO|" + str(dados["error"].get("message", "sem detalhe"))[:110])
    raise SystemExit

print("OK|" + str(dados.get("display_phone_number", "?")) + "  (" + str(dados.get("verified_name", "?")) + ")")
