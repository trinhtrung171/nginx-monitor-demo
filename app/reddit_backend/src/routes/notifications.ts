import { Elysia, t } from "elysia";
import { db } from "../db";

export const notificationRoutes = new Elysia({ prefix: "/notifications" })
  .get("/", async ({ headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }

    const notifications = await db.notification.findMany({
      where: { userId },
      include: {
        actor: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    
    return notifications;
  })
  
  .post("/readAll", async ({ headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }

    await db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    return { success: true };
  });
