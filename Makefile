# ==============================================================================
# Ápice Monorepo Makefile (Inspired by bluesky-social/atproto)
# ==============================================================================

.PHONY: run-dev-env dev dev-server dev-admin dev-web down test typecheck doctor prod-doctor clean

# Boot infrastructure (Postgres + Redis), run migrations & check health
run-dev-env:
	@./scripts/run-dev-env.sh

# Diagnose the running stack: API probes, Postgres, Redis, SeaweedFS, Streamplace
doctor:
	@./scripts/doctor.sh

# Same checks against the production compose file
prod-doctor:
	@./scripts/doctor.sh --prod

# Start backend server
dev-server:
	pnpm dev:server

# Start Next.js admin dashboard
dev-admin:
	pnpm dev:admin

# Start React Native Expo web bundler
dev-web:
	pnpm web

# Run full typecheck across monorepo packages
typecheck:
	pnpm typecheck

# Stop all docker containers and clean up orphans
down:
	docker compose down --remove-orphans

# Full clean reset: stop containers and clean node_modules build artifacts
clean: down
	rm -rf node_modules/.cache server/build packages/mobile-app/.expo admin/.next
