FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Com output "standalone", o Next já empacota em .next/standalone o servidor e só as
# dependências usadas em runtime. Os estáticos e o public ficam de fora de propósito
# e precisam ser copiados à parte.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Roda como o usuario `node` (uid 1000), que a imagem ja traz. Sem isto o
# servidor do Next roda como root: qualquer falha que consiga executar codigo
# aqui dentro o executa com privilegio total, e uma escapada do container vira
# uma escapada como root.
#
# A porta 3000 esta acima de 1024, entao nao exige root pra escutar.
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]
