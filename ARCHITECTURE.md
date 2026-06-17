# Tài liệu Kiến trúc & Observability — nginx-monitor-demo

> Hướng dẫn chi tiết từng bước trên macOS.  
> Mục tiêu: Frontend (Vercel) → Backend (Render) → NGINX + PostgreSQL (Local) với mTLS, toàn bộ log/metrics đổ về Grafana Cloud.  
> Tài liệu này bao gồm: kiến trúc hệ thống, cấu hình hạ tầng, bảo mật mTLS, và toàn bộ stack observability (metrics + logs + alerting + dashboard).

---

## Mục lục

**Phần I — Hạ tầng & Bảo mật**
1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu trúc thư mục repo](#2-cấu-trúc-thư-mục-repo)
3. [Bước 0 — Chuẩn bị môi trường macOS](#3-bước-0--chuẩn-bị-môi-trường-macos)
4. [Bước 1 — Cài và cấu hình NGINX (Local)](#4-bước-1--cài-và-cấu-hình-nginx-local)
5. [Bước 2 — Cài và cấu hình PostgreSQL (Local)](#5-bước-2--cài-và-cấu-hình-postgresql-local)
6. [Bước 3 — Tạo chứng chỉ mTLS](#6-bước-3--tạo-chứng-chỉ-mtls)
7. [Bước 4 — Cấu hình NGINX stream + mTLS](#7-bước-4--cấu-hình-nginx-stream--mtls)
8. [Bước 5 — Mở port Router & DDNS](#8-bước-5--mở-port-router--ddns)
9. [Bước 6 — Backend trên Render](#9-bước-6--backend-trên-render)
10. [Bước 7 — Frontend trên Vercel](#10-bước-7--frontend-trên-vercel)

**Phần II — Observability**
11. [Bước 8 — Monitoring với Grafana Cloud](#11-bước-8--monitoring-với-grafana-cloud)
12. [Bước 9 — Alerting](#12-bước-9--alerting)
13. [Bước 10 — Metrics chi tiết theo Layer](#13-bước-10--metrics-chi-tiết-theo-layer)
14. [Bước 11 — OpenTelemetry tích hợp Backend](#14-bước-11--opentelemetry-tích-hợp-backend)
15. [Bước 12 — Log tracking người dùng](#15-bước-12--log-tracking-người-dùng)
16. [Bước 13 — Database query monitoring](#16-bước-13--database-query-monitoring)
17. [Bước 14 — Grafana Dashboard layout](#17-bước-14--grafana-dashboard-layout)
18. [Bước 15 — Kiểm tra toàn bộ hệ thống](#18-bước-15--kiểm-tra-toàn-bộ-hệ-thống)

**Phần III — Tham khảo**
19. [Biến môi trường tổng hợp](#19-biến-môi-trường-tổng-hợp)
20. [Metrics checklist](#20-metrics-checklist)
21. [Sơ đồ luồng dữ liệu chi tiết](#21-sơ-đồ-luồng-dữ-liệu-chi-tiết)

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLOUD                                      │
│                                                                     │
│   ┌───────────────┐   HTTPS    ┌───────────────┐                   │
│   │   Frontend    │ ─────────► │   Backend     │                   │
│   │ Vercel        │            │ Render        │                   │
│   │ Vite + Bun    │            │ Node.js / API │                   │
│   └───────────────┘            └───────┬───────┘                   │
│         │ Log Drain                    │ TCP + mTLS                │
│         │ (HTTPS)                      │ Log Stream (HTTPS)        │
└─────────┼────────────────────────────────────────────────────────  ┘
          │                             │
          │          ┌──────────────────┘
          ▼          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        LOCAL MACHINE (macOS)                        │
│                                                                     │
│   ┌──────────────────────────────┐                                 │
│   │  NGINX (port 5433, TCP)      │  ◄── Nhận kết nối từ Render    │
│   │  stream module + mTLS        │      Xác thực client cert       │
│   └──────────────┬───────────────┘                                 │
│                  │ forward tới 127.0.0.1:5432                      │
│   ┌──────────────▼───────────────┐                                 │
│   │  PostgreSQL (port 5432)      │  Chỉ nhận từ localhost          │
│   │  pg_hba.conf: 127.0.0.1 only │                                 │
│   └──────────────────────────────┘                                 │
│                                                                     │
│   ┌──────────────────────────────┐                                 │
│   │  Promtail agent              │  Đọc log NGINX + PostgreSQL     │
│   │  Đẩy lên Grafana Cloud Loki  │                                 │
│   └──────────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
          │               │               │
          ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GRAFANA CLOUD (Monitoring)                       │
│                                                                     │
│   ┌───────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│   │   Loki    │    │  Prometheus  │    │   Grafana UI          │  │
│   │  (Logs)   │    │  (Metrics)   │    │   Dashboard + Alert   │  │
│   └───────────┘    └──────────────┘    └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Bảng luồng dữ liệu

| Luồng | Giao thức | Chi tiết |
|---|---|---|
| Frontend → Backend | HTTPS | Vercel gọi API trên Render |
| Backend → NGINX | TCP + mTLS | Render dùng client cert để kết nối vào NGINX local |
| NGINX → PostgreSQL | TCP (localhost) | Forward nội bộ, không qua mạng |
| Vercel → Loki | HTTPS (Log Drain) | Vercel đẩy log tự động qua webhook |
| Render → Loki | HTTPS (Log Stream) | Render đẩy log tự động qua webhook |
| Promtail → Loki | HTTPS | Agent local đọc file log rồi đẩy lên Cloud |
| Loki + Prometheus → Grafana | Internal | Grafana query datasource |

---

## 2. Cấu trúc thư mục repo

```
nginx-monitor-demo/
│
├── certs/                          # Chứng chỉ mTLS (KHÔNG commit lên git)
│   ├── ca.crt                      # CA certificate
│   ├── ca.key                      # CA private key        ← gitignore
│   ├── server.crt                  # NGINX server cert
│   ├── server.key                  # NGINX server key      ← gitignore
│   ├── client.crt                  # Backend client cert (đưa lên Render)
│   └── client.key                  # Backend client key    ← gitignore
│
├── nginx/
│   └── nginx.conf                  # Config NGINX (http block + stream block mTLS)
│
├── prometheus/
│   ├── prometheus.yml              # Scrape config + remote_write Grafana Cloud
│   ├── alert_rules.yml             # Alert rules: NGINX, PostgreSQL, APM
│   └── blackbox.yml                # Blackbox modules: tcp_connect + http_2xx
│
├── promtail/
│   └── promtail-config.yml         # Đẩy log NGINX + PostgreSQL + app lên Loki
│
├── alertmanager/
│   └── alertmanager.yml            # Routing alert → email (Gmail SMTP)
│
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── datasources.yml     # Khai báo Loki + Prometheus datasource
│       └── dashboards/
│           └── dashboard.yml       # Auto-load dashboard JSON
│
├── backend/                        # Code backend (Node.js trên Render)
│   ├── src/
│   │   ├── otel.js                 # OpenTelemetry bootstrap (load trước server)
│   │   ├── startup/
│   │   │   └── certs.js            # Decode mTLS certs từ env → /tmp/
│   │   ├── db/
│   │   │   └── pool.js             # PostgreSQL pool dùng mTLS
│   │   └── middleware/
│   │       └── requestLogger.js    # JSON access log mỗi request
│   └── index.js                    # Entry point
│
├── monitor-docker-compose.yml      # Chạy Prometheus + Blackbox + Alertmanager
├── .env                            # Biến môi trường local (gitignore)
├── .env.example                    # Mẫu env để tham khảo
├── .gitignore
└── README.md
```

### File `.gitignore` tối thiểu

```gitignore
# Certs — tuyệt đối không commit
certs/*.key
certs/ca.crt

# Env
.env

# macOS
.DS_Store
```

---

## 3. Bước 0 — Chuẩn bị môi trường macOS

### 3.1 Cài Homebrew (nếu chưa có)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 3.2 Cài các công cụ cần thiết

```bash
# NGINX (bản đầy đủ có stream module)
brew install nginx

# PostgreSQL 16
brew install postgresql@16

# OpenSSL (tạo cert)
brew install openssl@3

# Promtail (agent đẩy log lên Loki)
brew install promtail

# node_exporter (thu thập metrics CPU/RAM/Disk của macOS)
brew install node_exporter

# Docker Desktop (chạy Prometheus, Blackbox, Alertmanager)
# Tải tại: https://www.docker.com/products/docker-desktop/

# (Tuỳ chọn) verify cài đặt
nginx -v
psql --version
openssl version
promtail --version
node_exporter --version
docker --version
```

### 3.3 Khởi động node_exporter

```bash
brew services start node_exporter

# Kiểm tra metrics đang expose
curl -s http://localhost:9100/metrics | head -20
# Expected: thấy dòng như: node_cpu_seconds_total{...}
```

### 3.4 Thêm PostgreSQL vào PATH

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## 4. Bước 1 — Cài và cấu hình NGINX (Local)

### 4.1 Kiểm tra NGINX có stream module không

```bash
nginx -V 2>&1 | grep -o with-stream
# Output mong đợi: with-stream
```

> Nếu không thấy `with-stream`, cần build lại hoặc dùng bản `nginx-full`:
> ```bash
> brew uninstall nginx
> brew install nginx-full   # nếu có, hoặc dùng Docker nginx:alpine
> ```

### 4.2 Tìm đường dẫn config NGINX trên macOS

```bash
brew info nginx
# Thường là: /opt/homebrew/etc/nginx/nginx.conf
```

### 4.3 Tạo thư mục log

```bash
sudo mkdir -p /opt/homebrew/var/log/nginx
sudo chown $(whoami) /opt/homebrew/var/log/nginx
```

### 4.4 Khởi động và kiểm tra

```bash
# Khởi động
brew services start nginx

# Kiểm tra đang chạy
brew services list | grep nginx

# Reload sau khi sửa config
nginx -t && brew services restart nginx
```

---

## 5. Bước 2 — Cài và cấu hình PostgreSQL (Local)

### 5.1 Khởi tạo và khởi động

```bash
# Khởi tạo database cluster (chỉ làm 1 lần)
initdb /opt/homebrew/var/postgresql@16

# Khởi động PostgreSQL
brew services start postgresql@16

# Kiểm tra
psql -U $(whoami) -c "SELECT version();"
```

### 5.2 Tạo user và database cho ứng dụng

```bash
psql -U $(whoami) postgres << 'EOF'
CREATE USER appuser WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE appdb OWNER appuser;
GRANT ALL PRIVILEGES ON DATABASE appdb TO appuser;
EOF
```

### 5.3 Cấu hình `postgresql.conf` — chỉ nhận localhost

Tìm và mở file config:

```bash
# Tìm file config
psql -U $(whoami) -c "SHOW config_file;"
# Thường: /opt/homebrew/var/postgresql@16/postgresql.conf
```

Sửa các dòng sau trong `postgresql.conf`:

```ini
# Chỉ lắng nghe localhost — KHÔNG phải '*'
listen_addresses = 'localhost'

# Bật log JSON để Promtail parse dễ hơn
log_destination = 'jsonlog'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_min_duration_statement = 500   # Log query chậm hơn 500ms
log_connections = on
log_disconnections = on
log_line_prefix = ''               # Để trống khi dùng jsonlog
```

### 5.4 Cấu hình `pg_hba.conf` — chỉ cho phép localhost

```bash
psql -U $(whoami) -c "SHOW hba_file;"
# Thường: /opt/homebrew/var/postgresql@16/pg_hba.conf
```

Nội dung `pg_hba.conf` — xóa hết các dòng cũ, thay bằng:

```
# TYPE  DATABASE  USER      ADDRESS         METHOD
local   all       all                       trust
host    appdb     appuser   127.0.0.1/32    md5
# Không có dòng nào cho 0.0.0.0/0 hoặc IP ngoài
```

Reload PostgreSQL để áp dụng:

```bash
brew services restart postgresql@16
```

---

## 6. Bước 3 — Tạo chứng chỉ mTLS

Tất cả các lệnh dưới đây chạy trong thư mục `certs/` của repo.

```bash
mkdir -p certs && cd certs
```

### 6.1 Tạo Certificate Authority (CA)

```bash
# Tạo CA key + self-signed cert (10 năm)
openssl req -x509 -newkey rsa:4096 \
  -keyout ca.key \
  -out ca.crt \
  -days 3650 \
  -nodes \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=MyApp-CA"
```

### 6.2 Tạo Server Certificate (cho NGINX)

```bash
# Tạo private key cho NGINX
openssl genrsa -out server.key 4096

# Tạo Certificate Signing Request
openssl req -new \
  -key server.key \
  -out server.csr \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=nginx-local"

# Tạo file extension với SAN (Subject Alternative Name)
cat > server-ext.cnf << 'EOF'
[req]
req_extensions = v3_req
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = myhome.ddns.net
DNS.2 = localhost
IP.1  = 127.0.0.1
EOF

# Ký cert bằng CA
openssl x509 -req \
  -in server.csr \
  -CA ca.crt \
  -CAkey ca.key \
  -CAcreateserial \
  -out server.crt \
  -days 365 \
  -extensions v3_req \
  -extfile server-ext.cnf
```

### 6.3 Tạo Client Certificate (cho Backend trên Render)

```bash
# Tạo private key cho client (Render backend)
openssl genrsa -out client.key 4096

# Tạo CSR
openssl req -new \
  -key client.key \
  -out client.csr \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=render-backend"

# Ký cert bằng CA
openssl x509 -req \
  -in client.csr \
  -CA ca.crt \
  -CAkey ca.key \
  -CAcreateserial \
  -out client.crt \
  -days 365
```

### 6.4 Verify các cert đã tạo đúng

```bash
# Kiểm tra server cert hợp lệ
openssl verify -CAfile ca.crt server.crt
# Expected: server.crt: OK

# Kiểm tra client cert hợp lệ
openssl verify -CAfile ca.crt client.crt
# Expected: client.crt: OK

# Xem nội dung cert
openssl x509 -in server.crt -text -noout | grep -A2 "Subject Alternative Name"
```

### 6.5 Encode cert để đưa lên Render

```bash
# Encode từng file thành base64 (1 dòng duy nhất)
base64 -i client.crt | tr -d '\n' > client.crt.b64
base64 -i client.key | tr -d '\n' > client.key.b64
base64 -i ca.crt     | tr -d '\n' > ca.crt.b64

# In ra terminal để copy vào Render dashboard
echo "=== MTLS_CLIENT_CERT ==="
cat client.crt.b64
echo ""
echo "=== MTLS_CLIENT_KEY ==="
cat client.key.b64
echo ""
echo "=== MTLS_CA_CERT ==="
cat ca.crt.b64
```

> **Lưu ý:** Các file `*.b64` cũng cần thêm vào `.gitignore`.

---

## 7. Bước 4 — Cấu hình NGINX stream + mTLS

### 7.1 Copy cert vào thư mục NGINX

```bash
sudo mkdir -p /opt/homebrew/etc/nginx/certs
sudo cp certs/server.crt /opt/homebrew/etc/nginx/certs/
sudo cp certs/server.key /opt/homebrew/etc/nginx/certs/
sudo cp certs/ca.crt     /opt/homebrew/etc/nginx/certs/
sudo chmod 600 /opt/homebrew/etc/nginx/certs/*.key
```

### 7.2 File `nginx/nginx.conf` hoàn chỉnh

```nginx
# ─── Worker settings ─────────────────────────────────────────────
worker_processes auto;

error_log  /opt/homebrew/var/log/nginx/error.log warn;
pid        /opt/homebrew/var/run/nginx.pid;

events {
    worker_connections 1024;
}

# ─── HTTP block (Web / API nếu cần) ──────────────────────────────
http {
    include       mime.types;
    default_type  application/octet-stream;

    # Log dạng JSON để Promtail parse dễ
    log_format json_combined escape=json
        '{'
            '"time":"$time_iso8601",'
            '"remote_addr":"$remote_addr",'
            '"method":"$request_method",'
            '"uri":"$request_uri",'
            '"status":$status,'
            '"body_bytes":$body_bytes_sent,'
            '"request_time":$request_time,'
            '"upstream_addr":"$upstream_addr"'
        '}';

    access_log /opt/homebrew/var/log/nginx/access.log json_combined;

    sendfile on;
    keepalive_timeout 65;

    # Thêm server block nếu cần serve web/API
    # server { ... }
}

# ─── Stream block (TCP proxy cho PostgreSQL) ──────────────────────
stream {

    log_format stream_json '$remote_addr [$time_local] '
                           '$protocol $status $bytes_sent $bytes_received '
                           '$session_time';

    access_log /opt/homebrew/var/log/nginx/stream.log stream_json;

    server {
        # Port NGINX lắng nghe từ bên ngoài (Render kết nối vào đây)
        listen 5433 ssl;

        # Forward tới PostgreSQL local
        proxy_pass 127.0.0.1:5432;

        # Timeout settings
        proxy_connect_timeout 5s;
        proxy_timeout         300s;

        # ── Server cert (NGINX tự xác thực với client) ────────────
        ssl_certificate     /opt/homebrew/etc/nginx/certs/server.crt;
        ssl_certificate_key /opt/homebrew/etc/nginx/certs/server.key;

        # ── Client cert verification (mTLS) ───────────────────────
        ssl_client_certificate /opt/homebrew/etc/nginx/certs/ca.crt;
        ssl_verify_client      on;      # Bắt buộc client phải có cert

        # ── TLS settings ──────────────────────────────────────────
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 10m;
    }
}
```

### 7.3 Test và reload

```bash
# Validate config
nginx -t
# Expected: nginx: configuration file ... syntax is ok
#           nginx: configuration file ... test is successful

# Reload
brew services restart nginx

# Kiểm tra port 5433 đang lắng nghe
sudo lsof -i :5433
# Expected: nginx ... TCP *:5433 (LISTEN)
```

### 7.4 Test mTLS kết nối thủ công

```bash
# Thử kết nối từ máy local dùng client cert (mô phỏng Render)
openssl s_client \
  -connect localhost:5433 \
  -cert certs/client.crt \
  -key  certs/client.key \
  -CAfile certs/ca.crt \
  -verify_return_error

# Nếu thành công sẽ thấy: Verify return code: 0 (ok)
```

---

## 8. Bước 5 — Mở port Router & DDNS

### 8.1 Tìm IP local của máy

```bash
# IP nội bộ của máy Mac trong mạng LAN
ipconfig getifaddr en0
# Ví dụ: 192.168.1.100
```

### 8.2 Port forwarding trên Router

Truy cập router admin (thường là `192.168.1.1` hoặc `192.168.0.1`):

| Mục | Giá trị |
|---|---|
| External Port | 5433 |
| Internal IP | 192.168.1.100 (IP máy Mac) |
| Internal Port | 5433 |
| Protocol | TCP |

> Mỗi hãng router có UI khác nhau. Tìm mục **Port Forwarding** hoặc **NAT**.

### 8.3 Thiết lập DDNS (No-IP)

1. Đăng ký tại [noip.com](https://www.noip.com) (miễn phí)
2. Tạo hostname, ví dụ: `myhome.ddns.net`
3. Tải **DUC (Dynamic Update Client)** cho macOS tại No-IP
4. Đăng nhập và chọn hostname vừa tạo — DUC sẽ tự cập nhật IP khi thay đổi

Kiểm tra DDNS đã trỏ đúng:

```bash
nslookup myhome.ddns.net
# So sánh với IP public hiện tại:
curl -s ifconfig.me
```

### 8.4 Kiểm tra port có mở ra ngoài chưa

```bash
# Từ một máy khác hoặc dùng online tool
nc -zv myhome.ddns.net 5433
# Expected: Connection to myhome.ddns.net 5433 port [tcp] succeeded!
```

---

## 9. Bước 6 — Backend trên Render

### 9.1 Cấu trúc code xử lý cert

Tạo file `src/startup/certs.js` trong project backend:

```javascript
// src/startup/certs.js
import fs from 'fs';
import path from 'path';

/**
 * Decode các cert từ env variable (base64) ra file tạm /tmp/certs/
 * Gọi hàm này TRƯỚC KHI khởi tạo database pool.
 */
export function setupMtlsCerts() {
  const certDir = '/tmp/mtls-certs';

  // Tạo thư mục nếu chưa có
  fs.mkdirSync(certDir, { recursive: true });

  const certs = {
    'client.crt': process.env.MTLS_CLIENT_CERT,
    'client.key': process.env.MTLS_CLIENT_KEY,
    'ca.crt':     process.env.MTLS_CA_CERT,
  };

  for (const [filename, b64value] of Object.entries(certs)) {
    if (!b64value) {
      throw new Error(`Missing env var for cert: ${filename}`);
    }
    fs.writeFileSync(
      path.join(certDir, filename),
      Buffer.from(b64value, 'base64')
    );
  }

  console.log('[mTLS] Certificates written to /tmp/mtls-certs/');
}
```

### 9.2 Khởi tạo Database Pool với mTLS

```javascript
// src/db/pool.js
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

export const pool = new Pool({
  host:     process.env.NGINX_HOST,      // myhome.ddns.net
  port:     parseInt(process.env.NGINX_PORT || '5433'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max:      10,                          // connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,

  ssl: {
    rejectUnauthorized: true,            // Bắt buộc verify server cert
    ca:   fs.readFileSync('/tmp/mtls-certs/ca.crt'),
    cert: fs.readFileSync('/tmp/mtls-certs/client.crt'),
    key:  fs.readFileSync('/tmp/mtls-certs/client.key'),
  }
});

// Kiểm tra kết nối khi khởi động
pool.on('connect', () => console.log('[DB] New client connected'));
pool.on('error',   (err) => console.error('[DB] Pool error:', err));
```

### 9.3 Entry point — gọi setupCerts trước

```javascript
// src/index.js (hoặc server.js)
import { setupMtlsCerts } from './startup/certs.js';

// Decode certs trước khi làm bất cứ thứ gì
setupMtlsCerts();

// Sau đó mới import pool (để pool đọc được cert)
const { pool } = await import('./db/pool.js');

// ... khởi động Express / Fastify / Hono
```

### 9.4 Env vars cần set trên Render Dashboard

Vào **Render Dashboard → Service → Environment**:

```
NGINX_HOST          = myhome.ddns.net
NGINX_PORT          = 5433
DB_NAME             = appdb
DB_USER             = appuser
DB_PASSWORD         = your_strong_password_here
MTLS_CLIENT_CERT    = <nội dung file client.crt.b64>
MTLS_CLIENT_KEY     = <nội dung file client.key.b64>
MTLS_CA_CERT        = <nội dung file ca.crt.b64>
```

---

## 10. Bước 7 — Frontend trên Vercel

### 10.1 Setup Log Drain về Loki

Vercel hỗ trợ đẩy log trực tiếp qua **Log Drains**:

1. Vào **Vercel Dashboard → Settings → Log Drains**
2. Chọn **Add Drain**
3. Điền thông tin:

| Trường | Giá trị |
|---|---|
| Delivery Format | NDJSON |
| Endpoint URL | `https://logs-prod-xxx.grafana.net/loki/api/v1/push` |
| Sources | Static, Lambda, Edge, Build |
| Headers | `Authorization: Basic <base64(username:grafana_api_key)>` |

> Lấy URL endpoint và API key từ **Grafana Cloud → Connections → Data sources → Loki**.

### 10.2 Env vars trên Vercel

```
NEXT_PUBLIC_API_URL = https://your-backend.onrender.com
```

---

## 11. Bước 8 — Monitoring với Grafana Cloud

### 11.1 Tạo tài khoản Grafana Cloud

1. Đăng ký tại [grafana.com/auth/sign-up](https://grafana.com/auth/sign-up) (free tier đủ dùng cho đồ án)
2. Sau khi tạo stack, ghi lại 3 thông tin:
   - **Prometheus remote_write URL**: `https://prometheus-prod-xxx.grafana.net/api/prom/push`
   - **Loki push URL**: `https://logs-prod-xxx.grafana.net/loki/api/v1/push`
   - **API key** (tạo tại My Account → API Keys, role: MetricsPublisher)

### 11.2 Cấu hình `prometheus/prometheus.yml`

```yaml
global:
  scrape_interval:     15s
  evaluation_interval: 15s

# Đẩy metrics lên Grafana Cloud
remote_write:
  - url: "${PROMETHEUS_REMOTE_WRITE_URL}"
    basic_auth:
      username: "${GRAFANA_CLOUD_INSTANCE_ID}"
      password: "${GRAFANA_CLOUD_API_KEY}"

rule_files:
  - "alert_rules.yml"
  - "blackbox_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:
  # Scrape chính Prometheus
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Blackbox probe — kiểm tra NGINX TCP còn sống không
  - job_name: 'nginx_tcp_probe'
    metrics_path: /probe
    params:
      module: [tcp_connect]
    static_configs:
      - targets:
          - "${NGINX_HOST}:5433"
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - target_label: __address__
        replacement: blackbox-exporter:9115
      - source_labels: [__param_target]
        target_label: instance

  # NGINX stub_status metrics (nếu bật ngx_http_stub_status_module)
  - job_name: 'nginx_metrics'
    static_configs:
      - targets: ['host.docker.internal:80']
    metrics_path: /nginx_status
```

### 11.3 Cấu hình `prometheus/alert_rules.yml`

```yaml
groups:
  - name: nginx_alerts
    rules:
      # NGINX không phản hồi
      - alert: NginxDown
        expr: probe_success{job="nginx_tcp_probe"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "NGINX TCP không phản hồi"
          description: "Không thể kết nối TCP tới {{ $labels.instance }} trong 1 phút."

      # Tỉ lệ lỗi 5xx cao
      - alert: HighNginxErrorRate
        expr: |
          sum(rate(nginx_http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(nginx_http_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Tỉ lệ lỗi 5xx vượt 5%"
          description: "Hiện tại {{ $value | humanizePercentage }} request trả về lỗi 5xx."

  - name: postgresql_alerts
    rules:
      # Số connection pool gần đầy
      - alert: PostgresConnectionPoolHigh
        expr: |
          sum(pg_stat_activity_count) 
          / 
          sum(pg_settings_max_connections) > 0.8
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Connection pool PostgreSQL vượt 80%"
          description: "Đang dùng {{ $value | humanizePercentage }} connection pool."

      # Không kết nối được PostgreSQL
      - alert: PostgresDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL không phản hồi"
          description: "pg_exporter không kết nối được tới PostgreSQL."
```

### 11.4 Cấu hình `prometheus/blackbox.yml`

```yaml
modules:
  # Module kiểm tra TCP port còn mở không
  tcp_connect:
    prober: tcp
    timeout: 5s

  # Module kiểm tra HTTP endpoint trả về 200
  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: [200]
      follow_redirects: true
      preferred_ip_protocol: "ip4"
```

### 11.5 File `monitor-docker-compose.yml` cập nhật

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    volumes:
      - ./prometheus:/etc/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    env_file: .env

  blackbox-exporter:
    image: prom/blackbox-exporter:latest
    container_name: blackbox-exporter
    restart: unless-stopped
    volumes:
      - ./prometheus/blackbox.yml:/etc/blackbox_exporter/config.yml
    ports:
      - "9115:9115"

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    restart: unless-stopped
    volumes:
      - ./alertmanager:/etc/alertmanager
    ports:
      - "9093:9093"
```

### 11.6 Cấu hình Promtail đẩy log lên Loki

File `promtail/promtail-config.yml`:

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

# ── Đẩy log lên Grafana Cloud Loki ───────────────────────────────
clients:
  - url: "${LOKI_PUSH_URL}"
    basic_auth:
      username: "${GRAFANA_CLOUD_INSTANCE_ID}"
      password: "${GRAFANA_CLOUD_API_KEY}"

scrape_configs:
  # Log access NGINX (JSON)
  - job_name: nginx_access
    static_configs:
      - targets: [localhost]
        labels:
          job:      nginx
          log_type: access
          host:     local-mac
          __path__: /opt/homebrew/var/log/nginx/access.log
    pipeline_stages:
      - json:
          expressions:
            status:       status
            method:       method
            uri:          uri
            request_time: request_time
      - labels:
          status:
          method:

  # Log error NGINX
  - job_name: nginx_error
    static_configs:
      - targets: [localhost]
        labels:
          job:      nginx
          log_type: error
          host:     local-mac
          __path__: /opt/homebrew/var/log/nginx/error.log

  # Log PostgreSQL (JSON format)
  - job_name: postgresql
    static_configs:
      - targets: [localhost]
        labels:
          job:      postgresql
          host:     local-mac
          __path__: /opt/homebrew/var/postgresql@16/log/*.json
    pipeline_stages:
      - json:
          expressions:
            error_severity: error_severity
            duration:       duration
            query:          query
      - labels:
          error_severity:
```

### 11.7 Chạy Promtail

```bash
# Chạy thẳng (không cần Docker)
promtail \
  --config.file=promtail/promtail-config.yml \
  --config.expand-env=true

# Hoặc chạy ngầm
nohup promtail \
  --config.file=promtail/promtail-config.yml \
  --config.expand-env=true \
  > /tmp/promtail.log 2>&1 &
```

### 11.8 Cấu hình alertmanager email

File `alertmanager/alertmanager.yml`:

```yaml
global:
  smtp_smarthost:    'smtp.gmail.com:587'
  smtp_from:         'your_email@gmail.com'
  smtp_auth_username: 'your_email@gmail.com'
  smtp_auth_password: '${GMAIL_APP_PASSWORD}'   # Dùng App Password, không phải password chính
  smtp_require_tls:  true

route:
  receiver: 'email-alert'
  group_wait:      30s
  group_interval:  5m
  repeat_interval: 12h
  group_by: [alertname, severity]

receivers:
  - name: 'email-alert'
    email_configs:
      - to: 'your_email@gmail.com'
        send_resolved: true
```

> Tạo Gmail App Password: **Google Account → Security → 2-Step Verification → App passwords**

---

## 12. Bước 9 — Alerting (tổng hợp)

Hệ thống alert được kích hoạt theo hai nguồn:

**Nguồn 1 — Prometheus → Alertmanager → Email**
- NGINX TCP probe thất bại > 1 phút → alert critical
- Error rate 5xx > 5% → alert warning
- PostgreSQL connection pool > 80% → alert warning
- CPU macOS > 80% liên tục 2 phút → alert warning
- RAM macOS > 85% → alert warning

**Nguồn 2 — Grafana Cloud Alerting (UI)**
1. Vào **Grafana → Alerting → Alert rules → New alert rule**
2. Ví dụ alert từ Loki log:

```logql
# Đếm số log có status=500 trong 5 phút
sum(count_over_time({job="nginx"} | json | status="500" [5m]))
```

3. Condition: `IS ABOVE 10` → notify

---

## 13. Bước 10 — Metrics chi tiết theo Layer

### Layer 1 — Infrastructure (node_exporter trên macOS)

> node_exporter cần chạy trên máy local và được Prometheus scrape qua `host.docker.internal:9100`

| Metric Group | Metrics | PromQL mẫu |
|---|---|---|
| **CPU** | `node_cpu_seconds_total` | `100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)` |
| **RAM** | `node_memory_active_bytes`, `node_memory_wired_bytes`, `node_memory_total_bytes` | `(node_memory_active_bytes + node_memory_wired_bytes) / node_memory_total_bytes * 100` |
| **Disk I/O** | `node_disk_read_bytes_total`, `node_disk_written_bytes_total` | `rate(node_disk_read_bytes_total[1m])` |
| **Network** | `node_network_receive_bytes_total`, `node_network_transmit_bytes_total` | `rate(node_network_receive_bytes_total{device="en0"}[1m])` |
| **Load** | `node_load1`, `node_load5`, `node_load15` | So sánh `node_load1` với số core: nếu > 1.0 là overload |

> **Lưu ý macOS:** Một số disk/filesystem metric của Linux không có trên macOS. CPU và RAM hoạt động bình thường. Interface mạng thường là `en0` (WiFi) hoặc `en1` (Ethernet) — kiểm tra bằng `ifconfig | grep '^en'`.

Thêm vào `prometheus/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "node"
    static_configs:
      - targets: ["host.docker.internal:9100"]
```

Alert rules cho infrastructure — thêm vào `prometheus/alert_rules.yml`:

```yaml
  - name: infrastructure_alerts
    rules:
      - alert: HighCpuUsage
        expr: 100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100) > 80
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "CPU macOS vượt 80%"
          description: "CPU đang ở {{ $value | printf \"%.1f\" }}% trong 2 phút."

      - alert: HighMemoryUsage
        expr: |
          (node_memory_active_bytes + node_memory_wired_bytes)
          / node_memory_total_bytes * 100 > 85
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "RAM macOS vượt 85%"
          description: "RAM đang dùng {{ $value | printf \"%.1f\" }}%."
```

### Layer 2 — Application (OpenTelemetry trên Render Backend)

| Metric Group | Metrics | PromQL mẫu |
|---|---|---|
| **Request count** | `http_server_requests_total` | `sum by(route,method,status_code)(rate(http_server_requests_total[1m]))` |
| **Error rate** | `http_server_requests_total{status_code=~"5.."}` | `rate(http_server_requests_total{status_code=~"5.."}[5m])` |
| **Latency p95** | `http_server_duration_milliseconds` (Histogram) | `histogram_quantile(0.95, rate(http_server_duration_milliseconds_bucket[5m]))` |
| **Process CPU** | `process_cpu_usage` | Gauge trực tiếp — CPU chỉ của process Node.js |
| **Process RAM** | `process_resident_memory_bytes` | Theo dõi trend tăng dần = memory leak |
| **Custom errors** | `app_errors_total` | `rate(app_errors_total[5m])` |

Thêm scrape job OTel vào `prometheus/prometheus.yml`:

```yaml
  - job_name: "app-otel"
    static_configs:
      - targets: ["host.docker.internal:9464"]   # OTel Prometheus exporter port
```

### Layer 5 — Blackbox probe Render.com

Kiểm tra endpoint `/health` của backend trên Render từ bên ngoài:

```yaml
# prometheus/prometheus.yml — thêm job này
  - job_name: "blackbox_render"
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://your-app.onrender.com/health
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - target_label: __address__
        replacement: blackbox-exporter:9115
      - source_labels: [__param_target]
        target_label: instance
```

Alert cho Render uptime:

```yaml
      - alert: RenderBackendDown
        expr: probe_success{job="blackbox_render"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Backend Render không phản hồi"
          description: "Endpoint {{ $labels.instance }} down > 1 phút."

      - alert: RenderSlowResponse
        expr: probe_duration_seconds{job="blackbox_render"} > 3
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Backend Render phản hồi chậm"
          description: "Response time {{ $value | printf \"%.2f\" }}s > 3s."
```

---

## 14. Bước 11 — OpenTelemetry tích hợp Backend

### 14.1 Cài packages

```bash
npm install @opentelemetry/sdk-node \
            @opentelemetry/auto-instrumentations-node \
            @opentelemetry/exporter-prometheus
```

### 14.2 File `backend/src/otel.js`

```javascript
// otel.js — PHẢI load trước mọi thứ khác
// Khởi động bằng: node --require ./src/otel.js src/index.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const sdk = new NodeSDK({
  // Expose metrics tại http://localhost:9464/metrics
  // Prometheus sẽ scrape endpoint này
  metricReader: new PrometheusExporter({ port: 9464 }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Tắt các instrumentation không cần thiết để giảm noise
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();
console.log('[OTel] OpenTelemetry started, metrics at :9464/metrics');
```

### 14.3 Cập nhật `package.json`

```json
{
  "scripts": {
    "start": "node --require ./src/otel.js src/index.js",
    "dev":   "nodemon --require ./src/otel.js src/index.js"
  }
}
```

### 14.4 Custom counter cho lỗi unhandled

```javascript
// backend/src/middleware/errorCounter.js
const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('app-errors');
const errorCounter = meter.createCounter('app_errors_total', {
  description: 'Tổng số lỗi unhandled trong app',
});

// Dùng trong error handler của Express
function errorHandler(err, req, res, next) {
  errorCounter.add(1, {
    route:  req.path,
    method: req.method,
  });
  console.error(JSON.stringify({
    type:      'unhandled_error',
    message:   err.message,
    route:     req.path,
    method:    req.method,
    timestamp: new Date().toISOString(),
  }));
  res.status(500).json({ error: 'Internal Server Error' });
}

module.exports = { errorHandler };
```

---

## 15. Bước 12 — Log tracking người dùng

### 15.1 Format log chuẩn JSON (mỗi request)

Mỗi request phải emit log JSON với đủ các trường sau:

```json
{
  "timestamp":   "2025-06-13T10:00:00Z",
  "ip":          "203.162.x.x",
  "user_id":     "u_123",
  "method":      "POST",
  "path":        "/api/checkout",
  "status":      200,
  "duration_ms": 142,
  "bytes_sent":  1024,
  "user_agent":  "Mozilla/5.0..."
}
```

### 15.2 Middleware Express — `backend/src/middleware/requestLogger.js`

```javascript
// requestLogger.js
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const log = {
      timestamp:   new Date().toISOString(),
      ip:          req.headers['x-forwarded-for']?.split(',')[0].trim()
                   || req.socket.remoteAddress,
      user_id:     req.user?.id || 'anonymous',
      method:      req.method,
      path:        req.path,
      status:      res.statusCode,
      duration_ms: Date.now() - start,
      bytes_sent:  parseInt(res.getHeader('content-length') || '0', 10),
      user_agent:  req.headers['user-agent'] || '',
    };
    // Log ra stdout — Render sẽ bắt và đẩy qua Log Stream → Loki
    process.stdout.write(JSON.stringify(log) + '\n');
  });

  next();
}

module.exports = { requestLogger };
```

### 15.3 Đăng ký middleware trong `index.js`

```javascript
import { requestLogger } from './middleware/requestLogger.js';

// Đặt TRƯỚC các route
app.use(requestLogger);
```

### 15.4 LogQL queries hữu ích trong Grafana

```logql
# Tất cả request từ 1 IP cụ thể
{job="backend"} | json | ip="203.162.x.x"

# Tất cả lỗi 5xx kèm path
{job="backend"} | json | status >= 500
  | line_format "{{.method}} {{.path}} → {{.status}} ({{.duration_ms}}ms)"

# Request chậm hơn 500ms
{job="backend"} | json | duration_ms > 500

# Toàn bộ hành động của 1 user
{job="backend"} | json | user_id="u_123"

# Tỉ lệ lỗi theo phút (metric từ log)
sum(rate({job="backend"} | json | status >= 500 [1m]))
/
sum(rate({job="backend"} | json [1m]))
```

### 15.5 Bảng panels Grafana cho User Access

| Panel | Loại | Query |
|---|---|---|
| Top 10 IPs | Table | `{job="backend"} \| json \| ip != ""` group by ip |
| HTTP method breakdown | Pie chart | group by method |
| Status code theo thời gian | Time series | group by status |
| Avg response time | Stat/Gauge | avg(duration_ms) |
| Slow requests log | Logs panel | `duration_ms > 500` |
| Bandwidth per IP | Bar chart | sum(bytes_sent) by ip |

---

## 16. Bước 13 — Database query monitoring

### 16.1 Slow query log với Prisma

```javascript
// backend/src/db/prismaClient.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
});

// Log query chậm hơn 200ms
prisma.$on('query', (e) => {
  if (e.duration > 200) {
    process.stdout.write(JSON.stringify({
      type:        'slow_query',
      duration_ms: e.duration,
      query:       e.query,
      params:      e.params,
      timestamp:   new Date().toISOString(),
    }) + '\n');
  }
});

module.exports = { prisma };
```

### 16.2 Slow query log với Sequelize

```javascript
// Nếu dùng Sequelize thay Prisma
const sequelize = new Sequelize(DB_URL, {
  benchmark: true,
  logging: (sql, duration) => {
    if (duration > 200) {
      process.stdout.write(JSON.stringify({
        type:        'slow_query',
        duration_ms: duration,
        sql:         sql,
        timestamp:   new Date().toISOString(),
      }) + '\n');
    }
  },
});
```

### 16.3 Slow query log từ PostgreSQL trực tiếp

Đã cấu hình ở Bước 2 (`log_min_duration_statement = 500`). File JSON của PostgreSQL sẽ có dạng:

```json
{
  "timestamp":        "2025-06-13 10:00:00.123 UTC",
  "error_severity":   "LOG",
  "duration":         "523.456 ms",
  "message":          "duration: 523.456 ms  statement: SELECT * FROM orders WHERE ...",
  "application_name": "node-postgres"
}
```

Promtail sẽ parse và đẩy trường này lên Loki với label `error_severity`.

### 16.4 LogQL query cho slow queries

```logql
# Tất cả slow query từ Prisma/Sequelize
{job="backend"} | json | type="slow_query"
  | line_format "{{.duration_ms}}ms → {{.query}}"

# Slow query từ PostgreSQL log trực tiếp
{job="postgresql"} | json | error_severity="LOG"
  | json | __error__=""

# Đếm số slow query theo phút
sum(rate({job="backend"} | json | type="slow_query" [1m]))
```

---

## 17. Bước 14 — Grafana Dashboard layout

### 17.1 Cấu trúc dashboard gợi ý

```
┌─────────────────────────────────────────────────────────────────────┐
│  Row 1 — System Health (node_exporter)                              │
│  ┌────────────┬────────────┬────────────┬────────────┐             │
│  │ CPU Usage% │ RAM Usage% │ Disk I/O   │ Net In/Out │             │
│  │  (Gauge)   │  (Gauge)   │(Timeseries)│(Timeseries)│             │
│  └────────────┴────────────┴────────────┴────────────┘             │
│                                                                     │
│  Row 2 — Application Performance (OTel)                             │
│  ┌────────────┬────────────┬────────────┬────────────┐             │
│  │ Req/min    │ Error Rate%│ p95 Latency│Render Uptime│            │
│  │(Timeseries)│(Timeseries)│(Timeseries)│  (Stat)    │             │
│  └────────────┴────────────┴────────────┴────────────┘             │
│                                                                     │
│  Row 3 — User Access (Loki)                                         │
│  ┌─────────────────────┬───────────────────────────────┐           │
│  │ Top 10 IPs (Table)  │ Requests by Endpoint (Bar)    │           │
│  ├─────────────────────┼───────────────────────────────┤           │
│  │ HTTP Status Pie     │ Avg Response Time by Route    │           │
│  └─────────────────────┴───────────────────────────────┘           │
│                                                                     │
│  Row 4 — Database (Loki)                                            │
│  ┌─────────────────────┬───────────────────────────────┐           │
│  │ Slow Query Count    │ Live Slow Query Log           │           │
│  │   (Timeseries)      │   (Logs panel)                │           │
│  └─────────────────────┴───────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### 17.2 Tạo dashboard trong Grafana Cloud

1. Vào **Grafana → Dashboards → New → New Dashboard**
2. Tạo từng Row theo cấu trúc trên
3. Với mỗi panel, chọn đúng datasource:
   - Metrics CPU/RAM/Request → **Prometheus**
   - Logs NGINX/App/DB → **Loki**
4. Export JSON → lưu vào `grafana/provisioning/dashboards/main-dashboard.json`

### 17.3 PromQL mẫu cho từng panel

```promql
# CPU Usage %
100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)

# RAM Usage % (macOS-native fields)
(node_memory_active_bytes + node_memory_wired_bytes) / node_memory_total_bytes * 100

# Request/min
sum(rate(http_server_requests_total[1m])) * 60

# Error Rate %
sum(rate(http_server_requests_total{status_code=~"5.."}[5m]))
/ sum(rate(http_server_requests_total[5m])) * 100

# p95 Latency (ms)
histogram_quantile(0.95, rate(http_server_duration_milliseconds_bucket[5m]))

# Render uptime (1 = up, 0 = down)
probe_success{job="blackbox_render"}
```

---

## 18. Bước 15 — Kiểm tra toàn bộ hệ thống

### Checklist theo thứ tự

```bash
# ── Tầng 1: Local infrastructure ─────────────────────────────────

# 1. PostgreSQL đang chạy và chỉ nhận localhost
psql -U appuser -h 127.0.0.1 appdb -c "SELECT 1;"
# Expected: ?column? = 1

# 2. NGINX đang chạy và lắng nghe port 5433
sudo lsof -i :5433
# Expected: nginx ... LISTEN

# 3. node_exporter đang expose metrics
curl -s http://localhost:9100/metrics | grep node_cpu
# Expected: thấy các dòng node_cpu_seconds_total{...}

# ── Tầng 2: mTLS ──────────────────────────────────────────────────

# 4. mTLS handshake thành công
openssl s_client \
  -connect localhost:5433 \
  -cert certs/client.crt \
  -key  certs/client.key \
  -CAfile certs/ca.crt \
  -verify_return_error 2>&1 | grep "Verify return code"
# Expected: Verify return code: 0 (ok)

# 5. Kết nối qua NGINX tới PostgreSQL
psql \
  "host=localhost port=5433 dbname=appdb user=appuser \
   sslmode=verify-full \
   sslcert=certs/client.crt \
   sslkey=certs/client.key \
   sslrootcert=certs/ca.crt" \
  -c "SELECT version();"
# Expected: PostgreSQL 16...

# ── Tầng 3: Network ───────────────────────────────────────────────

# 6. DDNS trỏ đúng IP public
dig myhome.ddns.net +short
curl -s ifconfig.me
# Hai giá trị phải giống nhau

# 7. Port forwarding hoạt động (từ máy khác hoặc dùng online tool)
nc -zv myhome.ddns.net 5433
# Expected: Connection to myhome.ddns.net 5433 succeeded!

# ── Tầng 4: Monitoring ────────────────────────────────────────────

# 8. Promtail đang chạy
curl http://localhost:9080/ready
# Expected: ready

# 9. OTel metrics đang expose (nếu backend chạy local để test)
curl http://localhost:9464/metrics | grep http_server
# Expected: thấy các dòng http_server_requests_total{...}

# 10. Prometheus đang scrape
curl http://localhost:9090/api/v1/targets | python3 -m json.tool | grep health
# Expected: "health": "up" cho tất cả targets

# 11. Blackbox probe NGINX
curl "http://localhost:9115/probe?target=localhost:5433&module=tcp_connect"
# Expected: probe_success 1

# 12. Log đã vào Loki
# Vào Grafana Cloud → Explore → Loki → query:
# {job="nginx"} | json
# {job="postgresql"}
# {job="backend"} | json
```

---

## 19. Biến môi trường tổng hợp

### File `.env.example`

```bash
# ── NGINX / Database ─────────────────────────────────────────────
NGINX_HOST=myhome.ddns.net
NGINX_PORT=5433
DB_NAME=appdb
DB_USER=appuser
DB_PASSWORD=your_strong_password_here

# ── mTLS Certs (base64 encoded) — set trên Render Dashboard ──────
MTLS_CLIENT_CERT=
MTLS_CLIENT_KEY=
MTLS_CA_CERT=

# ── Grafana Cloud ─────────────────────────────────────────────────
GRAFANA_CLOUD_INSTANCE_ID=123456
GRAFANA_CLOUD_API_KEY=glc_eyJ...
PROMETHEUS_REMOTE_WRITE_URL=https://prometheus-prod-xxx.grafana.net/api/prom/push
LOKI_PUSH_URL=https://logs-prod-xxx.grafana.net/loki/api/v1/push

# ── Alertmanager ──────────────────────────────────────────────────
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

---

## 20. Metrics checklist

| # | Metric | Nguồn | Ưu tiên |
|---|---|---|---|
| 1 | CPU Usage % | node_exporter | ✅ Bắt buộc |
| 2 | RAM Usage % | node_exporter | ✅ Bắt buộc |
| 3 | Request count by endpoint | OTel | ✅ Bắt buộc |
| 4 | HTTP error rate (5xx) | OTel | ✅ Bắt buộc |
| 5 | Response latency p95 | OTel | ✅ Bắt buộc |
| 6 | Access log (IP, user_id, path, status) | App middleware | ✅ Bắt buộc |
| 7 | Bandwidth per request (bytes_sent) | App middleware | ✅ Bắt buộc |
| 8 | Slow query detection (>200ms) | ORM hook + PG log | ✅ Bắt buộc |
| 9 | Render.com HTTP uptime probe | blackbox_exporter | ✅ Bắt buộc |
| 10 | NGINX TCP probe (port 5433) | blackbox_exporter | ✅ Bắt buộc |
| 11 | Disk I/O | node_exporter | ⚡ Nên có |
| 12 | Network I/O | node_exporter | ⚡ Nên có |
| 13 | Process CPU (Node.js only) | OTel | ⚡ Nên có |
| 14 | Process RAM — memory leak detection | OTel | ⚡ Nên có |
| 15 | PostgreSQL connection pool % | pg_exporter | ⚡ Nên có |

---

## 21. Sơ đồ luồng dữ liệu chi tiết

```
USER (Browser)
    │
    │ HTTPS request
    ▼
VERCEL (Frontend — Vite + Bun)
    │  └─── Log Drain (HTTPS/NDJSON) ──────────────────────────────► LOKI
    │
    │ HTTPS API call
    ▼
RENDER (Backend — Node.js + OTel)
    │  ├─── Log Stream (HTTPS) ─────────────────────────────────────► LOKI
    │  └─── OTel metrics (:9464) ──► Prometheus scrape ────────────► PROMETHEUS CLOUD
    │
    │ TCP + mTLS (port 5433)
    │ [dùng client.crt + client.key để bắt tay]
    ▼
NGINX (Local macOS — stream module)
    │  ├─── Verify client cert với ca.crt
    │  ├─── access.log (JSON) ──────────────────────────────────────► PROMTAIL
    │  └─── error.log ──────────────────────────────────────────────► PROMTAIL
    │
    │ TCP forward (127.0.0.1:5432)
    ▼
POSTGRESQL (Local macOS — port 5432)
    │  └─── postgresql-YYYY-MM-DD.json ─────────────────────────────► PROMTAIL
    │
    (kết quả query trả ngược về theo đường cũ)

NODE_EXPORTER (Local macOS — port 9100)
    └─── CPU / RAM / Disk / Network metrics ─► Prometheus scrape ──► PROMETHEUS CLOUD

PROMTAIL ──── HTTPS push ──────────────────────────────────────────► LOKI

PROMETHEUS (Docker local)
    │  ├─── Scrape node_exporter     (:9100)  — system metrics
    │  ├─── Scrape OTel backend      (:9464)  — app metrics
    │  ├─── Scrape blackbox NGINX    (:9115)  — TCP probe :5433
    │  ├─── Scrape blackbox Render   (:9115)  — HTTP probe /health
    │  ├─── Evaluate alert_rules.yml
    │  └─── remote_write ────────────────────────────────────────────► PROMETHEUS CLOUD

LOKI + PROMETHEUS CLOUD ──────────────────────────────────────────► GRAFANA UI
                                                                          │
                                                        Alert rules ──────┤
                                                                          ▼
                                                               ALERTMANAGER
                                                                    │
                                                                    └─► Email (Gmail SMTP)
```

---

> **Bảo mật — nhắc lại:**
> - Không commit file `.env`, `*.key`, `ca.crt` lên git
> - Đổi password Grafana mặc định ngay sau khi cài
> - Cert có hạn 365 ngày — đặt nhắc gia hạn trước 30 ngày
> - Render: dùng **Secret Files** thay vì env vars nếu platform cho phép trong tương lai
