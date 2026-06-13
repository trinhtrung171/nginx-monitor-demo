import { Elysia } from 'elysia';
import { getClientIp } from './otel-middleware';

export function registerAccessLogger(app: Elysia) {
  app.onAfterResponse(({ request, set, path, route }) => {
    const status = set.status || 200;
    const method = request.method;
    const activePath = route || path || new URL(request.url).pathname;
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || '';

    const logEntry = {
      timestamp: new Date().toISOString(),
      ip,
      user_id: 'anonymous',
      method,
      path: activePath,
      status,
      duration_ms: 0,
      bytes_sent: parseInt(request.headers.get('content-length') || '0'),
      user_agent: userAgent,
    };

    console.log(JSON.stringify(logEntry));
  });
}
