#!/bin/sh
set -e

# Variables par défaut pour Unraid/Docker
: "${PUID:=99}"
: "${PGID:=100}"
: "${PORT:=30009}"

echo "[entrypoint] Starting with PUID=${PUID} PGID=${PGID}"

# Créer TOUS les dossiers nécessaires au démarrage
# Ces dossiers doivent exister AVANT que Node.js démarre
REQUIRED_DIRS="/app/data /app/data/logs /app/data/.cache_trakt /app/data/.secrets /app/data/sessions /app/config"

for dir in $REQUIRED_DIRS; do
  if [ ! -d "$dir" ]; then
    echo "[entrypoint] Creating directory: $dir"
    mkdir -p "$dir" 2>/dev/null || true
  fi
done

# Si on est root (UID 0), on peut changer les permissions
if [ "$(id -u)" = "0" ]; then
  echo "[entrypoint] Running as root, setting permissions..."
  # Changer les permissions de TOUS les dossiers data
  chown -R ${PUID}:${PGID} /app/data /app/config 2>/dev/null || true
  chmod -R 755 /app/data /app/config 2>/dev/null || true
  
  # Exécuter en tant que l'utilisateur spécifié
  echo "[entrypoint] Switching to user ${PUID}:${PGID}"
  exec su-exec ${PUID}:${PGID} "$@"
else
  # On n'est pas root, essayer quand même de créer les dossiers
  echo "[entrypoint] Not running as root (UID=$(id -u))"
  
  # Vérifier si on peut écrire dans /app/data
  if [ -w "/app/data" ]; then
    echo "[entrypoint] /app/data is writable, creating subdirectories..."
    mkdir -p /app/data/logs /app/data/.cache_trakt /app/data/.secrets /app/data/sessions 2>/dev/null || true
  else
    echo "[entrypoint] WARNING: Cannot write to /app/data - logs may fail"
    echo "[entrypoint] To fix: chown -R ${PUID}:${PGID} ./data on host"
  fi
  
  # Exécuter normalement
  exec "$@"
fi

# Provide a safe default for session secret if user didn't set it
if [ -z "${SESSION_SECRET}" ]; then
  export SESSION_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  echo "[entrypoint] Generated SESSION_SECRET"
fi