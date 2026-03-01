# packages/frontend/Dockerfile

FROM node:20-alpine AS builder
WORKDIR /repo
RUN corepack enable

# Copy workspace manifests (root)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy frontend manifest (so pnpm can resolve workspace deps)
COPY packages/frontend/package.json packages/frontend/

# Install deps for build
RUN pnpm install --frozen-lockfile

# Copy rest of repo
COPY . .

# Build frontend only
RUN pnpm --filter frontend run build


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# Ensure destination directory exists
RUN mkdir -p /app/packages/frontend

# Copy workspace manifests for production install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json packages/frontend/

# Install only frontend deps (and its deps) for runtime
RUN pnpm install --frozen-lockfile --prod --filter frontend...

# Copy built output + public + package.json from builder
COPY --from=builder /repo/packages/frontend/.next /app/packages/frontend/.next
COPY --from=builder /repo/packages/frontend/public /app/packages/frontend/public
COPY --from=builder /repo/packages/frontend/package.json /app/packages/frontend/package.json

WORKDIR /app/packages/frontend
EXPOSE 3000
CMD ["pnpm", "start"]