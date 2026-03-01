#!/bin/sh
set -e

# Generate JWT_SECRET at runtime if not set
if [ -z "$JWT_SECRET" ]; then
  export JWT_SECRET=$(openssl rand -base64 48)
  echo "[entrypoint] Generated JWT_SECRET (not persisted — set JWT_SECRET in env for production)"
fi

# Initialize database (Prisma)
echo "[entrypoint] Running database migrations..."
pnpm run db:push || true

echo "[entrypoint] Starting backend..."
exec pnpm run start
