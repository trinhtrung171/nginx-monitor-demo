# Session Summary — nginx-monitor-demo

## Overall Project Goal
Monitor Nginx with Docker Compose stack: Nginx → Backend (Bun/Elysia) → Postgres, with Prometheus/Grafana/OTel observability pipeline. Frontend SPA served by Nginx. Render backend hosts live demo.

## Active Architecture

- **Frontend**: Dual env — `.env.development` → `VITE_API_URL=http://localhost:8080` (local dev), `.env.production` → `VITE_API_URL=https://nginx-monitor-demo.onrender.com` (build/deploy)
- **Dual Database**: Local Docker Postgres (`devshare-db:5432`, uid `devshare-postgres-local`) vs Neon cloud (uid `devshare-postgres-neon`)
- **Grafana Dashboard**: User Access Logs uses Loki datasource (`devshare-loki`) exclusively — no PostgreSQL queries
- **Render Backend**: Exposes `/metrics` via prom-client, scraped by local Prometheus (`render-backend` job). Writes access logs to Neon DB.
- **Local Backend**: Exports OTel metrics → OTel Collector → Prometheus:8889, plus own `/metrics` (prom-client, scraped by `devshare-backend` job). Writes access logs to Loki via console.log → Promtail.
- **Uploads**: Stored in DB via `Media` Prisma model (persists across restarts on Render); filesystem fallback exists

## Session: June 18, 2026

### Completed

1. **Docker rebuild & upload/serve verification**
   - Rebuilt `devshare-backend` with `index.ts` changes (staticPlugin removal, file.exists guard)
   - Verified upload → URL, serve 200/404 JSON

2. **Metrics Auth**
   - Added `METRICS_AUTH_TOKEN` env var → Bearer token check in `prometheus-exporter.ts`
   - Updated `prometheus.yml` with `authorization` header config
   - Updated `devshare-docker-compose.yml` to pass token
   - Created `prometheus/metrics_token.txt`

3. **Media Persistence (DB storage)**
   - Added `Media` model to Prisma schema (id, filename, mimeType, data/Bytes, size, createdAt)
   - Modified `/upload` to save file bytes to DB
   - Modified `/uploads/:id` to serve from DB with filesystem fallback
   - Updated Dockerfile CMD to `prisma db push && bun run src/index.ts`
   - Applied schema to Neon (production) and local Postgres

4. **Investigation: Disappearing posts/uploads**
   - Discovered frontend `.env` hardcodes `VITE_API_URL=https://nginx-monitor-demo.onrender.com`
   - Render backend connects to Neon cloud DB (separate from local Postgres)
   - Local Docker Postgres only has 4 seed posts
   - Uploads on Render were saved to ephemeral filesystem (lost on restart); now fixed via Media DB model

5. **`.gitignore`** — Added `app/reddit_backend/public/uploads/`

6. **Dashboard Verification — "Application — API Performance"**
   - All 9 panels use metric names that exist in Prometheus:
     - `http_server_requests_total` ✅ (from `render-backend` + `otel-collector` scrape jobs)
     - `http_server_duration_milliseconds_bucket` ✅
     - `process_cpu_usage` ✅ / `process_memory_usage_bytes` ✅
     - `app_errors_total` ✅
     - `probe_success{job="blackbox"}` ✅
     - `nginx_connections_active` / `nginx_connections_waiting` ✅
     - `nginx_http_requests_total` ✅
   - Prometheus targets: 8/8 up (excluding node-exporter)

### Known Issues / Open Items

- OTel Collector exports `app_access_total` (custom name), not `http_server_requests_total`. The fact that `http_server_requests_total` appears from `otel-collector` job needs investigation — may be from Render's prometheus direct scrape labeled differently.

### Session Addendum: DB Dashboard Fix (June 18, 2026)

