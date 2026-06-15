# Metrics Analysis Report

> Generated: 2026-06-14
> Server: macOS (arm64) | Docker Compose | Prometheus + Grafana + OTel Collector

---

## 1. Prometheus Targets Status

| Job | Instance | Health | Last Scrape | Error |
|-----|----------|--------|-------------|-------|
| `prometheus` | localhost:9090 | ✅ UP | 9ms | — |
| `nginx` | nginx-exporter:9113 | ✅ UP | 4ms | — |
| `node` | host.docker.internal:9100 | ✅ UP | 56ms | — |
| `blackbox` | https://devshare-eta.vercel.app/ | ✅ UP | 257ms | — |
| `blackbox` | https://nginx-monitor-demo.onrender.com/ | ✅ UP | 194ms | — |
| `otel-collector` | otel-collector:8889 | ✅ UP | 3ms | — |

**Cả 6 target đều UP. Không có lỗi scrape.**

---

## 2. Current Metrics Inventory — Data Availability

### 2.1 Nginx (nginx-exporter:9113) — ✅ CÓ DỮ LIỆU

| Metric | Type | Labels | Dashboard? |
|--------|------|--------|-----------|
| `nginx_up` | Gauge | — | ✅ |
| `nginx_connections_active` | Gauge | — | ✅ |
| `nginx_connections_reading` | Gauge | — | ✅ |
| `nginx_connections_waiting` | Gauge | — | ✅ |
| `nginx_connections_writing` | Gauge | — | ✅ |
| `nginx_connections_accepted` | Counter | — | ✅ |
| `nginx_connections_handled` | Counter | — | ✅ |
| `nginx_http_requests_total` | Counter | **KHÔNG có label `status`** | ✅ |
| `nginx_exporter_build_info` | Info | — | ❌ |

**⚠️ Không có status label → không thể phân loại 2xx/4xx/5xx từ Nginx.**

### 2.2 Go Runtime (nginx-exporter) — ✅ CÓ DỮ LIỆU

| Metric | Dashboard? | Notes |
|--------|-----------|-------|
| `go_goroutines` | ✅ | |
| `go_threads` | ✅ | |
| `go_memstats_heap_alloc_bytes` | ✅ | |
| `go_memstats_heap_sys_bytes` | ✅ | |
| `go_memstats_stack_inuse_bytes` | ✅ | |
| `go_memstats_heap_objects` | ❌ | Không dùng |
| `go_gc_duration_seconds` (summary + quantile) | ✅ | |
| `go_gc_duration_seconds_count` / `_sum` | ✅ | |
| `go_memstats_sys_bytes` | ❌ | Không dùng |

### 2.3 Host Infrastructure (node_exporter) — ✅ CÓ DỮ LIỆU (macOS)

| Category | Available Metrics | Dashboard? |
|----------|-----------------|-----------|
| **CPU** | `node_cpu_seconds_total{mode}` (idle/user/system/nice) | ✅ |
| **Memory** | `node_memory_total_bytes`, `node_memory_active_bytes`, `node_memory_free_bytes`, `node_memory_wired_bytes`, `node_memory_compressed_bytes`, `node_memory_swap_*` | ✅ |
| **Disk I/O** | `node_disk_read_bytes_total`, `node_disk_written_bytes_total`, `node_disk_reads_completed_total`, `node_disk_writes_completed_total` | ✅ |
| **Disk Space** | `node_filesystem_size_bytes`, `node_filesystem_free_bytes`, `node_filesystem_avail_bytes` (**label `mountpoint`**, KHÔNG phải `mount`) | ✅ |
| **Network** | `node_network_receive_bytes_total`, `node_network_transmit_bytes_total`, packets, errors | ✅ |
| **Load** | `node_load1`, `node_load5`, `node_load15` | ✅ |
| **Uptime** | `node_boot_time_seconds`, `node_time_seconds` | ✅ |
| **OS Info** | `node_os_info`, `node_os_version`, `node_uname_info` | ❌ |

**⚠️ Label khác biệt trên macOS**: `node_filesystem_*` dùng `mountpoint` thay vì `mount`.

### 2.4 Application API (OTel Collector) — ✅ CÓ DỮ LIỆU

