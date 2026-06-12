# 📘 Hướng Dẫn Toàn Diện Ứng Dụng

## 📋 Mục Lục
1. [Tổng Quan Kiến Trúc](#tổng-quan-kiến-trúc)
2. [Cấu Trúc Dự Án](#cấu-trúc-dự-án)
3. [Các Thành Phần & Chức Năng](#các-thành-phần--chức-năng)
4. [Thiết Lập & Cài Đặt](#thiết-lập--cài-đặt)
5. [Chạy Ứng Dụng](#chạy-ứng-dụng)
6. [Hướng Dẫn Kiểm Tra](#hướng-dẫn-kiểm-tra)
7. [Các Metrics Giám Sát](#các-metrics-giám-sát)
8. [Quy Tắc Cảnh Báo](#quy-tắc-cảnh-báo)
9. [Pipeline CI/CD](#pipeline-cicd)
10. [Khắc Phục Sự Cố](#khắc-phục-sự-cố)

---

## Tổng Quan Kiến Trúc

### 🏗️ Thiết Kế Hệ Thống

Đây là một **hệ thống Docker Compose hai stack**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Global Docker Network                         │
│                   (global-monitor-net)                           │
└─────────────────────────────────────────────────────────────────┘
         ▲                                              ▲
         │                                              │
    ┌────┴────────────────────┐         ┌──────────────┴──────────┐
    │   APP STACK             │         │ MONITORING STACK        │
    │ (app-docker-compose)    │         │(monitor-docker-compose) │
    └────┬────────────────────┘         └──────────────┬──────────┘
         │                                              │
         │  Services:                                  │  Services:
         ├─ nginx (port 8080)                         ├─ prometheus (9090)
         └─ nginx-exporter                            ├─ grafana (3000)
                                                       ├─ alertmanager (9093)
                                                       ├─ blackbox-exporter (9115)
                                                       ├─ loki (3100)
                                                       ├─ promtail
                                                       └─ (runs on all nodes)
```

### 🔄 Luồng Dữ Liệu

```
Nginx (app stack)
    ↓ (phát hành metrics tại /stub_status)
Nginx Prometheus Exporter (app stack)
    ↓ (chuyển đổi sang định dạng Prometheus)
Prometheus (monitoring stack)
    ├─ Lấy dữ liệu mỗi 15 giây
    ├─ Đánh giá quy tắc cảnh báo
    │   ↓
    └─→ Alertmanager
        ├─ Nhóm các cảnh báo
        └─→ Gửi email via Gmail SMTP
    │
    └─→ Grafana (đọc metrics)
        └─→ Hiển thị trên dashboard
```

---

## Cấu Trúc Dự Án

```
nginx-monitor-demo/
├── 📁 .github/
│   └── workflows/
│       └── hello-docker.yml          ← CI/CD Pipeline (3 jobs)
├── 📁 prometheus/                     ← Prometheus configuration
│   ├── prometheus.yml                ← Scrape jobs & rules
│   ├── alert_rules.yml               ← Nginx alerts
│   ├── blackbox_rules.yml            ← Vercel app alerts
│   └── ssl_rules.yml                 ← SSL certificate alerts
├── 📁 alertmanager/
│   └── alertmanager.yml              ← Email alert configuration
├── 📁 grafana/
│   ├── dashboards/
│   │   └── Blackbox-Vercel-Dashboard.json  ← 8-panel dashboard
│   └── provisioning/
│       ├── datasources/
│       │   └── prometheus-datasource.yml   ← Prometheus data source
│       └── dashboards/
│           └── dashboard.yml               ← Dashboard provisioning
├── 📁 grafana_data/                  ← Grafana persistent data
├── 📁 prometheus_data/               ← Prometheus metrics storage
├── 📁 docs/
│   ├── DEPLOYMENT_GUIDE.md           ← Setup & deployment
│   ├── DASHBOARD_GUIDE.md            ← Dashboard explanation
│   └── GUIDE.md                      ← This file (complete reference)
├── app-docker-compose.yml            ← Application stack (Nginx)
├── monitor-docker-compose.yml        ← Monitoring stack
├── Dockerfile                        ← Custom Nginx image
├── nginx.conf                        ← Nginx configuration
├── promtail-config.yml               ← Log collection config
├── .env                              ← Environment variables (secrets)
├── .env.example                      ← Environment template
├── .gitignore                        ← Git ignore rules
├── test-email.sh                     ← Email testing script
└── README.md                         ← Project overview
```

---

## Các Thành Phần & Chức Năng

### 1. **Máy Chủ Web Nginx** (Application Stack)

**Mục đích**: Phục vụ nội dung web và phát hành metrics

**Image**: `nginx:alpine` (tùy chỉnh được xây dựng với `Dockerfile`)

**Các tính năng chính**:
- Lắng nghe trên port 8080
- Được cấu hình với endpoint `stub_status` tại `/stub_status`
- Kiểm tra sức khỏe mỗi 30 giây
- Dựa trên Alpine (nhẹ)

**Cấu hình** (`nginx.conf`):
```nginx
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }
        location /stub_status {
            stub_status on;          ← Phát hành metrics
            access_log off;
            allow all;
        }
    }
}
```

**Metrics được phát hành**:
```
Active connections: 5
server accepts handled requests
 125 125 250
Reading: 1 Writing: 1 Waiting: 3
```

---

### 2. **Nginx Prometheus Exporter** (Application Stack)

**Mục đích**: Chuyển đổi metrics Nginx sang định dạng Prometheus

**Image**: `nginx/nginx-prometheus-exporter:latest`

**Các tính năng chính**:
- Thăm dò endpoint `/stub_status` của Nginx mỗi lần lấy dữ liệu
- Chuyển đổi metrics thô sang định dạng Prometheus
- Tự động phát hiện bởi Prometheus thông qua Docker labels:
  - `prometheus.monitor=true`
  - `prometheus.scrape_port=9113`
  - `prometheus.job=nginx`

**Ví dụ Output**:
```
# HELP nginx_connections_active Active connections
# TYPE nginx_connections_active gauge
nginx_connections_active 5

# HELP nginx_http_requests_total Total HTTP requests
# TYPE nginx_http_requests_total counter
nginx_http_requests_total{method="GET",status="200"} 250
```

---

### 3. **Prometheus** (Monitoring Stack)

**Mục đích**: Cơ sở dữ liệu chuỗi thời gian để lưu trữ metrics

**Image**: `prom/prometheus:latest`

**Các tính năng chính**:
- Lấy dữ liệu metrics mỗi 15 giây
- Lưu trữ metrics trong 15 ngày (mặc định)
- Đánh giá quy tắc cảnh báo mỗi 15 giây
- Cung cấp API để truy vấn metrics
- Giao diện web trên port 9090

**Highlight cấu hình** (`prometheus.yml`):

**Job 1: Tự giám sát**
```yaml
- job_name: 'prometheus'
  static_configs:
    - targets: ['localhost:9090']
```

**Job 2: Nginx (tự động phát hiện)**
```yaml
- job_name: 'nginx'
  docker_sd_configs:
    - host: unix:///var/run/docker.sock
  relabel_configs:
    # Giữ lại containers có label 'prometheus.monitor=true'
    - source_labels: [__meta_docker_container_label_prometheus_monitor]
      action: keep
      regex: true
    # Sử dụng port động từ label
    - source_labels: [__meta_docker_container_name, ...]
      action: replace
      target_label: __address__
```

**Job 3: Blackbox (thăm dò HTTP bên ngoài)**
```yaml
- job_name: 'blackbox'
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

**Các file quy tắc được tải**:
- `alert_rules.yml` - Cảnh báo Nginx
- `blackbox_rules.yml` - Cảnh báo ứng dụng Vercel
- `ssl_rules.yml` - Cảnh báo chứng chỉ SSL

---

### 4. **Grafana** (Monitoring Stack)

**Mục đích**: Dashboard trực quan hóa dữ liệu

**Image**: `grafana/grafana:latest`

**Các tính năng chính**:
- Giao diện web trên port 3000
- Tự động cung cấp datasource Prometheus
- Tự động tải "Blackbox-Vercel-Dashboard.json"
- Mật khẩu admin từ `.env` (GF_PASSWORD)

**Dashboard: "Vercel App Monitoring (Blackbox)"**

**10 Panels**:

| # | Panel | Metric | Mục đích |
|---|-------|--------|---------|
| 1 | Probe Status | `probe_success` | Chỉ báo app Up/Down |
| 2 | HTTP Status Code | `probe_http_status_code` | HTTP response (200, 404, 500...) |
| 3 | Response Time | `probe_duration_seconds` | Tổng thời gian request |
| 4 | SSL Certificate Expiry | `probe_ssl_earliest_cert_expiry` | Ngày cho đến SSL hết hạn |
| 5 | Connect Time | `probe_http_duration_seconds{phase="connect"}` | Thời gian kết nối TCP |
| 6 | TLS Handshake Time | `probe_http_duration_seconds{phase="tls"}` | Thời gian thương lượng SSL |
| 7 | Server Processing Time | `probe_http_duration_seconds{phase="processing"}` | Thời gian xử lý logic app |
| 8 | Data Transfer Time | `probe_http_duration_seconds{phase="transfer"}` | Thời gian tải về response |
| 9 | Request Phase Breakdown | Stacked chart | Dòng thời gian tất cả phases |
| 10 | Response Time Trend | Line chart (1h) | Hiệu suất theo thời gian |

---

### 5. **Alertmanager** (Monitoring Stack)

**Mục đích**: Nhóm và gửi cảnh báo qua email

**Image**: `prom/alertmanager:latest`

**Các tính năng chính**:
- Nhận cảnh báo từ Prometheus
- Nhóm cảnh báo một cách thông minh
- Gửi email qua Gmail SMTP
- Giao diện web trên port 9093
- Cấu hình được đưa vào thông qua biến môi trường khi khởi động

**Cấu hình** (được tạo từ env vars):
```yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_auth_username: ${SMTP_USERNAME}    # Email Gmail
  smtp_auth_password: ${SMTP_PASSWORD}    # App password (16 ký tự)
  smtp_from: ${SMTP_FROM}                 # Email người gửi
  smtp_require_tls: true

route:
  receiver: 'email-notification'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s              # Chờ 10s để nhóm cảnh báo
  group_interval: 10s
  repeat_interval: 12h         # Gửi lại mỗi 12h nếu vẫn xảy ra

receivers:
  - name: 'email-notification'
    email_configs:
      - to: ${SMTP_TO}         # Email người nhận
```

---

### 6. **Blackbox Exporter** (Monitoring Stack)

**Mục đích**: Giám sát endpoint HTTP bên ngoài

**Image**: `prom/blackbox-exporter:latest`

**Các tính năng chính**:
- Thăm dò các endpoint HTTP/HTTPS
- Đo thời gian response, status code, tính hợp lệ SSL
- Được dùng để giám sát ứng dụng Vercel (bên ngoài)
- Không cần cấu hình (sử dụng module http_2xx mặc định)

**Metrics được phát hành**:
```
probe_success                 # 1=up, 0=down
probe_http_status_code        # 200, 404, 500...
probe_duration_seconds        # Tổng thời gian
probe_http_duration_seconds   # Chi tiết phases (connect, tls, processing, transfer)
probe_ssl_earliest_cert_expiry # Timestamp hết hạn SSL
```

---

### 7. **Loki + Promtail** (Log Aggregation)

**Mục đích**: Thu thập và truy vấn logs tập trung

**Loki**: Lưu trữ logs (giống Prometheus nhưng cho logs)

**Promtail**: Người gửi logs (đọc logs container Docker)

**Các tính năng chính**:
- Thu thập logs từ tất cả containers
- Có thể truy vấn qua Grafana (panel Logs)
- Chính sách giữ lại (có thể cấu hình)

---

## Thiết Lập & Cài Đặt

### Yêu Cầu Tiên Quyết

- Docker & Docker Compose
- Shell Bash/Zsh
- Git
- Tài khoản Gmail (để gửi cảnh báo)

### Bước 1: Clone Repository

```bash
git clone https://github.com/trinhtrung171/nginx-monitor-demo.git
cd nginx-monitor-demo
```

### Bước 2: Cấu Hình Environment

```bash
# Copy file template
cp .env.example .env

# Chỉnh sửa với các giá trị của bạn
nano .env
```

**Các biến bắt buộc**:
```bash
# Docker Hub (để push images)
DOCKERHUB_USERNAME=your-username

# Gmail SMTP (để gửi cảnh báo)
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # App password (16 ký tự, có khoảng trắng)
SMTP_FROM=your-email@gmail.com
SMTP_TO=recipient@gmail.com

# Mật khẩu Grafana
GF_PASSWORD=admin123

# URL ứng dụng bên ngoài (Vercel)
VERCEL_URL=https://cozyapp.vercel.app
```

**⚠️ Quan trọng**: 
- `SMTP_PASSWORD` phải là **Gmail App Password**, không phải mật khẩu thường
- Lấy từ: https://myaccount.google.com/apppasswords
- Bật 2FA trước nếu chưa

### Bước 3: Tạo Docker Network

```bash
docker network create global-monitor-net
```

Network bên ngoài này kết nối cả hai stack (app + monitoring).

---

## Chạy Ứng Dụng

### Khởi Động Monitoring Stack

```bash
docker compose -f monitor-docker-compose.yml up -d
```

**Services được khởi động**:
- Prometheus (9090)
- Grafana (3000)
- Alertmanager (9093)
- Blackbox Exporter (9115)
- Loki (3100)
- Promtail

**Kiểm tra**:
```bash
docker compose -f monitor-docker-compose.yml ps
```

### Khởi Động Application Stack

```bash
docker compose -f app-docker-compose.yml up -d
```

**Services được khởi động**:
- Nginx (8080)
- Nginx Prometheus Exporter

**Kiểm tra**:
```bash
docker compose -f app-docker-compose.yml ps
```

### Truy Cập các Dịch Vụ

| Dịch vụ | URL | Username | Mật khẩu |
|---------|-----|----------|----------|
| Nginx Web | http://localhost:8080 | - | - |
| Prometheus | http://localhost:9090 | - | - |
| Grafana | http://localhost:3000 | admin | (từ .env) |
| Alertmanager | http://localhost:9093 | - | - |
| Blackbox | http://localhost:9115 | - | - |

---

## Hướng Dẫn Kiểm Tra

### Kiểm Tra 1: Xác Minh Nginx Chạy

```bash
curl http://localhost:8080/stub_status
```

**Output dự kiến**:
```
Active connections: 2
server accepts handled requests
 125 125 250
Reading: 1 Writing: 1 Waiting: 0
```

### Kiểm Tra 2: Xác Minh Prometheus Lấy Dữ Liệu

```bash
# Mở trình duyệt
http://localhost:9090/targets
```

**Dự kiến**: Tất cả jobs hiển thị "UP"
- prometheus: UP
- nginx: UP
- blackbox: UP

### Kiểm Tra 3: Xác Minh Metrics

```bash
# Giao diện Query Prometheus
http://localhost:9090/graph
```

**Hãy thử các truy vấn**:
```promql
# Nginx metrics
nginx_connections_active
nginx_http_requests_total
rate(nginx_http_requests_total[1m])

# Blackbox metrics
probe_success
probe_http_status_code
probe_duration_seconds
```

### Kiểm Tra 4: Xem Dashboard Grafana

```
http://localhost:3000
Đăng nhập: admin / (từ .env)
Điều hướng: Dashboards → Vercel App Monitoring (Blackbox)
```

**Dự kiến**: 
- Probe Status: 1 (Up)
- HTTP Status Code: 200
- Response Time: ~0.25s
- SSL expiry: hiển thị ngày còn lại

### Kiểm Tra 5: Kiểm Tra Email Cảnh Báo

```bash
# Cách A: Dùng script kiểm tra
bash test-email.sh

# Cách B: Kích hoạt cảnh báo thủ công
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "critical"
    },
    "annotations": {
      "summary": "Test email alert",
      "description": "Check inbox if this arrives!"
    }
  }]'
```

**Dự kiến**: Email nhận được trong hộp thư `SMTP_TO` trong 1 phút

### Kiểm Tra 6: Kích Hoạt Cảnh Báo Thực

**Cách A: Nginx Down**
```bash
# Dừng Nginx
docker compose -f app-docker-compose.yml stop nginx

# Chờ 30s để cảnh báo xảy ra
sleep 30

# Kiểm tra Prometheus: http://localhost:9090/alerts
# Nên thấy: NginxServerDown (FIRING)

# Kiểm tra email để nhận cảnh báo

# Khởi động lại
docker compose -f app-docker-compose.yml start nginx
```

**Cách B: Ứng Dụng Vercel Down**
```bash
# Chỉnh sửa monitor-docker-compose.yml
# Thay đổi VERCEL_URL thành URL không hợp lệ: https://invalid-url.test

# Khởi động lại Prometheus
docker compose -f monitor-docker-compose.yml restart prometheus

# Chờ 30s + 30s để đánh giá
sleep 60

# Kiểm tra cảnh báo
# Kiểm tra email

# Sửa URL và khởi động lại
```

---

## Các Metrics Giám Sát

### Metrics Nginx (Application Stack)

Thu thập bởi **Nginx Prometheus Exporter**:

```
nginx_connections_active          # Kết nối hoạt động hiện tại
nginx_connections_reading          # Kết nối đang đọc requests
nginx_connections_writing          # Kết nối đang ghi responses
nginx_connections_waiting          # Kết nối idle
nginx_http_requests_total          # Tổng HTTP requests (by status)
nginx_up                           # Trạng thái exporter (1=up, 0=down)
```

**Ví dụ Query**:
```promql
# Requests mỗi giây (5 phút gần đây)
rate(nginx_http_requests_total[5m])

# Tỷ lệ lỗi
rate(nginx_http_requests_total{status=~"5.."}[5m])

# Phần trăm kết nối
nginx_connections_active / (nginx_connections_active + nginx_connections_waiting)
```

---

### Metrics Blackbox (Ứng Dụng Vercel)

Thu thập bởi **Blackbox Exporter** thông qua HTTP probes:

```
probe_success                      # 1=up, 0=down
probe_http_status_code             # HTTP response code
probe_duration_seconds             # Tổng thời gian probe
probe_http_duration_seconds        # Chi tiết phases:
  {phase="connect"}                #   Kết nối TCP
  {phase="tls"}                    #   Handshake TLS
  {phase="processing"}             #   Xử lý server
  {phase="transfer"}               #   Tải về dữ liệu
probe_ssl_earliest_cert_expiry     # Timestamp hết hạn SSL (unix)
probe_http_content_length          # Kích thước response (bytes)
probe_http_version                 # Phiên bản HTTP (1.0, 1.1, 2.0...)
```

**Ví dụ Query**:
```promql
# Ngày cho đến hết hạn SSL
(probe_ssl_earliest_cert_expiry - time()) / 86400

# Response time trung bình (5 phút)
avg_over_time(probe_duration_seconds[5m])

# App có lên không?
probe_success == 1
```

---

### Metrics Nội Bộ Prometheus

**Meta Metrics** (về Prometheus):

```
prometheus_http_requests_total     # Tổng API requests
prometheus_sd_discovered_targets   # Số targets phát hiện
prometheus_tsdb_symbol_table_size_bytes
prometheus_rule_evaluation_duration_seconds
```

---
---

## Quy Tắc Cảnh Báo

### 1. Nginx Alerts (`alert_rules.yml`)

#### Cảnh báo: NginxServerDown
```yaml
expr: up{job="nginx"} == 0 OR absent(up{job="nginx"})
for: 30s
severity: critical
```
**Xảy ra khi**: Target exporter Nginx down trong 30+ giây

**Email**: "Nginx service is down"

#### Cảnh báo: NginxHighErrorRate
```yaml
expr: (rate(nginx_http_requests_total{status=~"5.."}[5m]) > 0.05)
for: 5m
severity: warning
```
**Xảy ra khi**: Lỗi 5xx vượt 5% requests trong 5+ phút

#### Cảnh báo: NginxHighConnections
```yaml
expr: nginx_connections_active > 1000
for: 5m
severity: warning
```
**Xảy ra khi**: Kết nối hoạt động vượt 1000 trong 5+ phút

#### Cảnh báo: NginxHighResponseTime
```yaml
expr: histogram_quantile(0.99, rate(...))
for: 5m
severity: warning
```
**Xảy ra khi**: Response time thứ 99 vượt 1 giây

---

### 2. Blackbox Alerts (`blackbox_rules.yml`)

#### Cảnh báo: VercelAppDown
```yaml
expr: probe_success == 0
for: 30s
severity: critical
```
**Xảy ra khi**: Probe HTTP ứng dụng Vercel thất bại trong 30+ giây

**Email**: "Vercel app (cozyapp.vercel.app) is DOWN!"

---

### 3. SSL Alerts (`ssl_rules.yml`)

#### Cảnh báo: SSLCertificateExpiring
```yaml
expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 30
for: 5m
severity: warning
```
**Xảy ra khi**: Chứng chỉ SSL hết hạn trong 30 ngày

**Email**: "SSL Certificate sắp hết hạn... gia hạn ngay!"

#### Cảnh báo: SSLCertificateExpired
```yaml
expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 7
for: 5m
severity: critical
```
**Xảy ra khi**: Chứng chỉ SSL hết hạn trong 7 ngày

**Email**: "SSL Certificate hết hạn ngay! HÀNH ĐỘNG NGAY LẬP TỨC!"

---

## Pipeline CI/CD

### Workflow: `.github/workflows/hello-docker.yml`

**Kích hoạt**: Mỗi push tới bất kỳ nhánh nào

### Job 1: Lint (Tất cả Nhánh)

**Bước 1**: Lint Cấu Hình Nginx
```bash
docker run --rm -v $PWD/nginx.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine nginx -t
```

**Bước 2**: Lint Cấu Hình Prometheus
```bash
docker run --rm -v $PWD/prometheus:/etc/prometheus \
  --entrypoint "" prom/prometheus:latest \
  /bin/promtool check config /etc/prometheus/prometheus.yml
```

**Bước 3**: Lint Dockerfile (Hadolint)
```bash
docker run --rm -i hadolint/hadolint < Dockerfile
```

**Kết quả**: ✅ Tất cả configs hợp lệ → Tiếp tục Job 2

---

### Job 2: Xây Dựng & Push (Chỉ Nhánh Main)

**Điều kiện**: `push: ${{ github.ref == 'refs/heads/main' }}`

**Các bước**:
1. Setup QEMU (hỗ trợ multi-arch)
2. Setup Docker Buildx
3. Đăng nhập Docker Hub
4. Xây dựng & push image

**Nền tảng**:
- linux/amd64 (Intel)
- linux/arm64 (Apple Silicon, ARM)

**Tags**:
- `{DOCKERHUB_USERNAME}/nginx-monitor:latest`
- `{DOCKERHUB_USERNAME}/nginx-monitor:{COMMIT_SHA}`

**Kết quả**: Image được push lên Docker Hub

---

### Job 3: Smoke Test (Tất cả Nhánh)

**Mục đích**: Xác minh hệ thống khởi động chính xác

**Các bước**:

1. **Tạo .env** (giá trị test)
2. **Tạo Docker network**
3. **Khởi động monitoring stack** (`docker compose -f monitor-docker-compose.yml up -d`)
4. **Khởi động app stack** (`docker compose -f app-docker-compose.yml up -d`)
5. **Chờ 120s** (cho services khởi động đủ)
6. **Kiểm tra sức khỏe**:
   ```bash
   curl http://localhost:8080/stub_status      # Nginx
   curl http://localhost:9090/-/healthy        # Prometheus
   curl http://localhost:3000/api/health       # Grafana
   curl http://localhost:9093/-/healthy        # Alertmanager
   ```
7. **Dọn dẹp** (dừng containers, xóa network)

**Kết quả**: Tất cả kiểm tra sức khỏe vượt qua → CI vượt qua ✅

---

## Khắc Phục Sự Cố

### Vấn Đề 1: Prometheus không lấy dữ liệu Nginx

**Triệu chứng**: 
- Giao diện Prometheus hiển thị nginx job là "DOWN"
- Không có nginx metrics trong Grafana

**Nguyên nhân & Giải pháp**:
1. **Container Nginx không chạy**
   ```bash
   docker compose -f app-docker-compose.yml ps
   docker compose -f app-docker-compose.yml logs nginx
   ```

2. **Labels của exporter không được đặt**
   - Kiểm tra `app-docker-compose.yml` có labels trên nginx-exporter:
   ```yaml
   labels:
     - "prometheus.monitor=true"
     - "prometheus.scrape_port=9113"
     - "prometheus.job=nginx"
   ```

3. **Docker socket không được mount**
   - Kiểm tra Prometheus có `/var/run/docker.sock` mounted

4. **Network chưa được tạo**
   ```bash
   docker network create global-monitor-net
   ```

---

### Vấn Đề 2: Email cảnh báo không hoạt động

**Triệu chứng**: Cảnh báo xảy ra nhưng không nhận email

**Các bước Debug**:
```bash
# 1. Kiểm tra .env có credentials đúng
cat .env | grep SMTP

# 2. Kiểm tra Alertmanager logs
docker compose -f monitor-docker-compose.yml logs alertmanager | grep -i smtp

# 3. Kiểm tra Gmail App Password đúng
# Phải là 16 ký tự có khoảng trắng
# Từ: https://myaccount.google.com/apppasswords

# 4. Kiểm tra thủ công
bash test-email.sh

# 5. Kiểm tra thư rác (thường vào đó)
```

---

### Vấn Đề 3: Dashboard Grafana hiển thị "No Data"

**Triệu chứng**: Các panel dashboard trống

**Các bước Debug**:
```bash
# 1. Kiểm tra Prometheus có metrics
curl http://localhost:9090/api/v1/query?query=probe_success

# 2. Xác minh UID datasource khớp với dashboard
# Grafana: Configuration → Data Sources → Prometheus
# Copy UID và xác minh trong dashboard JSON:
# "uid": "PBFA97CFB590B2093"

# 3. Kiểm tra khoảng thời gian
# Dashboard: Đặt thành "Last 1 hour" hoặc "Last 5 minutes"

# 4. Khởi động lại services
docker compose -f monitor-docker-compose.yml restart prometheus grafana
```

---

### Vấn Đề 4: Probe Blackbox thất bại

**Triệu chứng**: 
- `probe_success == 0` liên tục
- Dashboard hiển thị app DOWN

**Các bước Debug**:
```bash
# 1. Kiểm tra probe thủ công
curl -s "http://localhost:9115/probe?target=https://cozyapp.vercel.app&module=http_2xx"

# 2. Kiểm tra Blackbox logs
docker compose -f monitor-docker-compose.yml logs blackbox-exporter

# 3. Kiểm tra DNS từ container
docker compose -f monitor-docker-compose.yml exec blackbox-exporter \
  nslookup cozyapp.vercel.app

# 4. Kiểm tra kết nối
docker compose -f monitor-docker-compose.yml exec blackbox-exporter \
  curl -I https://cozyapp.vercel.app

# 5. Xác minh URL trong prometheus.yml
# Kiểm tra VERCEL_URL hợp lệ và có thể truy cập được
```

---

### Vấn Đề 5: Services không khởi động

**Triệu chứng**: `docker compose up -d` thất bại âm thầm

**Các bước Debug**:
```bash
# 1. Kiểm tra logs
docker compose -f monitor-docker-compose.yml logs

# 2. Xác minh network tồn tại
docker network ls | grep global-monitor-net

# 3. Kiểm tra xung đột port
netstat -tuln | grep -E "9090|3000|9093|8080"

# 4. Xác minh file .env
cat .env

# 5. Thử không có -d flag để xem lỗi
docker compose -f monitor-docker-compose.yml up
```

---

## Các Chủ Đề Nâng Cao

### Truy Vấn Prometheus

**Các Metrics Quan Trọng**:
```promql
# App có lên trong 5 phút trước không?
up{job="nginx"} offset 5m

# Response time trung bình
avg_over_time(probe_duration_seconds[1h])

# Requests mỗi giây
rate(nginx_http_requests_total[1m])

# Latency thứ 95
histogram_quantile(0.95, rate(probe_duration_seconds_bucket[5m]))

# Ngày cho đến hết hạn SSL
(probe_ssl_earliest_cert_expiry - time()) / 86400
```

### Tạo Cảnh Báo Tùy Chỉnh

Chỉnh sửa `prometheus/alert_rules.yml`:
```yaml
- alert: MyCustomAlert
  expr: your_metric > threshold
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Mô tả cảnh báo"
    description: "Thông tin chi tiết: {{ $value }}"
```

Tải lại Prometheus:
```bash
docker compose -f monitor-docker-compose.yml reload prometheus
```

---

## Danh Sách Kiểm Tra Production

- [ ] Sử dụng mật khẩu Grafana mạnh (không phải "admin")
- [ ] Sử dụng Gmail App Password (không phải mật khẩu thường)
- [ ] Bật 2FA trên tài khoản Gmail
- [ ] Đặt người nhận SMTP_TO thích hợp
- [ ] Giám sát không gian đĩa (dữ liệu Prometheus phát triển ~15-30MB/ngày)
- [ ] Thiết lập xoay vòng logs (journalctl có giới hạn)
- [ ] Sao lưu volumes Prometheus/Grafana
- [ ] Kiểm tra quy trình phản ứng cảnh báo
- [ ] Ghi chép runbook cho sự cố
- [ ] Giám sát hệ thống giám sát (meta!)

---

**Lần cập nhật cuối**: 4 tháng 5, 2026
**Phiên bản**: 1.0
**Tác giả**: nginx-monitor-demo
