# Troca o valor de META_ACCESS_TOKEN no .env, mexendo so naquela linha.
#
# Nao usa sed de proposito: token da Meta pode conter caracteres que o sed trata
# como comando, e o estrago so apareceria depois, com o backend fora do ar.
#
# O token chega por variavel de ambiente, nunca por argumento: argumento aparece
# no `ps` de qualquer usuario da maquina.

import os
import sys

caminho = sys.argv[1]
novo = os.environ["TOKEN_NOVO"]

with open(caminho, encoding="utf-8") as arquivo:
    linhas = arquivo.read().splitlines(keepends=True)

achou = False
for i, linha in enumerate(linhas):
    if linha.startswith("META_ACCESS_TOKEN="):
        fim = "\n" if linha.endswith("\n") else ""
        linhas[i] = "META_ACCESS_TOKEN=" + novo + fim
        achou = True
        break

if not achou:
    # Nao deveria acontecer, mas perder o token e pior que ter uma linha a mais.
    if linhas and not linhas[-1].endswith("\n"):
        linhas.append("\n")
    linhas.append("META_ACCESS_TOKEN=" + novo + "\n")

with open(caminho, "w", encoding="utf-8") as arquivo:
    arquivo.write("".join(linhas))
