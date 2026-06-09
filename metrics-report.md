# Metrics Analysis Report

> Generated: 2026-06-09

## 1. Prometheus Targets Status

| Job | Instance | Status | Last Scrape | Duration |
|-----|----------|--------|-------------|----------|
| `prometheus` | localhost:9090 | ✅ UP | OK | 12ms |
| `nginx` | nginx-exporter:9113 | ✅ UP | OK | 8ms |
| `node` | host.docker.internal:9100 | ✅ UP | OK | 56ms |
| `blackbox` | https://devshare-eta.vercel.app/ | ✅ UP | OK | 275ms |

**All 4 targets healthy. No scrape errors.**

---

## 2. Current Metrics Inventory

### 2.1 Nginx Metrics (nginx-exporter)

| Metric | Type | Has Dashboard? | Notes |
|--------|------|----------------|-------|
| `nginx_up` | Gauge | ✅ | Nginx status indicator |
| `nginx_connections_accepted` | Counter | ✅ | Rate tracked |
| `nginx_connections_handled` | Counter | ✅ | Rate tracked |
| `nginx_connections_active` | Gauge | ✅ | Active/waiting/reading/writing |
| `nginx_connections_reading` | Gauge | ✅ | |
| `nginx_connections_waiting` | Gauge | ✅ | |
| `nginx_connections_writing` | Gauge | ✅ | |
| `nginx_http_requests_total` | Counter | ✅ | Rate tracked, NO status label breakdown |
| `nginx_exporter_build_info` | Info | ❌ | Metadata only |

**Key Gap**: `nginx_http_requests_total` has NO `status` label — cannot distinguish 2xx/4xx/5xx for error rate tracking.

### 2.2 Host Infrastructure (node_exporter) — NOT visualized

| Category | Available Metrics | Dashboard? |
|----------|-----------------|------------|
| CPU | `node_cpu_seconds_total` (48 cores/threads) | ❌ Missing |
| Memory | `node_memory_total_bytes`, `node_memory_active_bytes`, `node_memory_free_bytes`, etc. | ❌ Missing |
| Disk | `node_disk_*` (reads/writes/bytes/errors) | ❌ Missing |
| Network | `node_network_*` (bytes/packets/errors) | ❌ Missing |
| Load | `node_load1`, `node_load5`, `node_load15` | ❌ Missing |
| Filesystem | `node_filesystem_*` (size/free/avail) | ❌ Missing |
| Uptime | `node_boot_time_seconds` | ❌ Missing |

**Critical Gap**: Node exporter is scraping successfully but ZERO dashboards consume its data.

### 2.3 Blackbox / External Probe Metrics

| Metric | Dashboard? | Notes |
|--------|-----------|-------|
| `probe_success` | ✅ | Probe Status stat + timeline |
| `probe_http_status_code` | ✅ | HTTP Status stat |
| `probe_duration_seconds` | ✅ | Response Time stat + trend |
| `probe_http_duration_seconds{phase}` | ✅ | Phase breakdown (connect/TLS/processing/transfer) |
| `probe_ssl_earliest_cert_expiry` | ❌ | Not visualized — only alert rules exist |
| `probe_dns_lookup_time_seconds` | ❌ | Not visualized |

### 2.4 Go Runtime (from nginx-exporter) — NOT visualized

Metrics like `go_goroutines`, `go_memstats_heap_alloc_bytes`, `go_gc_duration_seconds`, `go_threads` are available but unused.

---

## 3. Grafana Dashboard Analysis

### Existing Dashboards

| Dashboard | UID | Panels | Data Sources | Issues |
|-----------|-----|--------|-------------|--------|
| **Nginx Monitor** | `MsjffzSZz` | 5 | Prometheus | Only nginx metrics, no host infra |
| **DevShare Full** | `devshare-unified-monitor` | 14 | Prometheus + PostgreSQL | References non-existent OTel metrics + external PostgreSQL |
| **Blackbox Vercel** | (same as Full) | 12 | Prometheus + PostgreSQL | ⚠️ ~85% duplicate of DevShare Full |
| **DevShare OTel** | `devshare_otel_monitor` | 6 | Prometheus | Subset of DevShare Full |

### Dashboard Gap Matrix

