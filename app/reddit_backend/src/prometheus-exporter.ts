import client from 'prom-client';
import type { Elysia } from 'elysia';

const register = new client.Registry();

const requestCounter = new client.Counter({
  name: 'http_server_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'status', 'path'],
  registers: [register],
});

const requestDuration = new client.Histogram({
  name: 'http_server_duration_milliseconds',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'status', 'path'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

const cpuGauge = new client.Gauge({
  name: 'process_cpu_usage',
  help: 'CPU usage percentage of the process',
  registers: [register],
});

const memoryGauge = new client.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Resident set size (RSS) memory usage of the process',
  registers: [register],
});

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = performance.now();

export function updateProcessMetrics() {
  const currentCpuUsage = process.cpuUsage();
  const currentCpuTime = performance.now();

  const userDiff = currentCpuUsage.user - lastCpuUsage.user;
  const systemDiff = currentCpuUsage.system - lastCpuUsage.system;
  const timeDiff = (currentCpuTime - lastCpuTime) * 1000;

  const cpuPercent = timeDiff > 0 ? (userDiff + systemDiff) / timeDiff : 0;
  cpuGauge.set(cpuPercent);

  lastCpuUsage = currentCpuUsage;
  lastCpuTime = currentCpuTime;

  memoryGauge.set(process.memoryUsage().rss);
}

export function recordRequest(method: string, status: string, path: string, durationMs: number) {
  requestCounter.inc({ method, status, path }, 1);
  requestDuration.observe({ method, status, path }, durationMs);
}

const errorCounter = new client.Counter({
  name: 'app_errors_total',
  help: 'Total number of unhandled errors',
  labelNames: ['method', 'path'],
  registers: [register],
});

export function recordError(method: string, path: string) {
  requestCounter.inc({ method, status: '500', path }, 1);
  errorCounter.inc({ method, path }, 1);
}

const dbQueriesCounter = new client.Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  registers: [register],
});

const dbQueryDurationHistogram = new client.Histogram({
  name: 'db_query_duration_milliseconds',
  help: 'Duration of database queries in milliseconds',
  labelNames: ['query'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

const slowQueryCounter = new client.Counter({
  name: 'slow_query_total',
  help: 'Total number of slow queries (>200ms)',
  registers: [register],
});

export function recordDbQuery(durationMs: number, query: string) {
  dbQueriesCounter.inc(1);
  dbQueryDurationHistogram.observe({ query: query.substring(0, 100) }, durationMs);
}

export function recordSlowQuery() {
  slowQueryCounter.inc(1);
}

export async function metricsHandler(): Promise<string> {
  updateProcessMetrics();
  return await register.metrics();
}

export function registerMetricsRoute(app: Elysia) {
  app.get('/metrics', async ({ request }) => {
    const authToken = process.env.METRICS_AUTH_TOKEN;
    if (authToken) {
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${authToken}`) {
        return new Response('Unauthorized', { status: 401 });
      }
    }
    const body = await metricsHandler();
    return new Response(body, {
      headers: { 'content-type': register.contentType },
    });
  });
}