7. **Database Dashboard 0 data fix**
   - **Root cause**: `db_queries_total`, `db_query_duration_milliseconds`, `slow_query_total` chỉ được emit qua OTel (`db.ts:6-18`). Frontend gọi Render, local backend không có traffic → DB metrics luôn 0.
   - **Fix (dual instrumentation)**: Thêm 3 metrics này vào prom-client `prometheus-exporter.ts:70-97` + thêm `devshare-backend` scrape job `prometheus.yml:82-90` → cả Render và local backend đều có DB metrics.
   - **Files changed**:
     - `app/reddit_backend/src/prometheus-exporter.ts` — thêm `dbQueriesCounter`, `dbQueryDurationHistogram`, `slowQueryCounter` + export `recordDbQuery()`, `recordSlowQuery()`
     - `app/reddit_backend/src/db.ts` — import & gọi `recordDbQuery()`, `recordSlowQuery()` song song với OTel
     - `prometheus/prometheus.yml` — thêm `devshare-backend` scrape job (target: `devshare-backend:3001`)
   - **Result**: DB dashboard panels query `sum(rate(db_queries_total[...]))` aggregate cả prom-client (Render + local) và OTel (local) → có data từ mọi traffic.
   - **Verification**: Query Rate 0.045 q/s, Avg Duration 7.45 ms, Prometheus targets 8/8 up.

8. **Prometheus targets**: Now 8/8 up (added `devshare-backend` job).

9. **Infrastructure Dashboard — System Health (No Data fix)**
   - **Root cause**: Node Exporter container chưa từng được start → `node-*` metrics không tồn tại → 5 panels đều No Data
   - **Fix**: `docker compose -f monitor-docker-compose.yml up -d node-exporter`
   - **Result**: CPU 46.7%, RAM 13.3%, Load 0.09, Disk I/O 375 KB/s, Net I/O ~50 B/s

### Session: June 19, 2026

10. **IP always 127.0.0.1 fix**
    - **Root cause**: `getClientIp()` (`otel-middleware.ts:65-91`) chỉ check `x-real-ip` → `cf-connecting-ip` → `Bun.requestIP()`, không check `x-client-ip` (frontend gửi IP thật từ `api.ipify.org`) và `x-forwarded-for` (nginx/proxy set).
    - Trên Docker Desktop macOS, `requestIP()` trả về null/undefined → fallback hardcoded `'127.0.0.1'`.
    - **Fix**: Thêm `x-client-ip` (ưu tiên cao nhất), `x-forwarded-for` (parse first IP), đổi fallback thành `'0.0.0.0'`, refactor thành `cleanIp()` helper.
    - **Result**: Frontend gửi `x-client-ip` → backend dùng đúng IP thật. curl không header → `0.0.0.0` thay vì `127.0.0.1`.

11. **Username always anonymous fix**
    - **Root cause 1 (local test)**: curl không gửi `x-user-id` → mặc định `'anonymous'`. Frontend gửi `x-user-id` nhưng `VITE_API_URL` trỏ Render, không đến local backend.
    - **Root cause 2 (silent failure)**: `getUsername()` catch block im lặng, không log error → khó debug.
    - **Root cause 3 (FK error)**: Khi userId gửi lên không tồn tại trong DB, `AccessLog.userId` FK constraint fail → `.catch(() => {})` swallow error → mất row.
    - **Fix**: Thêm `console.error` vào catch của `getUsername()`. Nếu username là `'anonymous'` (user không tồn tại) → set `userId = null` trước khi ghi DB, tránh FK violation.
    - **Result**: userId hợp lệ → username đúng (e.g. `devshare_admin`). userId không hợp lệ → `username: anonymous, userId: null`, không FK error.

12. **Dual-mode frontend & Grafana datasource switch**
    - **Problem**: Frontend luôn gọi Render → data vào Neon, Grafana query local Postgres → không thấy data production.
    - **Fix**:
      - `app/reddit_frontend/.env.development` → `VITE_API_URL=http://localhost:8080` (dùng `npm run dev` cho local)
      - `grafana/provisioning/datasources/postgres-neon.yml` → Neon datasource (uid `devshare-postgres-neon`)
      - `user-access-dashboard.json` → thêm variable `$ds_postgres` type datasource, thay 15 hardcoded `devshare-postgres` thành `${ds_postgres}`
    - **Result**: Dev `npm run dev` → local data. Prod build → Render data. Dashboard có dropdown chọn Postgres DB.

### Key Config Files

