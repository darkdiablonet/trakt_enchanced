# syntax=docker/dockerfile:1.7
FROM node:20-bookworm AS build

# Build metadata
LABEL org.opencontainers.image.title="Trakt Enhanced"
LABEL org.opencontainers.image.description="Trakt Enhanced Node.js application"
LABEL org.opencontainers.image.version="6.0.0"
LABEL org.opencontainers.image.url="https://hub.docker.com/r/diabolino/trakt_enhanced"
LABEL org.opencontainers.image.documentation="https://github.com/diabolino/trakt-enhanced/blob/main/README.md"
LABEL org.opencontainers.image.source="https://github.com/diabolino/trakt-enhanced"
LABEL org.opencontainers.image.vendor="Trakt Enhanced"
LABEL org.opencontainers.image.authors="matt"

# Install build deps (fonts / build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
	git ca-certificates build-essential python3 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# copy package files first for caching
COPY package*.json ./
# install deps: prefer npm ci, fallback to npm install if ci fails
RUN set -eux; \
	if [ -f package-lock.json ]; then \
	  echo "[build] running npm ci (with legacy-peer-deps)"; \
	  npm ci --legacy-peer-deps || (echo "[build] npm ci failed, falling back to npm install" && npm install --legacy-peer-deps --no-audit --progress=false); \
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
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=30009
ENV TZ=UTC
ENV SESSION_SECRET=""
ENV PUBLIC_HOST=""
ENV DOCKER_HOST_IP=""
ENV FULL_REBUILD_PASSWORD=""

# minimal runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata curl \
	&& rm -rf /var/lib/apt/lists/*

# create app user with Unraid compatible UID/GID (99:100)
# Note: GID 100 (users) already exists in Debian, so we use it directly
RUN useradd -u 99 -g 100 -m -s /bin/sh app

WORKDIR /app

# copy app from build stage
COPY --from=build /src /app

# copy logo for metadata/branding
COPY --from=build /src/public/assets/favicon.svg /app/logo.svg

# ensure data and config folders exist & set correct permissions for Unraid
RUN mkdir -p /app/data /app/config && \
    chown -R 99:100 /app

# Declare volumes for persistent data
VOLUME ["/app/data", "/app/config"]

# small entrypoint that will drop privileges; we provide the script inline for simplicity
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 30009

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-30009}/health || exit 1

USER app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
