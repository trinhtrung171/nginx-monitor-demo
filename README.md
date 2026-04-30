# Nginx Monitoring Ecosystem (CI/CD + Docker)# Nginx Monitoring Ecosystem (CI/CD + Docker)



Đồ án xây dựng hệ thống giám sát Nginx toàn diện, tự động hóa từ khâu đóng gói (Docker), kiểm tra lỗi (Linting) đến triển khai và hiển thị biểu đồ (Prometheus & Grafana).Đồ án xây dựng hệ thống giám sát Nginx toàn diện, tự động hóa từ khâu đóng gói (Docker), kiểm tra lỗi (Linting) đến triển khai và hiển thị biểu đồ (Prometheus & Grafana).



## Kiến trúc hệ thống---



Hệ thống bao gồm 4 thành phần chính chạy biệt lập trong Docker container:## Kiến trúc hệ thống



1. **Nginx (Custom Image):** Web server chính, đã được cấu hình `stub_status` để xuất dữ liệu thời gian thựcHệ thống bao gồm 4 thành phần chính chạy biệt lập trong Docker container:

2. **Nginx Prometheus Exporter:** Thu thập dữ liệu từ Nginx và chuyển đổi sang định dạng Prometheus metrics

3. **Prometheus:** Cơ sở dữ liệu chuỗi thời gian (Time-series DB) lưu trữ và quản lý các chỉ số giám sát1. **Nginx (Custom Image):** Web server chính, đã được cấu hình `stub_status` để xuất dữ liệu thời gian thực.

4. **Grafana:** Giao diện trực quan hóa dữ liệu với Dashboard chuyên nghiệp, kết nối trực tiếp với Prometheus2. **Nginx Prometheus Exporter:** Thu thập dữ liệu từ Nginx và chuyển đổi sang định dạng Prometheus metrics.

3. **Prometheus:** Cơ sở dữ liệu chuỗi thời gian (Time-series DB) lưu trữ và quản lý các chỉ số giám sát.

## Tính năng nổi bật4. **Grafana:** Giao diện trực quan hóa dữ liệu với Dashboard chuyên nghiệp, kết nối trực tiếp với Prometheus.



* **CI/CD Pipeline:** Tự động hóa hoàn toàn quy trình qua GitHub Actions---

* **Multi-Arch Support:** Image hỗ trợ cả kiến trúc **Intel (amd64)** và **Apple Silicon (arm64/v8)**

* **Automated Linting:** Kiểm tra lỗi cú pháp Dockerfile (Hadolint) và cấu hình Prometheus (Promtool) ngay trong Pipeline## Tính năng nổi bật

* **Infrastructure as Code (IaC):** Toàn bộ Data Source và Dashboard của Grafana được **Provisioning** tự động

* **CI/CD Pipeline:** Tự động hóa hoàn toàn quy trình qua GitHub Actions

## 🛠️ Hướng dẫn cài đặt nhanh* **Multi-Arch Support:** Image hỗ trợ cả kiến trúc **Intel (amd64)** và **Apple Silicon (arm64/v8)**

* **Automated Linting:** Kiểm tra lỗi cú pháp Dockerfile (Hadolint) và cấu hình Prometheus (Promtool) ngay trong Pipeline để đảm bảo tính ổn định

### Yêu cầu hệ thống* **Infrastructure as Code (IaC):** Toàn bộ Data Source và Dashboard của Grafana được **Provisioning** tự động, không cần cấu hình bằng tay sau khi khởi động



* Đã cài đặt **Docker** và **Docker Compose**---

* (Tùy chọn) **OrbStack** hoặc **Docker Desktop** (nếu chạy trên macOS/Windows)

## 🛠️ Hướng dẫn cài đặt nhanh

### Khởi chạy

### Yêu cầu hệ thống

Tại thư mục gốc của dự án, chạy lệnh duy nhất:

* Đã cài đặt **Docker** và **Docker Compose**

```bash* (Tùy chọn) **OrbStack** hoặc **Docker Desktop** (nếu chạy trên macOS/Windows)

docker compose up -d

```### Khởi chạy



### Truy cập các dịch vụTại thư mục gốc của dự án, chạy lệnh duy nhất:



| Dịch vụ | URL | Mô tả |```bash

| --- | --- | --- |docker compose up -d

| Nginx Web | <http://localhost:8080> | Trang chủ Nginx |```

| Nginx Status | <http://localhost:8080/stub_status> | Dữ liệu thô từ Nginx |

| Prometheus | <http://localhost:9090> | Giao diện truy vấn dữ liệu |### Truy cập các dịch vụ

| Grafana | <http://localhost:3000> | Dashboard giám sát |

| Dịch vụ | URL | Mô tả |

## 🔐 Tài khoản Grafana mặc định| --- | --- | --- |

| **Nginx Web** | <http://localhost:8080> | Trang chủ Nginx |

* **Username:** admin| **Nginx Status** | <http://localhost:8080/stub_status> | Dữ liệu thô từ Nginx |

* **Password:** Đặt trong file `.env` (biến `GF_PASSWORD`)| **Prometheus** | <http://localhost:9090> | Giao diện truy vấn dữ liệu |

