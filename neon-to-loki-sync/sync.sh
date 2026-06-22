#!/bin/sh
set -e

NEON_URL="${NEON_DATABASE_URL}"
LOKI_URL="${LOKI_URL:-http://loki:3100}"
STATE_FILE="/tmp/neon_sync_state.txt"
BATCH_SIZE=100
SLEEP_SEC=15

now_nanos() {
  # macOS: date +%N not available. Use python3
  python3 -c 'import time; print(time.time_ns())'
}

# Initialize cursor: last synced timestamp (ISO format, UTC)
if [ -f "$STATE_FILE" ]; then
  LAST_SYNC=$(cat "$STATE_FILE")
else
  # Default: sync last 1 hour
  LAST_SYNC=$(TZ=UTC date -v-1H +"%Y-%m-%dT%H:%M:%S.000Z")
fi

while true; do
  echo "[sync] Syncing from $LAST_SYNC"

  psql "$NEON_URL" -At \
    -v "last_sync='$LAST_SYNC'" \
    -c "SELECT row_to_json(t) FROM (
      SELECT
        \"createdAt\"::timestamptz as ts,
        \"ip\",
        COALESCE(\"username\", 'anonymous') as username,
        COALESCE(\"userAgent\", '') as user_agent,
        COALESCE(\"method\", '') as method,
        COALESCE(\"path\", '') as path,
        \"status\",
        \"durationMs\" as duration_ms,
        \"bytesSent\" as bytes_sent
      FROM \"AccessLog\"
      WHERE \"createdAt\" > '$LAST_SYNC'::timestamptz
      ORDER BY \"createdAt\" ASC
    ) t;" 2>/dev/null | while IFS= read -r line; do
      if [ -z "$line" ]; then continue; fi

      # Extract timestamp from the JSON row for cursor tracking
      TS_ISO=$(echo "$line" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ts'])" 2>/dev/null)
      if [ -z "$TS_ISO" ]; then continue; fi
      LAST_SYNC="$TS_ISO"

      # Build the log line (same format as access-logger.ts)
      LOG_LINE=$(echo "$line" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read())
entry = {
    'ip': d.get('ip',''),
    'username': d.get('username','anonymous'),
    'user_agent': d.get('user_agent',''),
    'method': d.get('method',''),
    'path': d.get('path',''),
    'status': d.get('status'),
    'duration_ms': d.get('duration_ms'),
    'bytes_sent': d.get('bytes_sent')
}
print(json.dumps(entry))
" 2>/dev/null)

      NANO_TS=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${TS_ISO%Z}" +%s 2>/dev/null || echo "")
      if [ -z "$NANO_TS" ]; then
        NANO_TS=$(python3 -c "import datetime; print(int(datetime.datetime.fromisoformat('$TS_ISO').timestamp() * 1e9))" 2>/dev/null)
      fi

      if [ -z "$NANO_TS" ] || [ "$NANO_TS" = "0" ]; then
        NANO_TS=$(now_nanos)
      fi

      USERNAME=$(echo "$LOG_LINE" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('username','anonymous'))")

      curl -s -X POST "$LOKI_URL/loki/api/v1/push" \
        -H "Content-Type: application/json" \
        -d "{
          \"streams\": [{
            \"stream\": {
              \"service_name\": \"devshare-backend\",
              \"username\": \"$USERNAME\"
            },
            \"values\": [[\"$NANO_TS\", $(echo "$LOG_LINE" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))")]]
          }]
        }" -o /dev/null -w "%{http_code}" 2>/dev/null | read -r http_code
    done

  # Save cursor
  echo "$LAST_SYNC" > "$STATE_FILE"
  echo "[sync] Cursor updated to $LAST_SYNC. Sleeping ${SLEEP_SEC}s..."
  sleep $SLEEP_SEC
done
