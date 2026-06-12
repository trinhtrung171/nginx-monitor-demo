# 📧 How to Test Vercel App, Nginx, Alertmanager & Email Alerts

## ✅ Current Status - Everything is Running!

All services are up and running:
- ✅ Nginx Server (port 8080)
- ✅ Prometheus (port 9090)
- ✅ Grafana (port 3000)
- ✅ Alertmanager (port 9093)
- ✅ Blackbox Exporter (port 9115)
- ✅ SMTP Config: Properly substituted with real Gmail credentials

---

## 🎯 Quick Testing (5 minutes)

### Test 1: Verify Nginx is Running
```bash
curl http://localhost:8080
# Should return: HTML welcome page

curl http://localhost:8080/stub_status
# Should return:
# Active connections: X
# server accepts handled requests
#  X X X
# Reading: X Writing: X Waiting: X
```

### Test 2: Check Prometheus
Open browser:
```
http://localhost:9090
```

In the Query bar, run these queries:

**Check Nginx Status:**
```promql
up{job="nginx"}
```
Should return: `1` (Nginx is UP)

**Check Active Connections:**
```promql
nginx_connections_active
```

### Test 3: Check Alertmanager Configuration
```bash
docker exec alertmanager cat /tmp/alertmanager-config.yml | head -20
```

Expected output (SMTP credentials should be ACTUAL VALUES, not placeholders):
```yaml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_auth_username: wwkuro175@gmail.com          ← ACTUAL EMAIL
  smtp_auth_password: xtwp qhcy txjq fkba         ← ACTUAL PASSWORD
  smtp_require_tls: true
  smtp_from: besttulen05@gmail.com                ← ACTUAL EMAIL
```

### Test 4: Check Alertmanager UI
Open browser:
```
http://localhost:9093
```
- Go to "Alerts" tab
- Go to "Status" tab to see configuration

---

## 🚨 TRIGGER ALERT TEST (10 minutes)

### Step 1: Stop Nginx to trigger "NginxServerDown" Alert

```bash
docker compose -f app-docker-compose.yml stop nginx
```

This will make Prometheus detect Nginx as DOWN.

### Step 2: Wait 35 seconds

The alert rule requires `for: 30s`, so wait at least 35 seconds for the alert to fire.

```bash
sleep 35
```

### Step 3: Verify Alert in Prometheus

```bash
# Open http://localhost:9090/alerts in browser
# OR query via CLI:
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | python3 -m json.tool

# Should show: "1609344000" "0"  ← value is 0 (Nginx DOWN)
```

### Step 4: Verify Alert in Alertmanager

```bash
# Open http://localhost:9093 in browser
# OR query via CLI:
curl -s 'http://localhost:9093/api/v1/alerts' | python3 -m json.tool

# Should show: "NginxServerDown" in "Firing" state
```

### Step 5: Check Email Alert

**Check Alertmanager logs for email delivery:**
```bash
docker logs alertmanager -f --tail=50 | grep -i email
```

**Check your Gmail inbox:**
- Recipient: `tailieuhust175@gmail.com`
- Expected sender: `besttulen05@gmail.com`
- Subject: `[NginxServerDown] Alert: firing`

The email should arrive within 1-2 minutes.

### Step 6: Restart Nginx

```bash
docker compose -f app-docker-compose.yml up -d nginx
sleep 30

# Verify recovery in Prometheus
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | python3 -m json.tool
# Should show: "1" (Nginx UP)
```

---

## 🌐 Test Vercel App Monitoring

### Test 1: Check Blackbox Exporter

```bash
# Verify blackbox exporter is running
curl -s http://localhost:9115 | head -5
```

### Test 2: Manually Probe Vercel App

```bash
curl 'http://localhost:9115/probe?target=https://cozyapp.vercel.app&module=http_2xx'

# Output should include:
# probe_success 1    ← 1 means UP, 0 means DOWN
```

### Test 3: Check Prometheus Blackbox Metrics

