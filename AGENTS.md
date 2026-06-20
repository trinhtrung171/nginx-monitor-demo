# Session Summary — nginx-monitor-demo

## Overall Project Goal
Monitor Nginx with Docker Compose stack: Nginx → Backend (Bun/Elysia) → Postgres, with Prometheus/Grafana/OTel observability pipeline. Frontend SPA served by Nginx. Render backend hosts live demo.

## Active Architecture

- **Frontend**: Dual env — `.env.development` → `VITE_API_URL=http://localhost:8080` (local dev), `.env.production` → `VITE_API_URL=https://nginx-monitor-demo.onrender.com` (build/deploy)
- **Dual Database**: Local Docker Postgres (`devshare-db:5432`, uid `devshare-postgres-local`) vs Neon cloud (uid `devshare-postgres-neon`)
- **Grafana Dashboard**: User Access Logs has `$ds_postgres` variable to switch between local and Neon Postgres datasources
- **Render Backend**: Exposes `/metrics` via prom-client, scraped by local Prometheus (`render-backend` job). Writes access logs to Neon DB.
- **Local Backend**: Exports OTel metrics → OTel Collector → Prometheus:8889, plus own `/metrics` (prom-client, scraped by `devshare-backend` job). Writes access logs to local Postgres.
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
- `app/reddit_backend/prisma/schema.prisma` — Media model, AccessLog model
- `app/reddit_backend/Dockerfile` — prisma db push in CMD
- `app/reddit_frontend/.env.development` — `VITE_API_URL=http://localhost:8080`
- `app/reddit_frontend/.env.production` — `VITE_API_URL=https://nginx-monitor-demo.onrender.com`
- `grafana/provisioning/datasources/postgres-neon.yml` — Neon cloud datasource
- `grafana/dashboards/user-access-dashboard.json` — User Access Logs (has `$ds_postgres` variable)
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

### Known Issues / Open Items
- Render backend không gửi logs đến Loki local (chỉ có backend local mới có Loki data). User Activity Log panel chỉ có data khi có traffic local.
- `computeBytesSent()` vẫn trả về 0 cho `Elysia-set` response objects (không có content-length header từ Elysia). Chỉ fix cho `new Response()` với data buffer.
- 9 rows có NULL method/path/status trong Neon — 0.7% data corruption, root cause chưa được xác định.
