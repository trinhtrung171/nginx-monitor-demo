# Comprehensive Log Monitoring & Observability Metrics System Design

This document outlines the complete set of metrics and architecture patterns required to build a practical Monitoring and Log Analytics (Observability) system for a web application — designed for a local macOS + Render.com deployment environment.

---

## 0. Recommended Stack & Setup

> **Target environment:** macOS (local dev) + backend deployed on Render.com

```
┌─────────────────────────────────────────────────┐
│              Data Collection Layer               │
│  node_exporter (macOS)  +  OTel SDK (backend)   │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│              Storage & Processing                │
│     Prometheus (metrics)  +  Loki (logs)        │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│               Visualization Layer                │
│               Grafana Dashboard                  │
└─────────────────────────────────────────────────┘
```

**Quick Start — run all services locally via Docker Compose:**

```yaml
# docker-compose.yml
version: "3.8"
services:
  prometheus:
    image: prom/prometheus
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  loki:
    image: grafana/loki
    ports: ["3100:3100"]
    volumes:
      - ./loki-data:/loki  # persist logs across restarts

  grafana:
    image: grafana/grafana
    ports: ["3000:3000"]
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - ./grafana-data:/var/lib/grafana  # persist dashboards across restarts
```

```bash
docker compose up -d
# Grafana → http://localhost:3000  (admin / admin)
# Prometheus → http://localhost:9090
```

---

## 1. Metrics Summary by Architecture Layer

### Layer 1: Infrastructure & System Resources
*Objective: Monitor CPU, RAM, Disk, and Network on the local macOS machine running the backend.*

| Metric Group | Specific Metrics | Collection Source | How to Use |
| :--- | :--- | :--- | :--- |
| **CPU Usage** | `node_cpu_seconds_total` | `node_exporter` | **PromQL:** `100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)` → Grafana "Gauge" panel, alert if > 80% |
| **Memory** | `node_memory_active_bytes`<br>`node_memory_wired_bytes`<br>`node_memory_total_bytes` | `node_exporter` | **PromQL:** `(node_memory_active_bytes + node_memory_wired_bytes) / node_memory_total_bytes * 100` → "Used RAM %" panel. Uses macOS-native fields (`active` + `wired`) instead of Linux-only `MemAvailable`. |
| **Disk I/O** | `node_disk_read_bytes_total`<br>`node_disk_written_bytes_total` | `node_exporter` | **PromQL:** `rate(node_disk_read_bytes_total[1m])` → "Disk Read/Write Speed" time-series panel |
| **Network I/O** | `node_network_receive_bytes_total`<br>`node_network_transmit_bytes_total` | `node_exporter` | **PromQL:** `rate(node_network_receive_bytes_total{device="en0"}[1m])` → replace `en0` with your macOS network interface |
| **System Load** | `node_load1`<br>`node_load5`<br>`node_load15` | `node_exporter` | Compare `node_load1` against CPU core count. If `load1 / cores > 1.0`, system is overloaded. |

**Installing node_exporter on macOS:**

```bash
brew install node_exporter
brew services start node_exporter
# Metrics available at: http://localhost:9100/metrics
```

**Add to `prometheus.yml`:**

```yaml
scrape_configs:
  - job_name: "node"
    static_configs:
      - targets: ["host.docker.internal:9100"]

  - job_name: "app-otel"
    static_configs:
      - targets: ["host.docker.internal:9464"]  # OTel Prometheus exporter port
```

> ⚠️ **macOS Note:** Some disk and filesystem metrics are unavailable on macOS. CPU and RAM work correctly. If needed, supplement with a small custom script using `vm_stat` or `top`.

---

### Layer 2: Application Layer (APM)
*Objective: Measure backend performance, detect errors, and identify slow endpoints.*

