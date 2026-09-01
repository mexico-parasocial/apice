FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl

# Enable pnpm 11.7.0 via corepack.
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# Copy workspace configuration so pnpm can resolve the monorepo lockfile.
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml ./
COPY patches ./patches
COPY server/package.json ./server/
COPY admin/package.json ./admin/
COPY packages/lexicons/package.json ./packages/lexicons/
COPY packages/mobile/package.json ./packages/mobile/
COPY packages/mobile-app/package.json ./packages/mobile-app/

RUN pnpm install --frozen-lockfile

COPY server/prisma ./server/prisma
COPY server/. ./server/

RUN pnpm --filter server exec prisma generate
RUN pnpm --filter server build

EXPOSE 8000
CMD ["sh", "-c", "pnpm --filter server exec prisma migrate deploy && pnpm --filter server start"]