- `devshare-docker-compose.yml` — entire stack
- `monitor-docker-compose.yml` — prometheus, grafana, loki, promtail, otel-collector
- `prometheus/prometheus.yml` — scrape configs (render-backend + devshare-backend with auth)
- `prometheus/otel-collector-config.yml` — OTel pipeline
- `app/reddit_backend/src/prometheus-exporter.ts` — prom-client metrics (HTTP + DB)
- `app/reddit_backend/src/db.ts` — DB metrics instrumentation (OTel + prom-client)
- `app/reddit_backend/src/otel-middleware.ts` — OTel metrics + `getClientIp()`
- `app/reddit_backend/src/access-logger.ts` — access logging (Loki + DB), username resolution
- `app/reddit_backend/prisma/schema.prisma` — Media model (no more AccessLog model)
- `app/reddit_backend/Dockerfile` — prisma db push in CMD
- `app/reddit_frontend/.env.development` — `VITE_API_URL=http://localhost:8080`
- `app/reddit_frontend/.env.production` — `VITE_API_URL=https://nginx-monitor-demo.onrender.com`
- `grafana/provisioning/datasources/postgres-neon.yml` — Neon cloud datasource
- `grafana/dashboards/user-access-dashboard.json` — User Access Logs (all Loki, no `ds_postgres`)
- `grafana/dashboards/application-dashboard.json` — Application — API Performance
- `grafana/dashboards/database-dashboard.json` — Database Queries

### Commands

```bash
# Rebuild & restart devshare-backend
docker compose -f devshare-docker-compose.yml build devshare-backend
docker compose -f devshare-docker-compose.yml up -d devshare-backend

# Restart Prometheus (after changing prometheus.yml)
docker compose -f monitor-docker-compose.yml restart prometheus

# Check logs
docker compose -f devshare-docker-compose.yml logs -f devshare-backend

# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | python3 -m json.tool

# Query DB metrics
curl -s 'http://localhost:9090/api/v1/query?query=db_queries_total'

# Generate local DB traffic (for testing)
curl -s http://localhost:3001/posts/

# View grafana
open http://localhost:3000
```

### Session: June 20, 2026

13. **Full User Access Logs Dashboard Audit + Fix**
   - **Audit result**: Duyệt chi tiết 7 panels, phát hiện và fix 6 issues:
     - **Panel 3 (HTTP Status Dist) — CRITICAL**: Query D thiếu `AND "status" IS NOT NULL` (9 rows NULL status biến mất khỏi pie chart). Thêm Query E: `SELECT COUNT(*)::int AS "Unknown (NULL)"`.
     - **Panel 7 (Access Logs DB) — Username**: `COALESCE(username, 'Guest')` không xử lý `'anonymous'`. Đổi thành `CASE WHEN username IS NULL OR username = 'anonymous' THEN 'Guest'`.
     - **Panel 7 — "Device" alias sai**: `userAgent AS "Device"` gây hiểu nhầm (Blackbox-Exporter != device). Đổi thành `"User Agent"`.
     - **Panel 7 — Layout gap**: y=32 → y=25 (xoá khoảng trống 7 units sau Panel 6).
     - **Panel 5 — Loki filter redundant**: Xoá `| path != "/metrics"` (đã filter ở source).
     - **Dashboard tags**: Thêm "loki", "monitoring".
   - **Loki data loss fix confirmed**: Filter `/metrics` từ `console.log` ở `access-logger.ts:78-79` hoạt động. Loki hiển thị data sau khi có traffic local.
   - **bytesSent fix**: Thêm `'content-length'` header vào `new Response(media.data)` ở `index.ts` giúp `computeBytesSent()` detect đúng kích thước file upload.
    - **Dashboard version**: 62 (đã restart Grafana).
    - **Files changed**:
      - `grafana/dashboards/user-access-dashboard.json` — 5 panel fixes
      - `app/reddit_backend/src/access-logger.ts` — skip /metrics trước console.log
      - `app/reddit_backend/src/index.ts` — content-length cho upload response

14. **Loki Panel 5 duplicate timestamp + Panel 3/6 SQL fix**
    - **Panel 3 & 6 — SQL syntax error**: Các query có `AND AND "status"` / `AND AND "bytesSent"` (double AND) → gây red exclamation mark. Xoá AND thừa.
    - **Panel 5 — duplicate timestamp**: `line_format "{{.timestamp}} | {{.ip}}..."` hiển thị ISO timestamp trùng với Grafana timestamp. Xoá `{{.timestamp}} | `.
    - **Loki data OK**: Promtail vẫn ship logs, data mới nhất tại `09:11:28` có trong Loki.
    - **Dashboard version**: 64.

