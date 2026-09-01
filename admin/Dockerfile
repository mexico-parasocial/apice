FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# Copy workspace metadata so pnpm can resolve the monorepo lockfile.
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml ./
COPY patches ./patches
COPY admin/package.json ./admin/
COPY packages/lexicons/package.json ./packages/lexicons/
COPY packages/mobile/package.json ./packages/mobile/
COPY packages/mobile-app/package.json ./packages/mobile-app/

RUN pnpm install --frozen-lockfile

COPY admin ./admin
COPY packages ./packages

ENV NEXT_TELEMETRY_DISABLED=1
# Next inlines NEXT_PUBLIC_* into the client bundle at build time — runtime
# env can't change them, so they must arrive as build args.
ARG NEXT_PUBLIC_SERVER_URI
ARG NEXT_PUBLIC_SOCKET_SERVER_URI
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SERVER_URI=$NEXT_PUBLIC_SERVER_URI \
    NEXT_PUBLIC_SOCKET_SERVER_URI=$NEXT_PUBLIC_SOCKET_SERVER_URI \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter admin build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
# The copied node_modules don't match /app/package.json (it's the admin
# package in a workspace layout); without this, pnpm 11 runs a full
# install at startup before `next start` ever binds.
ENV npm_config_verify_deps_before_run=false

COPY --from=builder /app/admin/.next ./.next
COPY --from=builder /app/admin/package.json ./package.json
COPY --from=builder /app/admin/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/admin/next.config.* ./

EXPOSE 3000

CMD ["pnpm", "next", "start", "-p", "3000"]
