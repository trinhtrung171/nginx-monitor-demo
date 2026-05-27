#!/bin/bash
# Test script để verify Alertmanager email functionality

set -e

echo "🧪 Testing Alertmanager Email Configuration"
echo "============================================="
echo ""

# Check if docker is running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found"
    exit 1
fi

# Check .env file
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    exit 1
fi

echo "✅ Loading .env configuration..."
source .env

# Validate SMTP credentials
echo ""
echo "📧 SMTP Configuration:"
echo "  Username: $SMTP_USERNAME"
echo "  From: $SMTP_FROM"
echo "  To: $SMTP_TO"
echo "  (Password: ***hidden***)"

# Check if alertmanager container exists
echo ""
echo "🐳 Checking Alertmanager container..."
if docker ps | grep -q alertmanager; then
    echo "✅ Alertmanager is running"
    ALERTMANAGER_UP=true
else
    echo "⚠️  Alertmanager is not running"
    echo "   Run: docker compose -f monitor-docker-compose.yml up -d"
    ALERTMANAGER_UP=false
fi

# Test Alertmanager API
if [ "$ALERTMANAGER_UP" = true ]; then
    echo ""
    echo "🔗 Testing Alertmanager API..."
    RESPONSE=$(curl -s http://localhost:9093/-/healthy)
    if [ "$RESPONSE" = "Alertmanager is Healthy." ]; then
        echo "✅ Alertmanager API is healthy"
    else
        echo "❌ Alertmanager API returned: $RESPONSE"
    fi
    
    # Get alert count
    ALERT_COUNT=$(curl -s http://localhost:9093/api/v1/alerts | grep -o '"status"' | wc -l)
    echo "📊 Current alerts: $ALERT_COUNT"
fi

# Manual email test
echo ""
echo "📮 To manually test email:"
echo "1. Trigger an alert by making app unavailable"
echo "2. Open Prometheus UI: http://localhost:9090"
echo "3. Go to Alerts tab"
echo "4. Wait for alert to fire (30-60 seconds)"
echo "5. Check if email arrives in: $SMTP_TO"
echo ""
echo "Or use curl to trigger test alert:"
cat << 'EOF'

# Create test alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "critical"
    },
    "annotations": {
      "summary": "Test alert from monitoring system",
      "description": "This is a test email alert"
    }
  }]'

EOF

echo ""
echo "🔍 Troubleshooting:"
echo "1. Check Alertmanager logs:"
echo "   docker compose -f monitor-docker-compose.yml logs -f alertmanager"
echo ""
echo "2. Verify Gmail App Password:"
echo "   - Go to https://myaccount.google.com/apppasswords"
echo "   - Generate new app password if needed"
echo "   - Update SMTP_PASSWORD in .env"
echo ""
echo "3. Check email spam folder"
echo "   - Gmail sometimes puts alerts in spam"
echo "   - Whitelist sender address: $SMTP_FROM"
echo ""
echo "4. Verify firewall/network"
echo "   - Gmail SMTP requires port 587 open"
echo "   - Test from container: docker compose exec alertmanager nc -zv smtp.gmail.com 587"
echo ""
echo "✅ Test script completed!"
