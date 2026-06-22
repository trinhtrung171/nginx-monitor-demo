import { Elysia } from 'elysia';
import { getClientIp } from './otel-middleware';
import { db } from './db';
const usernameCache = new Map<string, { username: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Only real Chrome/Safari-based browsers have this UA pattern
// HeadlessChrome = Render browser health check (Playwright/Puppeteer synthetic monitoring)
function isRealUserRequest(request: Request): boolean {
  const ua = request.headers.get('user-agent') || '';
  if (!ua.includes('AppleWebKit/537.36')) return false;
  if (!ua.includes('(KHTML, like Gecko)')) return false;
  if (!ua.includes('Chrome/')) return false;
  if (!ua.includes('Safari/537.36')) return false;
  if (ua.includes('HeadlessChrome')) return false;
  return !!(request.headers.get('x-client-ip') || request.headers.get('x-user-id'));
}

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

  db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS access_log (
    id BIGSERIAL PRIMARY KEY,
    ip TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT 'anonymous',
    user_id TEXT,
    method TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    bytes_sent INTEGER NOT NULL DEFAULT 0,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});

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
      if (skipPaths.includes(activePath) || !isRealUserRequest(request)) return;

      console.log(JSON.stringify(logEntry));

      db.$executeRawUnsafe(
        'INSERT INTO access_log (ip, username, user_id, method, path, status, duration_ms, bytes_sent, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ip, username, userId, method, activePath, status, duration_ms, bytesSent, userAgent
      ).catch((err: unknown) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to write access_log:', err);
        }
      });
    } catch (err) {
      startTimes.delete(request);
      console.error('Failed to write access log:', err);
    }
  });
}
