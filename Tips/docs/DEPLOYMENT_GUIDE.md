# 🚀 Hướng dẫn Deploy & Sử dụng Monitoring Stack

## 📋 Yêu cầu

- Docker & Docker Compose
- Account Gmail (cho Alertmanager email)
- URL Vercel app hoặc endpoint bất kỳ để monitor

---

## 🔧 Setup Bước 1: Cấu hình Environment

### 1. Copy file template
```bash
cp .env.example .env
```

### 2. Edit `.env` với thông tin của bạn
```bash
# Gmail SMTP (cho alerting)
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
SMTP_TO=recipient@gmail.com

# Grafana password
GF_PASSWORD=your-grafana-password

# Vercel URL (hoặc app URL bất kỳ)
VERCEL_URL=https://cozyapp.vercel.app

# Docker Hub (nếu push image)
DOCKERHUB_USERNAME=your-username
```

**⚠️ Note:** Dùng Gmail App Password, không phải regular password!
- Vào https://myaccount.google.com/apppasswords
- Chọn Mail + Other (custom app)
- Copy password vào `.env`

---

## 🐳 Setup Bước 2: Start Monitoring Stack

### Khởi chạy services
```bash
docker compose -f monitor-docker-compose.yml up -d
```

### Verify các services
```bash
docker compose -f monitor-docker-compose.yml ps
```

Output:
```
NAME                    STATUS
prometheus              Up
grafana                 Up
alertmanager            Up
blackbox-exporter       Up
loki                    Up
promtail                Up
```

---

## 🌐 Bước 3: Truy cập Grafana Dashboard

### 1. Mở Grafana
- URL: http://localhost:3000
- Username: `admin`
- Password: Từ `.env` (GF_PASSWORD)

### 2. Xem Dashboard
- Navigate: Dashboards → Vercel App Monitoring (Blackbox)
- Nó sẽ hiển thị **ngay lập tức** vì Prometheus đã scraping dữ liệu

### 3. Hiểu các panels (xem DASHBOARD_GUIDE.md để chi tiết)

| Panel | Ý nghĩa |
|-------|---------|
| Probe Status | App Up/Down |
| HTTP Status Code | HTTP response (200, 404, 500...) |
| Response Time | Tổng thời gian request |
| SSL Certificate Expiry | Còn bao lâu SSL hết hạn |
| Request Phase Breakdown | Time breakdown (Connect, TLS, Processing, Transfer) |
| Response Time Trend | Response time theo thời gian |

---

## 📧 Bước 4: Test Alert

### Trigger manual test
```bash
# 1. Vào Prometheus UI
http://localhost:9090

# 2. Vào Alerts tab
# 3. Xem status của:
#    - VercelAppDown
#    - SSLCertificateExpiring
#    - SSLCertificateExpired
#    - Nginx alerts (nếu có)
```

### Simulate alert (optional)
```bash
# Change VERCEL_URL to invalid URL temporarily
# Edit monitor-docker-compose.yml → Prometheus env VERCEL_URL
# Restart Prometheus
# Wait 30s → Alert fires
# Check Grafana Alert list
# Check email inbox (nhận alert mail)
```

---

## 📊 Prometheus Query Examples

### Các metric hay dùng
```promql
# Probe success (1 = up, 0 = down)
probe_success{job="blackbox"}

# HTTP status code
probe_http_status_code{job="blackbox"}

# Total response time
probe_duration_seconds{job="blackbox"}

# Connect time
probe_http_duration_seconds{job="blackbox",phase="connect"}

# TLS time
probe_http_duration_seconds{job="blackbox",phase="tls"}

# Server processing time
probe_http_duration_seconds{job="blackbox",phase="processing"}

# Transfer time
probe_http_duration_seconds{job="blackbox",phase="transfer"}

# SSL expiry (seconds until expiry)
probe_ssl_earliest_cert_expiry{job="blackbox"}

# Days until SSL expiry
(probe_ssl_earliest_cert_expiry{job="blackbox"} - time()) / 86400
```

---

## 🔍 Monitoring Nginx (Local)

Nếu bạn cũng chạy app-docker-compose.yml với Nginx:

```bash
# Start app stack
docker compose -f app-docker-compose.yml up -d
```

Dashboard sẽ tự động có alert cho:
- Nginx Server Down
- High Error Rate
- High Response Time

---

## 🛑 Troubleshooting

### Dashboard hiển thị "No data"
```bash
# 1. Kiểm tra Prometheus targets
http://localhost:9090/targets

# 2. Xem prometheus logs
docker compose -f monitor-docker-compose.yml logs prometheus

# 3. Check datasource UID
# Grafana → Configuration → Data Sources
# Copy UID và update dashboard JSON
```

### Không nhận email alert
```bash
# 1. Verify .env SMTP config
cat .env | grep SMTP

# 2. Check Alertmanager logs
docker compose -f monitor-docker-compose.yml logs alertmanager

# 3. Test SMTP manually
# Vào Alertmanager UI: http://localhost:9093
# Xem status alerts
```

### Blackbox probe fail
```bash
# 1. Check Blackbox logs
docker compose -f monitor-docker-compose.yml logs blackbox-exporter

# 2. Test probe manually
curl -s "http://localhost:9115/probe?target=https://cozyapp.vercel.app&module=http_2xx"

# 3. Verify URL accessible từ container
docker compose -f monitor-docker-compose.yml exec blackbox-exporter \
  curl -I https://cozyapp.vercel.app
```

---

## 🔐 Security Notes

- ✅ Credentials trong `.env`, không commit to Git
- ✅ `.gitignore` đã exclude `.env` và config files
- ✅ Prometheus, Grafana, Alertmanager sử dụng env vars
- ⚠️ Tất cả services chạy local (localhost), không expose to internet
- ⚠️ Nếu deploy to server, thêm authentication & reverse proxy (Nginx, Caddy)

---

## 📈 Production Checklist

- [ ] Cấu hình .env với credentials production
- [ ] Test email alerts từ Alertmanager
- [ ] Verify SSL/TLS config (Prometheus, Grafana)
- [ ] Backup Prometheus data volume
- [ ] Monitor disk space (Prometheus data grows ~15-30MB/day)
- [ ] Setup metrics retention (default 15 days)
- [ ] Document alert response procedures
- [ ] Test failover/recovery process

---

## 📚 Tài liệu thêm

- [Blackbox Exporter Docs](https://github.com/prometheus/blackbox_exporter)
- [Prometheus Alerting](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [Dashboard Guide](./DASHBOARD_GUIDE.md)