| Area | Nginx Monitor | DevShare Full | Blackbox Vercel | DevShare OTel |
|------|:------------:|:-------------:|:---------------:|:-------------:|
| Nginx connections | ✅ | ❌ | ❌ | ❌ |
| Nginx request rate | ✅ | ❌ | ❌ | ❌ |
| Nginx status | ✅ | ❌ | ❌ | ❌ |
| Blackbox probe | ❌ | ✅ | ✅ | ❌ |
| Probe SSL expiry | ❌ | ❌ | ❌ | ❌ |
| Host CPU | ❌ | ✅* | ✅* | ✅* |
| Host Memory | ❌ | ✅* | ✅* | ✅* |
| API Request Rate | ❌ | ✅* | ✅* | ✅* |
| API Latency (p50/p95/p99) | ❌ | ✅* | ✅* | ✅* |
| API Error Rate | ❌ | ✅* | ✅* | ✅* |
| Log Table (PostgreSQL) | ❌ | ✅ | ✅ | ❌ |
| Go Runtime | ❌ | ❌ | ❌ | ❌ |
| Host Disk I/O | ❌ | ❌ | ❌ | ❌ |
| Host Network | ❌ | ❌ | ❌ | ❌ |
| Host Load | ❌ | ❌ | ❌ | ❌ |

> `*` — These panels reference OTel metrics (`process_cpu_usage`, `http_server_requests_total`, etc.) that do NOT exist in local Prometheus. They only work with Grafana Cloud datasource.

---

## 4. Missing / Recommended Dashboards

### 4.1 Infrastructure Dashboard (HIGH priority)

Track host-level resources from `node_exporter`:

```
Panel: CPU Usage %
  Query: 100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
  
Panel: Memory Usage %
  Query: (1 - (node_memory_active_bytes / node_memory_total_bytes)) * 100

Panel: Disk Usage %
  Query: (node_filesystem_size_bytes{mount="/"} - node_filesystem_free_bytes{mount="/"}) / node_filesystem_size_bytes{mount="/"} * 100

Panel: Disk I/O
  Query: rate(node_disk_read_bytes_total[5m])
  Query: rate(node_disk_written_bytes_total[5m])

Panel: Network I/O
  Query: rate(node_network_receive_bytes_total{device!="lo"}[5m])
  Query: rate(node_network_transmit_bytes_total{device!="lo"}[5m])

Panel: System Load
  Query: node_load1 / node_load15  (as % of CPUs)
  Query: node_load5
  Query: node_load15

Panel: Uptime
  Query: (time() - node_boot_time_seconds)
```

### 4.2 Nginx RED Dashboard (MEDIUM priority)

```
Rate — Request throughput
  Query: sum(rate(nginx_http_requests_total[5m]))
  
Errors — Handled vs Accepted ratio
  Query: rate(nginx_connections_handled[5m]) / rate(nginx_connections_accepted[5m])
  
Duration — Active connections as proxy for load
  Query: nginx_connections_active
```

> **Note**: True RED requires latency histograms. `nginx_http_requests_total` has no `status` label, so 5xx error rate cannot be calculated. Consider adding `$upstream_status` or `log_format` with status codes to nginx config.

### 4.3 SSL Certificates Dashboard (LOW priority)

```
Panel: SSL Expiry (days remaining)
  Query: (probe_ssl_earliest_cert_expiry - time()) / 86400

Panel: Certificate Info
  Query: probe_ssl_last_chain_info (table view)

Panel: SSL Expiry Timeline
  Query: probe_ssl_earliest_cert_expiry
```

### 4.4 Go Runtime Dashboard (LOW priority)

```
Panel: Goroutines
  Query: go_goroutines{job="nginx"}

Panel: Heap Allocated
  Query: go_memstats_heap_alloc_bytes{job="nginx"}

Panel: GC Duration
  Query: rate(go_gc_duration_seconds_sum{job="nginx"}[5m]) / rate(go_gc_duration_seconds_count{job="nginx"}[5m])
```

---

## 5. Metrics to Include vs Remove

### ✅ NÊN ĐƯA VÀO (Should Include)

