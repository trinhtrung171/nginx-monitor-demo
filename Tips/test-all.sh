#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🧪 COMPLETE MONITORING STACK TEST     ${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 1: Check Docker Network
echo -e "${YELLOW}[TEST 1] Checking Docker network...${NC}"
if docker network ls | grep -q global-monitor-net; then
    echo -e "${GREEN}✅ Network 'global-monitor-net' exists${NC}\n"
else
    echo -e "${RED}❌ Network 'global-monitor-net' not found${NC}"
    echo "Creating network..."
    docker network create global-monitor-net
    echo -e "${GREEN}✅ Network created${NC}\n"
fi

# Test 2: Start containers
echo -e "${YELLOW}[TEST 2] Starting containers...${NC}"
docker compose -f app-docker-compose.yml up -d 2>/dev/null
docker compose -f monitor-docker-compose.yml up -d 2>/dev/null
sleep 30
echo -e "${GREEN}✅ Containers started${NC}\n"

# Test 3: Check all containers running
echo -e "${YELLOW}[TEST 3] Checking if all containers are running...${NC}"
containers=("nginx-server" "nginx-exporter" "prometheus" "grafana" "alertmanager" "blackbox-exporter")
all_running=true
for container in "${containers[@]}"; do
    if docker ps | grep -q "$container"; then
        echo -e "${GREEN}✅ $container is running${NC}"
    else
        echo -e "${RED}❌ $container is NOT running${NC}"
        all_running=false
    fi
done
echo ""

# Test 4: Test Nginx Web
echo -e "${YELLOW}[TEST 4] Testing Nginx web server...${NC}"
if curl -s http://localhost:8080 | grep -q "html"; then
    echo -e "${GREEN}✅ Nginx web server responding (http://localhost:8080)${NC}"
else
    echo -e "${RED}❌ Nginx not responding${NC}"
fi
echo ""

# Test 5: Test Nginx stub_status
echo -e "${YELLOW}[TEST 5] Checking Nginx metrics endpoint...${NC}"
if curl -s http://localhost:8080/stub_status | grep -q "Active connections"; then
    echo -e "${GREEN}✅ Nginx stub_status working${NC}"
    curl -s http://localhost:8080/stub_status | head -3
else
    echo -e "${RED}❌ Nginx stub_status not working${NC}"
fi
echo ""

# Test 6: Check Prometheus
echo -e "${YELLOW}[TEST 6] Testing Prometheus...${NC}"
if curl -s http://localhost:9090 | grep -q "Prometheus"; then
    echo -e "${GREEN}✅ Prometheus UI responding (http://localhost:9090)${NC}"
else
    echo -e "${RED}❌ Prometheus not responding${NC}"
fi
echo ""

# Test 7: Check Prometheus metrics
echo -e "${YELLOW}[TEST 7] Querying Prometheus for Nginx metrics...${NC}"
nginx_status=$(curl -s 'http://localhost:9090/api/v1/query?query=up{job="nginx"}' | grep -o '"value":\["[^"]*","[^"]*"\]' | grep -o '[01]"$' | tr -d '"')
if [ "$nginx_status" = "1" ]; then
    echo -e "${GREEN}✅ Nginx is UP in Prometheus (metric: up{job=\"nginx\"} = $nginx_status)${NC}"
elif [ "$nginx_status" = "0" ]; then
    echo -e "${YELLOW}⚠️  Nginx is DOWN in Prometheus (metric: up{job=\"nginx\"} = $nginx_status)${NC}"
else
    echo -e "${YELLOW}⚠️  Could not query Prometheus (data not yet available)${NC}"
fi
echo ""

# Test 8: Check Grafana
echo -e "${YELLOW}[TEST 8] Testing Grafana...${NC}"
if curl -s http://localhost:3000 | grep -q "grafana"; then
    echo -e "${GREEN}✅ Grafana UI responding (http://localhost:3000)${NC}"
else
    echo -e "${RED}❌ Grafana not responding${NC}"
fi
echo ""

# Test 9: Check Alertmanager
echo -e "${YELLOW}[TEST 9] Testing Alertmanager...${NC}"
if curl -s http://localhost:9093 | grep -q "alertmanager"; then
    echo -e "${GREEN}✅ Alertmanager UI responding (http://localhost:9093)${NC}"
