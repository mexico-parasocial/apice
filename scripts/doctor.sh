#!/usr/bin/env bash
set -uo pipefail

# ==============================================================================
# Ápice Service Doctor
# Pattern borrowed from the atproto monorepo: one command that answers "is
# anything obviously wrong?" before a human reports it. Checks the API's own
# probes first, then each dependency from inside the compose network.
#
# Usage:
#   ./scripts/doctor.sh          # local docker-compose.yml
#   ./scripts/doctor.sh --prod   # docker-compose.prod.yml
# ==============================================================================

PROD=0
[[ "${1:-}" == "--prod" ]] && PROD=1

if [[ $PROD -eq 1 ]]; then
  COMPOSE=(docker compose -f docker-compose.prod.yml)
  API_CONTAINER="apice-server"
  PREFIX="prod"
else
  COMPOSE=(docker compose)
  API_CONTAINER="apice-server"
  PREFIX="dev"
fi

PASS=0
FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
head() { echo; echo "── $1 ──────────────────────────────────"; }

# Is a container up at all?
check_container() {
  local name="$1"
  if "${COMPOSE[@]}" ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "$name"; then
    ok "$name is running"
  else
    bad "$name is NOT running"
  fi
}

# Does the API answer its probes from inside the network?
api_probe() {
  local path="$1" label="$2"
  local out
  out=$("${COMPOSE[@]}" exec -T "$API_CONTAINER" \
    wget -q -O - "http://localhost:8000${path}" 2>&1)
  if [[ $? -eq 0 ]]; then
    ok "$label: $out"
  else
    bad "$label failed: $out"
  fi
}

head "API probes"
check_container server
api_probe "/health" "liveness"
api_probe "/ready"  "readiness"
api_probe "/metrics" "metrics scrape" || true

head "Dependencies"
check_container postgres
"${COMPOSE[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER:-apice}" >/dev/null 2>&1 \
  && ok "postgres accepts connections" || bad "postgres NOT accepting connections"

check_container redis
"${COMPOSE[@]}" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG \
  && ok "redis answers PING" || bad "redis NOT answering"

head "Object storage / video"
check_container seaweed-master
"${COMPOSE[@]}" exec -T seaweed-master wget -q -O /dev/null http://localhost:9333/cluster/status 2>/dev/null \
  && ok "seaweed-master cluster status OK" || bad "seaweed-master cluster status FAILED"

check_container streamplace-node
"${COMPOSE[@]}" exec -T streamplace-node wget -q -O /dev/null http://localhost:38080/ 2>/dev/null \
  && ok "streamplace-node responds" || bad "streamplace-node NOT responding"

head "Summary ($PREFIX)"
echo "  $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && echo "  All good 👌" || { echo "  See docker compose logs for the failures above."; exit 1; }