15. **Login/logout tracking in Access Logs DB + dedup fix**
    - **Problem**: Logout chỉ xoá localStorage (client-side, không gọi API). Login không trigger `POST /access-logs`. Dedup key chỉ dùng IP → request từ cùng IP bị dedup dù user khác.
    - **Fix**:
      - `accessLogs.ts` — dedup key đổi từ `ip` thành `${ip}:${userId}` để tracking per-user. Khi user logout (userId thay đổi thành null) hoặc login (null → userId mới), mỗi session là key riêng → không bị dedup.
      - `AuthContext.jsx` — `login()` và `register()` gọi `POST /access-logs` với `x-user-id` của user mới sau khi login/register thành công. `logout()` gọi `POST /access-logs` với userId cũ trước khi clear.
    - **Result**: DB có trace rõ ràng: `guest → devshare_admin` (login), `devshare_admin → guest` (logout). Test xác nhận: 2 request từ cùng IP với userId khác nhau (null vs valid) đều được ghi vào DB.
    - **Files changed**:
      - `app/reddit_backend/src/routes/accessLogs.ts` — dedup key bao gồm userId
      - `app/reddit_frontend/src/AuthContext.jsx` — POST /access-logs trong login/logout/register

16. **Middleware DB writes + Bandwidth panel fix + logout→guest fix**
    - **Problem**: Logout ghi test03 thay vì guest. Bandwidth per IP panel luôn 0 (bytesSent=0). Middleware không ghi DB → chỉ có session ping entries.
    - **Fixes**:
      - `AuthContext.jsx` — `logout()` gọi POST /access-logs 2 lần: trước khi clear (với userId cũ) và sau khi clear (guest session với dedup key khác)
      - `access-logger.ts` — sau `console.log`, ghi DB 1 entry/IP/60s với real bytesSent, method, path, status → Bandwidth + IP panels có data thật
      - `user-access-dashboard.json` — Panel 6 SQL xoá `method = 'ACCESS'` filter, thêm `bytesSent > 0` → hiển thị real bandwidth data
    - **Result**: Bandwidth panel có data (GET /posts/ → 4786 bytes). Middleware ghi DB entry với method='GET'. Logout ghi đúng guest→test03→guest.
    - **Files changed**:
      - `app/reddit_frontend/src/AuthContext.jsx` — logout gọi 2 POST /access-logs
      - `app/reddit_backend/src/access-logger.ts` — DB write với rate limit 1/IP/60s
      - `grafana/dashboards/user-access-dashboard.json` — Panel 6 SQL

17. **Filter system/health-check traffic (replacing IP blocklist with header heuristic)**
    - **Problem**: IP blocklist (`skipIps`) không bền vững — Render health checks đến từ nhiều IP khác nhau (AWS, GCP, Azure), luôn có IP mới xuất hiện.
    - **Root cause**: System probes không gửi `x-client-ip` header (chỉ frontend thật mới gửi) và không gửi `x-user-id`.
    - **Fix**: Thay `skipIps` Set bằng `isRealUserRequest()` function — kiểm tra `x-client-ip || x-user-id` header. Nếu không có cả 2 → skip console.log + DB write.
    - **Result**: Mọi request từ Render health check, monitoring bots, hay curl không header đều tự động bị skip. Không cần maintain danh sách IP.
    - **Files changed**:
      - `app/reddit_backend/src/access-logger.ts` — replace skipIps with isRealUserRequest()

18. **Logout không ghi guest entry (stale fetchMeta.userId)**
    - **Problem**: Sau logout, POST /access-logs thứ 2 (guest) không được ghi vào DB. Chỉ hiện sau reload.
    - **Root cause**: `logout()` gọi `setUser(null)` rồi `fetch()` ngay. `fetchMeta.current.userId` chưa kịp update (React chưa re-render). Fetch wrapper vẫn gửi `x-user-id: <oldUserId>` → backend dedup key trùng với POST đầu → guest entry bị dedup.
    - **Fix**: `setTimeout(0)` để defer POST guest sau khi React kịp re-render và useEffect cập nhật fetchMeta.
    - **Files changed**:
      - `app/reddit_frontend/src/AuthContext.jsx` — setTimeout(0) quanh guest POST

19. **Filter non-browser traffic + Render health checks (UA heuristic)**
    - **Problem**: curl, HTTP libs, và Render Browser Health Checks đều lọt log dù x-client-ip có hoặc không.
    - **Fix**: `isRealUserRequest()` kiểm tra `(KHTML, like Gecko)` + `Chrome/` + `Safari/537.36` + `AppleWebKit/537.36` trong UA + `HeadlessChrome` (Render synthetic).
    - **Result**: Chỉ request từ Chrome/Safari/Edge browser thật mới được log. Curl, API clients, Firefox, HeadlessChrome đều skip.
    - **Files changed**:
      - `app/reddit_backend/src/access-logger.ts` — UA heuristic chi tiết hơn

