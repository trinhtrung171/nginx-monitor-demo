# 📊 Enhanced Blackbox-Vercel Dashboard

Dashboard này giám sát ứng dụng Vercel bằng Blackbox Exporter với các metrics chi tiết:

## 📈 Row 1: Current Status (Top row)

### 1. **Probe Status** (Trạng thái)
- **Ý nghĩa**: Ứng dụng có đang chạy không?
- **Giá trị**: 0 = Down (Đỏ), 1 = Up (Xanh)
- **Cảnh báo**: Nếu = 0 trong >30s → Email alert

### 2. **HTTP Status Code**
- **Ý nghĩa**: HTTP response code của app
- **Bình thường**: 200-399 (Xanh)
- **Lỗi**: <200 (Đỏ), ≥400 (Đỏ - client/server error)

### 3. **Response Time**
- **Ý nghĩa**: Tổng thời gian từ lúc gửi request đến nhận response
- **Đơn vị**: Giây
- **Bình thường**: <0.5s (Xanh), >1s (Đỏ - app chậm)

### 4. **Probe Success Timeline**
- **Ý nghĩa**: Lịch sử uptime trong 1 giờ qua
- **Đọc**: Nếu flat line ở 1 = app luôn online ✅

---

## 🔐 Row 2: SSL & Request Phase Details (Rows 12-16)

### 5. **SSL Certificate Expiry**
- **Ý nghĩa**: Còn bao lâu SSL hết hạn?
- **Đơn vị**: Giây
- **Màu**:
  - 🟢 Xanh: >90 ngày (an toàn)
  - 🟡 Vàng: 30-90 ngày (cảnh báo)
  - 🔴 Đỏ: <30 ngày (PHẢI GIA HẠN)
- **Alert**: Warning <30 ngày, Critical <7 ngày

### 6. **Connect Time**
- **Ý nghĩa**: Thời gian kết nối TCP tới server
- **Tốt**: <0.5s
- **Chậm**: >1s (có thể là vấn đề network)

### 7. **TLS Handshake Time**
- **Ý nghĩa**: Thời gian negotiation SSL/TLS certificate
- **Tốt**: <0.1s
- **Chậm**: >0.3s (server SSL config có vấn đề?)

### 8. **Server Processing Time**
- **Ý nghĩa**: Thời gian server xử lý request (thực tế app chạy)
- **Tốt**: <0.2s
- **Chậm**: >0.5s (app logic chậm hoặc database query nặng)

### 9. **Data Transfer Time**
- **Ý nghĩa**: Thời gian download response từ server
- **Tốt**: <0.1s
- **Chậm**: >0.3s (response size lớn hoặc bandwidth hạn chế)

---

## 📉 Row 3: Trends (Rows 20-28)

### 10. **Request Phase Breakdown Timeline**
- **Ý nghĩa**: Biểu đồ stacked thể hiện từng phase trong 1 giờ
- **Đọc**: Xem phase nào chiếm thời gian nhất
  - Connect cao → vấn đề DNS/network
  - TLS cao → SSL config chậm
  - Processing cao → app logic chậm
  - Transfer cao → response size lớn

### 11. **Response Time Trend**
- **Ý nghĩa**: Tổng response time theo thời gian
- **Xem**: App có chậm dần không? Có spike lúc nào không?
- **Cảnh báo**: Nếu baseline response time tăng đột ngột

---

## 🚨 Alert Rules

### Prometheus Alerts
| Alert | Điều kiện | Hành động |
|-------|-----------|----------|
| **VercelAppDown** | probe_success == 0 >30s | Email alert |
| **SSLCertificateExpiring** | SSL expiry <30 ngày | Warning email |
| **SSLCertificateExpired** | SSL expiry <7 ngày | Critical email |
| **NginxServerDown** | Nginx down (nginx job) | Warning email |
| **NginxHighErrorRate** | Error rate >5% | Warning email |
| **NginxHighResponseTime** | Response time >1s | Warning email |

---

## 💡 Cách dùng

1. **Kiểm tra sức khỏe app**: Xem Probe Status + HTTP Status Code
2. **Điều tra tại sao chậm**: Xem Request Phase Breakdown
3. **Gia hạn SSL**: Xem SSL Certificate Expiry, gia hạn nếu <30 ngày
4. **Phân tích trends**: Xem có pattern nào (peak time, gradual degradation)
5. **Nhận alert**: Email tự động khi Down hoặc SSL expiry gần

---

## 📝 Notes

- Refresh: 30 giây
- Thời gian: Last 1 hour (có thể thay đổi)
- Blackbox probe: Mỗi 15 giây check 1 lần
- Metrics storage: 15 days (mặc định Prometheus)
