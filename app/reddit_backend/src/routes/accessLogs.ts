import { Elysia, t } from "elysia";
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
  // POST /access-logs - Record a new access log when the app is opened
  .post("/", async ({ request, headers, set }) => {
    const userId = headers["x-user-id"];
    const userAgent = request.headers.get("user-agent");
    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      set.status = 429;
      return { error: "Too many requests. Rate limit exceeded." };
    }

    try {
      // If a userId is passed, verify it exists in the database
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
      // Using user_type instead of ip/username to prevent High Cardinality issues
      appAccessCounter.add(1, {
        user_type: finalUserId ? "member" : "guest"
      });

      const log = await db.accessLog.create({
        data: {
          ip,
          userId: finalUserId,
          username: finalUserId ? username : null,
          userAgent: userAgent || null,
          method: "GET",
          path: "/",
          status: 200,
          durationMs: 0,
          bytesSent: 0
        }
      });

      return { success: true, logId: log.id };
    } catch (e) {
      console.error("Failed to record access log:", e);
      set.status = 500;
      return { error: "Failed to record access log" };
    }
  })

  // GET /access-logs - Fetch access logs (Admin only)
  .get("/", async ({ headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Verify requesting user is an Admin
    const user = await db.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.role !== "ADMIN") {
      set.status = 403;
      return { error: "Forbidden. Admin access required." };
    }

    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const logs = await db.accessLog.findMany({
        where: {
          createdAt: {
            gte: thirtyMinutesAgo
          }
        },
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              username: true,
              email: true,
              avatarColor: true,
              avatarUrl: true
            }
          }
        },
        take: 200 // Limit to last 200 access logs
      });

      return logs;
    } catch (e) {
      console.error("Failed to fetch access logs:", e);
      set.status = 500;
      return { error: "Failed to fetch access logs" };
    }
  });
