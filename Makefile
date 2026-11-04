# ==============================================================================
# Ápice monorepo — shortcuts for the pnpm scripts in package.json.
#   apps/api     Express API      apps/admin   Next.js panel
#   apps/mobile  Expo app         infra/       compose helpers, Caddy, ops scripts
# ==============================================================================

.PHONY: run-dev-env dev-api dev-admin dev-web dev-indexer seed down test typecheck doctor prod-doctor health-check clean monitoring-up

# Boot infrastructure (Postgres + Redis), run migrations & check health
run-dev-env:
	@./infra/scripts/dev/run-dev-env.sh

# Diagnose the running stack: API probes, Postgres, Redis, SeaweedFS, Streamplace
doctor:
	@./infra/scripts/dev/doctor.sh

# Same checks against the production compose file
prod-doctor:
	@./infra/scripts/dev/doctor.sh --prod

dev-api:
	pnpm dev:api

dev-admin:
	pnpm dev:admin

dev-web:
	pnpm web

dev-indexer:
	pnpm dev:indexer

# Seed demo content (civic courses)
seed:
	pnpm seed

typecheck:
	pnpm typecheck

test:
	pnpm test

# Stop all docker containers and clean up orphans
down:
	docker compose down --remove-orphans

# Full clean reset: stop containers and remove build artifacts
clean: down
	rm -rf node_modules/.cache apps/api/build apps/mobile/.expo apps/admin/.next

# Start Uptime Kuma monitoring UI (http://localhost:3001)
monitoring-up:
	docker compose -f docker-compose.prod.yml --profile monitoring up -d uptime-kuma

# One-shot health check (API /ready + /metrics + Docker unhealthy containers)
health-check:
	@./infra/scripts/dev/health-check.sh