| Metric | Reason |
|--------|--------|
| `rate(nginx_http_requests_total[5m])` | Core throughput (RPS) |
| `nginx_connections_active/reading/writing/waiting` | Connection pool health |
| `rate(nginx_connections_accepted[5m])` / `rate(nginx_connections_handled[5m])` | Dropped connection detection |
| `node_cpu_seconds_total{mode="idle"}` | CPU utilization |
| `node_memory_active_bytes` / `node_memory_total_bytes` | Memory pressure |
| `node_filesystem_avail_bytes` / `node_filesystem_size_bytes` | Disk space |
| `rate(node_disk_read_bytes_total[5m])` / `rate(node_disk_written_bytes_total[5m])` | Disk I/O bottleneck |
| `rate(node_network_receive_bytes_total[5m])` / `rate(node_network_transmit_bytes_total[5m])` | Network throughput |
| `node_load1` / `node_load5` / `node_load15` | Load average trend |
| `probe_success` | Uptime SLA calculation |
| `probe_duration_seconds` | External response time |
| `(probe_ssl_earliest_cert_expiry - time()) / 86400` | SSL expiry countdown |
| `go_goroutines{job="nginx"}` | Nginx exporter health |
| `nginx_up` | Quick status check |

### ❌ NÊN BỎ / KHÔNG CÓ GIÁ TRỊ (Remove / No Reference Value)

| Metric | Lý do bỏ (Reason to Remove) |
|--------|---------------------------|
| `prometheus_engine_*`, `prometheus_tsdb_*`, `prometheus_sd_*` | Prometheus nội bộ, không liên quan đến application/infra monitoring. Chỉ hữu ích cho admin Prometheus. |
| `go_memstats_buck_hash_sys_bytes`, `go_memstats_mcache_inuse_bytes`, `go_memstats_mspan_sys_bytes` | Quá chi tiết, không actionable. Chỉ nên giữ `heap_alloc_bytes` và `sys_bytes` tổng thể. |
| `go_gc_*` dạng bucket/chi tiết (pauses_seconds_bucket, allocs_by_size_bytes_bucket) | Histogram quá mịn, khó đọc. Chỉ cần tổng GC duration. |
| `go_sched_*` (goroutines_runnable, goroutines_waiting, latencies_seconds) | Scheduler metrics của Go runtime — không cần cho monitoring Nginx. |
| `probe_http_content_length`, `probe_http_uncompressed_body_length` | Kích thước response không actionable với blackbox probing. |
| `probe_ip_addr_hash`, `probe_tls_version_info`, `probe_http_version` | Chỉ là thông tin tĩnh (metadata), không có trend. |
| `probe_http_last_modified_timestamp_seconds` | Header timestamp — không có giá trị monitoring. |
| `node_power_supply_*` | Pin/battery — chỉ hữu ích cho laptop cá nhân, không phải server. |
| `node_filesystem_purgeable_bytes` | macOS-specific purgeable count, không cross-platform. |
| `process_open_fds`, `process_resident_memory_bytes`, `process_virtual_memory_bytes` | Metrics của chính exporter processes (Prometheus, node_exporter), gây nhiễu nếu hiển thị cùng app metrics. |
| `node_network_noproto_total` | Counter zero trong hầu hết trường hợp. |
| `probe_http_redirects` | Chỉ có giá trị nếu test redirect logic, không cần monitoring thường xuyên. |

---

## 6. Recommended Grafana Dashboard Structure

```
1. Nginx Monitor                ← Giữ nguyên + thêm panels
   ├── Status: nginx_up
   ├── Active Connections (active/reading/writing/waiting)
   ├── Processed Connections (accepted/handled rate)
   └── Request Rate (RPS)

2. Infrastructure Dashboard     ← MỚI — từ node_exporter
   ├── CPU Usage %  + Load Average
   ├── Memory Usage % + breakdown
   ├── Disk Usage % + Disk I/O
   └── Network I/O

3. External Probe Dashboard      ← Gộp từ DevShare Full + Blackbox Vercel
   ├── Probe Status + Uptime %
   ├── Response Time (p50/p95/p99)
   ├── Phase Breakdown (connect/TLS/processing/transfer)
   └── SSL Certificate Expiry

4. [Remove] DevShare OTel        ← Overlap, không có OTel data local
5. [Remove] DevShare Full        ← Overlap, refs non-existent OTel metrics
6. [Remove] Blackbox Vercel      ← Duplicate of DevShare Full
```