In Prometheus UI (http://localhost:9090), query:

```promql
probe_success{job="blackbox"}
```

Should return: `1` (Vercel app is UP)

### Test 4: Trigger VercelAppDown Alert (Optional)

The alert fires automatically if Vercel app stops responding. To simulate:

```bash
# The alert will fire if probe_success == 0 for 30 seconds
# This happens naturally if Vercel goes down or if network is blocked

# Check Alertmanager for "VercelAppDown" alert
curl -s 'http://localhost:9093/api/v1/alerts' | grep VercelAppDown
```

---

## 📊 Complete Alert Testing Checklist

### Alert 1: NginxServerDown
- [x] Alert rule configured: `up{job="nginx"} == 0 for 30s`
- [x] **Test:** Stop Nginx, wait 35s, check Alertmanager
- [x] **Email test:** Verify email sent to inbox

### Alert 2: NginxHighErrorRate
- [ ] Alert rule configured: `error_rate > 5% for 5m`
- [ ] **Test:** Generate 500 errors, wait 5m, check Alertmanager

### Alert 3: NginxHighConnections
- [ ] Alert rule configured: `active_connections > 1000 for 5m`
- [ ] **Test:** Generate 1000+ connections, check Alertmanager

### Alert 4: NginxHighResponseTime
- [ ] Alert rule configured: `avg_response_time > 1s for 5m`
- [ ] **Test:** Slow down responses, check Alertmanager

### Alert 5: VercelAppDown
- [x] Alert rule configured: `probe_success == 0 for 30s`
- [ ] **Test:** Manually or wait for Vercel to go down

---

## 🔧 Troubleshooting

### Problem: Email not being sent

**Check SMTP configuration:**
```bash
docker exec alertmanager cat /tmp/alertmanager-config.yml | grep -A 5 global
```

Should show ACTUAL credentials, NOT `${VARIABLE}` placeholders.

**Check Alertmanager logs:**
```bash
docker logs alertmanager -f --tail=100 | grep -i "email\|smtp\|error"
```

**Verify SMTP credentials in .env:**
```bash
cat .env | grep SMTP
```

All values must be valid Gmail credentials.

### Problem: Prometheus not detecting Nginx down

**Check Prometheus targets:**
```bash
# Open http://localhost:9090/targets in browser
# Look for job="nginx" and verify status is "UP" or "DOWN"
```

**Check Prometheus scrape interval:**
- Default: 15 seconds
- Alert requires 30 seconds of being down before firing

### Problem: Vercel app not being probed

**Check blackbox exporter:**
```bash
docker logs blackbox-exporter -f --tail=50
```

**Verify Vercel URL in prometheus.yml:**
```bash
docker exec prometheus cat /etc/prometheus/prometheus.yml | grep -A 5 blackbox
```

Should show: `targets: ['https://cozyapp.vercel.app']`

### Problem: Container not found

**Create network if not exists:**
```bash
docker network create global-monitor-net
```

**Start containers:**
```bash
docker compose -f app-docker-compose.yml up -d
docker compose -f monitor-docker-compose.yml up -d
```

---

## 📚 Service URLs Reference

| Service | URL | Purpose |
|---------|-----|---------|
| Nginx Web | http://localhost:8080 | Main app |
| Nginx Metrics | http://localhost:8080/stub_status | Raw metrics |
| Prometheus | http://localhost:9090 | Query metrics & view alerts |
| Grafana | http://localhost:3000 | Dashboard visualization |
| Alertmanager | http://localhost:9093 | Alert routing & management |
| Blackbox Exporter | http://localhost:9115 | External app probing |

### Prometheus Useful Pages:
- Targets: http://localhost:9090/targets
- Alerts: http://localhost:9090/alerts
- Rules: http://localhost:9090/rules
- Graph: http://localhost:9090/graph

---

## 🎓 How It All Works Together

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR INFRASTRUCTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. NGINX WEB SERVER (localhost:8080)                      │
│     └─ Runs web app                                         │
│     └─ Exposes metrics: /stub_status                        │
│                                                             │
│  2. NGINX EXPORTER                                         │
│     └─ Scrapes: /stub_status                               │
│     └─ Converts to Prometheus format                        │
│     └─ Exposes at: localhost:9113/metrics                   │
│                                                             │
│  3. VERCEL APP (https://cozyapp.vercel.app)                │
│     └─ Cloud-hosted application                            │
│                                                             │
│  4. BLACKBOX EXPORTER (localhost:9115)                     │
│     └─ Probes: https://cozyapp.vercel.app                  │
│     └─ Checks: HTTP status, latency, SSL cert              │
│     └─ Exposes metrics: probe_success, probe_duration      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│              PROMETHEUS (localhost:9090)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Scrapes metrics every 15 seconds:                         │
│  - From Nginx Exporter (9113)                             │
│  - From Blackbox Exporter (9115)                          │
│  - From Prometheus itself (9090)                           │
│                                                             │
│  Stores time-series data in database                       │
│  Evaluates alert rules every 15 seconds                    │
│                                                             │
│  Alert Rules:                                              │
│  - NginxServerDown: up{job="nginx"} == 0 for 30s          │
│  - NginxHighErrorRate: error_rate > 5% for 5m             │
│  - NginxHighConnections: connections > 1000 for 5m        │
│  - NginxHighResponseTime: response_time > 1s for 5m       │
│  - VercelAppDown: probe_success == 0 for 30s              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│           ALERTMANAGER (localhost:9093)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Receives firing alerts from Prometheus                    │
│  Groups alerts by: alertname, instance, severity           │
│  Routes to receivers (email in this case)                  │
│                                                             │
│  SMTP Configuration (substituted at startup):              │
│  - Server: smtp.gmail.com:587                             │
│  - Username: wwkuro175@gmail.com                           │
│  - Password: xtwp qhcy txjq fkba                           │
│  - From: besttulen05@gmail.com                             │
│  - To: tailieuhust175@gmail.com                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                   GMAIL SMTP SERVER                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Sends email alerts to: tailieuhust175@gmail.com           │
│  Email contains:                                            │
│  - Alert name: NginxServerDown, NginxHighErrorRate, etc.   │
│  - Alert status: Firing / Resolved                         │
│  - Alert details: instance, severity, annotations          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                   YOUR EMAIL INBOX                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Alert notifications arrive here!                          │
│  Expected subject: [AlertName] Alert: firing               │
│  Expected content: HTML with details                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

VISUALIZATION:
┌─────────────────────────────────────────────────────────────┐
│                    GRAFANA (localhost:3000)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Dashboards:                                               │
│  - Nginx Monitor-Dashboard (real-time metrics)             │
│  - Alert status indicators                                 │
│  - Performance graphs                                      │
│                                                             │
│  Data sources:                                             │
│  - Prometheus (metrics)                                    │
│  - Alertmanager (alert status)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Next Steps

1. **Run the quick test** to verify all services
2. **Trigger NginxServerDown alert** by stopping Nginx
3. **Check your email inbox** for alert notification
4. **Verify Grafana dashboard** is showing real-time data
5. **Monitor logs** to understand the system behavior

All tests should work perfectly! The SMTP configuration fix ensures emails are sent with proper Gmail credentials.

Happy monitoring! 🎉
