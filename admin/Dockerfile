FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# Copy workspace metadata so pnpm can resolve the monorepo lockfile.
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml ./
COPY admin/package.json ./admin/
COPY packages/lexicons/package.json ./packages/lexicons/
COPY packages/mobile/package.json ./packages/mobile/
COPY packages/mobile-app/package.json ./packages/mobile-app/

RUN pnpm install --frozen-lockfile

COPY admin ./admin
COPY packages ./packages

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter admin build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY --from=builder /app/admin/.next ./.next
COPY --from=builder /app/admin/package.json ./package.json
COPY --from=builder /app/admin/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/admin/next.config.* ./

EXPOSE 3000

CMD ["pnpm", "next", "start", "-p", "3000"]
