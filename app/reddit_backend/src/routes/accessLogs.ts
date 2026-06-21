import { Elysia } from "elysia";
import { db } from "../db";
import { getClientIp, appAccessCounter } from "../otel-middleware";

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodically purge stale entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 5 * 60_000);

export const accessLogRoutes = new Elysia({ prefix: "/access-logs" })
  // POST /access-logs - Record a session ping
  .post("/", async ({ request, headers, set }) => {
    const userId = headers["x-user-id"];
    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      set.status = 429;
      return { error: "Too many requests. Rate limit exceeded." };
    }

    try {
      let finalUserId: string | null = null;
      let username = "guest";
      if (userId) {
        const userExists = await db.user.findUnique({
          where: { id: userId }
        });
        if (userExists) {
          finalUserId = userId;
          username = userExists.username;
        }
      }

      // Record OpenTelemetry Metric for Grafana Cloud
      appAccessCounter.add(1, {
        user_type: finalUserId ? "member" : "guest"
      });

      return { success: true };
    } catch (e) {
      console.error("Failed to record access log:", e);
      set.status = 500;
      return { error: "Failed to record access log" };
    }
  });
