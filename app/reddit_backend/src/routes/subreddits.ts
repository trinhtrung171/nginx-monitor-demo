import { Elysia, t } from "elysia";
import { db, getCached, setCache, invalidateCache } from "../db";

export const subredditRoutes = new Elysia({ prefix: "/subreddits" })
  .get("/", async () => {
    const cached = getCached<any>('subs:all');
    if (cached) return cached;
    const data = await db.subreddit.findMany({
      include: {
        _count: { select: { posts: true, subscribers: true } },
        creator: { select: { id: true, username: true } }
      },
      orderBy: { posts: { _count: "desc" } }
    });
    setCache('subs:all', data, 30000);
    return data;
  })

  .get("/:name", async ({ params: { name }, set }) => {
    const subreddit = await db.subreddit.findUnique({
      where: { name },
      include: {
        _count: { select: { posts: true, subscribers: true } },
        creator: { select: { id: true, username: true } },
        moderators: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
        posts: {
          include: {
            author: { select: { id: true, username: true, karma: true, avatarColor: true, avatarUrl: true } },
            subreddit: { include: { creator: { select: { id: true, username: true } }, moderators: { select: { id: true } } } },
            votes: { select: { type: true, userId: true } },
            bookmarks: { select: { userId: true } },
            _count: { select: { comments: true, votes: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!subreddit) {
      set.status = 404;
      return { error: "Subreddit not found" };
    }
    return subreddit;
  })

  .get("/:name/moderators", async ({ params: { name }, set }) => {
    const sub = await db.subreddit.findUnique({
      where: { name },
      include: { moderators: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } } }
    });
    if (!sub) { set.status = 404; return { error: "Subreddit not found" }; }
    return sub.moderators;
  })

  // GET members - list subscribers with roles
  .get("/:name/members", async ({ params: { name }, set }) => {
    const sub = await db.subreddit.findUnique({
      where: { name },
      include: {
        creator: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
        moderators: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
        subscribers: {
          include: { user: { select: { id: true, username: true, avatarColor: true, avatarUrl: true, karma: true } } },
          orderBy: { createdAt: "desc" },
          take: 50
        }
      }
    });
    if (!sub) { set.status = 404; return { error: "Subreddit not found" }; }

    const modIds = new Set(sub.moderators.map(m => m.id));
    const members = sub.subscribers.map(s => ({
      ...s.user,
      role: s.user.id === sub.creator?.id ? 'OWNER' : modIds.has(s.user.id) ? 'MODERATOR' : 'MEMBER',
      joinedAt: s.createdAt
    }));
    // Ensure creator is always first
    members.sort((a, b) => a.role === 'OWNER' ? -1 : b.role === 'OWNER' ? 1 : 0);
    return members;
  })

  // PATCH update community settings (creator/admin only)
  .patch("/:name", async ({ params: { name }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    const sub = await db.subreddit.findUnique({ where: { name } });
    if (!sub || !user) { set.status = 404; return { error: "Not found" }; }
    if (sub.creatorId !== user.id && user.role !== "ADMIN") {
      set.status = 403; return { error: "Only the creator or an admin can update community settings" };
    }

    try {
      const updated = await db.subreddit.update({
        where: { id: sub.id },
        data: {
          description: body.description !== undefined ? body.description : undefined,
        },
      });
      invalidateCache('subs:');
      return updated;
    } catch { set.status = 500; return { error: "Failed to update community" }; }
  }, {
    body: t.Object({
      description: t.Optional(t.String({ maxLength: 500 })),
    })
  })

  .post("/", async ({ body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) { set.status = 401; return { error: "User not found" }; }

    try {
      const subreddit = await db.subreddit.create({
        data: {
          name: body.name,
          description: body.description,
          creatorId: user.id,
          moderators: { connect: { id: user.id } }
        }
      });

      await db.subscription.create({
        data: { userId: user.id, subredditId: subreddit.id }
      });

      invalidateCache('subs:');
      return subreddit;
    } catch (e) {
      set.status = 400;
      return { error: "Subreddit already exists or invalid" };
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 3, maxLength: 21 }),
      description: t.Optional(t.String())
    })
  })

  // POST add moderator (creator or admin only)
  .post("/:name/moderators", async ({ params: { name }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    const sub = await db.subreddit.findUnique({ where: { name }, include: { creator: true } });
    if (!sub || !user) { set.status = 404; return { error: "Not found" }; }
    if (sub.creatorId !== user.id && user.role !== "ADMIN") {
      set.status = 403; return { error: "Only the creator or an admin can add moderators" };
    }
    const target = await db.user.findUnique({ where: { id: body.userId } });
    if (!target) { set.status = 404; return { error: "User not found" }; }

    try {
      await db.subreddit.update({
        where: { id: sub.id },
        data: { moderators: { connect: { id: target.id } } }
      });
      invalidateCache('subs:');
      return { message: `u/${target.username} added as moderator` };
    } catch { set.status = 500; return { error: "Failed to add moderator" }; }
  }, {
    body: t.Object({ userId: t.String() })
  })

  // DELETE remove moderator (creator or admin only)
  .delete("/:name/moderators/:userId", async ({ params: { name, userId: targetId }, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    const sub = await db.subreddit.findUnique({ where: { name } });
    if (!sub || !user) { set.status = 404; return { error: "Not found" }; }
    if (sub.creatorId !== user.id && user.role !== "ADMIN") {
      set.status = 403; return { error: "Only the creator or an admin can remove moderators" };
    }
    if (targetId === sub.creatorId) {
      set.status = 400; return { error: "Cannot remove the creator as moderator" };
    }

    try {
      await db.subreddit.update({
        where: { id: sub.id },
        data: { moderators: { disconnect: { id: targetId } } }
      });
      invalidateCache('subs:');
      return { message: "Moderator removed" };
    } catch { set.status = 500; return { error: "Failed to remove moderator" }; }
  })

  // DELETE a subreddit (Admin or creator only)
  .delete("/:name", async ({ params: { name }, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    const sub = await db.subreddit.findUnique({ where: { name } });
    if (!sub || !user) { set.status = 404; return { error: "Not found" }; }

    if (user.role !== "ADMIN" && sub.creatorId !== user.id) {
      set.status = 403; return { error: "Forbidden" };
    }

    try {
      await db.post.deleteMany({ where: { subredditId: sub.id } });
      await db.subreddit.delete({ where: { name } });
      invalidateCache('subs:');
      invalidateCache('posts:');
      return { success: true };
    } catch (e) {
      console.error(e);
      set.status = 500; return { error: "Failed to delete" };
    }
  })

  // POST join/leave a subreddit
  .post("/:name/join", async ({ params: { name }, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }

    const user = await db.user.findUnique({ where: { id: userId } });
    const sub = await db.subreddit.findUnique({ where: { name } });
    if (!sub || !user) { set.status = 404; return { error: "Not found" }; }

    try {
      const existing = await db.subscription.findUnique({
        where: { userId_subredditId: { userId, subredditId: sub.id } }
      });

      if (existing) {
        await db.subscription.delete({
          where: { userId_subredditId: { userId, subredditId: sub.id } }
        });
        return { action: "left" };
      } else {
        await db.subscription.create({
          data: { userId, subredditId: sub.id }
        });
        return { action: "joined" };
      }
    } catch (e) {
      console.error(e);
      set.status = 500;
      return { error: "Could not change subscription status" };
    }
  });
