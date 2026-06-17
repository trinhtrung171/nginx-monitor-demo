#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CERTS_DIR="${SCRIPT_DIR}/certs"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }
die()   { err "$1"; exit 1; }

# Guard clause
command -v openssl >/dev/null 2>&1 || die "openssl is required but not installed"

mkdir -p "$CERTS_DIR" && cd "$CERTS_DIR"

# ── 1. CA ──────────────────────────────────────────────────────────
info "Generating Certificate Authority (CA)..."
openssl req -x509 -newkey rsa:4096 \
  -keyout ca.key -out ca.crt \
  -days 3650 -nodes \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=MyApp-CA" 2>/dev/null
ok "CA certificate created: ca.crt"

# ── 2. Server cert (NGINX) ────────────────────────────────────────
info "Generating Server certificate (NGINX)..."
openssl genrsa -out server.key 4096 2>/dev/null
openssl req -new -key server.key -out server.csr \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=nginx-local" 2>/dev/null

cat > server-ext.cnf << 'EOF'
[req]
req_extensions = v3_req
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = myhome.ddns.net
DNS.2 = localhost
IP.1  = 127.0.0.1
EOF

openssl x509 -req -in server.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365 \
  -extensions v3_req -extfile server-ext.cnf 2>/dev/null
ok "Server certificate created: server.crt"

# ── 3. Client cert (Backend) ──────────────────────────────────────
info "Generating Client certificate (Backend)..."
openssl genrsa -out client.key 4096 2>/dev/null
openssl req -new -key client.key -out client.csr \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=render-backend" 2>/dev/null
openssl x509 -req -in client.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 365 2>/dev/null
ok "Client certificate created: client.crt"

# ── 4. Verify ─────────────────────────────────────────────────────
info "Verifying certificates..."
openssl verify -CAfile ca.crt server.crt
openssl verify -CAfile ca.crt client.crt
ok "All certificates verified successfully"

# ── 5. Base64 encode ──────────────────────────────────────────────
info "Encoding certificates to base64..."
base64 -i client.crt | tr -d '\n' > client.crt.b64
base64 -i client.key | tr -d '\n' > client.key.b64
base64 -i ca.crt     | tr -d '\n' > ca.crt.b64
ok "Base64 encoded files created"

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  mTLS Certificates Generated Successfully${NC}"
echo -e "${GREEN}  Location: ${CERTS_DIR}${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"

echo ""
echo -e "${YELLOW}Render Environment Variables:${NC}"
echo ""

for pair in "CA_CERT_B64 ca.crt.b64" "CLIENT_CERT_B64 client.crt.b64" "CLIENT_KEY_B64 client.key.b64"; do
  env_name=$(echo "$pair" | cut -d' ' -f1)
  file=$(echo "$pair" | cut -d' ' -f2)
  if [ -f "$file" ]; then
    val=$(cat "$file")
    echo -e "  ${CYAN}${env_name}=${NC}${val:0:80}..."
  fi
done

echo ""
echo -e "${YELLOW}Local NGINX setup:${NC}"
echo -e "  sudo mkdir -p /opt/homebrew/etc/nginx/certs"
echo -e "  sudo cp ca.crt server.crt server.key /opt/homebrew/etc/nginx/certs/"
echo -e "  sudo chmod 600 /opt/homebrew/etc/nginx/certs/*.key"
echo ""
echo -e "${GREEN}Done!${NC}"
