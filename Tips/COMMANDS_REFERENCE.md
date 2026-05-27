# ⚡ Quick Command Reference - Testing & Troubleshooting

## 🚀 Quick Commands

### Start Everything
```bash
docker compose -f app-docker-compose.yml up -d
docker compose -f monitor-docker-compose.yml up -d
```

### Stop Everything
```bash
docker compose -f app-docker-compose.yml down
docker compose -f monitor-docker-compose.yml down
```

### Check All Containers
```bash
docker ps -a | grep -E 'nginx|prometheus|grafana|alertmanager|blackbox'
```

### View Logs
```bash
# Alertmanager (SMTP/Email)
docker logs alertmanager -f --tail=50

# Prometheus (Metrics/Alerts)
docker logs prometheus -f --tail=50

# Blackbox (Vercel probing)
docker logs blackbox-exporter -f --tail=50

# All services
docker compose -f app-docker-compose.yml logs -f
docker compose -f monitor-docker-compose.yml logs -f
```

---

## 🧪 Testing Commands

### Test Nginx
```bash
# Web access
curl http://localhost:8080

# Metrics endpoint
curl http://localhost:8080/stub_status
```

### Test Prometheus
```bash
# Query Nginx status
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | python3 -m json.tool

# Query active connections
curl -s 'http://localhost:9090/api/v1/query?query=nginx_connections_active' | python3 -m json.tool

# Query error rate
curl -s 'http://localhost:9090/api/v1/query?query=rate(nginx_http_requests_total{status=~"5.."}[5m])' | python3 -m json.tool
```

### Test Alertmanager
```bash
# Check SMTP config (should show real credentials, not placeholders)
docker exec alertmanager cat /tmp/alertmanager-config.yml | head -15

# Get all alerts via API
curl -s 'http://localhost:9093/api/v1/alerts' | python3 -m json.tool

# Get active alerts only
curl -s 'http://localhost:9093/api/v1/alerts?active=true' | python3 -m json.tool
```

### Test Vercel App
```bash
# Probe Vercel app
curl 'http://localhost:9115/probe?target=https://cozyapp.vercel.app&module=http_2xx'

# Check Vercel status in Prometheus
curl -s 'http://localhost:9090/api/v1/query?query=probe_success{job="blackbox"}' | python3 -m json.tool
```

---

## 🚨 Alert Testing

### Trigger NginxServerDown Alert
```bash
# Step 1: Stop Nginx
docker compose -f app-docker-compose.yml stop nginx

# Step 2: Wait 35 seconds
sleep 35

# Step 3: Verify alert fired
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | grep -o '"value":\[[^]]*\]' | head -1

# Step 4: Check Alertmanager
curl -s 'http://localhost:9093/api/v1/alerts' | grep -o '"alertname":"[^"]*"'

# Step 5: Check email inbox - tailieuhust175@gmail.com

# Step 6: Restart Nginx
docker compose -f app-docker-compose.yml up -d nginx
```

### Trigger High Load Alert
```bash
# Generate connections
for i in {1..100}; do curl http://localhost:8080 &; done

# Query connections
curl -s 'http://localhost:9090/api/v1/query?query=nginx_connections_active' | python3 -m json.tool
```

---

## 🔧 Troubleshooting Commands

### Verify SMTP Credentials
```bash
# Check if substituted correctly (should be real emails, not ${VAR})
docker exec alertmanager cat /tmp/alertmanager-config.yml | grep -E 'smtp_auth_username|smtp_auth_password|smtp_from'

# Expected output:
# smtp_auth_username: wwkuro175@gmail.com
# smtp_auth_password: xtwp qhcy txjq fkba
# smtp_from: besttulen05@gmail.com
```

### Check Prometheus Targets
```bash
# Get all targets status
curl -s 'http://localhost:9090/api/v1/targets' | python3 -m json.tool | grep -A 5 'job_name\|state'

# Or open in browser:
# http://localhost:9090/targets
```

### Check Alert Rules
```bash
# Get all rules
curl -s 'http://localhost:9090/api/v1/rules' | python3 -m json.tool | head -50

# Or open in browser:
# http://localhost:9090/rules
```

### Check Docker Network
```bash
# Verify network exists
docker network ls | grep global-monitor-net

# Create if missing
docker network create global-monitor-net

# Inspect network
docker network inspect global-monitor-net
```

