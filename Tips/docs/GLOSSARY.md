# 📚 Bảng Thuật Ngữ - Glossary

Hướng dẫn giải thích các thuật ngữ, khái niệm, và metrics trong nginx-monitor-demo.

---

## 📋 Mục Lục

1. [Thuật Ngữ Cơ Bản](#thuật-ngữ-cơ-bản)
2. [Metrics (Dữ Liệu Đo Lường)](#metrics-dữ-liệu-đo-lường)
3. [Monitoring Stack](#monitoring-stack)
4. [Docker & Networking](#docker--networking)
5. [Prometheus](#prometheus)
6. [Alerting](#alerting)
7. [SSL/TLS](#ssltls)
8. [HTTP & Web](#http--web)

---

## 📖 Thuật Ngữ Cơ Bản

### **Alert / Cảnh báo**
Thông báo được kích hoạt khi một điều kiện xảy ra (ví dụ: app down, response time cao).

**Ví dụ:**
- Alert: "VercelAppDown" → Email gửi: "App of yours is DOWN!"
- Alert: "SSLCertificateExpiring" → Email: "SSL hết hạn trong 30 ngày"

**Quy trình:**
```
Prometheus phát hiện điều kiện
    ↓
Tạo alert (FIRING)
    ↓
Gửi tới Alertmanager
    ↓
Alertmanager gửi email
```

---

### **Alertmanager**
Dịch vụ nhận cảnh báo từ Prometheus, nhóm chúng lại, và gửi tới kênh thông báo (email, Slack, PagerDuty...).

**Chức năng:**
- Nhân cảnh báo từ Prometheus
- Nhóm cảnh báo giống nhau
- Gửi email via Gmail SMTP
- Chỉnh lại frequency (gửi lại mỗi 12h nếu vẫn xảy ra)

**Cấu hình:** `alertmanager/alertmanager.yml` (generated from `.env` vars)

---

### **Blackbox Exporter**
Công cụ thăm dò (probe) HTTP/HTTPS từ bên ngoài để kiểm tra xem endpoint có hoạt động không.

**Công dụng:**
- Kiểm tra app từ bên ngoài (simulate user accessing app)
- Measure response time, HTTP status, SSL validity
- Không cần cài agent trên server được monitor

**Ví dụ:**
```
Blackbox probes https://cozyapp.vercel.app mỗi 15s
├─ Is it up?
├─ HTTP status?
├─ Response time?
└─ SSL cert valid?
```

---

### **Dashboard**
Giao diện hiển thị visualizations của metrics (charts, gauges, tables...).

**Dashboard trong project:**
- **Blackbox-Vercel-Dashboard.json** (10 panels)
  - Probe Status, HTTP Code, Response Time
  - SSL Certificate Expiry
  - Request Phase Breakdown
  - Response Time Trend

---

### **Datasource**
Nguồn dữ liệu mà Grafana lấy metrics từ đó.

**Trong project:**
- **Prometheus** (main datasource)
  - Địa chỉ: `http://prometheus:9090`
  - UID: `PBFA97CFB590B2093`
- **Loki** (log datasource)
  - Địa chỉ: `http://loki:3100`

---

### **Endpoint**
URL/port của service được monitor (ví dụ: `http://localhost:9090`, `/stub_status`).

**Endpoints trong project:**
```
Nginx:           http://localhost:8080/stub_status
Prometheus:      http://localhost:9090
Grafana:         http://localhost:3000
Alertmanager:    http://localhost:9093
Blackbox:        http://localhost:9115
Loki:            http://localhost:3100
```

---

### **Exporter**
Công cụ chuyển đổi metrics từ định dạng gốc sang Prometheus format.

**Exporters trong project:**
- **Nginx Exporter** - Chuyển `/stub_status` → Prometheus format
- **Blackbox Exporter** - Chuyển HTTP probe → Prometheus metrics

**Cách hoạt động:**
```
Nginx (raw metrics)
    ↓
Nginx Exporter (convert)
    ↓
Prometheus format
    ↓
Prometheus scrapes it
```

---

### **Grafana**
Dashboard visualization platform - hiển thị metrics dưới dạng charts, graphs, tables.

**Chức năng:**
- Tạo dashboard từ Prometheus data
- Alert rules integration
- Auto-provision datasources & dashboards
- Role-based access control

**URL:** `http://localhost:3000`

---

### **Healthcheck**
Kiểm tra định kỳ xem service có chạy bình thường không (restart nếu down).

**Ví dụ trong Docker:**
```yaml
healthcheck:
  test: curl -f http://localhost/stub_status || exit 1
  interval: 30s
  timeout: 10s
  retries: 3
```

---

### **Labels**
Metadata (nhãn) gắn trên container/metrics để phân loại và identify.

**Docker labels (app-docker-compose.yml):**
```yaml
labels:
  - "prometheus.monitor=true"
  - "prometheus.scrape_port=9113"
  - "prometheus.job=nginx"
```

**Prometheus labels (metrics):**
```
nginx_up{job="nginx", instance="nginx-exporter:9113"}
probe_success{job="blackbox", instance="https://cozyapp.vercel.app"}
```

---

### **Loki**
Log aggregation platform - tập trung logs từ tất cả containers, queryable qua Grafana.

**Chức năng:**
- Collect logs từ Docker containers
- Store & index logs
- Query via Grafana (like Prometheus but for logs)

---

### **Metrics**
Dữ liệu đo lường (con số, giá trị) được thu thập định kỳ để track hiệu suất.

**Ví dụ:**
```
nginx_connections_active = 45
probe_http_status_code = 200
probe_duration_seconds = 0.268
prometheus_up = 1
```

*Xem section [Metrics](#metrics-dữ-liệu-đo-lường) bên dưới*

---

### **Prometheus**
Time-series database (TSDB) - lưu trữ metrics, đánh giá alert rules, cung cấp query API.

**Chức năng:**
- Scrape metrics từ exporters
- Lưu metrics với timestamps
- Evaluate alert rules
- Expose query API
- Web UI: `http://localhost:9090`

---

### **Probe / Probing**
Gửi request tới endpoint để check xem nó còn hoạt động không.

**Ví dụ Blackbox probe:**
```
Blackbox → GET https://cozyapp.vercel.app
    ↓
Measure: status 200, time 268ms, SSL valid
    ↓
Export metrics: probe_success=1, probe_duration_seconds=0.268
```

---

### **Scrape**
Quá trình Prometheus lấy metrics từ target (exporter).

**Khoảng thời gian:** Mặc định mỗi 15 giây

**Quy trình:**
```
Prometheus (every 15s)
    ↓
GET http://nginx-exporter:9113/metrics
    ↓
Parse metrics
    ↓
Store in TSDB
```

---

### **Service**
Container chạy trong Docker Compose (Nginx, Prometheus, Grafana, etc).

**Services trong project:**

**App Stack:**
- nginx
- nginx-exporter

**Monitoring Stack:**
- prometheus
- grafana
- alertmanager
- blackbox-exporter
- loki
- promtail

---

### **Stack**
Tập hợp services chạy cùng nhau (ví dụ: app stack, monitoring stack).

**Trong project:**
- **app-docker-compose.yml** - Application stack (Nginx + Exporter)
- **monitor-docker-compose.yml** - Monitoring stack (Prometheus, Grafana, etc)

---

### **Target**
Service/endpoint được monitor (ví dụ: Nginx, Vercel app, Prometheus self).

**Targets trong project:**
```
prometheus (job: prometheus)
nginx-exporter (job: nginx)
https://cozyapp.vercel.app (job: blackbox)
```

---

### **Threshold**
Giá trị mục tiêu - khi metrics vượt ngưỡng này, alert được kích hoạt.

**Ví dụ:**
```
Alert: NginxHighConnections
  threshold: > 1000
  meaning: Nếu active connections vượt 1000, fire alert

Alert: NginxHighResponseTime
  threshold: > 1s (1000ms)
  meaning: Nếu response time vượt 1 giây, fire alert
```

---

### **TSDB (Time-Series Database)**
Database lưu trữ metrics với timestamps.

**Ví dụ:**
```
timestamp: 15:00:00, metric: nginx_connections_active, value: 45
timestamp: 15:00:15, metric: nginx_connections_active, value: 48
timestamp: 15:00:30, metric: nginx_connections_active, value: 42
```

**Prometheus là TSDB** - lưu metrics theo thời gian.

---

## 📊 Metrics (Dữ Liệu Đo Lường)

### **Metrics là gì?**

Metrics = dữ liệu đo lường (con số, giá trị) được collect định kỳ.

**Quy trình:**
```
Collect → Export → Scrape → Store → Query → Visualize → Alert
```

---

### **3 Loại Metrics:**

#### **1. Counter (Bộ đếm)**
- Chỉ tăng, không giảm
- Có thể reset khi service restart

**Ví dụ:**
```
nginx_http_requests_total = 100    (restart)
nginx_http_requests_total = 100    (start counting)
nginx_http_requests_total = 105    (tăng 5)
nginx_http_requests_total = 150    (tăng 45)
```

**Query:**
```promql
# Requests per second (mỗi giây)
rate(nginx_http_requests_total[1m])
```

---

#### **2. Gauge (Đo lường)**
- Có thể tăng/giảm
- Snapshot của giá trị hiện tại

**Ví dụ:**
```
nginx_connections_active = 45    (hiện tại)
nginx_connections_active = 50    (tăng)
nginx_connections_active = 42    (giảm)
```

**Query:**
```promql
# Connection hiện tại
nginx_connections_active

# Average trong 5 phút
avg_over_time(nginx_connections_active[5m])
```

---

#### **3. Histogram (Phân bố)**
- Phân bố giá trị trong buckets (ranges)
- Thường dùng cho time/latency

**Ví dụ:**
```
probe_duration_seconds_bucket{le="0.1"} = 2340  (< 0.1s)
probe_duration_seconds_bucket{le="0.5"} = 5600  (< 0.5s)
probe_duration_seconds_bucket{le="1.0"} = 6200  (< 1.0s)
probe_duration_seconds_bucket{le="+Inf"} = 6200 (all)
```

**Query:**
```promql
# 95th percentile response time
histogram_quantile(0.95, rate(probe_duration_seconds_bucket[5m]))
```

---

### **Nginx Metrics:**

| Metric | Type | Giải thích |
|--------|------|-----------|
| `nginx_up` | Gauge | Nginx running (1=up, 0=down) |
| `nginx_http_requests_total` | Counter | Tổng HTTP requests |
| `nginx_http_requests_total{status="200"}` | Counter | Requests status 200 |
| `nginx_http_requests_total{status="5xx"}` | Counter | Requests status 5xx (errors) |
| `nginx_connections_active` | Gauge | Active connections hiện tại |
| `nginx_connections_reading` | Gauge | Connections đang read requests |
| `nginx_connections_writing` | Gauge | Connections đang write responses |
| `nginx_connections_waiting` | Gauge | Connections idle (waiting) |
| `nginx_connections_accepted_total` | Counter | Tổng connections accepted |

---

### **Blackbox Metrics:**

| Metric | Type | Giải thích |
|--------|------|-----------|
| `probe_success` | Gauge | Probe success (1=up, 0=down) |
| `probe_http_status_code` | Gauge | HTTP response code (200, 404, 500...) |
| `probe_duration_seconds` | Gauge | Tổng thời gian probe (seconds) |
| `probe_http_duration_seconds{phase="connect"}` | Gauge | TCP connection time |
| `probe_http_duration_seconds{phase="tls"}` | Gauge | TLS handshake time |
| `probe_http_duration_seconds{phase="processing"}` | Gauge | Server processing time |
| `probe_http_duration_seconds{phase="transfer"}` | Gauge | Data transfer time |
| `probe_ssl_earliest_cert_expiry` | Gauge | SSL expiry (unix timestamp) |
| `probe_http_content_length` | Gauge | Response body size (bytes) |
| `probe_http_version` | Gauge | HTTP version (1.0, 1.1, 2.0...) |

---

### **Prometheus Internal Metrics:**

| Metric | Type | Giải thích |
|--------|------|-----------|
| `prometheus_up` | Gauge | Prometheus running |
| `prometheus_http_requests_total` | Counter | Tổng API requests |
| `prometheus_sd_discovered_targets` | Gauge | Số targets phát hiện |
| `prometheus_tsdb_metric_chunks_created_total` | Counter | Chunks created |
| `prometheus_rule_evaluation_duration_seconds` | Histogram | Alert evaluation time |

---

### **Query Examples:**

```promql
# Requests per second
rate(nginx_http_requests_total[1m])

# Error rate (5xx errors)
rate(nginx_http_requests_total{status=~"5.."}[1m])

# Average response time
avg_over_time(probe_duration_seconds[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(probe_duration_seconds_bucket[5m]))

# Days until SSL expires
(probe_ssl_earliest_cert_expiry - time()) / 86400

# Connection percentage
nginx_connections_active / (nginx_connections_active + nginx_connections_waiting)

# Is app up?
probe_success == 1

# Probe failures
probe_success == 0
```

---

## 🛠️ Monitoring Stack

### **Architecture Overview**

```
┌─────────────────────────────────────────────────┐
│           Monitoring Stack                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Prometheus (TSDB)                        │  │
│  │ ├─ Scrapes metrics every 15s             │  │
│  │ ├─ Evaluates alert rules                 │  │
│  │ └─ Web UI: http://localhost:9090         │  │
│  └──────────────────────────────────────────┘  │
│                    ↓                            │
│  ┌──────────────────────────────────────────┐  │
│  │ Alertmanager                             │  │
│  │ ├─ Receives alerts from Prometheus       │  │
│  │ ├─ Groups & deduplicates                 │  │
│  │ └─ Sends email via Gmail SMTP            │  │
│  └──────────────────────────────────────────┘  │
│                    ↓                            │
│               Email (Gmail)                    │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Grafana (Visualization)                  │  │
│  │ ├─ Reads from Prometheus                 │  │
│  │ ├─ Dashboards (10 panels)                │  │
│  │ └─ Web UI: http://localhost:3000         │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Blackbox Exporter                        │  │
│  │ ├─ Probes external endpoints (Vercel)    │  │
│  │ ├─ Exports HTTP probe metrics            │  │
│  │ └─ API: http://localhost:9115            │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Loki + Promtail (Log Aggregation)        │  │
│  │ ├─ Collects logs from containers         │  │
│  │ ├─ Queryable in Grafana                  │  │
│  │ └─ API: http://localhost:3100            │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

### **Prometheus Job Types:**

#### **1. Static Config (Nginx Exporter)**
```yaml
job_name: 'prometheus'
static_configs:
  - targets: ['localhost:9090']
```
- Cấu hình cố định
- Không auto-discovery

#### **2. Dynamic Discovery (Nginx via Docker SD)**
```yaml
job_name: 'nginx'
docker_sd_configs:
  - host: unix:///var/run/docker.sock
relabel_configs:
  - source_labels: [__meta_docker_container_label_prometheus_monitor]
    action: keep
    regex: true
```
- Auto-discover containers với label `prometheus.monitor=true`
- Port từ label `prometheus.scrape_port`

#### **3. Service Discovery (Blackbox)**
```yaml
job_name: 'blackbox'
metrics_path: /probe
params:
  module: [http_2xx]
static_configs:
  - targets: ['https://cozyapp.vercel.app']
relabel_configs:
  - source_labels: [__address__]
    target_label: __param_target
  - target_label: __address__
    replacement: blackbox-exporter:9115
```
- Proxy through Blackbox Exporter
- Transform target URL → Blackbox param

---

## 🐳 Docker & Networking

### **Docker Compose**
Công cụ define & run multiple containers.

**Trong project:**
- `app-docker-compose.yml` - Application stack
- `monitor-docker-compose.yml` - Monitoring stack

---

### **Docker Network**
Kết nối containers để chúng communicate với nhau.

**Type: Bridge Network (External)**
```
global-monitor-net (user-defined bridge)
├─ Container trong app stack
├─ Container trong monitoring stack
└─ Tất cả có thể communicate qua hostname
```

**Tại sao external network?**
- Services từ 2 stacks khác nhau có thể talk
- Prometheus (monitoring) có thể scrape Nginx (app)

---

### **Ports**
Container port mapping `HOST_PORT:CONTAINER_PORT`

**Trong project:**
```
8080 → Nginx
9090 → Prometheus
3000 → Grafana
9093 → Alertmanager
9113 → Nginx Exporter (internal only)
9115 → Blackbox Exporter (internal only)
3100 → Loki (internal only)
```

**"Internal only"** = không expose ra host, chỉ trong Docker network

---

### **Volumes**
Persistent storage cho containers.

**Trong project:**
```
prometheus_data  → Lưu Prometheus TSDB
grafana_data     → Lưu Grafana configs, dashboards
```

**Lợi ích:**
- Data không mất khi container restart
- Multiple containers có thể share

---

### **Environment Variables (.env)**
Runtime configuration stored in `.env` file.

**Trong project:**
```bash
DOCKERHUB_USERNAME=your-username
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_FROM=your-email@gmail.com
SMTP_TO=recipient@gmail.com
GF_PASSWORD=admin123
VERCEL_URL=https://cozyapp.vercel.app
```

**Lợi ích:**
- Không hardcode secrets
- Dễ thay đổi mà không edit code
- `.env` excluded from git (.gitignore)

---

## 🔍 Prometheus

### **Prometheus Architecture**

```
┌─────────────────────────────────────────┐
│        Prometheus                       │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │ Scraper                          │  │
│  │ (mỗi 15s)                        │  │
│  │ ↓                                │  │
│  │ GET /metrics from targets        │  │
│  └──────────────────────────────────┘  │
│           ↓                             │
│  ┌──────────────────────────────────┐  │
│  │ Parser                           │  │
│  │ Parse Prometheus text format     │  │
│  └──────────────────────────────────┘  │
│           ↓                             │
│  ┌──────────────────────────────────┐  │
│  │ TSDB (Time-Series DB)            │  │
│  │ ├─ Store metrics with timestamps │  │
│  │ ├─ Index by labels               │  │
│  │ └─ Retention: 15 days            │  │
│  └──────────────────────────────────┘  │
│           ↓                             │
│  ┌──────────────────────────────────┐  │
│  │ Query Engine                     │  │
│  │ ├─ PromQL queries                │  │
│  │ ├─ Alert evaluation              │  │
│  │ └─ Grafana requests              │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

---

### **PromQL (Prometheus Query Language)**

Ngôn ngữ query metrics trong Prometheus.

**Syntax:**
```promql
# Selector (chọn metrics)
metric_name{label="value"}

# Range vector (khoảng thời gian)
metric_name{label="value"}[5m]

# Functions
rate(...)           # tính tốc độ thay đổi
avg_over_time(...)  # average
histogram_quantile(...)  # percentile
sum(...)            # tổng
count(...)          # đếm
```

**Ví dụ:**
```promql
nginx_connections_active                           # Giá trị hiện tại
nginx_connections_active[5m]                       # Range vector
rate(nginx_http_requests_total[1m])                # Requests per second
avg_over_time(probe_duration_seconds[5m])          # Average response time
histogram_quantile(0.95, rate(...[5m]))            # 95th percentile
```

---

### **Alert Rules**

File định nghĩa khi nào alert should fire.

**Syntax:**
```yaml
- alert: AlertName
  expr: PromQL_expression
  for: duration        # Cần xảy ra đủ lâu
  labels:
    severity: critical
  annotations:
    summary: "..."
    description: "..."
```

**Ví dụ:**
```yaml
- alert: NginxServerDown
  expr: up{job="nginx"} == 0
  for: 30s             # Down 30+ seconds
  severity: critical
  annotations:
    summary: "Nginx server is down"
    description: "Nginx has been down for 30 seconds"
```

---

## 📢 Alerting

### **Alert Lifecycle**

```
Inactive
    ↓
Pending (condition met, waiting for 'for' duration)
    ↓
FIRING (condition still true after 'for')
    ↓ (send to Alertmanager)
Alertmanager (group, deduplicate)
    ↓
Email sent
    ↓
Resolved (condition no longer true)
    ↓
Inactive
```

---

### **Alert Severity Levels**

**Critical** (URGENT)
- App hoàn toàn down
- Data loss nguy hiểm
- Security breach
- Ví dụ: VercelAppDown, NginxServerDown

**Warning** (ATTENTION)
- Performance degradation
- Resource usage high
- Certificate expiring soon
- Ví dụ: NginxHighResponseTime, SSLCertificateExpiring

**Info** (FYI)
- Informational only
- Không cần immediate action
- Ví dụ: "Deployment started"

---

### **Alertmanager Grouping**

Alertmanager groups alerts theo labels để avoid email spam.

**Config:**
```yaml
route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s      # Chờ 10s để gather alerts
  group_interval: 10s  # Check mỗi 10s
  repeat_interval: 12h # Re-send mỗi 12h nếu vẫn firing
```

**Ví dụ:**
```
Alert 1: NginxServerDown (15:00:00)
Alert 2: NginxHighErrorRate (15:00:05)

Alertmanager waits 10s...

15:00:10: Sends 1 email with BOTH alerts grouped
(thay vì 2 emails riêng)
```

---

### **Notification Channels**

**Supported by Alertmanager:**
- Email (Gmail SMTP)
- Slack
- PagerDuty
- Webhook
- OpsGenie
- etc.

**Trong project:** Email via Gmail SMTP

---

## 🔐 SSL/TLS

### **SSL/TLS Basics**

**SSL (Secure Sockets Layer)** / **TLS (Transport Layer Security)**
- Encrypt communication
- Verify identity
- Certificate-based

---

### **SSL Certificate Components**

**Certificate Expiry:**
- Issued: 2024-01-01
- Expires: 2026-06-10
- Days remaining: Calculate as `(expiry_time - current_time) / 86400`

**Certificate Chain:**
- Root CA (Certificate Authority)
- Intermediate CA
- End-entity certificate (your app)

---

### **SSL Metrics (Blackbox)**

| Metric | Giải thích |
|--------|-----------|
| `probe_ssl_earliest_cert_expiry` | Unix timestamp khi SSL hết hạn |
| `probe_tls_version_info` | TLS version (1.2, 1.3) |
| `probe_http_duration_seconds{phase="tls"}` | TLS handshake time |

---

### **SSL Alert Rules**

**SSLCertificateExpiring** (Warning)
```yaml
expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 30
```
- Fires when < 30 days until expiry
- Action: Renew certificate

**SSLCertificateExpired** (Critical)
```yaml
expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 7
```
- Fires when < 7 days until expiry
- Action: URGENT renewal needed

---

## 🌐 HTTP & Web

### **HTTP Status Codes**

| Range | Meaning | Ví dụ |
|-------|---------|-------|
| 1xx | Informational | 100 Continue |
| 2xx | Success | 200 OK, 201 Created |
| 3xx | Redirection | 301 Moved, 304 Not Modified |
| 4xx | Client Error | 400 Bad Request, 404 Not Found |
| 5xx | Server Error | 500 Internal, 502 Bad Gateway |

**Metrics:**
- 2xx → Success (healthy)
- 4xx → Client issue (bad request)
- 5xx → Server issue (error) → Alert!

---

### **HTTP Request Phases (Blackbox)**

Breakdown of HTTP request into phases:

1. **connect** - TCP handshake
   - Time to establish TCP connection
   - Typical: 5-50ms

2. **tls** - TLS handshake
   - SSL/TLS negotiation
   - Typical: 50-200ms
   - Only for HTTPS

3. **processing** - Server processing
   - Time app takes to process request
   - Typical: 50-500ms
   - Depends on app logic

4. **transfer** - Data transfer
   - Time to download response
   - Typical: 1-50ms
   - Depends on response size

**Example:**
```
Total: 268ms
├─ connect: 8ms
├─ tls: 150ms
├─ processing: 102ms
└─ transfer: 8ms
```

---

### **HTTP Methods**

| Method | Purpose | Safe | Idempotent |
|--------|---------|------|-----------|
| GET | Retrieve data | Yes | Yes |
| POST | Create data | No | No |
| PUT | Replace data | No | Yes |
| DELETE | Remove data | No | Yes |
| PATCH | Partial update | No | No |

**Blackbox probes:** Default uses GET

---

### **Content-Type (MIME Types)**

Specifies format of data:
- `text/html` - HTML page
- `application/json` - JSON data
- `application/x-www-form-urlencoded` - Form data
- `multipart/form-data` - File upload
- etc.

**Blackbox metric:** `probe_http_content_length` (size of response)

---

### **Response Headers**

Important headers:
- `Content-Length` - Size of response body
- `Content-Type` - Format of response
- `Cache-Control` - Caching behavior
- `Set-Cookie` - Cookie values
- `Location` - Redirect target (3xx)
- `X-*` - Custom headers

**Blackbox metric:** `probe_http_redirects` (number of redirects followed)

---

## 🎯 Summary

Bảng thuật ngữ này covers:
- ✅ Cơ bản khái niệm
- ✅ Metrics types & examples
- ✅ Monitoring stack components
- ✅ Docker/networking
- ✅ Prometheus PromQL
- ✅ Alerting rules
- ✅ SSL/TLS
- ✅ HTTP basics

Tham khảo file này để hiểu rõ hơn các thuật ngữ khi làm việc với project!

---

**Last Updated**: 4 tháng 5, 2026
**Version**: 1.0
**Author**: nginx-monitor-demo
