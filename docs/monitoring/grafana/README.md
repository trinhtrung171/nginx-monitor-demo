# Grafana Dashboards

## Dashboard Files

| File | UID | Description |
|------|-----|-------------|
| `application-runtime-dashboard.json` | `runtime-go-app-process` | Go runtime (heap alloc/sys/idle/inuse, GC count/duration, goroutines, threads) + App process CPU & memory (OTel/Bun) |
| `application-api-dashboard.json` | `application-api-monitor-v2` | Request rate, latency p50/p90/p95/p99, error rate (5xx), HTTP status breakdown, slowest endpoints, business metrics (app_access) |
| `infrastructure-dashboard.json` | `infrastructure-host-monitor-v2` | Host CPU %, memory %, disk %, disk I/O, network traffic (bits), system load, uptime, CPU by mode, memory detail |
| `tong-quan-monitor-dashboard.json` | `nginx-monitor-tong-quan` | *(Legacy)* All-in-one dashboard with Nginx, API, Runtime, Infra, External Probe sections |

## Data Flow

```
App (Bun/Elysia) ──OTLP HTTP──> OTel Collector ──:8889──> Prometheus ──> Grafana
Nginx + nginx-exporter ────────:9113─────────────────────────>
Host (node_exporter) ──────────:9100─────────────────────────>
Blackbox Exporter ─────────────:9115 (probe) ────────────────>
```

## Metric Sources & Jobs

| Source | Job name (Prometheus) | Key metrics |
|--------|----------------------|-------------|
| nginx-exporter | `nginx` (Docker label) | `nginx_*`, `go_*` |
| OTel Collector | `otel-collector` | `http_server_*`, `app_access_*`, `process_*` |
| node_exporter | `node` | `node_*` |
| Blackbox | `blackbox` | `probe_*` |

## PromQL Queries by Dashboard

### 1. Application Runtime Dashboard (substitutes JVM)

#### Go Heap Memory
```promql
# Heap currently in use
go_memstats_heap_alloc_bytes{job="nginx"}

# Heap reserved from OS
go_memstats_heap_sys_bytes{job="nginx"}

# Heap idle (not in use but retained)
go_memstats_heap_idle_bytes{job="nginx"}

# Heap in use (actual RSS)
go_memstats_heap_inuse_bytes{job="nginx"}
```

#### Go GC
```promql
# GC rate (collections/sec)
rate(go_gc_duration_seconds_count{job="nginx"}[5m])

# Average GC duration (ms)
rate(go_gc_duration_seconds_sum{job="nginx"}[5m]) / rate(go_gc_duration_seconds_count{job="nginx"}[5m]) * 1000

# GC percentiles
go_gc_duration_seconds{job="nginx",quantile="0.5"}
go_gc_duration_seconds{job="nginx",quantile="0.95"}
```

#### Go Goroutines & Threads
```promql
go_goroutines{job="nginx"}
go_threads{job="nginx"}
```

#### App Process (Bun/Node via OTel)
```promql
# CPU %
process_cpu_usage * 100 or vector(0)

# Memory RSS
process_memory_usage_bytes or vector(0)
```

### 2. Application API Dashboard

#### Traffic
```promql
# Total requests
sum(http_server_requests_total) or vector(0)

# Request rate (RPS)
sum(rate(http_server_requests_total[5m])) or vector(0)

# By method
sum(rate(http_server_requests_total[5m])) by (method) or vector(0)
```

#### Latency
```promql
# p50 / p90 / p95 / p99
histogram_quantile(0.50, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))
histogram_quantile(0.90, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))
histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))
histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))

# Slowest endpoints (avg latency 5m)
sum(rate(http_server_duration_milliseconds_sum[5m])) by (path, method) / sum(rate(http_server_duration_milliseconds_count[5m])) by (path, method)
```

#### Errors
```promql
# Error rate %
(sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m]))) * 100 or vector(0)

# By status class
sum(rate(http_server_requests_total{status=~"2.."}[5m]))
sum(rate(http_server_requests_total{status=~"4.."}[5m]))
sum(rate(http_server_requests_total{status=~"5.."}[5m]))
```

#### Business Metrics
```promql
sum(rate(app_access_total[5m])) or vector(0)
sum(app_access_total) or vector(0)
```

### 3. Infrastructure Dashboard

#### CPU
```promql
# Usage %
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# By mode
avg by(instance, mode)(rate(node_cpu_seconds_total{instance=~"$instance"}[5m]))
```

#### Memory
```promql
# Usage %
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Detail
node_memory_MemTotal_bytes
node_memory_MemFree_bytes
node_memory_MemAvailable_bytes
```

#### Disk
```promql
# Disk usage %
(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_free_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"} * 100

# I/O
rate(node_disk_read_bytes_total[5m])
rate(node_disk_written_bytes_total[5m])

# By mountpoint
((node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes) * 100
```

#### Network
```promql
# bits/sec
rate(node_network_receive_bytes_total{device!="lo"}[5m]) * 8
rate(node_network_transmit_bytes_total{device!="lo"}[5m]) * 8
```

## Troubleshooting "No Data"

If panels show **No Data**, check the following:

1. **Metric name mismatch**: Verify actual metric names by querying in Prometheus UI (`localhost:9090`). Use `{job="nginx"}` for Go runtime, `{job="otel-collector"}` for app HTTP metrics.

2. **Job label incorrect**: The job label depends on Docker labels. Check `__meta_docker_container_label_prometheus_job` for the correct job name.

3. **No traffic / no data yet**: Some metrics (like histograms) only appear after the first request. Trigger a few API calls to seed data.

4. **OTel histogram naming**: OpenTelemetry exposes histograms with `_bucket`, `_count`, `_sum` suffixes. The base name is `http_server_duration_milliseconds`.

5. **`or vector(0)` fallback**: All queries now use `or vector(0)` to show "0" instead of "No Data" when metrics are absent.

6. **Container not running**: Ensure the app container is running and emitting OTLP metrics to `otel-collector:4318`.

## Importing

Dashboards are auto-provisioned via `/etc/grafana/dashboards/` in the Grafana container. To manually import:
1. Grafana UI → **+** → **Import**
2. Upload JSON file or paste contents
3. Select Prometheus datasource

All dashboards use template variable `${DS_PROMETHEUS}` for datasource selection.
