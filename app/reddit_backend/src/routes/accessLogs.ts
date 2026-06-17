import { Elysia, t } from "elysia";
import { db } from "../db";
import { getClientIp } from "../lib/client-ip.ts";
import { appAccessCounter } from "../otel-middleware";

export const accessLogRoutes = new Elysia({ prefix: "/access-logs" })
  .post("/", async ({ request, headers, set }) => {
    const userId = headers["x-user-id"];
    const userAgent = request.headers.get("user-agent");
    const ip = getClientIp(request);

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

  .get("/", async ({ headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

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
        take: 200
      });

      return logs;
    } catch (e) {
      console.error("Failed to fetch access logs:", e);
      set.status = 500;
      return { error: "Failed to fetch access logs" };
    }
  });