| Metric Group | Specific Metrics | Collection Source | How to Use |
| :--- | :--- | :--- | :--- |
| **Request Count** | `http_server_requests_total` | OpenTelemetry SDK | **PromQL:** `sum by(route, method, status_code)(rate(http_server_requests_total[1m]))` → "Top Endpoints by Traffic" bar chart |
| **HTTP Status Codes** | `http_server_requests_total{status_code=~"5.."}` | OpenTelemetry SDK | **PromQL:** `rate(http_server_requests_total{status_code=~"5.."}[5m])` → "Error Rate %" panel, alert if > 1% |
| **Response Latency** | `http_server_duration_milliseconds` (Histogram) | OpenTelemetry SDK | **PromQL:** `histogram_quantile(0.95, rate(http_server_duration_milliseconds_bucket[5m]))` → "p95 Latency" panel |
| **App Process CPU** | `process_cpu_usage` | OpenTelemetry SDK | Isolates CPU consumed only by your app process (Node.js / Python / Go), separate from OS-level CPU |
| **App Process RAM** | `process_resident_memory_bytes` | OpenTelemetry SDK | Useful for detecting memory leaks — watch for steady upward trend over hours |
| **Error Count** | `app_errors_total` (custom counter) | OTel SDK / Log Parser | Increment this counter in your error handler (`try/catch`) to count unhandled exceptions |

**Installing OpenTelemetry (Node.js example):**

```bash
npm install @opentelemetry/sdk-node \
            @opentelemetry/auto-instrumentations-node \
            @opentelemetry/exporter-prometheus
```

```javascript
// otel.js — load before anything else: node -r ./otel.js server.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const sdk = new NodeSDK({
  metricReader: new PrometheusExporter({ port: 9464 }), // metrics at :9464/metrics
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

---

### Layer 3: User Access Log Tracking
*Objective: Track who accessed what, from which IP, what action they took, and how much resource was consumed.*

**Required log format — emit this on every request:**

```json
{
  "timestamp": "2025-06-13T10:00:00Z",
  "ip": "203.162.x.x",
  "user_id": "u_123",
  "method": "POST",
  "path": "/api/checkout",
  "status": 200,
  "duration_ms": 142,
  "bytes_sent": 1024,
  "user_agent": "Mozilla/5.0..."
}
```

**Express.js middleware example:**

```javascript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      user_id: req.user?.id || 'anonymous',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      bytes_sent: parseInt(res.getHeader('content-length') || 0),
      user_agent: req.headers['user-agent'],
    }));
  });
  next();
});
```

**Send logs to Loki via Promtail:**

```yaml
# promtail-config.yml
clients:
  - url: http://localhost:3100/loki/api/v1/push

