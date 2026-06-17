import { Elysia, t } from "elysia";
import { db, getCached, setCache, invalidateCache } from "../db";
import { fetchLinkPreview } from "../lib/link-preview.ts";
import { handleVote } from "../lib/vote-handler.ts";
import { toggleBookmark } from "../lib/bookmark-handler.ts";
import { requireAuth } from "../lib/auth-check.ts";
import { unauthorized, notFound, forbidden } from "../lib/response.ts";

export const postRoutes = new Elysia({ prefix: "/posts" })
  .get("/", async () => {
    const cached = getCached<any>('posts:all');
    if (cached) return cached;
    const data = await db.post.findMany({
      include: {
        author: {
          select: { id: true, username: true, karma: true, avatarColor: true, avatarUrl: true }
        },
        subreddit: {
          include: { creator: { select: { id: true, username: true } } }
        },
        _count: {
          select: { comments: true, votes: true }
        },
        votes: {
          select: { type: true, userId: true }
        },
        bookmarks: {
          select: { userId: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    setCache('posts:all', data, 10000);
    return data;
  })

  .get("/saved", async ({ headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();
    const bookmarks = await db.bookmark.findMany({
      where: { userId: user.id },
      include: {
        post: {
          include: {
            author: { select: { id: true, username: true, karma: true, avatarColor: true, avatarUrl: true } },
            subreddit: { include: { creator: { select: { id: true, username: true } } } },
            _count: { select: { comments: true, votes: true } },
            votes: { select: { type: true, userId: true } },
            bookmarks: { select: { userId: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    return bookmarks.map(b => b.post);
  })

  .get("/:id", async ({ params: { id }, set }) => {
    const post = await db.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, username: true, karma: true, avatarColor: true, avatarUrl: true }
        },
        subreddit: {
          include: {
            creator: { select: { id: true, username: true } },
            moderators: { select: { id: true } }
          }
        },
        votes: {
          select: { type: true, userId: true }
        },
        bookmarks: { select: { userId: true } },
        _count: { select: { comments: true, votes: true } },
        comments: {
          where: { parentId: null },
          include: {
            author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
            votes: { select: { type: true, userId: true } },
            replies: {
              include: {
                author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } },
                votes: { select: { type: true, userId: true } }
              }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!post) {
      set.status = 404;
      return notFound("Post");
    }
    return post;
  })

  .post("/", async ({ body, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();

    const subreddit = await db.subreddit.findUnique({ where: { id: body.subredditId } });
    if (!subreddit) { set.status = 400; return { error: "Subreddit not found" }; }

    try {
      let linkPreview = null;
      if (body.linkUrl) {
        linkPreview = await fetchLinkPreview(body.linkUrl);
      }

      let attachments = body.attachments ?? null;
      if (attachments && Array.isArray(attachments)) {
        attachments = await Promise.all(attachments.map(async (att: any) => {
          if (att.type === 'LINK' && att.url) {
            const preview = await fetchLinkPreview(att.url).catch(() => null);
            return { ...att, linkPreview: preview };
          }
          return att;
        }));
      }

      const post = await db.post.create({
        data: {
          title: body.title,
          content: body.content,
          authorId: user.id,
          subredditId: body.subredditId,
          mediaUrl: body.mediaUrl,
          mediaType: body.mediaType,
          linkPreview: linkPreview ? linkPreview : undefined,
          attachments: attachments ? attachments : undefined,
        } as any,
        include: {
          author: { select: { id: true, username: true, karma: true, avatarColor: true, avatarUrl: true } },
          subreddit: { include: { creator: { select: { id: true, username: true } } } },
          _count: { select: { comments: true, votes: true } },
          votes: { select: { type: true, userId: true } },
          bookmarks: { select: { userId: true } }
        }
      });

      const subscribers = await db.subscription.findMany({
        where: { subredditId: body.subredditId, userId: { not: user.id } }
      });
      if (subscribers.length > 0) {
        await db.notification.createMany({
          data: subscribers.map(sub => ({
            type: "POST_IN_SUBREDDIT",
            userId: sub.userId,
            actorId: user.id,
            postId: post.id,
            subredditId: body.subredditId
          }))
        });
      }

      invalidateCache('posts:');
      invalidateCache('subs:');
      return post;
    } catch (e) {
      console.error(e);
      set.status = 400;
      return { error: "Could not create post" };
    }
  }, {
    body: t.Object({
      title: t.String({ minLength: 1 }),
      content: t.Optional(t.String()),
      subredditId: t.String({ minLength: 1 }),
      mediaUrl: t.Optional(t.String()),
      mediaType: t.Optional(t.String()),
      linkUrl: t.Optional(t.String()),
      attachments: t.Optional(t.Array(t.Any())),
    })
  })

  .post("/:id/vote", async ({ params: { id }, body, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();

    const post = await db.post.findUnique({ where: { id } });
    if (!post) {
      set.status = 404;
      return notFound("Post");
    }

    try {
      return await handleVote(user.id, id, body.type, 'post');
    } catch (e) {
      console.error(e);
      set.status = 400;
      return { error: "Could not vote" };
    }
  }, {
    body: t.Object({
      type: t.Enum({ UP: "UP", DOWN: "DOWN" })
    })
  })

  .post("/:id/save", async ({ params: { id }, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();

    const post = await db.post.findUnique({ where: { id } });
    if (!post) { set.status = 404; return notFound("Post"); }

    try {
      return await toggleBookmark(user.id, id);
    } catch (e) {
      console.error(e);
      set.status = 400;
      return { error: "Could not toggle save" };
    }
  })

  .delete("/:id", async ({ params: { id }, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();

    const post = await db.post.findUnique({
      where: { id },
      include: { subreddit: { include: { moderators: { select: { id: true } } } } }
    });
    if (!post) { set.status = 404; return notFound("Post"); }

    const isMod = post.subreddit.moderators.some(m => m.id === user.id);
    if (post.authorId !== user.id && user.role !== "ADMIN" && !isMod) {
      set.status = 403; return forbidden();
    }

    try {
      await db.post.delete({ where: { id } });
      invalidateCache('posts:');
      invalidateCache('subs:');
      return { message: "Deleted" };
    } catch {
      set.status = 500; return { error: "Failed to delete" };
    }
  })

  .patch("/:id", async ({ params: { id }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return unauthorized(); }
    const post = await db.post.findUnique({ where: { id } });
    if (!post) { set.status = 404; return notFound("Post"); }

    if (post.authorId !== userId) {
      set.status = 403; return forbidden();
    }

    try {
      const updatedPost = await db.post.update({
        where: { id },
        data: {
          title: body.title !== undefined ? body.title : undefined,
          content: body.content !== undefined ? body.content : undefined,
        },
        include: {
          author: { select: { id: true, username: true, karma: true, avatarColor: true, avatarUrl: true } },
          subreddit: { include: { creator: { select: { id: true, username: true } } } },
          _count: { select: { comments: true, votes: true } },
          votes: { select: { type: true, userId: true } },
          bookmarks: { select: { userId: true } }
        }
      });
      invalidateCache('posts:');
      invalidateCache('subs:');
      return updatedPost;
    } catch {
      set.status = 500; return { error: "Failed to edit" };
    }
  }, {
    body: t.Object({
      title: t.Optional(t.String({ minLength: 1 })),
      content: t.Optional(t.String()),
    })
  })

  .patch("/:id/note", async ({ params: { id }, body, headers, set }) => {
    const user = await requireAuth(db, headers, set);
    if (!user) return unauthorized();

    if (user.role !== "ADMIN") { set.status = 403; return forbidden(); }

    try {
      const post = await db.post.update({
        where: { id },
        data: { communityNote: body.communityNote },
      });
      return post;
    } catch {
      set.status = 500; return { error: "Failed to add note" };
    }
  }, {
    body: t.Object({
      communityNote: t.String()
    })
  });
