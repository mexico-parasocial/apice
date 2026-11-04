#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Lightweight health monitor — curls /ready + /metrics and alerts on failure.
# Designed for cron (e.g. */5 * * * *) or manual runs.
#
# Environment:
#   API_BASE_URL   — base URL of the Ápice API (default: http://localhost:8000)
#   ALERT_WEBHOOK  — optional Slack/Discord/Mattermost webhook URL
#   ALERT_EMAIL    — optional email address (requires mailx)
# ==============================================================================

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
LOGFILE="${LOGFILE:-/tmp/apice-health-check.log}"

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

alert() {
  local message="$1"
  echo "[$(timestamp)] ALERT: $message" | tee -a "$LOGFILE"

  if [ -n "$ALERT_WEBHOOK" ]; then
    curl -sf -X POST "$ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"Apice health check FAILED: $message\"}" \
      > /dev/null 2>&1 || true
  fi

  if [ -n "$ALERT_EMAIL" ] && command -v mailx > /dev/null 2>&1; then
    echo "$message" | mailx -s "Apice Health Check FAILED" "$ALERT_EMAIL" || true
  fi
}

ok() {
  echo "[$(timestamp)] OK: $1" >> "$LOGFILE"
}

# --- /ready probe ---
ready_status=$(curl -sf -o /dev/null -w "%{http_code}" "$API_BASE_URL/ready" 2>/dev/null || echo "000")
if [ "$ready_status" = "200" ]; then
  ok "/ready returned 200"
else
  alert "/ready returned $ready_status (expected 200)"
fi

# --- /metrics probe (Prometheus) ---
metrics_status=$(curl -sf -o /dev/null -w "%{http_code}" "$API_BASE_URL/metrics" 2>/dev/null || echo "000")
if [ "$metrics_status" = "200" ]; then
  ok "/metrics returned 200"
else
  alert "/metrics returned $metrics_status (expected 200)"
fi

# --- Check for unhealthy containers (Docker only) ---
if command -v docker > /dev/null 2>&1; then
  unhealthy=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null || true)
  if [ -n "$unhealthy" ]; then
    alert "Unhealthy containers: $unhealthy"
  else
    ok "No unhealthy containers"
  fi
fi

echo "[$(timestamp)] Health check complete" >> "$LOGFILE"
