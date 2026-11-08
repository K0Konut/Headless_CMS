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
# npm range dans un workspace les dépendances dont la version entre en conflit avec la racine
# (@tiptap/html et son happy-dom dans apps/api) : ces dossiers existent toujours, même vides.
RUN npm run build -w @dashility/api -w @dashility/dashboard \
  && npm prune --omit=dev \
  && mkdir -p apps/api/node_modules packages/shared/node_modules

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
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/dashboard/dist apps/dashboard/dist
USER node
WORKDIR /app/apps/api
# Chaque module de l'API doit se charger : une dépendance absente de l'image fait échouer sa
# construction au lieu de faire tomber la production.
RUN node --input-type=module -e "await import('./dist/app.module.js')"
EXPOSE 3000
# Migrations avant l'API ; exec : l'API reçoit directement les signaux d'arrêt de Docker.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/main.js"]
