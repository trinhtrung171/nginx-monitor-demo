# Metrics Analysis Report

> Generated: 2026-06-09 (Updated)
> System: macOS (Host) + Docker (Containers)

## 1. Prometheus Targets Status

| Job | Instance | Status | Last Scrape | Duration |
|-----|----------|--------|-------------|----------|
| `prometheus` | localhost:9090 | ✅ UP | OK | 11ms |
| `nginx` | nginx-exporter:9113 | ✅ UP | OK | 4ms |
| `node` | host.docker.internal:9100 | ✅ UP | OK | 64ms |
| `blackbox` | https://devshare-eta.vercel.app/ | ✅ UP | OK | 615ms |

**All 4 targets UP — no scrape errors.**

---

## 2. Current Metrics Inventory (Actual Data)

### 2.1 Nginx Metrics (nginx-exporter)

| Metric | Value | Notes |
|--------|-------|-------|
| `nginx_up` | 1 | Up |
| `nginx_connections_active` | 1 | Very low traffic (dev) |
| `nginx_http_requests_total` | ~0.07 req/s | No `status` label — cannot split 2xx/4xx/5xx |
| `nginx_connections_accepted/handled` | ~0 | Match — no drops |

**48 CPU time series** available from node_exporter on macOS host.

### 2.2 Host Infrastructure (node_exporter on macOS)

| Category | Available Metrics | Working? |
|----------|-----------------|----------|
| CPU | `node_cpu_seconds_total{mode="idle"}` → 100 - idle% | ✅ |
| Memory (macOS) | `node_memory_active_bytes`, `wired_bytes`, `free_bytes`, `compressed_bytes`, `inactive_bytes` | ✅ (total: 24GB) |
| Memory (Linux) | `node_memory_MemAvailable_bytes`, `MemFree_bytes`, `MemTotal_bytes` | ❌ Not on macOS |
| Disk | `node_disk_read_bytes_total`, `node_disk_written_bytes_total` | ✅ (1 device) |
| Filesystem | `node_filesystem_size_bytes{mountpoint="/"}`: 460GB | ✅ |
| Network | 28 interfaces (en0, en5, awdl0, anpi*, lo, etc.) | ✅ Too many |
| Load | `node_load1`: 2.76, `node_load5`: 2.89 | ✅ |
| Uptime | System up: 2.6 hours | ✅ |

### 2.3 Blackbox / External Probe Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| `probe_success` | 1 (UP) | Vercel app reachable |
| `probe_duration_seconds` | 183ms | Total response time |
| `probe_http_duration_seconds{phase="connect"}` | 92ms | TCP connect |
| `probe_http_duration_seconds{phase="tls"}` | 152ms | TLS handshake |
| `probe_http_duration_seconds{phase="processing"}` | 268ms | Server processing |
| `probe_http_duration_seconds{phase="transfer"}` | 13ms | Response transfer |
| `probe_ssl_earliest_cert_expiry` | 47.7 days remaining | ✅ Healthy |

### 2.4 Go Runtime (nginx-exporter + node_exporter)

| Metric | Value | Source |
|--------|-------|--------|
| `go_goroutines{job="nginx"}` | 10 | nginx-exporter |
| `go_goroutines{job="node"}` | 7 | node_exporter |
| `go_memstats_heap_alloc_bytes{job="nginx"}` | ~5MB | nginx-exporter |

---

## 3. Grafana Dashboard Changes

### Before (5 dashboards — fragmented, broken)

| Dashboard | Status | Problem |
|-----------|--------|---------|
| Nginx Monitor | ✅ Working | Only nginx, no infra |
| System Overview | ⚠️ Broken | Memory query uses Linux metric (`MemAvailable`) — no data on macOS |
| DevShare Full | ❌ Broken | References non-existent OTel metrics |
| Blackbox Vercel | ❌ Duplicate | ~85% duplicate of DevShare Full |
| DevShare OTel | ❌ Broken | References non-existent OTel metrics |

### After (2 dashboards — consolidated)

| Dashboard | Panels | Covers |
|-----------|--------|--------|
| **Unified Monitor - Tổng Quan** | 17 | Nginx + Host Infra + Blackbox + Go Runtime |
| Nginx Monitor | 5 | Detailed Nginx (kept for backward compat) |

### Fixes Applied to Unified Dashboard

1. **Memory Usage** (was blank → now works)
   - Old: `(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100` — Linux-only
   - New: Stacked area of `active`, `wired`, `free`, `compressed`, `inactive` bytes — works on macOS

2. **Network Traffic** (was 28 interfaces → now simplified)
   - Old: All 28 interfaces including `lo`, `anpi0-2`, `ap1`, `awdl0`
   - New: All non-loopback interfaces shown but aggregated into single view

3. **Added New Metrics** (not in any dashboard before)
   - `go_goroutines{job="nginx"}` — exporter health
   - `go_memstats_heap_alloc_bytes{job="nginx"}` — exporter memory
   - `probe_ssl_earliest_cert_expiry` — SSL days remaining
   - `rate(nginx_http_requests_total[5m])` — RPS
   - Dropped connection rate

### Metrics Removed (No Reference Value)

| Metric | Reason |
|--------|--------|
| Prometheus internal engine/tsdb/sd/target/rule/wal | Only useful for Prometheus admin |
| Go scheduler metrics (sched_latencies, runqueue) | Too low-level for app monitoring |
| Go GC bucket histograms (pauses_seconds_bucket) | Too fine-grained; only keep avg |
| `node_power_supply_*` | Laptop battery — not server |
| `probe_http_content_length` | Not actionable for blackbox |
| `probe_ip_addr_hash`, `probe_tls_version_info` | Static metadata, no trend |
| `process_resident_memory_bytes` | Exporter process memory — not relevant |

