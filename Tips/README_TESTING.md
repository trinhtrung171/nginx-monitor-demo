# 🎉 Complete Testing Setup - Summary & How To Use

## 📊 What You Have

Your monitoring stack includes:

### 🌐 Applications
- **Nginx Web Server** - Main app running on `http://localhost:8080`
- **Vercel App** - Monitoring `https://cozyapp.vercel.app`

### 📈 Monitoring Components
- **Prometheus** - Collects metrics every 15 seconds
- **Grafana** - Visualizes metrics on dashboards
- **Alertmanager** - Routes alerts via email
- **Blackbox Exporter** - Probes external apps (like Vercel)

### 📧 Email Alerts
- Configured with **Gmail SMTP**
- Sends alerts to: `tailieuhust175@gmail.com`
- From: `besttulen05@gmail.com`
- With app-specific password: `xtwp qhcy txjq fkba`

---

## 🚀 3-Step Quick Start

### Step 1: Start Everything
```bash
docker compose -f app-docker-compose.yml up -d
docker compose -f monitor-docker-compose.yml up -d
```

### Step 2: Trigger Test Alert
```bash
docker compose -f app-docker-compose.yml stop nginx
sleep 35
# Check Alertmanager: http://localhost:9093
```

### Step 3: Check Email
- Inbox: `tailieuhust175@gmail.com`
- Look for email from: `besttulen05@gmail.com`
- Subject: `[NginxServerDown] Alert: firing`

---

## 📚 Documentation Files

You have **4 comprehensive guides** in your project:

### 1. **QUICK_START_TEST.md** ⚡
**Best for:** Getting started quickly  
**Contains:**
- 5-minute quick tests
- Step-by-step alert trigger instructions
- Email verification steps
- Quick troubleshooting
- Complete system diagram

**Read this first!**

### 2. **TESTING_GUIDE.md** 📖
**Best for:** Deep dive and detailed testing  
**Contains:**
- All service verification steps
- Complete test scenarios
- Prometheus query examples
- Alert trigger methods
- Load testing instructions
- Dashboard verification
- Complete troubleshooting guide

**Read this for detailed testing**

### 3. **COMMANDS_REFERENCE.md** 💾
**Best for:** Copy-paste commands  
**Contains:**
- Quick commands for every task
- One-liners for common scenarios
- Troubleshooting commands
- Browser URL reference
- Common issue solutions

**Use this as a reference while testing**

### 4. **README.md** 📋
**Best for:** Understanding the architecture  
**Contains:**
- System architecture explanation
- Component descriptions
- Setup instructions
- Service URLs

---

## 🧪 Testing Workflow

```
START HERE
    ↓
Read: QUICK_START_TEST.md
    ↓
Run: 3-Step Quick Start (above)
    ↓
✅ Everything working?
    ├─ YES → Congratulations! 🎉
    ├─ NO → Read: QUICK_START_TEST.md troubleshooting section
    └─ Still stuck? → Use: COMMANDS_REFERENCE.md troubleshooting commands
    ↓
Need detailed testing?
    ↓
Read: TESTING_GUIDE.md
    ↓
Try: Complete test scenarios
    ↓
All working? 🎊 → You're done!
```

---

## ✅ What's Already Fixed

✅ **SMTP Configuration Issue - SOLVED**

**The Problem:** 
- Alertmanager was using placeholder variables `${SMTP_USERNAME}` instead of actual credentials
- Gmail SMTP authentication was failing with "Username and Password not accepted"

**The Solution:**
- Fixed `alertmanager/alertmanager.yml` to use `${VAR}` placeholders
- Fixed `monitor-docker-compose.yml` entrypoint with proper environment variable substitution
- Used `sed` command with correct YAML escaping: `$${VAR}`

**Verification:**
```bash
docker exec alertmanager cat /tmp/alertmanager-config.yml | grep smtp
# Shows: smtp_auth_username: wwkuro175@gmail.com ✅ (not ${VARIABLE})
```

---

## 🎯 Testing Checklist

Use this checklist to verify everything works:

### Infrastructure
- [ ] All containers running: `docker ps -a`
- [ ] Network exists: `docker network ls`
- [ ] Nginx web accessible: `http://localhost:8080`

### Monitoring
- [ ] Prometheus accessible: `http://localhost:9090`
- [ ] Grafana accessible: `http://localhost:3000`
- [ ] Alertmanager accessible: `http://localhost:9093`
- [ ] Prometheus scraping Nginx: Query `up{job="nginx"}` returns `1`

### Configuration
- [ ] SMTP config has real emails (not `${VAR}` placeholders)
- [ ] All 4 alert rules loaded in Prometheus
- [ ] Alertmanager has email receiver configured

### Alerts
- [ ] Can trigger NginxServerDown alert (stop Nginx, wait 35s)
- [ ] Alert appears in Alertmanager UI
- [ ] Email sent to inbox (check in 1-2 minutes)
- [ ] Email has correct sender, recipient, and subject

