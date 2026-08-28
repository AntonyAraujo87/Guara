FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Lista explícita em vez de "COPY . .": mantém .env, node_modules e testes
# fora da imagem publicada.
#
# O preço é este: arquivo novo que não entrar aqui derruba o backend em loop de
# restart, com "Cannot find module". Já aconteceu — ao criar um .js novo,
# acrescente aqui na mesma mudança.
COPY index.js ai-service.js db-service.js media-service.js leitura-simples.js run-recurring.js ./

EXPOSE 3001

CMD ["node", "index.js"]