20. **Dashboard: Extract device/platform from User-Agent**
    - **Problem**: Panel 7 hiển thị full UA string, quá dài.
    - **Fix**: Dùng `substring(userAgent from '\(([^)]+)\)')` để chỉ lấy phần platform (VD: `Windows NT 10.0; Win64; x64`).
    - **Files changed**:
      - `grafana/dashboards/user-access-dashboard.json` — SQL regex cho Device

### Session: June 21, 2026 (continued)

25. **User Access Logs audit — method='ACCESS' filter bug**
    - **Problem**: Tất cả SQL panels lọc `method = 'ACCESS'` → chỉ show session ping entries (`ACCESS / 200 0ms` từ `POST /access-logs`), KHÔNG show real HTTP request data (`GET /posts/ 200 42ms`). `method='ACCESS'` chỉ là heartbeat/session log, không phải HTTP request thật của user.
    - **Panels bị ảnh hưởng (6/7)**: Top 10 IPs, Request Rate, HTTP Status, Most Called Endpoints, Bandwidth, Access Logs DB.
    - **Fix**: Đổi all queries từ `method = 'ACCESS'` → `method != 'ACCESS'`. Panel 3 (HTTP Status) gộp 5 query riêng thành 1 CASE query.
    - **Files changed**:
      - `grafana/dashboards/user-access-dashboard.json` — user-access-dashboard-test.json

26. **TEST Neon Dashboard deleted + clone for testing**
    - Xoá dashboard `TEST Neon Dashboard` (uid: test-neon-dashboard) qua Grafana API.
    - Clone `user-access-dashboard.json` → `user-access-dashboard-test.json`.
    - **Fixes applied to test dashboard**:
      1. **Panel 3**: 5 separate COUNT queries → 1 query với `CASE WHEN status ... GROUP BY 1` — 1 round-trip, đúng format piechart
      2. **Datasource default**: `devshare-postgres-neon` → `devshare-postgres-local` (tránh vô tình query production)
      3. **Panel 1 + Panel 6**: Thêm `method != 'ACCESS'` (đồng nhất với các panel khác)
      4. **Default time range**: `now-30m` → `now-6h` (đủ data cho traffic thấp)
      5. **Panel 7 device**: Chưa fix — cần parse ở tầng app (ua-parser-js) mới đúng
    - **Files changed**:
      - `grafana/dashboards/user-access-dashboard-test.json` — new test dashboard

21. **Dashboard audit — all metrics verified**
    - Audited all 3 Grafana dashboards (Application — API Performance, Database Queries, User Access Logs).
    - Every PromQL/SQL/Loki query references metrics/fields/tables that exist.
    - **Application dashboard**: `http_server_requests_total`, `http_server_duration_milliseconds_bucket`, `process_cpu_usage`, `process_memory_usage_bytes`, `app_errors_total`, `probe_success{job="blackbox"}`, `nginx_connections_active`, `nginx_connections_waiting`, `nginx_http_requests_total` — all have data from Render + local jobs.
    - **Database dashboard**: `db_queries_total`, `db_query_duration_milliseconds_sum/_count`, `slow_query_total` — dual-instrumented via prom-client + OTel.
    - **User Access Logs**: All 7 panels verified with correct Grafana variables (`$ds_postgres`, `$ip`, `$method`, `$status`).

