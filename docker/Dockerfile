# Image de production (architecture technique) : l'API NestJS sert /api et le dashboard compilé sur /.
# Construite depuis la racine du dépôt : docker build -f docker/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
# Lint, types et tests déjà vérifiés par le CI avant l'image : compilation seule.
RUN npm run build -w @dashility/api -w @dashility/dashboard \
  && npm prune --omit=dev

FROM node:22-alpine
# Relie l'image au dépôt sur GHCR (page du paquet).
LABEL org.opencontainers.image.source=https://github.com/K0Konut/Headless_CMS
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
# @dashility/shared est importé en TypeScript : Node l'exécute tel quel (suppression des types).
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/dashboard/dist apps/dashboard/dist
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