---

## 7. PromQL Query Cheatsheet

### Nginx

```promql
# Request rate (RPS)
sum(rate(nginx_http_requests_total[5m]))

# Dropped connection rate
rate(nginx_connections_accepted[5m]) - rate(nginx_connections_handled[5m])

# Active connections
nginx_connections_active

# Connection state breakdown
nginx_connections_reading
nginx_connections_waiting
nginx_connections_writing
```

### Host Infrastructure

```promql
# CPU utilization %
100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory utilization %
(1 - (node_memory_free_bytes / node_memory_total_bytes)) * 100

# Memory breakdown by type
node_memory_active_bytes
node_memory_wired_bytes
node_memory_compressed_bytes

# Disk space usage %
(node_filesystem_size_bytes{mount="/"} - node_filesystem_avail_bytes{mount="/"}) / node_filesystem_size_bytes{mount="/"} * 100

# Disk read/write rate
rate(node_disk_read_bytes_total[5m])
rate(node_disk_written_bytes_total[5m])

# Network throughput
rate(node_network_receive_bytes_total{device!="lo"}[5m])
rate(node_network_transmit_bytes_total{device!="lo"}[5m])

# System load (as fraction of CPU count)
node_load1 / count(node_cpu_seconds_total{mode="idle"})
```

### External Probe

```promql
# Uptime over last 24h
avg_over_time(probe_success[24h]) * 100

# Response time by phase (ms)
probe_http_duration_seconds{phase="connect"} * 1000
probe_http_duration_seconds{phase="tls"} * 1000
probe_http_duration_seconds{phase="processing"} * 1000
probe_http_duration_seconds{phase="transfer"} * 1000

# SSL days remaining
(probe_ssl_earliest_cert_expiry - time()) / 86400
```

---

## 8. Alerts Assessment

| Alert Rule | Expression | Correct? | Issues |
|-----------|-----------|----------|--------|
| `NginxServerDown` | `up{job="nginx"} == 0 OR absent(up{job="nginx"}) OR nginx_up{job="nginx"} == 0` | ✅ | Good — multiple conditions cover all failure modes |
| `NginxHighErrorRate` | `rate(nginx_http_requests_total{status=~"5.."}[5m]) > 0.05` | ❌ | `nginx_http_requests_total` has **no `status` label** — alert will NEVER fire |
| `NginxHighConnections` | `nginx_connections_active > 1000` | ✅ | Simple, actionable |
| `NginxHighResponseTime` | `rate(nginx_http_request_duration_seconds_sum[5m]) / rate(nginx_http_request_duration_seconds_count[5m]) > 1` | ❌ | `nginx_http_request_duration_seconds_*` does NOT exist in nginx-exporter — alert will NEVER fire |
| `VercelAppDown` | `probe_success{job="blackbox"} == 0` | ✅ | Correct |
| `SSLCertificateExpiring` | `(probe_ssl_earliest_cert_expiry - time()) / 86400 < 30` | ✅ | Correct |
| `SSLCertificateExpired` | `(probe_ssl_earliest_cert_expiry - time()) / 86400 < 7` | ✅ | Correct |

**2 broken alert rules** — `NginxHighErrorRate` and `NginxHighResponseTime` reference non-existent metric labels. They will never trigger.

---

## 9. Recommendations Summary

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | **Node exporter data not visualized** | High | Create Infrastructure dashboard with CPU/Memory/Disk/Network panels |
| 2 | **DevShare dashboards reference missing OTel metrics** | High | Remove or adapt — local Prometheus lacks `process_cpu_usage`, `http_server_requests_total`, etc. |
| 3 | **Dashboard duplication** (DevShare Full ≈ Blackbox Vercel ≈ OTel) | Medium | Consolidate into single External Probe dashboard |
| 4 | **Alert rules referencing non-existent metrics** (NginxHighErrorRate, NginxHighResponseTime) | Medium | Fix expressions or remove rules |
| 5 | **No RED dashboard for Nginx** | Low | Add latency proxy (active connections as load indicator) |
| 6 | **No SSL expiry visualization** | Low | Add probe_ssl_earliest_cert_expiry panel to external dashboard |
| 7 | **Go runtime metrics unused** | Low | Optional: lightweight goroutines + heap panel |