22. **No redundant CPU/RAM panels**
    - Application Dashboard → `process_cpu_usage` / `process_memory_usage_bytes` (per-process, from app's `/metrics`).
    - Infrastructure Dashboard → `node_cpu_seconds_total` / `node_memory_MemTotal_bytes` (host-level, from node-exporter).
    - Different scope → both needed, no redundancy.

23. **Promtail down → User Activity Log no data (fixed)**
    - **Root cause**: `promtail` container was down for ~4h (containers restart after Docker config changes).
    - **Fix**: `docker compose -f monitor-docker-compose.yml restart promtail` → logs flow again.
    - **Lesson**: Always check Promtail/agent status when log panels go dark.

24. **Live Slow Query Log formatting (database-dashboard.json)**
    - **Problem**: Panel 7 showed raw JSON (`{"duration_ms":13.0669...,"query":"SELECT...","type":"slow_query"}`) — hard to read.
    - **Fix**: Added `| json | __error__="" | line_format "⏱ {{ .duration_ms | substr 0 6 }}ms\n{{ .query }}"` — splits duration and SQL on separate lines, truncates precision.
    - **Verified via Loki API**: Output now renders as `⏱ 13.066ms\nSELECT ...` — much more readable.
    - **Added `timezone: "Asia/Ho_Chi_Minh"`** to dashboard JSON for local time display.
    - **Dashboard version**: 3.
    - **Files changed**:
      - `grafana/dashboards/database-dashboard.json` — Panel 7 expr + timezone

### Session: June 21, 2026 (afternoon)

27. **Loki panel (User Activity Log) no data — Promtail DNS failure**
    - **Symptom**: Test dashboard Panel 5 (User Activity Log, Loki) showed no data. All PostgreSQL panels (`ds_postgres`) had data.
    - **Root cause**: `promtail` không thể resolve hostname `loki` (`dial tcp: lookup loki on 127.0.0.11:53: no such host`) + Loki returned `empty ring` errors. Promtail bị restart nhiều lần (Docker compose changes), mất vị trí cursor → logs cũ không bao giờ được ship.
    - **Evidence**: Promtail logs show `error sending batch` + `no such host` at 04:42 UTC. Chỉ 11 log entries total trong Loki (từ sau restart gần nhất), trong đó có 1 access log duy nhất.
    - **Fix**: Tách healthcheck ra khỏi `monitor-docker-compose.yml` (Loki image không có curl/wget/shell → healthcheck luôn fail). Restart promtail. Tạo traffic test (5+ request browser-like) → verify data flow OK.
    - **Result**: Loki có 10 access log entries, pipeline working.
    - **Lesson**: Loki image `grafana/loki:latest` is distroless (không có curl/wget/shell) → không thể dùng HTTP healthcheck với `CMD`. Dùng TCP healthcheck hoặc bỏ qua (promtail có built-in retry).
    - **Files changed**:
      - `monitor-docker-compose.yml` — xoá loki healthcheck + promtail depends_on (gây start loop)
      - `grafana/dashboards/user-access-dashboard-test.json` — xác nhận loki panel hiển thị data

### Session: June 21, 2026 (evening) — Neon→Loki sync

28. **Neon→Loki sync: Production user activity in local Loki panel**
    - **Problem**: Loki panel (User Activity Log) chỉ có data từ local Docker backend (Promtail ship). Render backend (production) never ships to local Loki — chỉ ghi vào Neon DB. Grafana Loki panel luôn trống với production user data.
    - **Solution**: Created `neon-to-loki-sync/sync.py` — Python script queries Neon `AccessLog` table, pushes JSON log lines to Loki via HTTP API every 15s. Real IPs/usernames/device data từ Neon DB được sync vào Loki với labels `service_name="devshare-backend"` và `username`.
    - **Root cause (Loki invisible data)**: Loki (distroless, no config) từ chối old timestamps (June 14-19) vì out-of-order detection. Sync đã push thành công (HTTP 204) nhưng data không query được.
    - **Fix**: Sync script uses `time.time_ns()` (current time) instead of original `createdAt` from Neon. Data content (IP, username, path, method, status) remains real — only timestamp reflects sync time.
    - **Result**: Loki panel shows all 7 usernames (Sybau, test01-04, guest, anonymous) with real IPs (118.68.46.7 Vietnam, 116.96.44.197, etc.) and real HTTP requests (GET /subreddits/, POST /access-logs/, etc.).
    - **Sync stats**: 1,683 entries from Neon pushed as 7 streams (one per username), 26 unique IPs.
    - **Files changed**:
      - `neon-to-loki-sync/sync.py` — new sync script (Python, psql + Loki push API)
      - `neon-to-loki-sync/Dockerfile` — new `python:3-alpine` + `postgresql-client` image
      - `monitor-docker-compose.yml` — added `neon-to-loki-sync` service
      - `.env` — added `NEON_DATABASE_URL`

### Session: June 21, 2026 (night) — AccessLog cleanup + Loki-only dashboard + ALL 7 Panels Verified

29. **AccessLog DB table removed (complete cleanup)**
    - **Context**: All 7 dashboard panels migrated from PostgreSQL → Loki. AccessLog DB table no longer needed.
    - **Changes**:
      - `schema.prisma` — removed `AccessLog` model + relation from User
      - `access-logger.ts` — removed DB write block (was appending to AccessLog table with 1/IP/60s rate limit)
      - `routes/accessLogs.ts` — removed GET /access-logs handler, removed DB write from POST handler (only OTel metric + rate limiting remain)
      - `index.ts` — no change needed (route still mounted for session ping)
    - **DB cleanup**: Dropped `AccessLog` table from both local Postgres and Neon
    - **Result**: Backend still accepts POST /access-logs (for session tracking via OTel metric), but no longer writes to AccessLog DB table. All user activity visible in Loki panels only.

30. **ALL 7 Panels Verified — data flowing through Loki**
    - **Problem**: After removing AccessLog DB table + stopping neon-to-loki-sync, all Grafana panels showed "no data". Backend was still writing `console.log(JSON.stringify(logEntry))` but no browser-like traffic was being generated, and the `db` import was missing from `access-logger.ts` after the cleanup.
    - **Root cause**: `access-logger.ts` referenced `db` (Prisma) in `getUsername()` at line 22 but the `import { db } from './db'` was removed during cleanup (alongside DB write block removal). This caused `ReferenceError: db is not defined` every time a request with `x-user-id` header hit the server. But the main "no data" issue was simply that no browser-like traffic was hitting the backend after the AccessLog table was dropped.
    - **Fixes**:
      - `access-logger.ts` — added `import { db } from './db'` at line 3 to fix `getUsername()` Prisma lookup
      - Generated browser-like traffic with `x-client-ip`, `x-user-id: cmq5i2ohq0000e7itthkyon6g`, and real Chrome UA to trigger `isRealUserRequest()` filter
    - **Verification**:
      - Panel 1 (Top IPs): 10.10.10.10 = 3 requests ✅
      - Panel 2 (Request Rate): 0.047 req/s ✅
      - Panel 3 (HTTP Status): 14 entries ✅
      - Panel 4 (Endpoints): GET /posts/ (7), GET /subreddits/ (4), POST /access-logs/ (3) ✅
      - Panel 5 (User Activity Log): 5 formatted log lines ✅
      - Panel 6 (Bandwidth): 4 IPs with real bytes (17413, 9588, 5815) ✅
      - Panel 7 (Access Logs): 5 entries with method/path/status/duration/IP/username/UA ✅
    - **Files changed**:
      - `app/reddit_backend/src/access-logger.ts` — added `db` import

### Known Issues / Open Items
- Loki image distroless → cannot healthcheck with curl/wget. TCP healthcheck needed if depends_on condition is required.
- `neon-to-loki-sync` permanently stopped — AccessLog table was dropped, sync has no data source. All access logs now come from `console.log(JSON.stringify(logEntry))` via Promtail pipeline.
- Backend restart needed after the `db` import fix was deployed — any future rebuilds will auto-fix.

### Session: June 22, 2026

31. **Guest POST after logout shows test02 instead of anonymous (race condition fix)**
    - **Problem**: After logout, the deferred guest POST (setTimeout 100ms) still recorded as `test02` instead of `anonymous`/guest. The access log showed 2 test02 entries (1 logout + 1 incorrectly as test02) instead of 1 test02 + 1 anonymous.
    - **Root cause**: `App.jsx:312` fetch wrapper used `{ ...init.headers, ...extraHeaders }` — `extraHeaders` won over the caller's explicit headers. When `fetchMeta.current.userId` had stale `test02-id` (React `setUser(null)` hadn't flushed yet), the wrapper added `x-user-id: test02-id` regardless of the guest POST's intent. The `setTimeout(100)` was unreliable because React state updates are async.
    - **Fix**:
      - `App.jsx:312` — Changed spread to `{ ...extraHeaders, ...init.headers }` so the **caller's** explicit headers take precedence over the wrapper's inferred headers.
      - `AuthContext.jsx:54` — Guest POST now explicitly passes `x-user-id: ''` (empty string, falsy), which overrides any stale `x-user-id` from the wrapper and ensures the backend treats it as guest.
    - **Files changed**:
      - `app/reddit_frontend/src/App.jsx` — wrapper spread order reversed
      - `app/reddit_frontend/src/AuthContext.jsx` — explicit `x-user-id: ''` in guest POST