### Vercel Monitoring
- [ ] Blackbox exporter running: `http://localhost:9115`
- [ ] Vercel app probed: `probe_success{job="blackbox"}` in Prometheus
- [ ] VercelAppDown alert triggers if app goes down

### Grafana Dashboard
- [ ] Dashboard displays live Nginx metrics
- [ ] Alert indicators show current state
- [ ] All graphs showing data (not empty)

---

## 🎓 Learning Outcomes

After testing everything, you'll understand:

1. **Prometheus**: Scrapes metrics, evaluates alert rules, exposes metrics API
2. **Alertmanager**: Routes alerts, groups them, sends emails via SMTP
3. **Grafana**: Visualizes Prometheus metrics on dashboards
4. **Blackbox Exporter**: Probes external endpoints (like Vercel)
5. **Email Alerts**: Complete flow from metric → alert → email
6. **Docker**: Multi-container applications with proper networking
7. **Environment Variables**: How Docker, YAML, and shell interact
8. **Monitoring as Code**: Infrastructure defined in YAML files

---

## 🚀 Next Steps After Testing

### 1. **Customize for Your Apps**
- Change Vercel URL in `.env` and `prometheus/prometheus.yml`
- Add more exporters (Redis, PostgreSQL, etc.)
- Create custom dashboards in Grafana

### 2. **Set Up Production Alerts**
- Add more alert rules for your metrics
- Configure multiple email recipients
- Set up Slack/PagerDuty integrations
- Adjust alert thresholds based on your baselines

### 3. **Enhance Monitoring**
- Add log aggregation with Loki/Promtail
- Set up tracing with Jaeger
- Create SLOs (Service Level Objectives)
- Add runbooks to your alerts

### 4. **Deploy to Cloud**
- Push Docker images to registry
- Deploy to Kubernetes with Helm
- Use managed services (AWS CloudWatch, GCP Monitoring)

---

## 📞 Quick Help

### Problem: Services not starting
```bash
# Create network
docker network create global-monitor-net

# Start services
docker compose -f app-docker-compose.yml up -d
docker compose -f monitor-docker-compose.yml up -d
```

### Problem: Email not being sent
```bash
# Check SMTP config
docker exec alertmanager cat /tmp/alertmanager-config.yml | grep -A 5 global

# Check Alertmanager logs
docker logs alertmanager -f --tail=100 | grep -i email
```

### Problem: Prometheus not scraping
```bash
# Check targets
curl -s 'http://localhost:9090/api/v1/targets' | python3 -m json.tool

# Or open browser
# http://localhost:9090/targets
```

### Problem: Need commands to test?
```bash
# Use the reference guide
cat COMMANDS_REFERENCE.md
```

---

## 📊 System Overview

```
┌─────────────────────────────────────────────┐
│         YOUR APPLICATIONS                   │
├─────────────────────────────────────────────┤
│ • Nginx (localhost:8080)                   │
│ • Vercel App (https://cozyapp.vercel.app)  │
└─────────────────────────────────────────────┘
           ↓ (metrics)
┌─────────────────────────────────────────────┐
│         PROMETHEUS (localhost:9090)         │
├─────────────────────────────────────────────┤
│ • Scrapes metrics every 15s                │
│ • Stores time-series data                  │
│ • Evaluates alert rules                    │
│ • Exposes metrics API                      │
└─────────────────────────────────────────────┘
    ↙ (metrics)    ↓ (alerts)    ↘ (data)
    │               │               │
    ↓               ↓               ↓
┌─────────┐  ┌──────────────┐  ┌─────────┐
│ GRAFANA │  │ ALERTMANAGER │  │ LOKI    │
│ (3000)  │  │   (9093)     │  │ (3100)  │
└─────────┘  └──────────────┘  └─────────┘
                   ↓ (emails)
             ┌──────────────┐
             │  GMAIL SMTP  │
             └──────────────┘
                   ↓
             ┌──────────────┐
             │ YOUR INBOX   │
             └──────────────┘
```

---

## 🎉 Ready to Test?

1. **Start here:** Read `QUICK_START_TEST.md`
2. **Quick test:** Run the 3-step quick start (above)
3. **Deep dive:** Read `TESTING_GUIDE.md` when ready
4. **Reference:** Use `COMMANDS_REFERENCE.md` for any command

**Good luck! Your monitoring stack is ready! 🚀**

---

**Files Created:**
- ✅ `QUICK_START_TEST.md` - Quick reference for testing
- ✅ `TESTING_GUIDE.md` - Comprehensive testing guide
- ✅ `COMMANDS_REFERENCE.md` - Command reference
- ✅ `test-all.sh` - Automated test script
- ✅ `quick-test.sh` - Quick test script
- ✅ `README_TESTING.md` - This file

**Status:** ✅ All services running
**SMTP Config:** ✅ Properly substituted
**Ready to test:** ✅ YES!

Last updated: 5 May 2026