---

## 4. Unified Dashboard Panel Layout

```
Row 1:  Tổng Quan (Overview)
├── Nginx Status          [stat]     nginx_up
├── Vercel Uptime         [stat]     probe_success
└── System Uptime         [stat]     time() - node_boot_time_seconds

Row 2:  Nginx Connections
├── Active Connections    [timeseries] active/reading/waiting/writing (stacked)
└── Processed Connections [timeseries] accepted/handled rate

Row 3:  Nginx Requests (RED)
├── Request Rate (RPS)    [timeseries] rate(nginx_http_requests_total[5m])
└── Connection Health     [timeseries] accepted - handled = dropped

Row 4:  Host CPU & Memory
├── CPU Usage %           [timeseries] 100 - idle% (threshold: 70/90)
└── Memory Usage          [timeseries] active/wired/free/compressed/inactive (stacked)

Row 5:  System Load & Disk
├── System Load           [timeseries] load1/load5/load15
├── Disk Usage %          [timeseries] (size-free)/size*100 (threshold: 80/95)
└── Disk I/O              [timeseries] read/write bytes rate

Row 6:  Network Traffic
└── Network Traffic       [timeseries] rx/tx bps (aggregated)

Row 7:  External Probe (Blackbox)
├── Response Time Phase   [timeseries] connect/tls/processing/transfer (stacked)
└── Probe Duration        [timeseries] total duration + SSL days left

Row 8:  Go Runtime
├── Goroutines & Heap     [timeseries] go_goroutines + heap_alloc_bytes
└── GC Activity           [timeseries] avg GC duration + heap objects
```

---

## 5. PromQL Query Cheatsheet

### Nginx
```promql
# Request rate (RPS)
irate(nginx_http_requests_total{instance=~"$instance"}[5m])

# Active connections
nginx_connections_active{instance=~"$instance"}

# Dropped connection rate
rate(nginx_connections_accepted{instance=~"$instance"}[5m]) - rate(nginx_connections_handled{instance=~"$instance"}[5m])
```

### Host Infrastructure (macOS)
```promql
# CPU utilization %
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory used % (macOS approximation)
(node_memory_active_bytes + node_memory_wired_bytes) / node_memory_total_bytes * 100

# Disk space usage %
(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_free_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"} * 100

# Disk I/O
rate(node_disk_read_bytes_total[5m])
rate(node_disk_written_bytes_total[5m])

# Network (aggregated)
rate(node_network_receive_bytes_total{device!="lo"}[5m]) * 8
rate(node_network_transmit_bytes_total{device!="lo"}[5m]) * 8

# System load
node_load1 / count(node_cpu_seconds_total{mode="idle"}) by(instance)
```

### External Probe
```promql
# Uptime %
avg_over_time(probe_success[24h]) * 100

# SSL days remaining
(probe_ssl_earliest_cert_expiry - time()) / 86400

# Response phase breakdown (ms)
probe_http_duration_seconds{phase=~"connect|tls|processing|transfer"} * 1000
```

### Go Runtime
```promql
# Goroutines count
go_goroutines{job="nginx"}

# Heap allocated
go_memstats_heap_alloc_bytes{job="nginx"}

# Average GC duration
rate(go_gc_duration_seconds_sum{job="nginx"}[5m]) / rate(go_gc_duration_seconds_count{job="nginx"}[5m])
```

---

## 6. Alerts Assessment

| Alert Rule | Status | Notes |
|-----------|--------|-------|
| `NginxServerDown` | ✅ Correct | Multi-condition (up + absent + nginx_up) |
| `NginxRequestRateDrop` | ✅ Correct | rate < 1 req/s for 5m |
| `NginxHighConnections` | ✅ Correct | > 1000 active |
| `NginxConnectionDrain` | ✅ Correct | > 500 waiting |
| `VercelAppDown` | ✅ Correct | probe_success == 0 |
| `SSLCertificateExpiring` | ✅ Correct | < 30 days |
| `SSLCertificateExpired` | ✅ Correct | < 7 days |

**No broken alert rules** — previously broken rules (`NginxHighErrorRate`, `NginxHighResponseTime`) have been removed.

---

## 7. Summary of Changes

| # | Change | Reason |
|---|--------|--------|
| 1 | ✅ **New Unified Monitor dashboard** | Consolidate 5 fragmented dashboards into 1 |
| 2 | ✅ **Fixed Memory Usage panel** | macOS uses `active_bytes/wired_bytes/free_bytes`, not Linux `MemAvailable` |
| 3 | ✅ **Simplified Network Traffic** | Show all non-loopback interfaces (was 28, too noisy) |
| 4 | ✅ **Added Go Runtime panels** | goroutines + heap alloc + GC for exporter health |
| 5 | ✅ **Added SSL Expiry panel** | Visual countdown for TLS cert renewal |
| 6 | ✅ **Added Connection Health panel** | Dropped connection rate tracking |
| 7 | ✅ **Removed 3 broken dashboards** | DevShare Full, Blackbox Vercel, DevShare OTel — all reference non-existent OTel metrics |
| 8 | ✅ **Removed System Overview** | Merged into Unified Monitor |
| 9 | ✅ **Kept Nginx Monitor** | Backward compat for detailed nginx view |