else
    echo -e "${RED}❌ Alertmanager not responding${NC}"
fi
echo ""

# Test 10: Check SMTP configuration
echo -e "${YELLOW}[TEST 10] Verifying SMTP configuration...${NC}"
smtp_user=$(docker exec alertmanager cat /tmp/alertmanager-config.yml 2>/dev/null | grep "smtp_auth_username" | grep -o '[^ ]*@[^ ]*')
if [ -z "$smtp_user" ]; then
    echo -e "${RED}❌ Could not verify SMTP config${NC}"
elif [ "$smtp_user" = "${SMTP_USERNAME}" ] || [[ "$smtp_user" == *"@gmail.com" ]]; then
    echo -e "${GREEN}✅ SMTP username configured: $smtp_user${NC}"
else
    echo -e "${RED}❌ SMTP config contains placeholder: $smtp_user${NC}"
fi
echo ""

# Test 11: Check Blackbox Exporter
echo -e "${YELLOW}[TEST 11] Testing Blackbox Exporter...${NC}"
if curl -s http://localhost:9115 | grep -q "blackbox"; then
    echo -e "${GREEN}✅ Blackbox Exporter responding (http://localhost:9115)${NC}"
else
    echo -e "${RED}❌ Blackbox Exporter not responding${NC}"
fi
echo ""

# Test 12: Check Vercel probe
echo -e "${YELLOW}[TEST 12] Testing Vercel app probe...${NC}"
vercel_status=$(curl -s 'http://localhost:9115/probe?target=https://devshare-eta.vercel.app/&module=http_2xx' | grep "probe_success" | grep -o '[01]$')
if [ "$vercel_status" = "1" ]; then
    echo -e "${GREEN}✅ Vercel app is UP (probe_success = 1)${NC}"
elif [ "$vercel_status" = "0" ]; then
    echo -e "${RED}❌ Vercel app is DOWN (probe_success = 0)${NC}"
else
    echo -e "${YELLOW}⚠️  Could not probe Vercel app${NC}"
fi
echo ""

# Test 13: Check alert rules
echo -e "${YELLOW}[TEST 13] Checking Alert Rules...${NC}"
alert_count=$(curl -s 'http://localhost:9090/api/v1/rules' | grep -o '"name":"[^"]*"' | wc -l)
if [ "$alert_count" -gt 0 ]; then
    echo -e "${GREEN}✅ $alert_count alert rules loaded in Prometheus${NC}"
else
    echo -e "${RED}❌ No alert rules found${NC}"
fi
echo ""

# Test 14: Trigger test alert
echo -e "${YELLOW}[TEST 14] OPTIONAL: Trigger NginxServerDown Alert${NC}"
echo -e "${BLUE}To test alerts:${NC}"
echo "  1. Stop Nginx: docker compose -f app-docker-compose.yml stop nginx"
echo "  2. Wait 35 seconds"
echo "  3. Check Alertmanager: http://localhost:9093"
echo "  4. Check email inbox: tailieuhust175@gmail.com"
echo "  5. Restart Nginx: docker compose -f app-docker-compose.yml up -d nginx"
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  📊 QUICK ACCESS URLS                 ${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Nginx Web:${NC}        http://localhost:8080"
echo -e "${GREEN}Nginx Status:${NC}     http://localhost:8080/stub_status"
echo -e "${GREEN}Prometheus:${NC}       http://localhost:9090"
echo -e "${GREEN}Grafana:${NC}          http://localhost:3000"
echo -e "${GREEN}Alertmanager:${NC}     http://localhost:9093"
echo -e "${GREEN}Blackbox:${NC}         http://localhost:9115"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🧪 TEST COMPLETE                     ${NC}"
echo -e "${BLUE}========================================${NC}\n"

if [ "$all_running" = true ]; then
    echo -e "${GREEN}✅ All services are running!${NC}"
    echo -e "${GREEN}✅ Your monitoring stack is ready for testing!${NC}"
else
    echo -e "${RED}❌ Some containers are not running${NC}"
    echo -e "Run: ${YELLOW}docker compose -f app-docker-compose.yml logs${NC}"
    echo -e "Run: ${YELLOW}docker compose -f monitor-docker-compose.yml logs${NC}"
fi
echo ""
