import { Elysia } from 'elysia';
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('elysia-http');

const requestCounter = meter.createCounter('http_server_requests_total', {
  description: 'Total number of HTTP requests',
});

const requestDuration = meter.createHistogram('http_server_duration_milliseconds', {
  description: 'HTTP request duration in milliseconds',
});

export const appAccessCounter = meter.createCounter('app_access_total', {
  description: 'Total number of app accesses (opens)',
});

export const errorCounter = meter.createCounter('app_errors_total', {
  description: 'Total number of unhandled errors',
});

// Đo đạc CPU & RAM tùy chỉnh cho Bun (Tránh crash lỗi node:v8 getHeapSpaceStatistics trên Bun)
const cpuGauge = meter.createObservableGauge('process_cpu_usage', {
  description: 'CPU usage percentage of the process',
});

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = performance.now();

cpuGauge.addCallback(result => {
  const currentCpuUsage = process.cpuUsage();
  const currentCpuTime = performance.now();
  
  const userDiff = currentCpuUsage.user - lastCpuUsage.user;
  const systemDiff = currentCpuUsage.system - lastCpuUsage.system;
  // Đổi mili-giây sang micro-giây (* 1000)
  const timeDiff = (currentCpuTime - lastCpuTime) * 1000;
  
  const cpuPercent = timeDiff > 0 ? (userDiff + systemDiff) / timeDiff : 0;
  result.observe(cpuPercent);
  
  lastCpuUsage = currentCpuUsage;
  lastCpuTime = currentCpuTime;
});

const memoryGauge = meter.createObservableGauge('process_memory_usage_bytes', {
  description: 'Resident set size (RSS) memory usage of the process',
});

memoryGauge.addCallback(result => {
  result.observe(process.memoryUsage().rss);
});

const startTimes = new WeakMap<Request, number>();

export const getClientIp = (request: Request, app?: Elysia) => {
  // 1. Cloudflare connecting IP
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    let ip = cfConnectingIp.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  // 2. Standard X-Forwarded-For (first IP is the client IP)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    let firstIp = forwarded.split(',')[0].trim();
    if (firstIp) {
      if (firstIp.startsWith('::ffff:')) firstIp = firstIp.substring(7);
      return firstIp;
    }
  }

  // 3. Alternative proxy headers
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    let ip = realIp.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  const trueClientIp = request.headers.get('true-client-ip');
  if (trueClientIp) {
    let ip = trueClientIp.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  const clientIpHeader = request.headers.get('x-client-ip');
  if (clientIpHeader) {
    let ip = clientIpHeader.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  try {
    // 4. Fallback to socket IP from Bun Server
    if (app?.server) {
      const socketAddr = app.server.requestIP(request);
      if (socketAddr?.address) {
        let ip = socketAddr.address;
        if (ip.startsWith('::ffff:')) ip = ip.substring(7);
        return ip;
      }
    }
  } catch {}
  return '127.0.0.1';
};

export function registerOTel(app: Elysia) {
  app.onRequest(({ request }) => {
    startTimes.set(request, performance.now());
  });

  app.onAfterResponse(({ request, set, path, route }) => {
    const startTime = startTimes.get(request);
    if (startTime !== undefined) {
      const duration = performance.now() - startTime;
      const status = set.status || 200;
      const method = request.method;
      
      const activePath = route || path || new URL(request.url).pathname;
      const clientIp = getClientIp(request, app);

      requestCounter.add(1, {
        method,
        status: status.toString(),
        path: activePath
      });

      requestDuration.record(duration, {
        method,
        status: status.toString(),
        path: activePath
      });

      startTimes.delete(request);
    }
  });
}
