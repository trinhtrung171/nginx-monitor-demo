import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('app-db');
const slowQueryCounter = meter.createCounter('slow_query_total', {
  description: 'Total number of slow queries (>200ms)',
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
      if (e.duration > 200) {
        slowQueryCounter.add(1);
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

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data as T;
}
export function setCache(key: string, data: any, ttlMs = 15000) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}
export function invalidateCache(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