| **Grafana** | <http://localhost:3000> | Dashboard giám sát |

## 📧 Setup Email Alerts (Alertmanager)

---

Hệ thống hỗ trợ gửi cảnh báo tự động qua **Email** khi Nginx bị sập.

## 🔐 Tài khoản Grafana mặc định

### Yêu cầu

* **Username:** admin

* Tài khoản **Gmail** hoặc email SMTP khác* **Password:** Đặt trong file `.env` (biến `GF_PASSWORD`)

* Bật **2-Step Verification** trên tài khoản Google <https://myaccount.google.com>

---

### Các bước cấu hình

## 📧 Setup Email Alerts (Alertmanager)

#### 1. Tạo App Password trên Gmail

Hệ thống hỗ trợ gửi cảnh báo tự động qua **Email** khi Nginx bị sập.

1. Vào <https://myaccount.google.com/apppasswords>

2. Chọn **Mail** → **Windows PC** (hoặc device của bạn)### Yêu cầu

3. Click **Create** → Copy password được tạo

* Tài khoản **Gmail** hoặc email SMTP khác

#### 2. Tạo file `.env` từ template* Bật **2-Step Verification** trên tài khoản Google <https://myaccount.google.com>



```bash### Các bước cấu hình

cp .env.example .env

```#### 1. Tạo App Password trên Gmail



#### 3. Cập nhật credentials trong `.env`1. Vào <https://myaccount.google.com/apppasswords>

2. Chọn **Mail** → **Windows PC** (hoặc device của bạn)

```bash3. Click **Create** → Copy password được tạo

SMTP_USERNAME=your-email@gmail.com

SMTP_PASSWORD=your-app-password#### 2. Tạo file `.env` từ template

SMTP_FROM=your-email@gmail.com

SMTP_TO=recipient@example.com```bash

GF_PASSWORD=admincp .env.example .env

``````



#### 4. Khởi động hệ thống#### 3. Cập nhật credentials trong `.env`



```bash```bash

docker compose -f monitor-docker-compose.yml downSMTP_USERNAME=your-email@gmail.com

docker compose -f monitor-docker-compose.yml up -dSMTP_PASSWORD=your-app-password      # ← Paste password từ bước 1

```SMTP_FROM=your-email@gmail.com

SMTP_TO=recipient@example.com         # ← Email nhận cảnh báo

### Test Email AlertsGF_PASSWORD=admin                     # ← Mật khẩu Grafana

```

1. **Tắt app (Nginx) để trigger alert:**

#### 4. Tạo file `alertmanager/alertmanager.yml` từ template

   ```bash

   docker compose -f app-docker-compose.yml down```bash

   ```cp alertmanager/alertmanager.yml.example alertmanager/alertmanager.yml

```

2. **Chờ 30-60 giây** để Prometheus detect target down

#### 5. Khởi động lại hệ thống

3. **Kiểm tra email** - bạn sẽ nhận được email cảnh báo

```bash

4. **Khôi phục app:**docker compose -f monitor-docker-compose.yml down

docker compose -f monitor-docker-compose.yml up -d

   ```bash```

   docker compose -f app-docker-compose.yml up -d

   ```### Test Email Alerts



   Alert sẽ tự động resolve khi Nginx quay lại1. **Tắt app (Nginx) để trigger alert:**

   ```bash

### Truy cập Alertmanager UI   docker compose -f app-docker-compose.yml down

   ```

<http://localhost:9093>

2. **Chờ 30-60 giây** để Prometheus detect target down

## 🚀 Quy trình CI/CD (GitHub Actions)

3. **Kiểm tra email** - bạn sẽ nhận được email cảnh báo

Mỗi khi có thay đổi được push lên nhánh main, hệ thống sẽ tự động thực hiện:

4. **Khôi phục app:**

* **Job Lint:** Kiểm tra chất lượng Dockerfile và cấu hình Prometheus   ```bash

* **Job Build & Push:**   docker compose -f app-docker-compose.yml up -d

  * Khởi tạo môi trường build đa nền tảng (QEMU & Buildx)   ```

  * Đóng gói Image cho cả linux/amd64 và linux/arm64   Alert sẽ tự động resolve khi Nginx quay lại

  * Đẩy Image lên Docker Hub với các tag latest và git-sha

  * Chạy smoke test để kiểm tra toàn bộ hệ thống### Truy cập Alertmanager UI

* **Alertmanager:** http://localhost:9093

## 📁 Cấu trúc thư mục dự án

---

