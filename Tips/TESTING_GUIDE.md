# 🧪 Complete Testing Guide - Monitoring Stack

This guide will help you test **Vercel App**, **Nginx App**, **Alertmanager**, and **Email Alerts** end-to-end.

---

## 📋 Prerequisites

- ✅ Docker and Docker Compose installed
- ✅ `.env` file configured with SMTP credentials
- ✅ Network `global-monitor-net` created (run: `docker network create global-monitor-net`)
- ✅ All containers running smoothly

---

## 🚀 Step 1: Verify All Services Are Running

### Check if all containers are up:

```bash
# Check all running containers
docker ps -a | grep -E "nginx|prometheus|grafana|alertmanager|blackbox"

# You should see:
# - nginx-server (port 8080)
# - nginx-exporter
# - prometheus (port 9090)
# - grafana (port 3000)
# - alertmanager (port 9093)
# - blackbox-exporter (port 9115)
```

### View logs of all services:

```bash
# Prometheus logs
docker logs prometheus -f --tail=20

# Alertmanager logs
docker logs alertmanager -f --tail=20

# Blackbox exporter logs
docker logs blackbox-exporter -f --tail=20
```

---

## 🌍 Step 2: Test Nginx Application

### 2.1 Access Nginx Web Page

```bash
# Open in browser or curl
curl http://localhost:8080

# You should see the custom Nginx page
```

### 2.2 Check Nginx Metrics (Raw)

```bash
# View raw Nginx stub_status
curl http://localhost:8080/stub_status

# Output should look like:
# Active connections: X
# server accepts handled requests
#  X X X
# Reading: X Writing: X Waiting: X
```

### 2.3 Check Nginx Exporter

```bash
# View Prometheus-formatted metrics
curl http://localhost:9113/metrics | head -30

# Look for metrics like:
# - nginx_connections_active
# - nginx_http_requests_total
# - nginx_connections_accepted_total
```

---

## 📊 Step 3: Test Prometheus

### 3.1 Access Prometheus UI

```bash
# Open in browser
open http://localhost:9090
# Or on Linux: firefox http://localhost:9090
```

### 3.2 Query Nginx Metrics in Prometheus

In the Prometheus UI, try these queries:

**Query 1: Check if Nginx is up**
```promql
up{job="nginx"}
```
Expected result: `1` (up) or `0` (down)

**Query 2: Active connections**
```promql
nginx_connections_active
```

**Query 3: Request rate (requests per second)**
```promql
rate(nginx_http_requests_total[5m])
```

**Query 4: Error rate**
```promql
rate(nginx_http_requests_total{status=~"5.."}[5m])
```

### 3.3 Check Alert Rules

In Prometheus UI, go to **Alerts** tab and look for:
- `NginxServerDown` - fires when `up{job="nginx"} == 0`
- `NginxHighErrorRate` - fires when error rate > 5%
- `NginxHighConnections` - fires when active connections > 1000
- `NginxHighResponseTime` - fires when avg response > 1s
- `VercelAppDown` - fires when Vercel app doesn't respond

---

## 🔔 Step 4: Test Alertmanager

### 4.1 Verify Alertmanager Configuration

Check that SMTP credentials are properly substituted:

```bash
# View the generated config file
docker exec alertmanager cat /tmp/alertmanager-config.yml | head -20

# You should see:
# smtp_auth_username: wwkuro175@gmail.com (NOT ${SMTP_USERNAME})
# smtp_auth_password: xtwp qhcy txjq fkba (NOT ${SMTP_PASSWORD})
# smtp_from: besttulen05@gmail.com (NOT ${SMTP_FROM})
```

### 4.2 Access Alertmanager UI

```bash
# Open in browser
open http://localhost:9093
# Or on Linux: firefox http://localhost:9093
```

In the Alertmanager UI:
- Check **Alerts** tab to see active alerts
- Check **Status** to verify SMTP configuration

---

## ✉️ Step 5: Test Email Alerts

### 5.1 Trigger NginxServerDown Alert

**Stop the Nginx container:**

```bash
# This will make Prometheus detect Nginx as down
docker compose -f app-docker-compose.yml stop nginx
```

**Wait 30 seconds** (the alert rule has `for: 30s`)

**Check in Prometheus:**
```bash
# Query this in Prometheus UI
up{job="nginx"}
# Should return: 0
```

