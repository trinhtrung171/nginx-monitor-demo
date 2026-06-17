---
phase: 4
title: "Update monitor-docker-compose.yml with blackbox config + node_exporter"
status: pending
priority: P2
effort: 2h
dependencies: [3]
---

# Phase 4: Update Docker Compose Monitor Stack

## Overview

Update `monitor-docker-compose.yml` to mount the `prometheus/blackbox.yml` config into the blackbox-exporter container and ensure the node_exporter scrape job exists in Prometheus config. Phase 4 depends on Phase 3 (rule file paths must be updated first).

## Requirements

- **Functional**: Blackbox-exporter loads `blackbox.yml` module config; Prometheus can scrape node_exporter for host metrics
- **Non-functional**: All existing services continue working; no port conflicts; backward-compatible

## Architecture

### What changes

**monitor-docker-compose.yml — blackbox-exporter service:**
- Add `volumes:` section to mount `./prometheus/blackbox.yml` as `/etc/blackbox_exporter/config.yml`
- Service already exists (lines 80-87) but was missing config mount

**prometheus/prometheus.yml — verify node scrape job:**
- Job `node` already exists (lines 46-48) targeting `host.docker.internal:9100`
- No changes needed but verify it's present and correct

## Related Files

### Modify
- `monitor-docker-compose.yml` — add blackbox-exporter volume mount (lines 80-87)

### Verify/No Change
- `prometheus/prometheus.yml` — node job already present (lines 46-48). Add `node` to the blackbox scrape target list if needed for TCP probe

## Implementation Steps

### Step 4.1: Add blackbox config volume to monitor-docker-compose.yml

**Current blackbox-exporter block** (lines 79-87):
```yaml
  # Blackbox exporter: probe external HTTP/HTTPS endpoints (e.g., Vercel apps)
  blackbox-exporter:
    image: prom/blackbox-exporter:latest
    container_name: blackbox-exporter
    ports:
      - "9115:9115"
    networks:
      - global-monitor-net
    restart: unless-stopped
```

**After** (add volumes and config flag):
```yaml
  # Blackbox exporter: probe external HTTP/HTTPS endpoints (e.g., Vercel apps)
  blackbox-exporter:
    image: prom/blackbox-exporter:latest
    container_name: blackbox-exporter
    ports:
      - "9115:9115"
    volumes:
      - ./prometheus/blackbox.yml:/etc/blackbox_exporter/config.yml:ro
    networks:
      - global-monitor-net
    restart: unless-stopped
```

The blackbox-exporter auto-loads `config.yml` at its default path (`/etc/blackbox_exporter/`), so no explicit `--config.file` flag is needed in command. The `:ro` mount prevents the container from modifying it.

### Step 4.2: Verify Prometheus blackbox job has the necessary scrape config

The existing `blackbox` job in `prometheus.yml` (lines 51-64) already targets external URLs via the blackbox-exporter. The job name is `blackbox`, it uses `metrics_path: /probe`, `params: { module: [http_2xx] }`, and rewrites `__address__` to `blackbox-exporter:9115`.

**No change needed** — the blackbox scrape config is correct. It will use the `http_2xx` module defined in `blackbox.yml`.

### Step 4.3: Verify node_exporter job

The existing `node` job (lines 46-48) targets `host.docker.internal:9100`:
```yaml
  - job_name: 'node'
    static_configs:
      - targets: ['host.docker.internal:9100']
```

**No change needed**. This requires `node_exporter` running on the host machine (set up per ARCHITECTURE.md §3.3: `brew services start node_exporter`).

### Step 4.4 (Optional): Ensure Prometheus rule_files reference updated paths

Already handled in Phase 3. Verify the `rule_files:` section of `prometheus.yml` after Phase 3 changes:
```yaml
rule_files:
  - "app_rules.yml"
  - "rules/alert_rules.yml"
  - "rules/blackbox_rules.yml"
  - "rules/ssl_rules.yml"
```

### Step 4.5: Verify docker compose validity

```bash
docker compose -f monitor-docker-compose.yml config
```

This validates the compose file syntax without starting services.

## Success Criteria

- [ ] `docker compose -f monitor-docker-compose.yml config` passes without errors
- [ ] blackbox-exporter has `volumes:` entry mounting `./prometheus/blackbox.yml`
- [ ] After `docker compose up`, blackbox-exporter starts without config errors
- [ ] `curl http://localhost:9115/probe?module=tcp_connect&target=localhost:5433` returns valid metrics
- [ ] Prometheus `node` job scrapes `host.docker.internal:9100` (verify in Prometheus targets UI)
- [ ] Prometheus `blackbox` job scrapes web targets through blackbox-exporter

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing `:ro` mount flag lets blackbox write to config | Low | Low | Added `:ro` explicitly |
| blackbox.yml missing at startup | Low | High | File created in Phase 3 before Phase 4 runs |
| host.docker.internal not resolving on macOS | Medium | Medium | Docker Desktop on macOS auto-resolves host.docker.internal; verify with `docker run alpine ping host.docker.internal` |
| node_exporter not running on host | Medium | Medium | Need `brew services start node_exporter` documented in ARCHITECTURE.md; add check to troubleshooting guide |
| Port 9115 already in use | Low | Medium | Blackbox port is standard; no conflicts in current configuration |
