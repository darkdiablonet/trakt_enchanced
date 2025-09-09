# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build

# Build metadata
LABEL org.opencontainers.image.title="Trakt Enhanced"
LABEL org.opencontainers.image.description="Trakt Enhanced Node.js application"
LABEL org.opencontainers.image.version="7.6.1"
LABEL org.opencontainers.image.url="https://hub.docker.com/r/diabolino/trakt_enhanced"
LABEL org.opencontainers.image.documentation="https://github.com/diabolino/trakt-enhanced/blob/main/README.md"
LABEL org.opencontainers.image.source="https://github.com/diabolino/trakt-enhanced"
LABEL org.opencontainers.image.vendor="Trakt Enhanced"
LABEL org.opencontainers.image.authors="matt"

# Install build deps for Alpine
RUN apk add --no-cache \
	git ca-certificates curl

WORKDIR /src

# copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN set -eux; \
	echo "[build] Installing dependencies"; \
	if [ -f package-lock.json ]; then \
	  echo "[build] running npm ci (with legacy-peer-deps)"; \
	  npm ci --legacy-peer-deps --verbose || \
	  (echo "[build] npm ci failed, falling back to npm install" && \
	   npm install --legacy-peer-deps --no-audit --progress=false); \
	else \
	  echo "[build] no package-lock.json, running npm install"; \
	  npm install --legacy-peer-deps --no-audit --progress=false; \
	fi

# copy full repo
COPY . .

# Clean any existing tokens, caches, or sensitive data that shouldn't be in the image
RUN rm -rf data/.secrets/ data/.cache_* data/*.json || true

# build assets (tailwind + fontawesome)
RUN npm run build

# prune dev deps to reduce image size
RUN npm prune --production || true

# runtime image
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=30009
ENV TZ=UTC
ENV SESSION_SECRET=""
ENV PUBLIC_HOST=""
ENV DOCKER_HOST_IP=""
ENV FULL_REBUILD_PASSWORD=""
ENV PUID=99
ENV PGID=100

# IMPORTANT: Install su-exec for privilege dropping
RUN apk add --no-cache ca-certificates tzdata curl su-exec

WORKDIR /app

# copy app from build stage
COPY --from=build /src /app

# copy logo for metadata/branding
COPY --from=build /src/public/assets/favicon.svg /app/logo.svg

# IMPORTANT: Créer TOUS les dossiers nécessaires avec les bonnes permissions
# Ces dossiers seront créés dans l'image elle-même
RUN mkdir -p /app/data \
             /app/data/logs \
             /app/data/.cache_trakt \
             /app/data/.secrets \
             /app/data/sessions \
             /app/config && \
    # Donner les permissions à tout le monde (sera restreint par l'entrypoint)
    chmod -R 777 /app/data /app/config && \
    # Créer un fichier témoin pour vérifier les permissions
    touch /app/data/.docker_initialized && \
    chmod 666 /app/data/.docker_initialized

# Enhanced entrypoint script with better permission handling
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Declare volumes for persistent data
VOLUME ["/app/data", "/app/config"]

EXPOSE 30009

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-30009}/health || exit 1

# IMPORTANT: Ne PAS définir USER ici, laisser l'entrypoint gérer
# Cela permet à l'entrypoint de créer les dossiers si nécessaire
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]