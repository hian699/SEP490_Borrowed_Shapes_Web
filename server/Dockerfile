# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable

# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Generate Prisma client (uses @prisma/adapter-pg, no native binary needed)
RUN pnpm exec prisma generate
RUN pnpm build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs -G nodejs

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --chown=nestjs:nodejs package.json ./

USER nestjs
EXPOSE 3001

# CMD chỉ khởi động server; migrations chạy qua command trong docker-compose
CMD ["node", "dist/main"]