32. **Logout shows 3 entries (`test02 → anonymous → test02`) — terminology + timing fix**
    - **Problem**: After logout, log shows `test02 → anonymous → test02` (3 entries) instead of expected `test02 → guest`. `anonymous` and second `test02` share same timestamp.
    - **Root cause 1 (terminology)**: `access-logger.ts:85` defaults to `'anonymous'` when no `x-user-id`, but `accessLogs.ts:41` defaults to `'guest'`. Two different defaults for guest sessions.
    - **Root cause 2 (ordering)**: The first POST (oldUserId) calls `getUsername('test02-id')` which does a DB lookup — takes longer than the guest POST which skips the DB call. So the guest POST's `onAfterResponse` fires first despite being called later (setTimeout 100ms). Both finish within the same millisecond → same timestamp.
    - **Result**: 3 entries are **expected** — 1 browsing request + 2 logout POSTs. Order is `browsing(test02) → guest(anonymous) → logout(test02)`.
    - **Fix**: Changed `'anonymous'` → `'guest'` in `access-logger.ts:85` to match `accessLogs.ts` terminology.
    - **Files changed**:
      - `app/reddit_backend/src/access-logger.ts` — default `'anonymous'` → `'guest'`

### Session: June 22, 2026 (audit fix)

33. **Full system audit: 14 HIGH+MEDIUM issues fixed**
    - **HIGH #1**: Removed orphan `access_log` table creation + DB writes from `access-logger.ts` (dead code from session 29 cleanup; only `console.log` → Loki remains)
    - **HIGH #2**: Fixed `HighRAMUsage` alert metric names in `app_rules.yml` — changed `node_memory_active_bytes + node_memory_wired_bytes / node_memory_total_bytes` → `(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100`
    - **HIGH #3** (false alarm): `postgres-neon.yml` already gitignored, not tracked by git
    - **HIGH #4**: Untracked `prometheus/metrics_token.txt`, `prometheus/prometheus.yml`, `alertmanager/alertmanager.yml` from git (already in `.gitignore` but were committed before the ignore rules were added)
    - **HIGH #5**: Wrapped `new URL(att.url)` in try/catch in `MediaRenderer.jsx` to prevent crash on relative/malformed URLs
    - **HIGH #6**: Removed dead `AccessLogsModal` component (called deleted `GET /access-logs` endpoint); removed trigger button from admin user menu
    - **HIGH #7**: Removed `neon-to-loki-sync` service from `monitor-docker-compose.yml` (crash-looping since `access_log` table was dropped)
    - **MEDIUM #8**: Dashboard filter `username != "anonymous"` → `username != "guest"` (default was changed to "guest" in session 32)
    - **MEDIUM #9**: Panel 7 path filter `path = "/access-logs/"` → `path = "/access-logs"` (removed trailing slash)
    - **MEDIUM #10**: Added `| json | line_format` pipeline to Slow Query Log panel in `database-dashboard.json`
    - **MEDIUM #11**: Fixed `slow_query_total` description from `(>200ms)` to `(>50ms)` in `db.ts`
    - **MEDIUM #12**: Added `console.error` to the empty `fetch2` catch block in `App.jsx`
    - **MEDIUM #13**: Reduced `setTimeout(100)` → `setTimeout(0)` in `AuthContext.jsx` (race condition already solved by spread order fix)
    - **MEDIUM #14**: Fixed `updateUser` to use functional `setUser(prev => ...)` pattern to avoid stale state under concurrent calls in `AuthContext.jsx`
    - **Files changed** (11):
      - `app/reddit_backend/src/access-logger.ts` — removed CREATE TABLE + INSERT
      - `app/reddit_backend/src/db.ts` — fixed description
      - `app/reddit_frontend/src/App.jsx` — removed AccessLogsModal + empty catch fix
      - `app/reddit_frontend/src/AuthContext.jsx` — setTimeout(0) + functional updateUser
      - `app/reddit_frontend/src/MediaRenderer.jsx` — try/catch URL
      - `grafana/dashboards/database-dashboard.json` — Slow Query Log formatting
      - `grafana/dashboards/user-access-dashboard.json` — anonymous→guest, trailing slash
      - `monitor-docker-compose.yml` — removed neon-to-loki-sync
      - `prometheus/app_rules.yml` — fixed RAM alert metric
      - `.gitignore` — added metrics_token.txt
      - `alertmanager/alertmanager.yml`, `prometheus/prometheus.yml`, `prometheus/metrics_token.txt` — untracked from git`
