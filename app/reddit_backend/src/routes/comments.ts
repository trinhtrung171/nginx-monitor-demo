import { Elysia, t } from "elysia";
import { db } from "../db";

export const commentRoutes = new Elysia({ prefix: "/comments" })
  // GET comments for a post
  .get("/post/:postId", async ({ params: { postId }, set }) => {
    const post = await db.post.findUnique({ where: { id: postId } });
    if (!post) {
      set.status = 404;
      return { error: "Post not found" };
    }
    return await db.comment.findMany({
      where: { postId, parentId: null },
      include: {
        author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
        votes: { select: { type: true, userId: true } },
        replies: {
          include: {
            author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
            votes: { select: { type: true, userId: true } }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  })

  // POST create a comment
  .post("/", async ({ body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      set.status = 401;
      return { error: "User not found" };
    }

    const post = await db.post.findUnique({ where: { id: body.postId } });
    if (!post) {
      set.status = 400;
      return { error: "Post not found" };
    }

    try {
      const comment = await db.comment.create({
        data: {
          content: body.content,
          authorId: user.id,
          postId: body.postId,
          parentId: body.parentId ?? null
        },
        include: {
          author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
          votes: { select: { type: true, userId: true } }
        }
      });

      // Notification logic
      if (body.parentId) {
        const parentComment = await db.comment.findUnique({ where: { id: body.parentId } });
        if (parentComment && parentComment.authorId !== user.id) {
          await db.notification.create({
            data: {
              type: "REPLY_TO_COMMENT",
              userId: parentComment.authorId,
              actorId: user.id,
              postId: body.postId,
              commentId: comment.id
            }
          });
        }
      } else {
        if (post.authorId !== user.id) {
          await db.notification.create({
            data: {
              type: "COMMENT_ON_POST",
              userId: post.authorId,
              actorId: user.id,
              postId: post.id,
              commentId: comment.id
            }
          });
        }
      }

      return comment;
    } catch (e) {
      console.error(e);
      set.status = 400;
      return { error: "Could not create comment" };
    }
  }, {
    body: t.Object({
      content: t.String({ minLength: 1 }),
      postId: t.String({ minLength: 1 }),
      parentId: t.Optional(t.String())
    })
  })

  // POST vote on a comment
  .post("/:id/vote", async ({ params: { id }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      set.status = 401;
      return { error: "User not found" };
    }

    try {
      const existing = await db.vote.findUnique({
        where: { userId_commentId: { userId: user.id, commentId: id } }
      });

      if (existing && existing.type === body.type) {
        await db.vote.delete({ where: { userId_commentId: { userId: user.id, commentId: id } } });
        return { action: "removed" };
      }

      const vote = await db.vote.upsert({
        where: { userId_commentId: { userId: user.id, commentId: id } },
        update: { type: body.type },
        create: { type: body.type, userId: user.id, commentId: id }
      });
      return vote;
    } catch (e) {
      set.status = 400;
      return { error: "Could not vote" };
    }
  }, {
    body: t.Object({
      type: t.Enum({ UP: "UP", DOWN: "DOWN" })
    })
  })

  // DELETE a comment (Admin, Author, or Moderator)
  .delete("/:id", async ({ params: { id }, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    const comment = await db.comment.findUnique({
      where: { id },
      include: { post: { include: { subreddit: { include: { moderators: { select: { id: true } } } } } } }
    });
    if (!comment || !user) { set.status = 404; return { error: "Not found" }; }

    const isMod = comment.post.subreddit.moderators.some(m => m.id === user.id);
    if (comment.authorId !== user.id && user.role !== "ADMIN" && !isMod) {
      set.status = 403; return { error: "Forbidden" };
    }

    try {
      await db.comment.delete({ where: { id } });
      return { message: "Deleted" };
    } catch {
      set.status = 500; return { error: "Failed to delete" };
    }
  })

  // PATCH edit a comment (Author only)
  .patch("/:id", async ({ params: { id }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const comment = await db.comment.findUnique({ where: { id } });
    if (!comment) { set.status = 404; return { error: "Not found" }; }

    if (comment.authorId !== userId) {
      set.status = 403; return { error: "Forbidden" };
    }

    try {
      const updated = await db.comment.update({
        where: { id },
        data: { content: body.content },
        include: {
          author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
          votes: { select: { type: true, userId: true } }
        }
      });
      return updated;
    } catch {
      set.status = 500; return { error: "Failed to edit" };
    }
  }, {
    body: t.Object({
      content: t.String({ minLength: 1 })
    })
  });
