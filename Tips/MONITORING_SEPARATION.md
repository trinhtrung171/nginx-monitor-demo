# ✅ Separation Complete: Nginx Local vs Vercel App Monitoring

## 🎯 What Changed

**Before:** Blackbox probed both localhost:8080 and Vercel together
```yaml
- job_name: 'blackbox'
  targets: ['http://localhost:8080', 'https://cozyapp.vercel.app']
```

**After:** Separated into 2 distinct jobs
```yaml
- job_name: 'blackbox'          # ← Vercel only
  targets: ['https://cozyapp.vercel.app']

- job_name: 'blackbox-nginx'    # ← Nginx local only
  targets: ['http://localhost:8080']
```

## 📊 Current Monitoring Architecture

```
LOCAL MONITORING                 EXTERNAL MONITORING
═══════════════════════════════  ═════════════════════════════════

Nginx (localhost:8080)           Vercel App
        ↓                        (https://cozyapp.vercel.app)
        │                               ↓
        ├─→ nginx-exporter             │
        │   (port 9113)                │
        │   ↓                          │
        │ [metrics: connections,      │
        │  requests, errors, etc]      │
        │                              │
        ├─→ blackbox-nginx            │
        │   (HTTP direct probe)    ←───┘
        │   ↓
        │ [probe_success for
        │  http://localhost:8080]
        │
        └─→ blackbox
            (HTTP probe via blackbox-exporter)
            ↓
            [probe_success for
             https://cozyapp.vercel.app]

                    ↓
            PROMETHEUS (localhost:9090)
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
   GRAFANA DASHBOARDS      ALERTMANAGER
   (Visualization)         (Email Alerts)
        ↓                       ↓
   - Nginx Monitor         Alerts:
   - Vercel Monitoring     - NginxServerDown
                          - NginxHttpProbeDown
                          - VercelAppDown
```

## 🔍 Jobs in Prometheus

### Job 1: `blackbox` (Vercel)
```yaml
job_name: 'blackbox'
instance: 'https://cozyapp.vercel.app'
metrics:
  - probe_success (1=up, 0=down)
  - probe_duration_seconds
  - probe_http_status_code
  - probe_ssl_earliest_cert_expiry
```

### Job 2: `blackbox-nginx` (Nginx Local)
```yaml
job_name: 'blackbox-nginx'
instance: 'http://localhost:8080'
metrics:
  - probe_success (1=up, 0=down)
  - probe_duration_seconds
  - probe_http_status_code
```

### Job 3: `nginx` (Nginx Exporter)
```yaml
job_name: 'nginx'
instance: 'nginx-exporter:9113'
metrics:
  - up (1=exporter responsive, 0=exporter down)
  - nginx_connections_active
  - nginx_http_requests_total
  - nginx_connections_accepted_total
  - [100+ more detailed metrics]
```

## 🎯 Alert Rules

```
┌─ NginxServerDown
│  └─ Triggers when: up{job="nginx"} == 0 OR absent(up{job="nginx"})
│  └─ Meaning: Nginx container or exporter is down
│
├─ NginxHttpProbeDown ← NEW (Fixes "stop vs down" issue!)
│  └─ Triggers when: probe_success{job="blackbox-nginx"} == 0
│  └─ Meaning: HTTP port 8080 not responding
│  └─ Detects: docker stop, port blocked, crashes
│
├─ NginxHighErrorRate
│  └─ Triggers when: error_rate > 5% for 5m
│
├─ NginxHighConnections
│  └─ Triggers when: active_connections > 1000 for 5m
│
├─ NginxHighResponseTime
│  └─ Triggers when: avg_response_time > 1s for 5m
│
└─ VercelAppDown
   └─ Triggers when: probe_success{job="blackbox"} == 0
   └─ Meaning: Vercel app not responding
```

## 📈 Why This is Better

| Aspect | Before | After |
|--------|--------|-------|
| **Organization** | Mixed in one job | Separated into 2 jobs |
| **Clarity** | Confusing labels | Clear: blackbox=Vercel, blackbox-nginx=local |
| **Nginx Detection** | Misses "stop" events | ✅ Catches all failures |
| **Dashboard** | Show both together | Can have separate dashboards |
| **Scaling** | Hard to add more | Easy to add more local services |
| **Metrics** | Limited to probe | + Full nginx-exporter metrics |

## 🧪 Testing

### Test 1: Stop Nginx (NOW WORKS!)
```bash
docker compose -f app-docker-compose.yml stop nginx
# After 35 seconds:
# ✅ NginxServerDown fires (exporter unreachable)
# ✅ NginxHttpProbeDown fires (port 8080 unreachable)
# ✅ Email alerts sent!
```

### Test 2: Restart Nginx
```bash
docker compose -f app-docker-compose.yml start nginx
# After ~30 seconds:
# ✅ Alerts resolve automatically
```

### Test 3: Monitor Vercel Separately
```bash
# In Prometheus, query:
probe_success{job="blackbox"}
# Only shows Vercel status, not Nginx
```

### Test 4: Monitor Nginx Separately
```bash
# In Prometheus, query:
probe_success{job="blackbox-nginx"}
# Only shows Nginx local status
```

## 📊 Grafana Dashboards

Now you can create:

**Dashboard 1: Nginx Monitor**
- Nginx status (blackbox-nginx + nginx exporter)
- Connection metrics
- Request rates
- Error rates
- Response times

**Dashboard 2: Vercel App Monitoring**
- Vercel probe status
- Response times
- SSL cert expiry
- Uptime percentage
- Incident history

**Dashboard 3: Full Stack**
- Both Nginx and Vercel
- Comparison metrics
- Combined alerts

## 🚀 Future Enhancements

Now you can easily add more:

```yaml
# Example: Add more services
- job_name: 'blackbox-api'
  targets: ['http://localhost:3000/health']

- job_name: 'blackbox-database'
  targets: ['tcp://localhost:5432']

- job_name: 'blackbox-cache'
  targets: ['tcp://localhost:6379']
```

## 📝 Files Modified

✅ `prometheus/prometheus.yml`
- Split blackbox into 2 jobs
- Clear job names and labels

✅ `prometheus/alert_rules.yml`
- Updated job reference from `blackbox` to `blackbox-nginx`
- Kept alert logic intact

## ✨ Summary

- ✅ Nginx local monitoring: Separate job `blackbox-nginx`
- ✅ Vercel app monitoring: Dedicated job `blackbox`
- ✅ Alert firing: NOW works correctly with `docker compose stop`
- ✅ Scalable: Easy to add more services
- ✅ Clear: Labels and job names are descriptive
- ✅ Organized: Metrics properly separated
