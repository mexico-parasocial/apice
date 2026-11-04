#!/usr/bin/env bash
set -e

# ==============================================================================
# Ápice Demo Environment Launcher
#
# For demoing and inspecting the UI: boots the same infrastructure as
# `make run-dev-env`, loads demo data (courses, quizzes, pre-verified demo
# accounts, analytics cohort), rewinds the demo learner, then runs the API in
# the foreground with local demo video playback enabled.
#
# Not for real use: the demo accounts have known passwords and
# ALLOW_DIRECT_VIDEO_URLS is forced on. Use `make run-dev-env` for the
# official environment.
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# API port (override if 8000 is taken: `API_PORT=8001 make run-demo-env`).
API_PORT="${API_PORT:-8000}"
if lsof -iTCP:"$API_PORT" -sTCP:LISTEN > /dev/null 2>&1; then
  echo "❌ Port $API_PORT is already in use:"
  lsof -iTCP:"$API_PORT" -sTCP:LISTEN | tail -n +2 | head -3
  echo "   Free it, or pick another:  API_PORT=8001 make run-demo-env"
  exit 1
fi

# Host ports for Postgres (5434) and Redis (6381). Another project's stack may
# hold them; if something other than our own container is listening, use the
# next free port (data lives in docker volumes, so nothing is lost).
pick_port() { # <VAR> <default> <container> <first-fallback>
  local var="$1" default="$2" container="$3" candidate
  [ -n "${!var:-}" ] && return 0
  if lsof -iTCP:"$default" -sTCP:LISTEN > /dev/null 2>&1 \
    && ! docker ps --filter name="$container" --format '{{.Ports}}' | grep -q ":$default->"; then
    for candidate in $(seq "$4" $(( $4 + 20 ))); do
      if ! lsof -iTCP:"$candidate" -sTCP:LISTEN > /dev/null 2>&1; then
        export "$var=$candidate"
        echo "ℹ️  Port $default is in use by another stack — using $candidate for $container."
        return 0
      fi
    done
  fi
}
pick_port POSTGRES_PORT 5434 apice-postgres 5440
pick_port REDIS_PORT 6381 apice-redis 6390
# run-dev-env.sh turns these into DATABASE_URL / REDIS_URL; exported, they
# also reach the seeds and the API started below.
if [ -n "${POSTGRES_PORT:-}" ]; then
  export DATABASE_URL="postgresql://apice:apice@localhost:${POSTGRES_PORT}/apice_dev?schema=public"
fi
if [ -n "${REDIS_PORT:-}" ]; then
  export REDIS_URL="redis://localhost:${REDIS_PORT}"
fi

echo "🎬 [Ápice Demo-Env] Booting infrastructure..."
./scripts/run-dev-env.sh

echo "🌱 Loading demo data (idempotent — safe to re-run)..."
run_seed() {
  (cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child "scripts/$1")
}
run_seed seed-courses.ts
run_seed seed-quizzes.ts
run_seed seed-demo-users.ts
run_seed seed-demo-analytics.ts
run_seed demo-reset.ts

echo ""
echo "🎉 Demo environment is READY"
echo "--------------------------------------------------------"
echo "  Learner:  demo@apice.local   / Demo1234!"
echo "  Admin:    admin@apice.local  / see server/scripts/seed-demo-users.ts"
if [ "$API_PORT" != "8000" ]; then
  echo "  Mobile web:  EXPO_PUBLIC_API_URL=http://localhost:$API_PORT pnpm web"
else
  echo "  Mobile web:  pnpm web         (http://localhost:8081)"
fi
echo "  Admin web:   pnpm dev:admin   (http://localhost:3000)"
echo "  Reset learner between runs:  make demo-reset"
echo "--------------------------------------------------------"
echo "▶️  API starting on http://localhost:$API_PORT (Ctrl+C to stop)"
echo ""

# Demo only: accept any local Expo web / admin port so the UI works whichever
# port the bundler picked (the official env keeps the strict list in .env).
ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
for p in 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090; do
  ORIGINS="$ORIGINS,http://localhost:$p,http://127.0.0.1:$p"
done

# Demo clips are served from server/fixtures/videos at /demo-media.
PORT="$API_PORT" ALLOWED_ORIGINS="$ORIGINS" ALLOW_DIRECT_VIDEO_URLS=true exec pnpm dev:server
