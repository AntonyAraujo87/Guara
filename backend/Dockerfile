FROM node:22-slim

WORKDIR /app

# Segunda camada contra vazamento de stack trace: fora de produção o Express
# devolve o erro inteiro pro cliente. O handler global no index.js é a primeira
# camada e não depende disto — mas as duas juntas custam nada.
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Lista explícita em vez de "COPY . .": mantém .env, node_modules e testes
# fora da imagem publicada.
#
# O preço é este: arquivo novo que não entrar aqui derruba o backend em loop de
# restart, com "Cannot find module". Já aconteceu — ao criar um .js novo,
# acrescente aqui na mesma mudança. O `verificar-modulos.js` confere isso no CI.
COPY index.js formato.js mensagens.js respostas.js ai-service.js provedores.js db-base.js db-service.js carteiras.js media-service.js leitura-simples.js run-recurring.js verificar-modulos.js ./

# Roda como gente, não como root.
#
# A imagem node já traz o usuário `node` (uid 1000) pronto. Sem esta linha, uma
# falha que consiga executar código dentro do container o executa como root —
# e daí uma escapada do container é uma escapada como root na VM.
#
# Nada aqui precisa de privilégio: a porta é 3001 (acima de 1024, que é o limite
# que exige root pra escutar) e o app não escreve em disco. O chown cobre o caso
# de o npm ci ter deixado algo com dono root.
RUN chown -R node:node /app
USER node

EXPOSE 3001

CMD ["node", "index.js"]