**Check in Alertmanager UI:**
- Go to `http://localhost:9093`
- You should see `NginxServerDown` alert in `Firing` state

**Check if email was sent:**
```bash
# Check Alertmanager logs for email delivery
docker logs alertmanager -f --tail=50

# Look for messages like:
# "successfully sent notification"
# "Email notification sent"
```

**Verify email in inbox:**
- Check the email account: `tailieuhust175@gmail.com`
- Look for email from: `besttulen05@gmail.com`
- Subject should contain: `[NginxServerDown] Alert: firing`

### 5.2 Trigger NginxHighConnections Alert (Optional)

Generate high load on Nginx:

```bash
# First, restart Nginx
docker compose -f app-docker-compose.yml up -d nginx

# Wait 15 seconds for Prometheus to detect it's up
sleep 15

# Generate 1000+ concurrent connections using ApacheBench or ab
# Install: brew install httpd (macOS) or apt-get install apache2-utils (Linux)
ab -n 1000 -c 100 http://localhost:8080/

# Or use weighttp:
weighttp -n 10000 -c 1000 http://localhost:8080/
```

Then:
- Check Prometheus query: `nginx_connections_active`
- Check Alertmanager for `NginxHighConnections` alert
- Verify email is sent

### 5.3 Trigger NginxHighErrorRate Alert (Optional)

Make Nginx return 500 errors:

```bash
# Add a bad endpoint that returns errors
curl http://localhost:8080/bad-endpoint

# Or modify nginx.conf to add error responses
# Then reload the config
```

Then check:
- Prometheus query: `rate(nginx_http_requests_total{status=~"5.."}[5m])`
- Alertmanager for `NginxHighErrorRate` alert
- Verify email is sent

---

## 🌐 Step 6: Test Vercel App Monitoring

### 6.1 Verify Blackbox Exporter Configuration

```bash
# Check blackbox exporter is running
curl http://localhost:9115/

# Should return HTTP 200 with text
```

### 6.2 Test Vercel App Connectivity

```bash
# Probe the Vercel app directly
curl 'http://localhost:9115/probe?target=https://cozyapp.vercel.app&module=http_2xx'

# Should return metrics including:
# probe_success 1 (if the app is up)
```

### 6.3 Check Prometheus Metrics for Vercel

In Prometheus UI, query:

```promql
probe_success{job="blackbox"}
```

Expected result: `1` (app is up) or `0` (app is down)

### 6.4 Trigger VercelAppDown Alert (Optional)

The alert fires automatically if Vercel app stops responding. To simulate:

```bash
# Put Vercel URL on blocklist (requires firewall rule)
# Or wait for actual Vercel deployment issue

# Check if alert fires:
# - Prometheus: Look for "VercelAppDown" in Alerts tab
# - Alertmanager: http://localhost:9093
# - Email: Check inbox for alert notification
```

---

## 📊 Step 7: Test Grafana Dashboard

### 7.1 Access Grafana UI

```bash
# Open in browser
open http://localhost:3000
# Default credentials: admin / (password from .env)
```

### 7.2 View Nginx Dashboard

- Click on "Dashboards" in sidebar
- Find "Nginx Monitor-Dashboard"
- Should display:
  - Active connections graph
  - Request rate graph
  - Error rate graph
  - Response time graph
  - Current alerts

### 7.3 View Alertmanager Data Source

- Go to Dashboards > Nginx Monitor-Dashboard
- Verify Prometheus data source is connected (green checkmark)

---

## 🔧 Complete Test Scenario (End-to-End)

Run this complete test sequence:

```bash
#!/bin/bash

echo "=== STEP 1: Start all services ==="
docker compose -f app-docker-compose.yml up -d
docker compose -f monitor-docker-compose.yml up -d
sleep 30

echo "=== STEP 2: Verify Nginx is healthy ==="
curl http://localhost:8080 && echo "✅ Nginx responding"

echo "=== STEP 3: Check Prometheus metrics ==="
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | grep -q '1' && echo "✅ Prometheus can scrape Nginx"

echo "=== STEP 4: Stop Nginx to trigger alert ==="
docker compose -f app-docker-compose.yml stop nginx
sleep 35

echo "=== STEP 5: Check alert status ==="
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | grep -q '0' && echo "✅ Alert triggered (Nginx detected as down)"

echo "=== STEP 6: Check Alertmanager ==="
curl -s 'http://localhost:9093/api/v1/alerts' | grep -q 'NginxServerDown' && echo "✅ Alert in Alertmanager"

echo "=== STEP 7: Check email in inbox ==="
echo "📧 Check your email at: tailieuhust175@gmail.com for alert notification"
echo "   Expected sender: besttulen05@gmail.com"

echo "=== STEP 8: Restart Nginx ==="
docker compose -f app-docker-compose.yml up -d nginx
sleep 30
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | grep -q '1' && echo "✅ Nginx recovered"

echo "=== TEST COMPLETE ==="
```

