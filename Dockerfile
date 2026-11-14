FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

ARG GIT_SHA=local

ENV GIT_SHA=${GIT_SHA}
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/server/package*.json ./server/
COPY --from=build /app/client/package*.json ./client/
COPY --from=build /app/shared/package*.json ./shared/

RUN npm ci --omit=dev

COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/shared ./shared

RUN addgroup -S app \
    && adduser -S app -G app \
    && mkdir -p /app/server/logs \
    && chown -R app:app /app

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/src/server.js"]
