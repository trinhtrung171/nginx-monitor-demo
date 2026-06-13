# Metrics Analysis Report

> Generated: 2026-06-13
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

**⚠️ Không có status label → không thể phân loại 2xx/4xx/5xx.**

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

### 2.4 Application API (OTel Collector) — ✅ CÓ DỮ LIỆU (1 phần)

| Metric | Labels | Có data? | Dashboard? |
|--------|--------|----------|-----------|
| `http_server_requests_total` | `method`, `path`, `status` | ✅ Có (chỉ GET + 200) | ✅ |
| `http_server_duration_milliseconds_bucket` | `method`, `path`, `status`, `le` | ✅ Có histogram | ✅ |
| `http_server_duration_milliseconds_sum` | — | ✅ | ✅ |
| `http_server_duration_milliseconds_count` | — | ✅ | ✅ |
| `process_cpu_usage` | — | ✅ (0.6%) | ✅ |
| `process_cpu_seconds_total` | — | ✅ | ❌ |
| `process_memory_usage_bytes` | — | ✅ (133 MB) | ✅ |
| `app_access_total` | — | ❌ **NO DATA** | ✅ (panel hiển thị 0) |

**⚠️ `app_access_total` KHÔNG có dữ liệu** — backend app chưa emit metric này.

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

### 2.6 PostgreSQL (app database) — ❌ KHÔNG CÓ DATA TRONG GRAFANA

PostgreSQL chạy ở `localhost:5433` nhưng:
- Không có Prometheus PostgreSQL exporter
- Không có Grafana PostgreSQL datasource được provision
- Các panel "Total Users", "Total Posts" trong dashboard comprehensive-monitor-v3 là **NO DATA**

---

## 3. Dashboard Gap Analysis

### 3.1 Dashboard hiện tại

| Dashboard | File | Panels | Sections | Data Sources |
|-----------|------|--------|----------|-------------|
| **Hệ Thống Giám Sát Toàn Diện** | `grafana/dashboards/comprehensive-monitor-v3.json` | 50 | 5 | Prometheus + Loki + PostgreSQL |
| **Tổng Quan Hệ Thống** | `docs/monitoring/grafana/tong-quan-monitor-dashboard.json` | 60 | 10 | Prometheus + Loki |

### 3.2 Section-by-Section: Có Data hay Không?

#### `comprehensive-monitor-v3.json`

| Section | Panels | Metric Source | Data? | Vấn đề |
|---------|--------|--------------|-------|--------|
| **1. Hạ Tầng** | 11 | node_exporter | ✅ Có | Nhưng dùng `node_memory_*` không tồn tại trên macOS |
| **2. APM** | 12 | OTel + Go | ⚠️ Một phần | `app_access_total` NO DATA |
| **3. Người Dùng** | 8 | PostgreSQL + Loki | ❌ **NO DATA** | Không có PG datasource trong Grafana |
| **4. Cơ Sở Dữ Liệu** | 6 | PostgreSQL | ❌ **NO DATA** | Không có PG datasource trong Grafana |
| **5. Kiểm Tra Ngoài** | 8 | Blackbox | ✅ Có | |

#### `tong-quan-monitor-dashboard.json`

| Section | Panels | Data? | Vấn đề |
|---------|--------|-------|--------|
| NGINX Status & Connections | 4 | ✅ | OK |
| NGINX Connections & Request Rate | 2 | ✅ | OK |
| Application API — Traffic Overview | 6 | ⚠️ | `app_access_total` NO DATA |
| API Request Rate & Latency | 2 | ✅ | OK |
| HTTP Status & Slow Endpoints | 2 | ✅ | OK |
| Application Runtime — Go | 6 | ✅ | OK |
| Go Runtime — Heap, GC, Goroutines | 3 | ✅ | OK |
| Process Resources (OTel/Bun) | 2 | ✅ | OK |
| Infrastructure — CPU & Memory | 4 | ✅ | Nhưng cần fix label |
| Infra — CPU, Memory, Disk, Network | 4 | ✅ | OK |
| Infra — System Load & Uptime | 2 | ✅ | OK |
| External Probe — Uptime & Response | 5 | ✅ | OK |
| External Probe — Response Time & SSL | 2 | ✅ | OK |
| External Probe — SSL & DNS | 2 | ✅ | OK |

