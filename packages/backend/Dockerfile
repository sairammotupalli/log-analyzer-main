FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace root and backend for proper pnpm resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
# Minimal frontend package.json so workspace install succeeds
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install --frozen-lockfile

COPY packages/backend ./packages/backend

# Generate Prisma client before build (required for TypeScript types)
RUN pnpm --filter backend run db:generate

RUN pnpm --filter backend run build

# Entrypoint: generates JWT_SECRET if unset, runs db:push, then starts
COPY packages/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

WORKDIR /app/packages/backend

EXPOSE 4000

ENTRYPOINT ["/docker-entrypoint.sh"]
