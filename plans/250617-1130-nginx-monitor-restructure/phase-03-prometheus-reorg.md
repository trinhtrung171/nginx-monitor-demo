---
phase: 3
title: "Reorganize Prometheus Rules + blackbox.yml"
status: pending
priority: P2
effort: 1h
dependencies: []
---

# Phase 3: Reorganize Prometheus Rules

## Overview

Move existing rule files into `prometheus/rules/` subdirectory, create a new `prometheus/blackbox.yml` for blackbox-exporter configuration, and update `prometheus/prometheus.yml` to reference new paths.

## Requirements

- **Functional**: Prometheus continues to load all rules; blackbox-exporter gets its config file; old paths in docker-compose are updated
- **Non-functional**: Rule file content is unchanged (pure move); paths in prometheus.yml are updated to match

## Architecture

### Before
```
prometheus/
├── prometheus.yml      (references alert_rules.yml, app_rules.yml, blackbox_rules.yml, ssl_rules.yml)
├── alert_rules.yml     (NGINX alerts)
├── app_rules.yml       (infra + app + DB alerts) ← stays at root
├── blackbox_rules.yml  (Vercel probe alert)       ← moved to rules/
└── ssl_rules.yml       (SSL expiration alerts)    ← moved to rules/
```

### After
```
prometheus/
├── prometheus.yml      (ref updated: rules/alert_rules.yml, rules/blackbox_rules.yml, rules/ssl_rules.yml)
├── app_rules.yml       (unchanged)
├── blackbox.yml        (NEW — blackbox-exporter module config: tcp_connect + http_2xx)
└── rules/
    ├── alert_rules.yml (MOVED)
    ├── blackbox_rules.yml (MOVED)
    └── ssl_rules.yml   (MOVED)
```

## Related Files

### Create
- `prometheus/rules/` — new directory
- `prometheus/blackbox.yml` — blackbox exporter modules config

### Move (copy + delete originals)
- `prometheus/alert_rules.yml` → `prometheus/rules/alert_rules.yml`
- `prometheus/blackbox_rules.yml` → `prometheus/rules/blackbox_rules.yml`
- `prometheus/ssl_rules.yml` → `prometheus/rules/ssl_rules.yml`

### Modify
- `prometheus/prometheus.yml` — update 4 `rule_files:` paths

## Implementation Steps

### Step 3.1: Create `prometheus/rules/` directory

```bash
mkdir -p prometheus/rules
```

### Step 3.2: Move rule files

Copy each file to new location, then delete originals. Content is unchanged.

| Source | Destination |
|--------|------------|
| `prometheus/alert_rules.yml` | `prometheus/rules/alert_rules.yml` |
| `prometheus/blackbox_rules.yml` | `prometheus/rules/blackbox_rules.yml` |
| `prometheus/ssl_rules.yml` | `prometheus/rules/ssl_rules.yml` |

### Step 3.3: Create `prometheus/blackbox.yml`

From ARCHITECTURE.md §11.4 — contains probe module definitions that blackbox-exporter loads at startup:

```yaml
modules:
  tcp_connect:
    prober: tcp
    timeout: 5s

  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: [200]
      follow_redirects: true
      preferred_ip_protocol: "ip4"
```

### Step 3.4: Update `prometheus/prometheus.yml` rule_files paths

**Current** (lines 72-75):
```yaml
rule_files:
  - "alert_rules.yml"
  - "app_rules.yml"
  - "blackbox_rules.yml"
  - "ssl_rules.yml"
```

**After**:
```yaml
rule_files:
  - "app_rules.yml"
  - "rules/alert_rules.yml"
  - "rules/blackbox_rules.yml"
  - "rules/ssl_rules.yml"
```

Note: `app_rules.yml` stays at root, so its path is unchanged.

## Success Criteria

- [ ] `prometheus/rules/` exists with `alert_rules.yml`, `blackbox_rules.yml`, `ssl_rules.yml`
- [ ] `prometheus/alert_rules.yml` no longer exists (moved)
- [ ] `prometheus/blackbox_rules.yml` no longer exists (moved)
- [ ] `prometheus/ssl_rules.yml` no longer exists (moved)
- [ ] `prometheus/blackbox.yml` exists with correct module definitions
- [ ] `prometheus/prometheus.yml` references `rules/alert_rules.yml`, `rules/blackbox_rules.yml`, `rules/ssl_rules.yml`
- [ ] Prometheus config validates: `promtool check config prometheus/prometheus.yml` (if promtool available)
- [ ] No other files in repo reference old `prometheus/alert_rules.yml` paths (grep check)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Any docker-compose or config references old rule paths | Low | High | Grep for all rule file path references across repo before/after |
| blackbox-rules.yml confusion with blackbox.yml (two different files) | Medium | Low | Different purposes: `blackbox.yml` = exporter modules config; `rules/blackbox_rules.yml` = Prometheus alert rules |
| git mv loses history | Low | Low | Use `git mv` instead of copy+delete to preserve file history |

## Unresolved Questions / Out-of-Scope

### Documentation references to old paths
The following documentation files reference the old `prometheus/*.yml` flat structure but updating them is **out of scope** for this plan. These docs describe the intended architecture, not current state, so the mismatch is acceptable:

- `ARCHITECTURE.md` (lines 119, 788-789, 825, 1103)
- `architecture-review.md` (lines 25-27, 309-311, 389, 419-421)
- `README.md` (lines 275-277)
- `metrics-report.md` (line 439)
- Various `Tips/*.md` files

If desired, these can be updated in a follow-up doc refresh pass.
