#!/usr/bin/env bash
# Sends one test notification through Expo's push API.
# Usage: scripts/send-test-push.sh 'ExpoPushToken[xxxxxxxx]' ["title"] ["body"]
# Prints Expo's ticket, then (after a few seconds) the delivery receipt. A
# receipt error of InvalidCredentials / MismatchSenderId means the FCM key
# uploaded with `eas credentials` is missing or belongs to another Firebase project.
set -euo pipefail

token="${1:?usage: $0 'ExpoPushToken[...]' [title] [body]}"
title="${2:-Ápice}"
body="${3:-Notificación de prueba}"

ticket=$(curl -sS https://exp.host/--/api/v2/push/send \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"to":sys.argv[1],"title":sys.argv[2],"body":sys.argv[3],"channelId":"default"}))' "$token" "$title" "$body")")
echo "ticket:  $ticket"

id=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1])["data"]; print(d.get("id","") if isinstance(d,dict) else "")' "$ticket")
[ -n "$id" ] || { echo "No ticket id: Expo rejected the push (see above)."; exit 1; }

sleep 8
echo "receipt: $(curl -sS https://exp.host/--/api/v2/push/getReceipts -H 'Content-Type: application/json' -d "{\"ids\":[\"$id\"]}")"
