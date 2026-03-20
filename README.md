# Nginx Monitoring Ecosystem (CI/CD + Dockerized)

Đồ án xây dựng hệ thống giám sát Nginx toàn diện, tự động hóa từ khâu đóng gói (Docker), kiểm tra lỗi (Linting) đến triển khai và hiển thị biểu đồ (Prometheus & Grafana).

---

## Kiến trúc hệ thống
Hệ thống bao gồm 4 thành phần chính chạy biệt lập trong Docker container:

1.  **Nginx (Custom Image):** Web server chính, đã được cấu hình `stub_status` để xuất dữ liệu thời gian thực.
2.  **Nginx Prometheus Exporter:** Thu thập dữ liệu từ Nginx và chuyển đổi sang định dạng Prometheus metrics.
3.  **Prometheus:** Cơ sở dữ liệu chuỗi thời gian (Time-series DB) lưu trữ và quản lý các chỉ số giám sát.
4.  **Grafana:** Giao diện trực quan hóa dữ liệu với Dashboard chuyên nghiệp, kết nối trực tiếp với Prometheus.

## Tính năng nổi bật
* **CI/CD Pipeline:** Tự động hóa hoàn toàn quy trình qua GitHub Actions.
* **Multi-Arch Support:** Image hỗ trợ cả kiến trúc **Intel (amd64)** và **Apple Silicon (arm64/v8)**.
* **Automated Linting:** Kiểm tra lỗi cú pháp Dockerfile (Hadolint) và cấu hình Prometheus (Promtool) ngay trong Pipeline để đảm bảo tính ổn định.
* **Infrastructure as Code (IaC):** Toàn bộ Data Source và Dashboard của Grafana được **Provisioning** tự động, không cần cấu hình bằng tay sau khi khởi động.

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
