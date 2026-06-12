import { Elysia, t } from "elysia";
import { db } from "../db";

export const reportRoutes = new Elysia({ prefix: "/reports" })
  .post("/", async ({ body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }

    try {
      const report = await db.report.create({
        data: {
          type: body.type,
          targetId: body.targetId,
          reason: body.reason,
          reporterId: userId,
        }
      });
      return { message: "Report created", report };
    } catch (e) {
      set.status = 500;
      return { error: "Could not create report" };
    }
  }, {
    body: t.Object({
      type: t.String(),
      targetId: t.String(),
      reason: t.String()
    })
  })
  .get("/", async ({ headers, set }) => {
    const userId = headers["x-user-id"];
    const user = await db.user.findUnique({ where: { id: userId || "" } });
    if (!user || user.role !== "ADMIN") { set.status = 403; return { error: "Forbidden" }; }

    return await db.report.findMany({
      include: { reporter: { select: { username: true } } },
      orderBy: { createdAt: "desc" }
    });
  });
