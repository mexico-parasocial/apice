FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl

# Enable pnpm 11.7.0 via corepack.
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# Copy workspace configuration so pnpm can resolve the monorepo lockfile.
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/
# prisma generate is the API's postinstall — the schema must exist before
# install, or the container build dies looking for it (CI installs from a
# full checkout and never sees this).
COPY apps/api/prisma ./apps/api/prisma
COPY apps/admin/package.json ./apps/admin/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/lexicons/package.json ./packages/lexicons/

RUN pnpm install --frozen-lockfile

# Runtime workspace source the API imports (installed as a symlink to
# packages/lexicons — plain JS + JSON schemas, nothing to compile).
COPY packages/lexicons ./packages/lexicons
# Includes templates/ and fixtures/, resolved at runtime from the package
# root (src/platform/paths.ts) — tsc does not copy them into build/.
COPY apps/api/. ./apps/api/

RUN pnpm --filter @apice/api exec prisma generate
RUN pnpm --filter @apice/api build

EXPOSE 8000
CMD ["sh", "-c", "pnpm --filter @apice/api exec prisma migrate deploy && pnpm --filter @apice/api start"]
