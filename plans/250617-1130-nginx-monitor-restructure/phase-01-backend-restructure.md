---
phase: 1
title: "Backend Restructure — certs.ts, pool.ts, requestLogger.ts"
status: pending
priority: P2
effort: 2h
dependencies: []
---

# Phase 1: Backend Restructure

## Overview

Create 3 new TypeScript files under `app/reddit_backend/src/` that extract pool config, mTLS cert setup, and request logging into dedicated subdirectories. Old import paths are preserved via re-exports so ALL existing code continues working without modification.

## Requirements

- **Functional**: New files contain extracted logic; old files re-export from new locations
- **Non-functional**: TypeScript with ESM `.ts` extensions; follows existing coding style; zero breakage to existing imports

## Architecture

### Data Flow (Phase 1)

```
Before:
  db.ts ─────────────► routes/*.ts, index.ts, access-logger.ts
  access-logger.ts ──► index.ts

After:
  db/pool.ts ──────────► db.ts ──► (re-exports to) routes/*.ts, index.ts, access-logger.ts
  startup/certs.ts ────► (new, used by index.ts in future)
  middleware/requestLogger.ts ──► access-logger.ts ──► (re-exports to) index.ts
```

### Detail

1. **`src/startup/certs.ts`** — New file. Decodes base64-encoded mTLS certs from env vars (`MTLS_CLIENT_CERT`, `MTLS_CLIENT_KEY`, `MTLS_CA_CERT`) to `/tmp/mtls-certs/`. Mirrors ARCHITECTURE.md's `src/startup/certs.js` pattern but typed for TypeScript/Prisma context (not Express).

2. **`src/db/pool.ts`** — Extracts lines 1-31 from `src/db.ts`: the `Pool` instantiation and `PrismaPg` adapter creation. Exports `pool` (pg.Pool) and `adapter` (PrismaPg). `db.ts` then imports from `./db/pool.ts` instead of creating pool inline. The rest of `db.ts` (PrismaClient, cache, metrics) stays unchanged.

3. **`src/middleware/requestLogger.ts`** — Extracts the `registerAccessLogger` function and its helpers from `src/access-logger.ts`. `access-logger.ts` then imports and re-exports `registerAccessLogger` from `./middleware/requestLogger.ts`.

## Related Code Files

### Create
- `app/reddit_backend/src/startup/certs.ts` — mTLS cert decoder
- `app/reddit_backend/src/db/pool.ts` — Pool + PrismaPg adapter
- `app/reddit_backend/src/middleware/requestLogger.ts` — request logger middleware

### Modify
- `app/reddit_backend/src/db.ts` — Import pool/adapter from `./db/pool.ts`
- `app/reddit_backend/src/access-logger.ts` — Import + re-export from `./middleware/requestLogger.ts`

### No Change
- `app/reddit_backend/src/index.ts` — Imports already resolve through re-exports
- `app/reddit_backend/src/routes/*.ts` — All 7 route files keep `import { db } from "../db"`
- `app/reddit_backend/src/seed.ts` — Keeps `import { db as prisma } from "./db"`

## Implementation Steps

### Step 1.1: Create `src/startup/certs.ts`

Read cert env vars, decode from base64, write to `/tmp/mtls-certs/`.

**certs.ts content:**
```typescript
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const CERT_DIR = '/tmp/mtls-certs';

interface CertEntry {
  filename: string;
  envVar: string | undefined;
}

export function setupMtlsCerts(): void {
  mkdirSync(CERT_DIR, { recursive: true });

  const certs: CertEntry[] = [
    { filename: 'client.crt', envVar: process.env.MTLS_CLIENT_CERT },
    { filename: 'client.key', envVar: process.env.MTLS_CLIENT_KEY },
    { filename: 'ca.crt',     envVar: process.env.MTLS_CA_CERT },
  ];

  for (const { filename, envVar } of certs) {
    if (!envVar) {
      console.warn(`[certs] WARNING: Missing env var for ${filename} — skipping`);
      continue;
    }
    writeFileSync(join(CERT_DIR, filename), Buffer.from(envVar, 'base64'));
  }

  console.log(`[certs] Certificate written to ${CERT_DIR}`);
}

export function getCertPath(filename: string): string {
  return join(CERT_DIR, filename);
}
```

### Step 1.2: Create `src/db/pool.ts`

Extract lines 24-31 from `src/db.ts` (the Pool and PrismaPg adapter creation).