### 3.3 Vấn đề chính

| # | Vấn đề | Mức độ | Dashboard bị ảnh hưởng |
|---|--------|--------|----------------------|
| 1 | Section "Người Dùng" và "CSDL" trong comprehensive-monitor-v3 **hoàn toàn NO DATA** — không có PostgreSQL datasource | 🔴 Cao | comprehensive-monitor-v3 |
| 2 | Section "APM" dùng `app_access_total` không tồn tại | 🟡 Trung bình | Cả hai |
| 3 | `node_filesystem_*` dùng label `mountpoint` nhưng dashboard ghi `mount` | 🟡 Trung bình | Cả hai |
| 4 | `node_memory_MemAvailable_bytes` / `MemTotal_bytes` — macOS dùng tên khác (`node_memory_total_bytes`) | 🟡 Trung bình | comprehensive-monitor-v3 |
| 5 | `comprehensive-monitor-v3` có 3 section NO DATA trên tổng 5 section = **60% dashboard vô dụng** | 🔴 Cao | comprehensive-monitor-v3 |
| 6 | Section 5 "Kiểm Tra Ngoài" chỉ có 8 panels trong khi các section khác chiếm 42 panels — **tỉ lệ sai** | 🟡 Trung bình | comprehensive-monitor-v3 |
| 7 | `tong-quan-monitor-dashboard.json` ở thư mục `docs/` NHƯNG không được provisioning — không auto-load vào Grafana | 🟡 Trung bình | tong-quan-monitor |

---

## 4. Cấu Trúc Dashboard Đề Xuất

Thay vì 1 dashboard "toàn diện" với 50+ panels (phần lớn NO DATA), đề xuất **4 dashboard chuyên biệt**:

### 4.1 Nginx & Go Runtime
```
Section: Status
  - NGINX Up/Down (stat)
  - Active Connections (stat)
  - Request Rate RPS (stat)
  - Go Goroutines (stat)
  - Go Heap Alloc (stat)

Section: Connections
  - Active Connections (timeseries, 4 lines: active/reading/writing/waiting)
  - Processed Connections Rate (timeseries: accepted vs handled)
  - Request Rate (timeseries)

Section: Go Runtime
  - Goroutines & Threads (timeseries)
  - Heap Memory Detail (timeseries: alloc/sys/stack)
  - GC Duration (timeseries: avg + p50/p95)
```

### 4.2 Infrastructure (macOS)
```
Section: Tổng Quan
  - CPU % (stat)
  - RAM % (stat)
  - Disk Usage (stat)
  - Load 1m (stat)
  - Uptime (stat)

Section: Chi Tiết
  - CPU Usage Trend
  - Memory Usage (active/wired/free/compressed)
  - Disk I/O (read/write bytes)
  - Network Traffic (receive/transmit bits)
  - System Load (1m/5m/15m)
```

### 4.3 Application API (OTel)
```
Section: RE — Rate
  - Request Rate RPS (stat + timeseries by method/path)
  
Section: E — Errors
  - 5xx Error Rate (stat, %)
  
Section: D — Duration
  - Latency p50/p90/p95/p99 (stat + timeseries)
  - Slowest Endpoints (table)

Section: Process
  - App CPU Usage
  - App Memory Usage
```

### 4.4 External Probe
```
Section: Status
  - Probe Up/Down (stat per instance)
  - Uptime 24h (stat per instance)
  - HTTP Status Code (stat)

Section: Performance
  - Response Time (timeseries per instance)
  - Phase Breakdown (timeseries per instance)

Section: SSL
  - SSL Days Remaining (stat + timeseries)
  - DNS Lookup Time (timeseries)
```

---

## 5. PromQL Query Cheatsheet (Đã Kiểm Tra)

### 5.1 Nginx

```promql
# Nginx status
nginx_up

# Request rate (RPS)
sum(rate(nginx_http_requests_total[5m]))

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

### 5.3 Host Infrastructure (macOS)

```promql
# CPU usage %
100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

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

