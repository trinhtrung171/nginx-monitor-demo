#!/bin/bash
# Quick Test - Run these commands one by one

echo "🧪 Quick Monitoring Stack Tests"
echo "================================\n"

echo "1️⃣  CHECK CONTAINERS"
echo "   docker ps -a | grep -E 'nginx|prometheus|grafana|alertmanager|blackbox'"
docker ps -a | grep -E 'nginx|prometheus|grafana|alertmanager|blackbox' || echo "   (no containers found)"

echo "\n2️⃣  TEST NGINX WEB"
echo "   curl http://localhost:8080 | head -20"
curl -s http://localhost:8080 | head -20 || echo "   ❌ Failed to connect"

echo "\n3️⃣  TEST NGINX STATUS"
echo "   curl http://localhost:8080/stub_status"
curl -s http://localhost:8080/stub_status || echo "   ❌ Failed to connect"

echo "\n4️⃣  CHECK PROMETHEUS STATUS"
echo "   curl -s 'http://localhost:9090/api/v1/query?query=up{job=\"nginx\"}'"
curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | python3 -m json.tool 2>/dev/null || echo "   (Prometheus not ready yet)"

echo "\n5️⃣  CHECK ALERTMANAGER SMTP CONFIG"
echo "   docker exec alertmanager cat /tmp/alertmanager-config.yml | grep smtp"
docker exec alertmanager cat /tmp/alertmanager-config.yml 2>/dev/null | grep -A 5 "smtp" || echo "   ❌ Container not ready"

echo "\n6️⃣  QUICK URL REFERENCE"
echo "   📊 Prometheus:      http://localhost:9090"
echo "   📈 Grafana:         http://localhost:3000"
echo "   🔔 Alertmanager:    http://localhost:9093"
echo "   🌐 Nginx:           http://localhost:8080"
echo "   📡 Blackbox:        http://localhost:9115"

echo "\n7️⃣  TO TRIGGER ALERT"
echo "   docker compose -f app-docker-compose.yml stop nginx"
echo "   sleep 35"
echo "   # Check http://localhost:9093 and your inbox"
echo "   docker compose -f app-docker-compose.yml up -d nginx"

echo "\nDone! ✅"
