FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ai-service.js db-service.js run-recurring.js ./

EXPOSE 3001

CMD ["node", "index.js"]