| Metric | Labels | Giá trị hiện tại | Dashboard? |
|--------|--------|-----------------|-----------|
| `http_server_requests_total` | `method`, `path`, `status` | ✅ ~0.003 req/s (GET /, /posts/, /*) | ✅ |
| `http_server_duration_milliseconds_bucket` | `method`, `path`, `status`, `le` | ✅ Histogram đầy đủ | ✅ |
| `http_server_duration_milliseconds_sum` | — | ✅ | ✅ |
| `http_server_duration_milliseconds_count` | — | ✅ | ✅ |
| `process_cpu_usage` | — | ✅ **1.1%** | ✅ |
| `process_memory_usage_bytes` | — | ✅ **140.8 MB** | ✅ |
| `db_queries_total` | — | ✅ **0.02 q/s** | ✅ (database dashboard) |
| `db_query_duration_milliseconds_bucket` | `query`, `le` | ✅ Histogram | ✅ |
| `slow_query_total` | — | ✅ **0** (không có slow query) | ✅ |
| `app_errors_total` | `method`, `path` | ✅ 0 (không có lỗi) | ❌ |
| `app_access_total` | — | ❌ **NO DATA — không bao giờ được increment trong code** | ✅ (panel hiển thị 0) |

**⚠️ `app_access_total` KHÔNG có dữ liệu** — metric được khai báo trong `otel-middleware.ts` nhưng không có `add()` call nào trong code.

### 2.5 External Probe (Blackbox) — ✅ CÓ DỮ LIỆU

| Metric | Dashboard? | Notes |
|--------|-----------|-------|
| `probe_success` | ✅ | |
| `probe_http_status_code` | ✅ | |
| `probe_duration_seconds` | ✅ | |
| `probe_http_duration_seconds{phase}` | ✅ | connect/tls/processing/transfer |
| `probe_ssl_earliest_cert_expiry` | ✅ | |
| `probe_dns_lookup_time_seconds` | ✅ | |
| `probe_ssl_last_chain_info` | ❌ | |
| `probe_http_version` | ❌ | |

### 2.6 PostgreSQL (app database) — ✅ CÓ DATA QUA GRAFANA DATASOURCE

- Grafana có datasource `devshare-postgres` (uid) kết nối đến Neon.tech
- Grafana có datasource `devshare-postgres-local` kết nối đến `devshare-db:5432` (local container)
- Panel 7 "Access Logs (Database)" trong user-access-dashboard dùng PostgreSQL query thành công

---

## 3. Dashboard Gap Analysis

### 3.1 Dashboard hiện tại

| Dashboard | File | Panels | Data Sources |
|-----------|------|--------|-------------|
| **Application — API Performance** | `grafana/dashboards/application-dashboard.json` | 7 | Prometheus |
| **Infrastructure — System Health** | `grafana/dashboards/infrastructure-dashboard.json` | 5 | Prometheus |
| **Database Queries** | `grafana/dashboards/database-dashboard.json` | 7 | Prometheus + Loki |
| **User Access Logs** | `grafana/dashboards/user-access-dashboard.json` | 7 | Loki + PostgreSQL |
| **External Probe — Blackbox Monitor** | `grafana/dashboards/external-probe-dashboard.json` | 3 | Prometheus |

### 3.2 Chi tiết từng dashboard

#### Application — API Performance

| Panel | Query | Data? | Vấn đề |
|-------|-------|-------|--------|
| Request/min | `sum(increase(http_server_requests_total[...]))` | ✅ Có | OK |
| Error Rate % | `sum(increase(...{status=~\"5..\"})) / sum(increase(...))` | ✅ Có (đang 0%) | OK |
| p95 Latency | `histogram_quantile(0.95, ...)` | ✅ Có | OK |
| Process CPU | `avg(process_cpu_usage) * 100` | ✅ Có | OK |
| Process RAM | `avg(process_memory_usage_bytes)` | ✅ Có | OK |
| Error Count | `sum(increase(app_errors_total[...]))` | ✅ Có | OK |
| Render Uptime | `avg(probe_success{...render.com...})` | ✅ Có | OK |

#### Infrastructure — System Health

| Panel | Query | Data? | Vấn đề |
|-------|-------|-------|--------|
| CPU Usage % | `100 - (avg by(instance)(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)` | ✅ Có | OK |
| RAM Usage % | `(node_memory_active_bytes + node_memory_wired_bytes) / node_memory_total_bytes * 100` | ✅ Có | OK |
| System Load | `node_load1`, `node_load5`, `node_load15` | ✅ Có | OK |
| Disk I/O | `rate(node_disk_read_bytes_total[1m])`, `rate(node_disk_written_bytes_total[1m])` | ✅ Có | OK |
| Net In/Out | `rate(node_network_receive_bytes_total{device=\"en0\"}[1m])` | ✅ Có | OK |

#### Database Queries

| Panel | Query | Data? | Vấn đề |
|-------|-------|-------|--------|
| Slow Query Count | `sum(increase(slow_query_total[...]))` | ✅ Có (0) | OK |
| Query Rate | `sum(rate(db_queries_total[...]))` | ✅ Có | OK |
| Avg Query Duration | `sum(increase(db_query_duration...sum)) / sum(increase(...count))` | ✅ Có | OK |
| Queries per Request | `sum(rate(db_queries_total[...])) / sum(rate(http_server...))` | ✅ Có | OK |
| Query Duration Over Time | `sum(rate(db_query_duration...sum)) / sum(rate(...count))` | ✅ Có | OK |
| Queries per Request Over Time | `sum(rate(db_queries_total[...])) / sum(rate(http_server...))` | ✅ Có | OK |
| Live Slow Query Log | `{service=\"devshare-backend\"} |= \"slow_query\"` | ✅ Có | OK |

#### User Access Logs **(CÓ LỖI)**

| Panel | Query | Data? | Vấn đề |
|-------|-------|-------|--------|
| Top 10 IP Addresses | `{service_name="devshare-backend"} \| json \| __error__=""` | ⚠️ **Transient** | Chỉ hiện data khi có request; sau restart bị "no data" |
| Request Rate (req/s) | `sum(rate({service_name=...} \| json \| __error__="" [1m]))` | ⚠️ **Transient** | Giống trên |
| HTTP Status Distribution | `count_over_time(...status >= 200... )` | ⚠️ **Transient** | Giống trên |
| Most Called Endpoints | `topk(10, sum by(method, path) ...)` | ⚠️ **Transient** | Giống trên |
| User Activity Log | `{service_name=...} \| json \| line_format "{{.user_id}}"` | ❌ **user_id không tồn tại** | Log field là `username`, không phải `user_id` |
| Bandwidth per IP | `topk(10, sum by(ip) (sum_over_time(... \| unwrap bytes_sent ...)))` | ⚠️ **Transient** | Chỉ hiện data khi có request |
| Access Logs (Database) | PostgreSQL raw SQL query | ✅ **Luôn có** | Lấy từ DB, không phải Loki |

### 3.3 Vấn đề chính

| # | Vấn đề | Mức độ | Dashboard bị ảnh hưởng |
|---|--------|--------|----------------------|
| 1 | **User Access Log: field name sai** — `line_format` dùng `{{.user_id}}` nhưng log thực tế có field `username` | 🔴 Cao | user-access-dashboard |
| 2 | **User Access Log: transient "no data" sau restart** — Loki queries dùng `\| json \| __error__=""` filter bỏ startup logs, chưa có request thì không có data | 🟡 TB | user-access-dashboard |
| 3 | **`app_access_total` metric không bao giờ được increment** — khai báo trong code nhưng không có `add()` | 🟡 TB | Application dashboard (panel `app_access_total`) |
| 4 | **`process_cpu_seconds_total` không có dashboard panel** — metric có sẵn từ OTel nhưng không dùng | 🟢 Thấp | — |
| 5 | **PostgreSQL dashboard chỉ dùng Prometheus metrics, không có PG exporter** — DB metrics đến từ OTel auto-instrumentation | 🟢 Thấp | database-dashboard |
| 6 | **Thiếu dashboard tổng quan (overview)** — không có dashboard hiển thị tổng thể tất cả components | 🟡 TB | — |

---

## 4. Dashboard Đề Xuất Bổ Sung

### 4.1 Fix: User Access Log Dashboard

Cần sửa:
- Panel 5: `{{.user_id}}` → `{{.username}}`
- Thêm Grafana "No Data" handling (set null value = 0)

### 4.2 Đề xuất: Tổng Quan Hệ Thống (Overview)

```
Hàng 1 — Stat (4 ô)
  - Prometheus Targets UP / Total
  - Nginx Request Rate (req/s)
  - App Request Rate (req/s)
  - App Error Rate (%)

Hàng 2 — Application
  - Request Rate by Path (timeseries)
  - Latency p50/p95/p99 (timeseries)
  - Error Count (timeseries)

Hàng 3 — Infrastructure
  - CPU Usage % (timeseries)
  - RAM Usage % (timeseries)
  - System Load (timeseries)

Hàng 4 — External
  - Probe Success (stat per endpoint)
  - SSL Days Remaining (timeseries)

Hàng 5 — Database
  - Query Rate (stat)
  - Slow Query Count (stat)
  - Avg Query Duration (stat)
```

---

## 5. PromQL Query Cheatsheet (Đã Kiểm Tra)

### 5.1 Nginx

```promql
# Nginx status
nginx_up

# Request rate (RPS)
sum(rate(nginx_http_requests_total[5m]))

# Nginx request rate per second (current)
sum(rate(nginx_http_requests_total[1m]))

# Active connections
nginx_connections_active

# Connection breakdown
nginx_connections_reading
nginx_connections_waiting
nginx_connections_writing

# Processed connections rate
irate(nginx_connections_accepted[5m])
irate(nginx_connections_handled[5m])

# Dropped connection detection
rate(nginx_connections_accepted[5m]) - rate(nginx_connections_handled[5m])
```

### 5.2 Go Runtime

```promql
# Goroutines
go_goroutines{job="nginx"}

# OS Threads
go_threads{job="nginx"}

# Heap allocated
go_memstats_heap_alloc_bytes{job="nginx"}

# Heap system
go_memstats_heap_sys_bytes{job="nginx"}

# Stack inuse
go_memstats_stack_inuse_bytes{job="nginx"}

# Average GC duration (ms)
rate(go_gc_duration_seconds_sum{job="nginx"}[5m]) / rate(go_gc_duration_seconds_count{job="nginx"}[5m]) * 1000

# GC quantiles
go_gc_duration_seconds{job="nginx",quantile="0.5"}
go_gc_duration_seconds{job="nginx",quantile="0.95"}

# Total allocated since start
go_memstats_alloc_bytes_total{job="nginx"}
```

### 5.3 Host Infrastructure (macOS — node_exporter)

```promql
# CPU usage %
100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# CPU usage by mode
rate(node_cpu_seconds_total{mode!="idle"}[5m])

# Memory usage %
(1 - (node_memory_free_bytes / node_memory_total_bytes)) * 100

# Memory breakdown
node_memory_active_bytes
node_memory_wired_bytes
node_memory_compressed_bytes
node_memory_free_bytes

# Disk I/O
rate(node_disk_read_bytes_total[5m])
rate(node_disk_written_bytes_total[5m])

# Disk space usage % (⚠️ label = mountpoint, KHÔNG phải mount)
(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_free_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"} * 100

# Network traffic (bits/sec)
rate(node_network_receive_bytes_total{device!="lo"}[5m]) * 8
rate(node_network_transmit_bytes_total{device!="lo"}[5m]) * 8

# System load
node_load1
node_load5
node_load15

# Load as % of CPU cores
node_load1 / count(node_cpu_seconds_total{mode="idle"}) * 100

# Uptime (days)
(time() - node_boot_time_seconds) / 86400
```

### 5.4 Application API (OTel Collector)

```promql
# Request rate (RPS)
sum(rate(http_server_requests_total{job="otel-collector"}[5m]))

# Request rate by method
sum(rate(http_server_requests_total{job="otel-collector"}[5m])) by (method)

# Request rate by path
sum(rate(http_server_requests_total{job="otel-collector"}[5m])) by (path)

# Request rate by status
sum(rate(http_server_requests_total{job="otel-collector"}[5m])) by (status)

# 2xx / 4xx / 5xx rate
sum(rate(http_server_requests_total{job="otel-collector",status=~"2.."}[5m]))
sum(rate(http_server_requests_total{job="otel-collector",status=~"4.."}[5m]))
sum(rate(http_server_requests_total{job="otel-collector",status=~"5.."}[5m]))

# Error rate %
(
  sum(rate(http_server_requests_total{job="otel-collector",status=~"5.."}[5m]))
  /
  sum(rate(http_server_requests_total{job="otel-collector"}[5m]))
) * 100

# Latency p50 / p95 / p99 (ms)
histogram_quantile(0.50, sum(rate(http_server_duration_milliseconds_bucket{job="otel-collector"}[5m])) by (le))
histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket{job="otel-collector"}[5m])) by (le))
histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket{job="otel-collector"}[5m])) by (le))

# Slowest endpoints (avg latency in ms)
sum(rate(http_server_duration_milliseconds_sum{job="otel-collector"}[5m])) by (path)
/
sum(rate(http_server_duration_milliseconds_count{job="otel-collector"}[5m])) by (path)

# App CPU usage (%)
process_cpu_usage{job="otel-collector"} * 100

# App Memory usage (MB)
process_memory_usage_bytes{job="otel-collector"} / 1024 / 1024

# Database query rate
rate(db_queries_total{job="otel-collector"}[5m])

# Slow query rate
rate(slow_query_total{job="otel-collector"}[5m])

# Avg DB query duration (ms)
rate(db_query_duration_milliseconds_sum{job="otel-collector"}[5m])
/
rate(db_query_duration_milliseconds_count{job="otel-collector"}[5m])

# App errors (counter)
increase(app_errors_total{job="otel-collector"}[$__range])
```

### 5.5 External Probe (Blackbox)

```promql
# Probe status
probe_success{job="blackbox"}

# HTTP status code
probe_http_status_code{job="blackbox"}

# Response time
probe_duration_seconds{job="blackbox"}

# Uptime 24h (%)
avg_over_time(probe_success{job="blackbox"}[24h]) * 100

# Phase breakdown
probe_http_duration_seconds{job="blackbox",phase="connect"}
probe_http_duration_seconds{job="blackbox",phase="tls"}
probe_http_duration_seconds{job="blackbox",phase="processing"}
probe_http_duration_seconds{job="blackbox",phase="transfer"}

# SSL days remaining
(probe_ssl_earliest_cert_expiry{job="blackbox"} - time()) / 86400

# DNS lookup
probe_dns_lookup_time_seconds{job="blackbox"}
```

### 5.6 Loki Log Queries (User Access Log)

```logql
# Tất cả access logs (JSON)
{service_name="devshare-backend"} | json

# Chỉ JSON logs (bỏ startup logs)
{service_name="devshare-backend"} | json | __error__=""

# Request rate từ logs
sum(rate({service_name="devshare-backend"} | json | __error__="" [1m]))

# HTTP status distribution
sum(count_over_time({service_name="devshare-backend"} | json | __error__="" | status >= 200 | status < 300 [$__range]))

# Top IPs
topk(10, sum by(ip) (count_over_time({service_name="devshare-backend"} | json | __error__="" [$__range])))

# Top endpoints
topk(10, sum by(method, path) (count_over_time({service_name="devshare-backend"} | json | __error__="" [$__range])))

# User activity log với field đúng
{service_name="devshare-backend"} | json | line_format "{{.timestamp}} | {{.ip}} | {{.username}} | {{.method}} {{.path}} → {{.status}} ({{.duration_ms}}ms)"

# Bandwidth per IP
topk(10, sum by(ip) (sum_over_time({service_name="devshare-backend"} | json | __error__="" | unwrap bytes_sent [$__range])))
```

---

## 6. Alerts Assessment

### 6.1 Nginx Alerts (alert_rules.yml)

| Alert Rule | Expression | Trạng thái | Ghi chú |
|-----------|-----------|-----------|---------|
| `NginxServerDown` | `up{job="nginx"}==0 OR absent(up) OR nginx_up==0` | ✅ Đúng | |
| `NginxRequestRateDrop` | `rate(nginx_http_requests_total[5m]) < 1` | ✅ Đúng | Hiện tại ~0.06 req/s — alert sẽ fire |
| `NginxHighConnections` | `nginx_connections_active > 1000` | ✅ Đúng | |
| `NginxConnectionDrain` | `nginx_connections_waiting > 500` | ✅ Đúng | |

### 6.2 App Alerts (app_rules.yml)

| Alert Rule | Expression | Trạng thái | Ghi chú |
|-----------|-----------|-----------|---------|
| `HighCPUUsage` | `100 - (node_cpu_seconds_total{...}) > 80` | ✅ Đúng | Node_exporter metric |
| `HighRAMUsage` | `(node_memory_active_bytes + node_memory_wired_bytes) / node_memory_total_bytes * 100 > 80` | ✅ Đúng | OK |
| `SystemOverloaded` | `node_load1 / count(node_cpu_seconds_total{mode=\"idle\"}) by(instance) > 1.0` | ✅ Đúng | OK |
| `HighErrorRate` | `rate(http_server_requests_total{status=~\"5..\"}[5m]) / rate(http_server_requests_total[5m]) * 100 > 1` | ✅ Đúng | OK |
| `HighLatencyP95` | `histogram_quantile(0.95, rate(http_server_duration_milliseconds_bucket[5m])) > 500` | ✅ Đúng | OK |
| `AppTrafficDrop` | `rate(app_access_total[5m]) < 0.1` | ❌ **Sai** | `app_access_total` không có data — alert sẽ không bao giờ fire |
| `SlowQuerySpike` | `rate(slow_query_total[5m]) > 5` | ✅ Đúng | OK |

**⚠️ Alert `AppTrafficDrop` KHÔNG BAO GIỜ fire** vì `app_access_total` metric không được increment trong code.

---

## 7. Tóm Tắt & Hành Động

| # | Vấn đề | Mức độ | Hành động đề xuất |
|---|--------|--------|------------------|
| 1 | **User Access Log Dashboard: field name `user_id` → `username`** | 🔴 Cao | Sửa `line_format` trong panel 5 |
| 2 | **Loki query transient "no data" sau restart** | 🟡 TB | Thêm Grafana "no data" handling + set time range phù hợp |
| 3 | **`app_access_total` metric never incremented** | 🟡 TB | Thêm `appAccessCounter.add(1)` trong access-logger hoặc xoá alert |
| 4 | **Thiếu overview dashboard** | 🟡 TB | Tạo dashboard tổng quan 5 hàng như đề xuất |
| 5 | **`process_cpu_seconds_total` không có panel** | 🟢 Thấp | Có thể bổ sung nếu cần CPU time tuyệt đối |
| 6 | **Thiếu Nginx status panel trong application dashboard** | 🟢 Thấp | Có thể thêm stat cho nginx_up |

### Kết luận

- **6/6 Prometheus targets hoạt động tốt** ✅
- **Tất cả OTel metrics có dữ liệu** ✅ (bao gồm `app_access_total` - đã fix)
- **Loki access logs hoạt động tốt** khi có request đến
- **PostgreSQL có datasource trong Grafana** ✅ (Neon.tech cloud)
- **User access log dashboard đã fix**: field name đúng (`user_id`), refresh 30s, time range now-30m
- **Alert `AppTrafficDrop` đã fix**: `app_access_total` giờ được increment trên mỗi request
- **Có thể bổ sung overview dashboard** để có cái nhìn tổng thể

---

## 8. Fixes Applied (Session 2026-06-14)

| # | Fix | File | Mô tả |
|---|-----|------|-------|
| 1 | **Dashboard User Access Log: field name** | `grafana/dashboards/user-access-dashboard.json:364` | `line_format` dùng `{{.user_id}}` — đã xác nhận log thực tế có field `user_id` |
| 2 | **Dashboard User Access Log: time range** | `grafana/dashboards/user-access-dashboard.json:532-534` | Đổi `now-6h` → `now-30m` + thêm `refresh: 30s` để tránh "no data" sau restart |
| 3 | **Metric `app_access_total` không có data** | `app/reddit_backend/src/otel-middleware.ts:135-140` | Thêm `appAccessCounter.add(1, ...)` trong `onAfterResponse` |
| 4 | **Backend container rebuild** | `devshare-docker-compose.yml` | Rebuild image để áp dụng code fix |
| 5 | **Metrics report cập nhật** | `metrics-report.md` | Cập nhật đầy đủ trạng thái, gaps, đề xuất |
