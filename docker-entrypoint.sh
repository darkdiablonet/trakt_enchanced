#!/bin/sh
set -e

: "${PUID:=1000}"
: "${PGID:=1000}"
: "${PORT:=30009}"

# if running as root (rare), try to chown data dir
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/data/logs
  chown -R ${PUID}:${PGID} /app/data || true
fi

# Provide a safe default for session secret if user didn't set it
if [ -z "${SESSION_SECRET}" ]; then
  export SESSION_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  echo "[entrypoint] generated SESSION_SECRET"
fi

# Start the node app (assumes server.js in repo root)
exec "$@"
