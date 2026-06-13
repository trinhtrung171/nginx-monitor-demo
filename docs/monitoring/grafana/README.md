# Grafana Dashboards

## Dashboard Structure

| Dashboard | UID | Panels | Source | Description |
|-----------|-----|--------|--------|-------------|
| **Nginx Monitor** | `MsjffzSZz` | 5 | nginx-exporter (`nginx_*`) | Nginx connections, request rate, status |
| **System Overview** | `system-overview-host` | 8 | node_exporter (`node_*`) | Host CPU, memory, disk, network, load |
| **Application Runtime** | `app-runtime-monitor` | 8 | nginx-exporter (`go_*`) + OTel | Go runtime (goroutines, heap, GC, threads), Bun process CPU/memory |
| **Application API** | `app-api-monitor` | 9 | OTel Collector (`http_server_*`, `app_access_*`) | Request rate, latency p50/p90/p95/p99, error rate, business metrics |
| **External Probe** | `external-probe-monitor` | 10 | Blackbox exporter (`probe_*`) | Uptime, response time, phase breakdown, SSL expiry |

### Files Removed
- `DevShare-Full-Dashboard.json` — duplicate (same UID as Blackbox-Vercel)
- `Blackbox-Vercel-Dashboard.json` — duplicate UID conflict with DevShare-Full
- `DevShare-OTel-Dashboard.json` — redundant subset of Full dashboard

## Data Flow

```
App (Bun/Elysia) ──OTLP HTTP──> OTel Collector ──:8889──> Prometheus ──> Grafana
Nginx + nginx-exporter ────────:9113─────────────────────────>
Host (node_exporter) ──────────:9100─────────────────────────>
Blackbox Exporter ─────────────:9115 (probe) ────────────────>
```

## PromQL Cheat Sheet by Dashboard

### Nginx Monitor
```promql
# Nginx status
nginx_up{instance=~"$instance"}

# Processed connections rate
irate(nginx_connections_accepted{instance=~"$instance"}[5m])
irate(nginx_connections_handled{instance=~"$instance"}[5m])

# Active connections breakdown
nginx_connections_active{instance=~"$instance"}
nginx_connections_reading{instance=~"$instance"}
nginx_connections_waiting{instance=~"$instance"}
nginx_connections_writing{instance=~"$instance"}

# Request rate
irate(nginx_http_requests_total{instance=~"$instance"}[5m])
```

### System Overview (Infrastructure)
```promql
# CPU usage %
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage %
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Disk I/O
rate(node_disk_read_bytes_total[5m])
rate(node_disk_written_bytes_total[5m])

# Disk usage %
(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_free_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"} * 100

# Network traffic (bits/sec)
rate(node_network_receive_bytes_total{device!="lo"}[5m]) * 8
rate(node_network_transmit_bytes_total{device!="lo"}[5m]) * 8

# System load
node_load1 / node_load5 / node_load15

# Uptime
node_time_seconds - node_boot_time_seconds
```

### Application Runtime
```promql
# Process CPU (OTel/Bun)
process_cpu_usage * 100

# Process memory RSS (OTel/Bun)
process_memory_usage_bytes

# Go goroutines & threads
go_goroutines{job="nginx"}
go_threads{job="nginx"}

# Go heap
go_memstats_heap_alloc_bytes{job="nginx"}
go_memstats_heap_sys_bytes{job="nginx"}
go_memstats_stack_inuse_bytes{job="nginx"}

# Go GC duration
rate(go_gc_duration_seconds_sum{job="nginx"}[5m]) / rate(go_gc_duration_seconds_count{job="nginx"}[5m]) * 1000
go_gc_duration_seconds{job="nginx",quantile="0.5"}
go_gc_duration_seconds{job="nginx",quantile="0.95"}
```

### Application API
```promql
# Total requests
sum(http_server_requests_total)

# Request rate (RPS)
sum(rate(http_server_requests_total[5m]))

# Request rate by method
sum(rate(http_server_requests_total[5m])) by (method)

# Request rate by HTTP status class
sum(rate(http_server_requests_total{status=~"2.."}[5m]))
sum(rate(http_server_requests_total{status=~"4.."}[5m]))
sum(rate(http_server_requests_total{status=~"5.."}[5m]))

# Error rate %
(sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m]))) * 100

# Latency percentiles
histogram_quantile(0.50, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))
histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))
histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))

# Slowest APIs by average latency
sum(rate(http_server_duration_milliseconds_sum[5m])) by (path) / sum(rate(http_server_duration_milliseconds_count[5m])) by (path)

# Business: app access rate
sum(rate(app_access_total[5m]))
sum(app_access_total)
```

### External Probe
```promql
# Probe status
probe_success{job="blackbox"}

# HTTP status code
probe_http_status_code{job="blackbox"}

# Response time
probe_duration_seconds{job="blackbox"}

# Uptime (24h)
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

## Importing

Dashboards are auto-provisioned via `/etc/grafana/dashboards/` in the Grafana container. To manually import:
1. Grafana UI → **+** → **Import**
2. Upload JSON file or paste contents
3. Select Prometheus datasource

All dashboards use template variable `${DS_PROMETHEUS}` for datasource selection.
