# syntax=docker/dockerfile:1.7
FROM node:20-bookworm AS build

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

# build assets (tailwind, etc.). Adapt to your package.json scripts if different.
# If your repo doesn't have build:css, remove/modify the next line.
RUN npm run build:css || true

# prune dev deps to reduce image size
RUN npm prune --production || true

# runtime image
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=UTC

# minimal runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
	&& rm -rf /var/lib/apt/lists/*

# create app user for safety
RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

# copy app from build stage
COPY --from=build /src /app

# ensure data folder exists & not owned by root for Unraid cases
RUN mkdir -p /app/data && chown -R app:app /app/data

# small entrypoint that will drop privileges; we provide the script inline for simplicity
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health >/dev/null 2>&1 || exit 1

USER app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
