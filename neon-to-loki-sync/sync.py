#!/usr/bin/env python3
"""Sync Neon DB access logs to local Loki, so production user activity appears in Grafana."""

import json
import os
import subprocess
import time
import urllib.request
from datetime import datetime, timezone

NEON_URL = os.environ["NEON_DATABASE_URL"]
LOKI_URL = os.environ.get("LOKI_URL", "http://loki:3100")
STATE_FILE = "/tmp/neon_sync_state.txt"
BATCH_SIZE = 200
SLEEP_SEC = 15
STREAM_LABEL = "devshare-backend"  # Same label Promtail uses; Grafana picks it up automatically


def read_cursor() -> str:
    try:
        with open(STATE_FILE) as f:
            return f.read().strip()
    except FileNotFoundError:
        # Default: 7 days ago captures all existing production access logs
        past = datetime.now(timezone.utc).timestamp() - 7 * 86400
        return datetime.fromtimestamp(past, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + "000Z"


def write_cursor(ts: str) -> None:
    with open(STATE_FILE, "w") as f:
        f.write(ts)


def query_neon(last_sync: str) -> list[dict]:
    sql = f"""SELECT row_to_json(t)::text FROM (
        SELECT
            created_at::timestamptz AS ts,
            COALESCE(ip, '') AS ip,
            COALESCE(username, 'anonymous') AS username,
            COALESCE(user_agent, '') AS user_agent,
            COALESCE(method, '') AS method,
            COALESCE(path, '') AS path,
            status,
            duration_ms,
            bytes_sent
        FROM access_log
        WHERE created_at > '{last_sync}'::timestamptz
        ORDER BY created_at ASC
        LIMIT {BATCH_SIZE}
    ) t;"""

    result = subprocess.run(
        ["psql", NEON_URL, "-At", "-c", sql],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        print(f"[sync] psql error: {result.stderr.strip()}")
        return []

    lines = [l.strip() for l in result.stdout.split("\n") if l.strip()]
    return [json.loads(l) for l in lines]


def push_to_loki(entries: list[dict]) -> None:
    streams: dict[str, list] = {}

    for entry in entries:
        # Use current timestamp (Loki rejects old timestamps by default)
        nano_ts = str(time.time_ns())

        username = entry.get("username", "anonymous")
        log_line = json.dumps({
            "ip": entry.get("ip", ""),
            "username": username,
            "user_agent": entry.get("user_agent", ""),
            "method": entry.get("method", ""),
            "path": entry.get("path", ""),
            "status": entry.get("status"),
            "duration_ms": entry.get("duration_ms"),
            "bytes_sent": entry.get("bytes_sent"),
        })

        # Group by username for stream label cardinality control
        key = f"{STREAM_LABEL}|{username}"
        if key not in streams:
            streams[key] = {
                "stream": {
                    "service_name": STREAM_LABEL,
                    "username": username,
                },
                "values": [],
            }
        streams[key]["values"].append([nano_ts, log_line])

    payload = {"streams": [s for s in streams.values()]}
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        f"{LOKI_URL}/loki/api/v1/push",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        print(f"[sync] Pushed {len(entries)} entries → Loki ({resp.status})")
    except urllib.error.URLError as e:
        print(f"[sync] Loki push error: {e}")


def main():
    print("[sync] Neon → Loki sync started (cursor: read from state file)")
    last_sync = read_cursor()
    print(f"[sync] Initial cursor: {last_sync}")

    while True:
        entries = query_neon(last_sync)
        if entries:
            push_to_loki(entries)
            last_sync = entries[-1]["ts"]
            write_cursor(last_sync)
            print(f"[sync] Cursor advanced to {last_sync}")
        else:
            print(f"[sync] No new entries, sleeping {SLEEP_SEC}s...")

        time.sleep(SLEEP_SEC)


if __name__ == "__main__":
    main()
