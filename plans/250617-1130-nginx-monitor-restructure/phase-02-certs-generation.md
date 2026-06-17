---
phase: 2
title: "Create certs/ directory + generate-certs.sh script"
status: pending
priority: P2
effort: 1h
dependencies: []
---

# Phase 2: Certs Directory & Generation Script

## Overview

Create the `certs/` directory (already exists, empty) with proper `.gitignore` patterns and a `scripts/generate-certs.sh` shell script that automates the full mTLS certificate generation workflow documented in ARCHITECTURE.md §6.

## Requirements

- **Functional**: A single shell script generates CA + server + client certificates, verifies them, and produces base64-encoded files for Render deployment
- **Non-functional**: All sensitive files excluded from git via `.gitignore`; script uses ARCHITECTURE.md's exact `openssl` commands

## Architecture

### What gets generated

```
certs/
├── ca.crt            # CA certificate (self-signed, 10yr)
├── ca.key            # CA private key           ← gitignored
├── server.crt        # NGINX server cert (365d)
├── server.key        # NGINX server private key ← gitignored
├── server.csr        # (intermediate, can be deleted)
├── server-ext.cnf    # SAN config for server    ← gitignored
├── client.crt        # Backend client cert (365d)
├── client.key        # Backend client private key← gitignored
├── client.csr        # (intermediate, can be deleted)
├── ca.srl            # (serial, auto-generated)
├── ca.crt.b64        # CA base64 for Render     ← gitignored
├── client.crt.b64    # Client cert base64       ← gitignored
├── client.key.b64    # Client key base64        ← gitignored
```

## Related Files

- **Modify**: `.gitignore` — add cert patterns
- **Create**: `scripts/generate-certs.sh` — full automation script
- **Reference**: `ARCHITECTURE.md` §6 for the exact openssl commands

## Implementation Steps

### Step 2.1: Update `.gitignore`

Add the following lines AFTER line 9 (after `# OS & IDE` block, before `# Logs`):

```gitignore
# Certs — DO NOT commit private keys or encoded certs
certs/*.key
certs/ca.crt
certs/*.b64
certs/*.cnf
certs/*.csr
certs/*.srl
```

**Rationale:**
- `certs/*.key` — All private keys (CA, server, client)
- `certs/ca.crt` — CA certificate (trusted root, should stay local)
- `certs/*.b64` — Base64-encoded certs for Render env vars
- `certs/*.cnf`, `certs/*.csr`, `certs/*.srl` — Intermediate build artifacts, no value in repo
- `server.crt` and `client.crt` are NOT gitignored — the `.crt` files (signed certs) can be checked in for reference builds, though they expire. The important thing is keys stay out.

### Step 2.2: Create `scripts/generate-certs.sh`

This script automates the 6.1 → 6.5 steps from ARCHITECTURE.md:

**Key script sections:**
1. Guard: refuse to run if `certs/` already has files (safety)
2. CA cert generation (`openssl req -x509 ...`)
3. Server cert creation (genrsa → req → SAN config → x509 signing)
4. Client cert creation (genrsa → req → CA signing)
5. Verification (`openssl verify`)
6. Base64 encoding for Render
7. Colorized summary output

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$REPO_ROOT/certs"
DDNS_HOST="${1:-myhome.ddns.net}"  # optional: pass DDNS hostname as arg

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }

cd "$CERT_DIR"

# Guard: don't overwrite existing certs
if ls ca.key 2>/dev/null; then
  err "Certs already exist in $CERT_DIR. Remove them first or use a clean working tree."
  exit 1
fi

echo "=== Generating mTLS Certificates ==="
echo "  Cert dir: $CERT_DIR"
echo "  DDNS:     $DDNS_HOST"
echo ""

# 1. CA
info "Generating CA key + cert (10 years)..."
openssl req -x509 -newkey rsa:4096 \
  -keyout ca.key -out ca.crt \
  -days 3650 -nodes \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=MyApp-CA"

# 2. Server cert for NGINX
info "Generating server key..."
openssl genrsa -out server.key 4096

info "Creating server CSR..."
openssl req -new \
  -key server.key -out server.csr \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=nginx-local"

info "Creating SAN extension file..."
cat > server-ext.cnf << SANEOF
[req]
req_extensions = v3_req
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = $DDNS_HOST
DNS.2 = localhost
IP.1  = 127.0.0.1
SANEOF

info "Signing server cert with CA..."
openssl x509 -req \
  -in server.csr \
  -CA ca.crt -CAkey ca.key \
  -CAcreateserial \
  -out server.crt \
  -days 365 \
  -extensions v3_req \
  -extfile server-ext.cnf

# 3. Client cert for backend
info "Generating client key..."
openssl genrsa -out client.key 4096

info "Creating client CSR..."
openssl req -new \
  -key client.key -out client.csr \
  -subj "/C=VN/ST=HCM/O=MyApp/CN=render-backend"

info "Signing client cert with CA..."
openssl x509 -req \
  -in client.csr \
  -CA ca.crt -CAkey ca.key \
  -CAcreateserial \
  -out client.crt \
  -days 365

# 4. Verification
info "Verifying server cert..."
openssl verify -CAfile ca.crt server.crt

info "Verifying client cert..."
openssl verify -CAfile ca.crt client.crt

# 5. Base64 encode for Render
info "Base64 encoding for Render..."
base64 -i client.crt | tr -d '\n' > client.crt.b64
base64 -i client.key | tr -d '\n' > client.key.b64
base64 -i ca.crt     | tr -d '\n' > ca.crt.b64

# 6. Summary
echo ""
echo "========== SUMMARY =========="
echo ""
echo "MTLS_CLIENT_CERT:"
cat client.crt.b64
echo ""
echo "MTLS_CLIENT_KEY:"
cat client.key.b64
echo ""
echo "MTLS_CA_CERT:"
cat ca.crt.b64
echo ""
echo "=============================="
echo ""
info "Certificates generated in $CERT_DIR"
info "Server cert valid for: $(openssl x509 -in server.crt -noout -dates | grep notAfter)"
info "Client cert valid for: $(openssl x509 -in client.crt -noout -dates | grep notAfter)"
```

Make executable: `chmod +x scripts/generate-certs.sh`

## Success Criteria

- [ ] Running `bash scripts/generate-certs.sh` produces all cert files in `certs/`
- [ ] `openssl verify -CAfile certs/ca.crt certs/server.crt` returns `OK`
- [ ] `openssl verify -CAfile certs/ca.crt certs/client.crt` returns `OK`
- [ ] Base64 files (`*.b64`) are non-empty and decode correctly
- [ ] `git add certs/` does NOT stage `.key`, `.b64`, `.cnf`, `.csr`, `.srl` files
- [ ] Running script again when certs exist produces error (guard)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Script runs in wrong directory | Low | Medium | Uses `REPO_ROOT` detection via `dirname $0` |
| Overwriting existing certs | Low | Medium | Guard clause checks for `ca.key` existence |
| base64 flag differs on macOS vs Linux | High | Medium | macOS uses lowercase `-i`, Linux uses `-w0`. Script targets macOS (project runs on macOS per ARCHITECTURE.md) |
