#!/usr/bin/env bash
set -e

# ==============================================================================
# Ápice Dev Environment Launcher (Inspired by bluesky-social/atproto)
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🚀 [Ápice Dev-Env] Initializing development environment..."

# 1. Ensure server/.env exists
if [ ! -f "server/.env" ]; then
  echo "📄 Creating server/.env from server/.env.example..."
  cp server/.env.example server/.env
fi

# 2. Cleanup stale infrastructure containers (Conflict Prevention)
#    Only removes Postgres & Redis — leaves server/indexer/admin untouched so
#    parallel dev processes are not killed.
echo "🧹 Checking for stale infrastructure containers..."
docker compose rm -fs postgres redis > /dev/null 2>&1 || true

# 3. Boot infrastructure services (Postgres & Redis)
echo "🐳 Starting Postgres and Redis via Docker Compose..."
docker compose up -d postgres redis

# 4. Wait for Postgres health check & grant schema permissions
echo "⏳ Waiting for PostgreSQL to accept connections..."
until docker compose exec -T postgres pg_isready -U apice -d apice_dev > /dev/null 2>&1; do
  sleep 1
done
docker compose exec -T postgres psql -U apice -d apice_dev -c "GRANT ALL ON SCHEMA public TO apice; ALTER SCHEMA public OWNER TO apice;" > /dev/null 2>&1 || true
echo "✅ PostgreSQL is ready."

# 5. Wait for Redis health check
echo "⏳ Waiting for Redis to accept connections..."
until docker compose exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "✅ Redis is ready."

# 6. Apply database migrations
echo "📦 Running Prisma database migrations..."
(cd server && pnpm exec prisma migrate dev --name init_dev || pnpm exec prisma migrate deploy)
echo "✅ Database schema is up to date."

echo ""
echo "🎉 Development environment is READY!"
echo "--------------------------------------------------------"
echo "  • Server API:   pnpm dev:server    (http://localhost:8000)"
echo "  • Admin Web:    pnpm dev:admin     (http://localhost:3000)"
echo "  • Mobile Web:   pnpm web           (http://localhost:8081)"
echo "  • Indexer:      pnpm --filter server worker:indexer"
echo "--------------------------------------------------------"