```plaintext

├── .github/workflows/         # Cấu hình CI/CD Pipeline## Quy trình CI/CD (GitHub Actions)

├── alertmanager/* Mỗi khi có thay đổi được push lên nhánh main, hệ thống sẽ tự động thực hiện:

│   ├── alertmanager.yml       # Cấu hình Alertmanager* Job Lint: Kiểm tra chất lượng Dockerfile và tính hợp lệ của file cấu hình Prometheus.

│   ├── alertmanager.yml.example* Job Build & Push:

│   └── entrypoint.sh          # Script substitute env vars  - Khởi tạo môi trường build đa nền tảng (QEMU & Buildx).

├── grafana/  - Đóng gói Image cho cả linux/amd64 và linux/arm64.

│   ├── dashboards/            # File JSON của Dashboard  - Đẩy Image lên Docker Hub với các tag latest và git-sha.

│   └── provisioning/          # Config tự động nạp Data Source  - Chạy smoke test để kiểm tra toàn bộ hệ thống

├── prometheus/Đồ án xây dựng hệ thống giám sát Nginx toàn diện, tự động hóa từ khâu đóng gói (Docker), kiểm tra lỗi (Linting) đến triển khai và hiển thị biểu đồ (Prometheus & Grafana).

│   ├── prometheus.yml         # Cấu hình thu thập dữ liệu

│   ├── alert_rules.yml        # Định nghĩa alert rules---

│   └── blackbox_rules.yml     # Alert rules cho blackbox

├── Dockerfile                 # Hướng dẫn đóng gói Nginx## Kiến trúc hệ thống

├── nginx.conf                 # Cấu hình Nginx + stub_statusHệ thống bao gồm 4 thành phần chính chạy biệt lập trong Docker container:

├── app-docker-compose.yml     # Docker Compose cho app

├── monitor-docker-compose.yml # Docker Compose cho monitoring1.  **Nginx (Custom Image):** Web server chính, đã được cấu hình `stub_status` để xuất dữ liệu thời gian thực.

├── promtail-config.yml        # Cấu hình Promtail2.  **Nginx Prometheus Exporter:** Thu thập dữ liệu từ Nginx và chuyển đổi sang định dạng Prometheus metrics.

└── README.md                  # Tài liệu hướng dẫn (File này)3.  **Prometheus:** Cơ sở dữ liệu chuỗi thời gian (Time-series DB) lưu trữ và quản lý các chỉ số giám sát.

```4.  **Grafana:** Giao diện trực quan hóa dữ liệu với Dashboard chuyên nghiệp, kết nối trực tiếp với Prometheus.



## 📝 Ghi chú## Tính năng nổi bật

* **CI/CD Pipeline:** Tự động hóa hoàn toàn quy trình qua GitHub Actions.

* Toàn bộ dữ liệu được lưu trữ trong các volume Docker* **Multi-Arch Support:** Image hỗ trợ cả kiến trúc **Intel (amd64)** và **Apple Silicon (arm64/v8)**.

* Để xóa toàn bộ hệ thống: `docker compose down -v`* **Automated Linting:** Kiểm tra lỗi cú pháp Dockerfile (Hadolint) và cấu hình Prometheus (Promtool) ngay trong Pipeline để đảm bảo tính ổn định.

* Để xem logs: `docker compose logs -f [service-name]`* **Infrastructure as Code (IaC):** Toàn bộ Data Source và Dashboard của Grafana được **Provisioning** tự động, không cần cấu hình bằng tay sau khi khởi động.


---

## 🛠️ Hướng dẫn cài đặt nhanh

### Yêu cầu hệ thống
* Đã cài đặt **Docker** và **Docker Compose**.
* (Tùy chọn) **OrbStack** hoặc **Docker Desktop** (nếu chạy trên macOS/Windows).

### Khởi chạy
Tại thư mục gốc của dự án, chạy lệnh duy nhất:
```bash
docker compose up -d
```
Các cổng truy cập nội bộ
* **Nginx Web**	http://localhost:8080	- Trang chủ Nginx
* **Nginx Status**	http://localhost:8080/stub_status -	Dữ liệu thô từ Nginx
* **Prometheus**	http://localhost:9090 -	Giao diện truy vấn dữ liệu
* **Grafana**	http://localhost:3000 -	Dashboard giám sát

## Tài khoản Grafana mặc định:
* **Username:** admin
* **Password:** trunghalo2005

## Quy trình CI/CD (GitHub Actions)
* Mỗi khi có thay đổi được push lên nhánh main, hệ thống sẽ tự động thực hiện:
* Job Lint: Kiểm tra chất lượng Dockerfile và tính hợp lệ của file cấu hình Prometheus.
* Job Build & Push:
  - Khởi tạo môi trường build đa nền tảng (QEMU & Buildx).
  - Đóng gói Image cho cả linux/amd64 và linux/arm64.
  - Đẩy Image lên Docker Hub với các tag latest và git-sha.

## Cấu trúc thư mục dự án
```Plaintext
├── .github/workflows/      # Cấu hình CI/CD Pipeline
├── grafana/
│   ├── dashboards/         # Chứa file JSON của Dashboard
│   └── provisioning/       # Cấu hình tự động nạp Data Source/Dashboard
├── Dockerfile              # Hướng dẫn đóng gói Nginx
├── docker-compose.yml      # Điều phối toàn bộ hệ thống
├── nginx.conf              # Cấu hình Nginx + stub_status
├── prometheus.yml          # Cấu hình thu thập dữ liệu của Prometheus
└── README.md               # Tài liệu hướng dẫn (File này)
```
