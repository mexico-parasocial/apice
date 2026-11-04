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

# Standalone output (monorepo layout): traces nest the app as admin/.
COPY --from=builder /app/admin/.next/standalone ./
COPY --from=builder /app/admin/.next/static ./admin/.next/static
COPY --from=builder /app/admin/public ./admin/public

# The OAuth client-metadata is served as a STATIC file: Next's internal
# worker routing rewrites the Host header (127.0.0.1:<ipc-port>), which a
# route handler would bake into the client_id. ARG it in instead.
ARG ADMIN_BASE_URL
RUN mkdir -p ./api/oauth && \
    printf '{\n  "client_id": "%s/api/oauth/client-metadata",\n  "client_name": "Ápice Admin",\n  "client_uri": "%s",\n  "redirect_uris": ["%s/oauth/callback"],\n  "scope": "atproto transition:generic",\n  "response_types": ["code"],\n  "grant_types": ["authorization_code", "refresh_token"],\n  "token_endpoint_auth_method": "none",\n  "application_type": "web",\n  "dpop_bound_access_tokens": true\n}\n' \
      "$ADMIN_BASE_URL" "$ADMIN_BASE_URL" "$ADMIN_BASE_URL" > ./api/oauth/client-metadata.json

# Documented standalone runtime trio: without NODE_ENV the render worker
# dies, and without HOSTNAME the server binds the container hostname
# instead of a reachable interface.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app/admin

EXPOSE 3000

CMD ["node", "server.js"]