### Test SMTP Connectivity
```bash
# Install mail tools if needed (macOS)
brew install mailutils

# Test email sending
echo "Test alert from monitoring system" | \
  mail -S smtp=smtp.gmail.com:587 \
       -S smtp-use-starttls \
       -S smtp-auth=login \
       -S smtp-auth-user=wwkuro175@gmail.com \
       -S smtp-auth-password="xtwp qhcy txjq fkba" \
       -S from=besttulen05@gmail.com \
       tailieuhust175@gmail.com
```

---

## 📊 Browser URLs

| Service | URL |
|---------|-----|
| Nginx | http://localhost:8080 |
| Prometheus | http://localhost:9090 |
| Prometheus Targets | http://localhost:9090/targets |
| Prometheus Alerts | http://localhost:9090/alerts |
| Prometheus Rules | http://localhost:9090/rules |
| Grafana | http://localhost:3000 |
| Alertmanager | http://localhost:9093 |
| Blackbox Exporter | http://localhost:9115 |

---

## 📋 Environment Variables (.env)

```bash
# Docker Hub
DOCKERHUB_USERNAME=trinhtrung175

# SMTP/Email
SMTP_USERNAME=wwkuro175@gmail.com
SMTP_PASSWORD=xtwp qhcy txjq fkba
SMTP_FROM=besttulen05@gmail.com
SMTP_TO=tailieuhust175@gmail.com

# Grafana
GF_PASSWORD=trunghalo2005

# Vercel
VERCEL_URL=https://cozyapp.vercel.app
```

---

## 🎯 Common Scenarios

### Scenario 1: Email alerts not being sent
```bash
# 1. Check SMTP config
docker exec alertmanager cat /tmp/alertmanager-config.yml | grep smtp

# 2. Check Alertmanager logs
docker logs alertmanager -f --tail=100 | grep -i email

# 3. Verify credentials
cat .env | grep SMTP

# 4. Trigger test alert
docker compose -f app-docker-compose.yml stop nginx
sleep 35
docker logs alertmanager -f --tail=50
```

### Scenario 2: Prometheus not scraping Nginx
```bash
# 1. Check targets
curl -s 'http://localhost:9090/api/v1/targets' | python3 -m json.tool | grep -A 3 '"job":"nginx"'

# 2. Check Docker labels on nginx-exporter
docker inspect nginx-exporter | grep prometheus

# 3. Verify Prometheus config
docker exec prometheus cat /etc/prometheus/prometheus.yml | head -40
```

### Scenario 3: Vercel app not being monitored
```bash
# 1. Test blackbox exporter
curl 'http://localhost:9115/probe?target=https://cozyapp.vercel.app&module=http_2xx'

# 2. Check Prometheus config
docker exec prometheus cat /etc/prometheus/prometheus.yml | grep -A 5 blackbox

# 3. Check if Vercel app is accessible
curl -I https://cozyapp.vercel.app
```

### Scenario 4: Containers not starting
```bash
# 1. Check network
docker network ls | grep global-monitor-net
docker network create global-monitor-net

# 2. Check logs
docker compose -f app-docker-compose.yml logs
docker compose -f monitor-docker-compose.yml logs

# 3. Restart everything
docker compose -f app-docker-compose.yml down
docker compose -f monitor-docker-compose.yml down
docker compose -f app-docker-compose.yml up -d
docker compose -f monitor-docker-compose.yml up -d
```

---

## 📱 Mobile Monitoring

You can also monitor via your phone by accessing:

- **Prometheus:** `http://<your-machine-ip>:9090`
- **Grafana:** `http://<your-machine-ip>:3000`
- **Alertmanager:** `http://<your-machine-ip>:9093`

Replace `<your-machine-ip>` with your computer's IP address on the network.

---

## 🔐 Security Notes

- ⚠️ SMTP password is in `.env` file - keep it secure!
- ⚠️ Don't commit `.env` to git (it's in `.gitignore`)
- ⚠️ Use separate credentials for production
- ⚠️ Gmail requires "App Password" (not your account password)

---

## 📞 Need Help?

1. **Check logs first:**
   ```bash
   docker logs <container-name> -f --tail=100
   ```

2. **Check documentation:**
   - `QUICK_START_TEST.md` - Quick testing guide
   - `TESTING_GUIDE.md` - Detailed testing guide

3. **Common fixes:**
   - Network issue? → `docker network create global-monitor-net`
   - Container won't start? → Check logs with `docker logs`
   - Email not sending? → Verify SMTP config and credentials

---

**Last Updated:** 5 May 2026
**All Services Status:** ✅ Running
**SMTP Config:** ✅ Properly substituted with real credentials
