import type { Elysia } from 'elysia';
import { metrics } from '@opentelemetry/api';
import { recordRequest } from './prometheus-exporter';

const meter = metrics.getMeter('elysia-http');

const requestCounter = meter.createCounter('http_server_requests_total', {
  description: 'Total number of HTTP requests',
});

const requestDuration = meter.createHistogram('http_server_duration_milliseconds', {
  description: 'HTTP request duration in milliseconds',
});

export const errorCounter = meter.createCounter('app_errors_total', {
  description: 'Total number of unhandled errors',
});

errorCounter.add(0, { method: "INIT", path: "/init" });

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

let _server: any = null;

export function setAppServer(server: any) {
  _server = server;
}

function cleanIp(ip: string): string {
  ip = ip.trim();
  if (ip.startsWith('::ffff:')) ip = ip.substring(7);
  return ip;
}

export const getClientIp = (request: Request) => {
  const clientIp = request.headers.get('x-client-ip');
  if (clientIp) return cleanIp(clientIp);

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return cleanIp(forwardedFor.split(',')[0]);

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return cleanIp(realIp);

  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cleanIp(cfConnectingIp);

  try {
    if (_server) {
      const socketAddr = _server.requestIP(request);
      if (socketAddr?.address) return cleanIp(socketAddr.address);
    }
  } catch {}
  return '0.0.0.0';
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
      const clientIp = getClientIp(request);

      requestCounter.add(1, {
        method,
        status: status.toString(),
        path: activePath
      });

      recordRequest(method, status.toString(), activePath, duration);

      requestDuration.record(duration, {
        method,
        status: status.toString(),
        path: activePath
      });

      startTimes.delete(request);
    }
  });
}