---

## 🐛 Troubleshooting

### Email not being sent?

1. **Check SMTP credentials:**
   ```bash
   docker exec alertmanager cat /tmp/alertmanager-config.yml | grep smtp
   ```
   Should show actual email addresses, NOT `${VARIABLE}` placeholders.

2. **Verify alert is firing:**
   - Check Prometheus UI > Alerts tab
   - Query: `up{job="nginx"}` should return `0`

3. **Check Alertmanager logs:**
   ```bash
   docker logs alertmanager -f --tail=100 | grep -i email
   ```

4. **Test email config manually:**
   ```bash
   # Use mail utility to test SMTP
   echo "Test email" | mail -S smtp=smtp.gmail.com:587 -S smtp-use-starttls \
     -S smtp-auth=login -S smtp-auth-user=wwkuro175@gmail.com \
     -S smtp-auth-password="xtwp qhcy txjq fkba" \
     -S from=besttulen05@gmail.com \
     tailieuhust175@gmail.com
   ```

### Prometheus not scraping Nginx?

1. **Check Prometheus config:**
   ```bash
   docker exec prometheus cat /etc/prometheus/prometheus.yml
   ```

2. **Check targets in Prometheus UI:**
   - Go to http://localhost:9090/targets
   - Look for job="nginx"
   - Status should be "UP" (green)

3. **Check Docker labels:**
   ```bash
   docker inspect nginx-exporter | grep prometheus
   ```

### Vercel app alerts not firing?

1. **Verify blackbox exporter is running:**
   ```bash
   docker ps | grep blackbox
   ```

2. **Test probe manually:**
   ```bash
   curl 'http://localhost:9115/probe?target=https://cozyapp.vercel.app&module=http_2xx'
   ```

3. **Check Prometheus for blackbox metrics:**
   - Query: `probe_success{job="blackbox"}`

---

## ✅ Verification Checklist

- [ ] All containers running (`docker ps`)
- [ ] Nginx accessible at `http://localhost:8080`
- [ ] Prometheus accessible at `http://localhost:9090`
- [ ] Grafana accessible at `http://localhost:3000`
- [ ] Alertmanager accessible at `http://localhost:9093`
- [ ] Nginx metrics in Prometheus (query: `up{job="nginx"}`)
- [ ] Alert rules loaded in Prometheus
- [ ] Alertmanager has correct SMTP config
- [ ] Email sent when Nginx stops (check inbox)
- [ ] Vercel app being probed (query: `probe_success{job="blackbox"}`)
- [ ] Grafana dashboard showing live data

---

## 📚 Quick Reference URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Nginx Web | http://localhost:8080 | Main app |
| Nginx Status | http://localhost:8080/stub_status | Raw metrics |
| Prometheus | http://localhost:9090 | Metrics database & alerts |
| Grafana | http://localhost:3000 | Dashboard visualization |
| Alertmanager | http://localhost:9093 | Alert management & routing |
| Blackbox Exporter | http://localhost:9115 | External app probing |

---

## 🎓 Learning Points

- **Prometheus** scrapes metrics from exporters every 15 seconds
- **Alerts** are evaluated every 15 seconds, but require `for:` duration to fire
- **Alertmanager** groups alerts and routes them to receivers (email in this case)
- **Blackbox Exporter** probes external endpoints like Vercel apps
- **Grafana** visualizes data from Prometheus and shows alert status
- **Email alerts** require proper SMTP configuration and valid credentials

---

## 📞 Need Help?

Check container logs for detailed error messages:

```bash
# All services
docker compose -f app-docker-compose.yml logs -f
docker compose -f monitor-docker-compose.yml logs -f

# Specific service
docker logs <container-name> -f --tail=100
```

