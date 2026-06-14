import { Elysia } from 'elysia';
import { getClientIp } from './otel-middleware';

export function registerAccessLogger(app: Elysia) {
  const startTimes = new WeakMap<Request, number>();

  app.onRequest(({ request }) => {
    startTimes.set(request, performance.now());
  });

  app.onAfterResponse(({ request, set, path, route }) => {
    const startTime = startTimes.get(request);
    const duration_ms = startTime !== undefined ? Math.round(performance.now() - startTime) : 0;
    startTimes.delete(request);

    const status = set.status || 200;
    const method = request.method;
    const activePath = route || path || new URL(request.url).pathname;
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || '';
    const userId = request.headers.get('x-user-id') || 'anonymous';

    const logEntry = {
      timestamp: new Date().toISOString(),
      ip,
      user_id: userId,
      method,
      path: activePath,
      status,
      duration_ms,
      bytes_sent: parseInt(String(set.headers?.['content-length'] || '0')),
      user_agent: userAgent,
    };

    console.log(JSON.stringify(logEntry));
  });
}
