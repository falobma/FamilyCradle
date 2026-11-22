FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/server/package.json apps/server/package.json
COPY --from=build --chown=node:node /app/apps/server/dist apps/server/dist
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
COPY --from=build --chown=node:node /app/packages/shared packages/shared
USER node
EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]