scrape_configs:
  - job_name: app-logs
    static_configs:
      - targets: [localhost]
        labels:
          job: backend
          __path__: /var/log/app/*.log
```

**Useful Loki queries in Grafana:**

```logql
# All requests from a specific IP
{job="backend"} | json | ip="203.162.x.x"

# All 5xx errors with path
{job="backend"} | json | status >= 500 | line_format "{{.method}} {{.path}} → {{.status}} ({{.duration_ms}}ms)"

# Slowest requests (>500ms)
{job="backend"} | json | duration_ms > 500

# Activity of a specific user
{job="backend"} | json | user_id="u_123"
```

| What to Track | Loki Label / Field | Grafana Panel Type |
| :--- | :--- | :--- |
| Requests per IP | `ip` field | Table — Top IPs |
| User actions by path | `path` + `user_id` | Logs panel — User Journey |
| HTTP method breakdown | `method` field | Pie chart |
| Status code over time | `status` field | Time series |
| Avg response time | `duration_ms` | Stat / Gauge |
| Bandwidth per IP | `bytes_sent` grouped by `ip` | Bar chart |

---

### Layer 4: Database Query Monitoring
*Objective: Detect slow queries that degrade user experience.*

| Metric | How to Collect | How to Use |
| :--- | :--- | :--- |
| **Query execution time** | ORM middleware hook (see below) | Log all queries with duration; filter those > 200ms |
| **Slow query count** | Custom Prometheus counter | Alert when slow query rate spikes |
| **Query count per request** | Context-level counter | Detect N+1 query problems (many small queries per request) |

**Prisma example (log slow queries):**

```javascript
const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
});

prisma.$on('query', (e) => {
  if (e.duration > 200) {
    console.log(JSON.stringify({
      type: 'slow_query',
      duration_ms: e.duration,
      query: e.query,        // e.g. SELECT * FROM users WHERE ...
      timestamp: new Date().toISOString(),
    }));
  }
});
```

**Sequelize example:**

```javascript
const sequelize = new Sequelize(DB_URL, {
  benchmark: true,
  logging: (sql, duration) => {
    if (duration > 200) {
      console.log(JSON.stringify({ type: 'slow_query', duration_ms: duration, sql }));
    }
  },
});
```

---

### Layer 5: HTTP Endpoint Health Check (Blackbox Probing)
*Objective: Simulate external requests to verify your Render.com deployment is reachable and responding correctly.*

| Metric | Meaning | Alert Condition |
| :--- | :--- | :--- |
| `probe_success` | 1 = up, 0 = down | Alert immediately when = 0 |
| `probe_http_status_code` | Actual HTTP code returned | Alert if ≠ 200 |
| `probe_duration_seconds` | Total round-trip time | Alert if > 3s |

**`prometheus.yml` — add blackbox probe for your Render URL:**

```yaml
  - job_name: "blackbox"
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://your-app.onrender.com/health   # your Render URL
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

Add blackbox_exporter to docker-compose.yml:

```yaml
  blackbox:
    image: prom/blackbox-exporter
    ports: ["9115:9115"]
```

---

## 2. Recommended Grafana Dashboard Layout

```
Row 1 — System Health
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  CPU Usage % │  RAM Usage % │ Disk I/O     │ Net In/Out   │
└──────────────┴──────────────┴──────────────┴──────────────┘

Row 2 — Application Performance
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Request/min  │ Error Rate % │ p95 Latency  │ Render Uptime│
└──────────────┴──────────────┴──────────────┴──────────────┘

Row 3 — User Access
┌─────────────────────────┬────────────────────────────────┐
│ Top 10 IPs (Table)      │ Requests by Endpoint (Bar)     │
├─────────────────────────┼────────────────────────────────┤
│ HTTP Status Breakdown   │ Avg Response Time by Route     │
└─────────────────────────┴────────────────────────────────┘

Row 4 — Database
┌─────────────────────────┬────────────────────────────────┐
│ Slow Query Count        │ Live Slow Query Log (Logs panel│
└─────────────────────────┴────────────────────────────────┘
```

---

## 3. Key Metrics Checklist

| # | Metric | Source | Priority |
|---|--------|--------|----------|
| 1 | CPU Usage % | node_exporter | ✅ Must have |
| 2 | RAM Usage % | node_exporter | ✅ Must have |
| 3 | Request count by endpoint | OTel | ✅ Must have |
| 4 | HTTP error rate (5xx) | OTel | ✅ Must have |
| 5 | Response latency p95 | OTel | ✅ Must have |
| 6 | Access log (IP, user, action) | App middleware | ✅ Must have |
| 7 | Bandwidth per request | App middleware | ✅ Must have |
| 8 | Slow query detection | ORM hook | ✅ Must have |
| 9 | Render.com uptime probe | blackbox_exporter | ✅ Must have |
| 10 | Disk I/O | node_exporter | ⚡ Good to have |
| 11 | Network I/O | node_exporter | ⚡ Good to have |
| 12 | GeoIP per IP | MaxMind GeoLite2 | ⚡ Good to have |

---

*Document prepared for academic coursework — practical observability system for macOS local + Render.com deployment.*
