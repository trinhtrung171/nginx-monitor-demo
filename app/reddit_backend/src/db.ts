import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { metrics } from '@opentelemetry/api';
import { recordDbQuery, recordSlowQuery } from "./prometheus-exporter";

const meter = metrics.getMeter('app-db');
const slowQueryCounter = meter.createCounter('slow_query_total', {
  description: 'Total number of slow queries (>50ms)',
});
slowQueryCounter.add(0);

const queryDurationHistogram = meter.createHistogram('db_query_duration_milliseconds', {
  description: 'Duration of database queries in milliseconds',
});
const queriesTotal = meter.createCounter('db_queries_total', {
  description: 'Total number of database queries',
});
queriesTotal.add(0);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  max: 10,              // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
const adapter = new PrismaPg(pool);

export const db =
  globalForPrisma.prisma ??
  (() => {
    const prisma = new PrismaClient({
      adapter,
      log: [
        { emit: "event", level: "query" },
        { emit: "stdout", level: "error" },
        { emit: "stdout", level: "warn" },
      ],
    });

    prisma.$on("query" as any, (e: any) => {
      queryDurationHistogram.record(e.duration, { query: e.query.substring(0, 100) });
      queriesTotal.add(1);
      recordDbQuery(e.duration, e.query);
      if (e.duration > 50) {
        slowQueryCounter.add(1);
        recordSlowQuery();
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          type: "slow_query",
          duration_ms: e.duration,
          query: e.query,
          params: e.params,
        }));
      }
    });

    return prisma;
  })();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

async function connectWithRetry(maxRetries = 3, baseDelay = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db.$connect();
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`DB connect attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

connectWithRetry().then(() => console.log('Database connected')).catch(err => {
  console.error('Failed to connect to database after retries:', err);
  process.exit(1);
});

// Simple in-memory cache with TTL and max size
const CACHE_MAX_SIZE = 500;
const cache = new Map<string, { data: any; expires: number }>();
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data as T;
}
export function setCache(key: string, data: any, ttlMs = 15000) {
  if (cache.size >= CACHE_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expires: Date.now() + ttlMs });
}
export function invalidateCache(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