**pool.ts content:**
```typescript
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const adapter = new PrismaPg(pool);
```

### Step 1.3: Update `src/db.ts` to use pool/adapter from `./db/pool.ts`

**Changes to db.ts:**
- Remove `import { Pool } from "pg"` (line 2)
- Remove `import { PrismaPg } from "@prisma/adapter-pg"` (line 3)
- Add `import { pool, adapter } from './db/pool.ts'` at top
- Remove the pool creation block (lines 25-31: `const connectionString = ...; const pool = ...; const adapter = ...`)

Result: `db.ts` becomes cleaner — the pool config is now in `db/pool.ts`.

**No change** to db.ts exports — it still exports `db`, `getCached`, `setCache`, `invalidateCache`.

### Step 1.4: Create `src/middleware/requestLogger.ts`

Extract `registerAccessLogger` function + its helpers from `src/access-logger.ts`.

**requestLogger.ts content:**
```typescript
import { Elysia } from 'elysia';
import { getClientIp } from '../lib/client-ip.ts';
import { db } from '../db';

const usernameCache = new Map<string, { username: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getUsername(userId: string): Promise<string> {
  const cached = usernameCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.username;
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { username: true } });
    const username = user?.username || 'anonymous';
    usernameCache.set(userId, { username, expiresAt: Date.now() + CACHE_TTL_MS });
    return username;
  } catch {
    return 'anonymous';
  }
}

function computeBytesSent(response: unknown): number {
  if (!response) return 0;
  if (response instanceof Response) {
    const cl = response.headers.get('content-length');
    if (cl) return parseInt(cl, 10);
    return 0;
  }
  if (typeof response === 'string') return new TextEncoder().encode(response).length;
  if (typeof response === 'object') {
    try {
      return new TextEncoder().encode(JSON.stringify(response)).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

export function registerAccessLogger(app: Elysia) {
  const startTimes = new WeakMap<Request, number>();

  app.onRequest(({ request }) => {
    startTimes.set(request, performance.now());
  });

  app.onAfterResponse(async ({ request, set, path, route, response }) => {
    try {
      const startTime = startTimes.get(request);
      const duration_ms = startTime !== undefined ? Math.round(performance.now() - startTime) : 0;
      startTimes.delete(request);

      const status = set.status || 200;
      const method = request.method;
      const activePath = route || path || new URL(request.url).pathname;
      const ip = getClientIp(request);
      const userAgent = request.headers.get('user-agent') || '';
      const userId = request.headers.get('x-user-id');
      const username = userId ? await getUsername(userId) : 'anonymous';

      const logEntry = {
        timestamp: new Date().toISOString(),
        ip,
        username,
        method,
        path: activePath,
        status,
        duration_ms,
        bytes_sent: computeBytesSent(response),
        user_agent: userAgent,
      };

      console.log(JSON.stringify(logEntry));
    } catch (err) {
      startTimes.delete(request);
      console.error('Failed to write access log:', err);
    }
  });
}
```

### Step 1.5: Update `src/access-logger.ts` to re-export

**Changes to access-logger.ts:**
Replace entire content with:
```typescript
export { registerAccessLogger } from './middleware/requestLogger.ts';
```

This preserves the `import { registerAccessLogger } from "./access-logger"` path used in `index.ts:16`.

## Success Criteria

- [ ] `bun src/index.ts` starts without errors
- [ ] `import { db } from "../db"` works in all 7 route files (grep for all 7 callers verified)
- [ ] `import { registerAccessLogger } from "./access-logger"` works in index.ts
- [ ] `import { pool } from "./db/pool"` resolves correctly
- [ ] `import { registerAccessLogger } from "./middleware/requestLogger"` resolves correctly
- [ ] `import { setupMtlsCerts } from "./startup/certs"` resolves correctly
- [ ] All existing exports from `db.ts` remain available (`db`, `getCached`, `setCache`, `invalidateCache`)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Broken import paths in route files | Low | High | Re-export pattern ensures backward compat; verify all 7 callers |
| Relative path miscalculation in middleware import (`../db` vs `../../db`) | Medium | High | `requestLogger.ts` at `src/middleware/` needs `../db` (verified: src/db.ts → `../db` from src/middleware/ is correct path to src/db.ts) |
| Pool/adapter extraction breaks singleton pattern | Low | High | The `globalForPrisma` check in db.ts still ensures single PrismaClient; pool is imported once |
