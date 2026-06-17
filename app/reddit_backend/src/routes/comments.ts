import { Elysia, t } from "elysia";
import { db } from "../db";
import { handleVote } from "../lib/vote-handler.ts";
import { requireAuth } from "../lib/auth-check.ts";
import { unauthorized, notFound, forbidden } from "../lib/response.ts";

export const commentRoutes = new Elysia({ prefix: "/comments" })
  .get("/post/:postId", async ({ params: { postId }, set }) => {
    const post = await db.post.findUnique({ where: { id: postId } });
    if (!post) {
      set.status = 404;
      return notFound("Post");
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

  .post("/", async ({ body, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();

    const post = await db.post.findUnique({ where: { id: body.postId } });
    if (!post) {
      set.status = 400;
      return notFound("Post");
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

  .post("/:id/vote", async ({ params: { id }, body, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();

    try {
      return await handleVote(user.id, id, body.type, 'comment');
    } catch (e) {
      set.status = 400;
      return { error: "Could not vote" };
    }
  }, {
    body: t.Object({
      type: t.Enum({ UP: "UP", DOWN: "DOWN" })
    })
  })

  .delete("/:id", async ({ params: { id }, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();
    const comment = await db.comment.findUnique({
      where: { id },
      include: { post: { include: { subreddit: { include: { moderators: { select: { id: true } } } } } } }
    });
    if (!comment) { set.status = 404; return notFound("Comment"); }

    const isMod = comment.post.subreddit.moderators.some(m => m.id === user.id);
    if (comment.authorId !== user.id && user.role !== "ADMIN" && !isMod) {
      set.status = 403; return forbidden();
    }

    try {
      await db.comment.delete({ where: { id } });
      return { message: "Deleted" };
    } catch {
      set.status = 500; return { error: "Failed to delete" };
    }
  })

  .patch("/:id", async ({ params: { id }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return unauthorized(); }
    const comment = await db.comment.findUnique({ where: { id } });
    if (!comment) { set.status = 404; return notFound("Comment"); }

    if (comment.authorId !== userId) {
      set.status = 403; return forbidden();
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