### 5.4 Application API (OTel)

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
(sum(rate(http_server_requests_total{job="otel-collector",status=~"5.."}[5m])) / sum(rate(http_server_requests_total{job="otel-collector"}[5m]))) * 100

# Latency p50 / p95 / p99 (ms)
histogram_quantile(0.50, sum(rate(http_server_duration_milliseconds_bucket{job="otel-collector"}[5m])) by (le))
histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket{job="otel-collector"}[5m])) by (le))
histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket{job="otel-collector"}[5m])) by (le))

# Slowest endpoints (avg latency)
sum(rate(http_server_duration_milliseconds_sum{job="otel-collector"}[5m])) by (path) / sum(rate(http_server_duration_milliseconds_count{job="otel-collector"}[5m])) by (path)

# App CPU usage (%)
process_cpu_usage{job="otel-collector"} * 100

# App Memory usage (MB)
process_memory_usage_bytes{job="otel-collector"} / 1024 / 1024
```

### 5.5 External Probe

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

---

## 6. Alerts Assessment

| Alert Rule | Expression | Trạng thái | Ghi chú |
|-----------|-----------|-----------|---------|
| `NginxServerDown` | `up{job="nginx"}==0 OR absent(up) OR nginx_up==0` | ✅ Đúng | |
| `NginxRequestRateDrop` | `rate(nginx_http_requests_total[5m]) < 1` | ✅ Đúng | |
| `NginxHighConnections` | `nginx_connections_active > 1000` | ✅ Đúng | |
| `NginxConnectionDrain` | `nginx_connections_waiting > 500` | ✅ Đúng | |
| `VercelAppDown` | `probe_success{job="blackbox"} == 0` | ✅ Đúng | |
| `SSLCertificateExpiring` | `probe_ssl_earliest_cert_expiry - time() < 30d` | ✅ Đúng | |
| `SSLCertificateExpired` | `probe_ssl_earliest_cert_expiry - time() < 7d` | ✅ Đúng | |

**Tất cả alert rules đều đúng.** Metric names và labels đều tồn tại.

---

## 7. Tóm Tắt & Hành Động

| # | Vấn đề | Mức độ | Hành động đề xuất |
|---|--------|--------|------------------|
| 1 | `comprehensive-monitor-v3.json`: Section 3 (User) + Section 4 (DB) NO DATA | 🔴 Cao | **Xoá** 2 section này khỏi dashboard (không có PostgreSQL datasource) |
| 2 | `comprehensive-monitor-v3.json`: Section 2 (APM) panel `app_access_total` NO DATA | 🟡 TB | Ẩn panel hoặc để ở chế độ chờ |
| 3 | `comprehensive-monitor-v3.json`: Node memory metric names sai (macOS) | 🟡 TB | Sửa `node_memory_MemTotal_bytes` → `node_memory_total_bytes` |
| 4 | `comprehensive-monitor-v3.json`: Filesystem label sai | 🟡 TB | Sửa `mount` → `mountpoint` |
| 5 | Cả 2 dashboard đều thiếu Nginx Go Runtime panels | 🟢 Thấp | Đã có trong tong-quan-monitor |
| 6 | `tong-quan-monitor-dashboard.json` không được provisioning | 🟡 TB | Copy vào `grafana/dashboards/` + cập nhật dashboard.yml |
| 7 | Dashboard hiện tại quá to (50-60 panels) | 🟡 TB | Tách thành 4 dashboard nhỏ chuyên biệt |

### Kết luận

- **6/6 Prometheus targets hoạt động tốt**
- **4/5 nguồn dữ liệu có metrics đầy đủ** (Nginx, Go, Node, OTel, Blackbox)
- **PostgreSQL không có trong monitoring stack** — cần thêm postgres_exporter nếu muốn monitor DB
- **Dashboard `comprehensive-monitor-v3.json` bị lỗi cấu trúc**: 3/5 section không có dữ liệu, 2 section còn lại dùng sai metric names/labels
- **Dashboard `tong-quan-monitor-dashboard.json` tốt hơn** nhưng không được provisioning
- **Tỉ lệ section lệch**: Section "External" chỉ chiếm 8/50 panels (16%), không phải "quá nhiều" — vấn đề là các section khác chiếm chỗ nhưng không có data
