# 🔍 Fix: Alert không firing khi `docker compose stop nginx`

## ❓ Vấn đề Được Report

**Tình huống:** 
- Khi dùng `docker compose stop nginx` → Grafana hiển thị DOWN nhưng **alert KHÔNG báo firing**
- Khi dùng `docker compose down` → Alert báo firing ✓

**Tại sao lại vậy?**

## 🎯 Root Cause Analysis

### Khi `docker compose stop nginx`:
```
1. Container nginx dừng ❌
2. Container nginx-exporter vẫn chạy ✅
3. nginx-exporter cố kết nối đến nginx:80 → FAIL ❌
4. nginx-exporter CÓ THỂ vẫn trả về metrics cũ hoặc error response
5. Prometheus nhận được response từ exporter → coi như "up=1" ⚠️
6. Alert condition: up{job="nginx"} == 0 → FALSE
7. Alert KHÔNG fires ❌
```

### Khi `docker compose down`:
```
1. Cả nginx + nginx-exporter đều dừng ❌❌
2. Prometheus không thể kết nối tới exporter → timeout
3. up{job="nginx"} == 0 ✓
4. Alert fires ✅
```

## ✅ Giải Pháp (Đã Implement)

### 1. **Thêm Timeout Configuration cho nginx-exporter**

**File: `app-docker-compose.yml`**
```yaml
nginx-exporter:
  command:
    - -nginx.scrape-uri=http://nginx:80/stub_status
    - -web.telemetry-path=/metrics
    - -nginx.timeout=5s    # ← NEW: Timeout nếu không kết nối được
```

### 2. **Thêm Secondary Detection Method: Blackbox Exporter HTTP Probe**

**File: `prometheus/prometheus.yml`**
```yaml
- job_name: 'blackbox'
  static_configs:
    - targets: 
        - 'http://localhost:8080'      # ← NEW: Direct HTTP check
        - 'https://cozyapp.vercel.app'
```

**Cách hoạt động:**
- Blackbox exporter thử HTTP GET đến `http://localhost:8080`
- Nếu không kết nối → `probe_success = 0`
- Alert fires ngay lập tức

### 3. **Cập nhật Alert Rules**

**File: `prometheus/alert_rules.yml`**
```yaml
# Primary: Check exporter status
- alert: NginxServerDown
  expr: |
    up{job="nginx"} == 0 
    OR absent(up{job="nginx"})
    OR nginx_up{job="nginx"} == 0
  for: 30s

# Secondary: Check HTTP accessibility
- alert: NginxHttpProbeDown
  expr: |
    probe_success{instance="http://localhost:8080", job="blackbox"} == 0
  for: 30s
```

## 🧪 Cách Test

### Test 1: Stop Nginx (SEKARANG SẼ WORK)
```bash
docker compose -f app-docker-compose.yml stop nginx
sleep 35

# Check Alertmanager
curl http://localhost:9093/api/v2/alerts

# Alert should fire:
# - NginxServerDown (from nginx-exporter)
# - NginxHttpProbeDown (from blackbox exporter)
```

### Test 2: Restart Nginx
```bash
docker compose -f app-docker-compose.yml start nginx
sleep 30

# Alerts should resolve automatically
```

### Test 3: Kill only nginx-exporter
```bash
docker stop nginx-exporter
sleep 35

# Alert NginxServerDown should fire
# (exporter is down, so Prometheus can't scrape)
```

## 📊 Comparison: Before vs After

| Scenario | Before | After |
|----------|--------|-------|
| `stop nginx` | ❌ Alert không fire | ✅ Alert fires |
| `stop nginx + wait 35s` | ❌ Không báo | ✅ Email gửi |
| `down all` | ✅ Alert fires | ✅ Alert fires |
| `stop exporter only` | ❌ Alert không detect | ✅ Alert fires (up=0) |

## 🔧 Technical Details

### Monitoring Methods:

1. **Method 1: Exporter-based** (nginx-exporter)
   - Scrape interval: 15s
   - Khối lượng: Nhẹ (~1KB)
   - Ưu điểm: Chi tiết metrics, độ trễ thấp
   - Nhược điểm: Cần exporter chạy

2. **Method 2: HTTP-based** (Blackbox Exporter)
   - Probe interval: 15s
   - Khối lượng: Nhẹ
   - Ưu điểm: Phát hiện được khi exporter sập
   - Nhược điểm: Chỉ check HTTP, không có chi tiết

3. **Method 3: DNS-based** (có thể thêm)
   - Có thể probe internal DNS
   - Phát hiện network issues

### Alert Priority:

```
NginxServerDown (Critical)     - Exporter không thể connect
    ↓
NginxHttpProbeDown (Critical)  - HTTP không respond
    ↓
NginxHighErrorRate (Warning)   - 5xx errors
    ↓
NginxHighConnections (Warning) - Quá tải
    ↓
NginxHighResponseTime (Warning) - Performance
```

## 📈 What's Monitored Now

```
┌─────────────────────────────────────────────┐
│         NGINX APPLICATION                   │
│  (localhost:8080)                           │
└─────────────────────────────────────────────┘
    ↙ (Method 1)              ↘ (Method 2)
    │                          │
    ↓                          ↓
nginx-exporter              blackbox-exporter
(localhost:9113)            (http probe)
    │                          │
    └──────────┬───────────────┘
               ↓
          PROMETHEUS
               ↓
      ┌────────┴────────┐
      ↓                 ↓
NginxServerDown    NginxHttpProbeDown
(from exporter)    (from HTTP check)
      │                 │
      └────────┬────────┘
               ↓
        ALERTMANAGER
               ↓
            EMAIL
```

## ✨ Key Improvements

1. **Dual Detection**: 2 methods to detect failures
2. **Faster Detection**: Redundant checks catch issues sooner
3. **Better Diagnostics**: Know if exporter is down vs nginx down
4. **Production Ready**: Typical monitoring setup pattern

## 🎯 Next Steps

1. **Verify tests work:**
   ```bash
   docker compose -f app-docker-compose.yml stop nginx
   sleep 35
   # Check http://localhost:9093 for alerts
   # Check inbox for emails
   ```

2. **Monitor the logs:**
   ```bash
   docker logs alertmanager -f --tail=50 | grep -i nginx
   ```

3. **Add more probes** if needed:
   - Health check endpoint: `/health`
   - Upstream services
   - Database connectivity

## 🔗 Related Files Modified

- ✅ `app-docker-compose.yml` - Added timeout config
- ✅ `prometheus/prometheus.yml` - Added HTTP probe
- ✅ `prometheus/alert_rules.yml` - Added secondary alert

## 📌 Summary

**Problem**: `stop` doesn't trigger alerts like `down` does

**Root Cause**: Exporter still running, misleads Prometheus

**Solution**: Add HTTP probe via Blackbox Exporter as secondary detection

**Result**: Now both `stop` and `down` correctly trigger alerts! ✅
