#!/bin/sh
set -e

# Generate NEXTAUTH_SECRET at runtime if not set
if [ -z "$NEXTAUTH_SECRET" ]; then
  export NEXTAUTH_SECRET=$(openssl rand -base64 48)
  echo "[entrypoint] Generated NEXTAUTH_SECRET (not persisted — set NEXTAUTH_SECRET in env for production)"
fi

# Ensure NEXTAUTH_URL is set for Docker
if [ -z "$NEXTAUTH_URL" ]; then
  export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}"
fi

echo "[entrypoint] Starting frontend..."
exec pnpm run start
