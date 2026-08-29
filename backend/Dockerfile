# Multi-stage build: install + compile TypeScript in one stage, run the
# compiled JS in a slim final stage so the deployed image doesn't carry
# devDependencies or TS source around.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

EXPOSE 4000
# Applies any pending migrations, then starts the server. Safe to run on
# every deploy: prisma migrate deploy is a no-op if there's nothing pending.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
