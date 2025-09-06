# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build

# Build metadata
LABEL org.opencontainers.image.title="Trakt Enhanced"
LABEL org.opencontainers.image.description="Trakt Enhanced Node.js application"
LABEL org.opencontainers.image.version="7.1.2"
LABEL org.opencontainers.image.url="https://hub.docker.com/r/diabolino/trakt_enhanced"
LABEL org.opencontainers.image.documentation="https://github.com/diabolino/trakt-enhanced/blob/main/README.md"
LABEL org.opencontainers.image.source="https://github.com/diabolino/trakt-enhanced"
LABEL org.opencontainers.image.vendor="Trakt Enhanced"
LABEL org.opencontainers.image.authors="matt"

# Install build deps for Alpine
# Include dependencies for sharp compilation from source
RUN apk add --no-cache \
	git ca-certificates build-base python3 curl \
	vips-dev glib-dev expat-dev \
	pkgconfig autoconf automake libtool nasm

WORKDIR /src

# copy package files first for caching
COPY package*.json ./

# Install dependencies with special handling for sharp
# Build sharp from source to support older CPUs without AVX2
RUN set -eux; \
	echo "[build] Installing dependencies with sharp built from source for CPU compatibility"; \
	if [ -f package-lock.json ]; then \
	  echo "[build] running npm ci (with legacy-peer-deps and sharp from source)"; \
	  npm ci --legacy-peer-deps --build-from-source=sharp --verbose || \
	  (echo "[build] npm ci failed, falling back to npm install" && \
	   npm install --legacy-peer-deps --no-audit --progress=false --build-from-source=sharp); \
	else \
	  echo "[build] no package-lock.json, running npm install with sharp from source"; \
	  npm install --legacy-peer-deps --no-audit --progress=false --build-from-source=sharp; \
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

# minimal runtime deps for Alpine
RUN apk add --no-cache ca-certificates tzdata curl \
	# Required runtime libs for sharp
	vips glib expat

# create app user with Unraid compatible UID/GID (99:100)
# Alpine uses different user management
RUN addgroup -g 100 -S users 2>/dev/null || true && \
    adduser -u 99 -G users -s /bin/sh -D -H app

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