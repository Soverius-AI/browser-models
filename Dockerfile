# syntax=docker/dockerfile:1

# Builds the docs site (apps/docs) with the four examples embedded, then serves it with nginx.
FROM node:24-alpine AS builder
WORKDIR /app
ENV CI=true \
    NX_DAEMON=false \
    NX_NO_CLOUD=true
# Public canonical origin used in generated metadata; not a secret.
ARG SITE_URL=https://browser-models.soverius.ai
ENV SITE_URL=${SITE_URL}
RUN npm install -g pnpm@11.16.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm nx run docs:build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runner
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/apps/docs /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
