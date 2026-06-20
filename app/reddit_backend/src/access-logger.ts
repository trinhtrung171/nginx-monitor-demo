import { Elysia } from 'elysia';
import { getClientIp } from './otel-middleware';
import { db } from './db';

const usernameCache = new Map<string, { username: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Rate-limit DB writes from middleware (1 per IP per 60s)
const dbWriteTimestamps = new Map<string, number>();
const DB_WRITE_INTERVAL_MS = 60_000;

async function getUsername(userId: string): Promise<string> {
  const cached = usernameCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.username;
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { username: true } });
    const username = user?.username || 'anonymous';
    usernameCache.set(userId, { username, expiresAt: Date.now() + CACHE_TTL_MS });
    return username;
  } catch (err) {
    console.error('getUsername error for userId', userId, ':', err);
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
      const rawUserId = request.headers.get('x-user-id');
      let userId = rawUserId || null;
      const username = rawUserId ? await getUsername(rawUserId) : 'anonymous';
      if (rawUserId && username === 'anonymous') userId = null;

      const bytesSent = computeBytesSent(response);

      const logEntry = {
        timestamp: new Date().toISOString(),
        ip,
        user_id: userId,
        username,
        method,
        path: activePath,
        status,
        duration_ms,
        bytes_sent: bytesSent,
        user_agent: userAgent,
      };

      const skipPaths = ['/metrics', '/health'];
      if (skipPaths.includes(activePath)) return;

      console.log(JSON.stringify(logEntry));

      // Also write to DB (1 entry per IP per 60s) so Bandwidth and IP panels have real data
      const lastWrite = dbWriteTimestamps.get(ip) || 0;
      if (Date.now() - lastWrite >= DB_WRITE_INTERVAL_MS) {
        dbWriteTimestamps.set(ip, Date.now());
        db.accessLog.create({
          data: {
            ip,
            userId,
            username,
            userAgent: userAgent || '',
            method,
            path: activePath,
            status,
            durationMs: duration_ms,
            bytesSent,
          },
        }).catch((err: unknown) => console.error('Failed to write middleware access log to DB:', err));
      }
    } catch (err) {
      startTimes.delete(request);
      console.error('Failed to write access log:', err);
    }
  });
}
