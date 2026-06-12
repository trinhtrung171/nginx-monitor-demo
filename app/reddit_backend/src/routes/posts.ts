import { Elysia, t } from "elysia";
import { db, getCached, setCache, invalidateCache } from "../db";

async function fetchLinkPreview(url: string) {
  const platform = detectPlatform(url);
  if (platform?.embedHtml) {
    return { url, ...platform };
  }

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DevShareBot/1.0)' }, signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    const getMeta = (prop: string) => {
      const match = html.match(new RegExp(`<meta\\s+(?:property|name)=["']${prop}["']\\s+content=["']([^"']+)["']`, 'i')) ||
                    html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${prop}["']`, 'i'));
      return match ? match[1] : null;
    };
    const title = getMeta('og:title') || getMeta('twitter:title') || html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description');
    const image = getMeta('og:image') || getMeta('twitter:image');
    const siteName = getMeta('og:site_name') || getMeta('al:android:app_name') || '';

    if (title || description || image) {
      return { url, platform: platform?.id || 'website', title, description, image, siteName };
    }
  } catch {}
  return { url, platform: 'website', title: url };
}

function detectPlatform(url: string) {
  const u = url.toLowerCase();
  // YouTube
  const ytMatch = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-z0-9_-]{11})/);
  if (ytMatch) {
    return { id: 'youtube', videoId: ytMatch[1], embedHtml: true };
  }
  // Twitter / X
  if (u.includes('twitter.com') || u.includes('x.com')) {
    return { id: 'twitter', embedHtml: true };
  }
  // Facebook
  if (u.includes('facebook.com') || u.includes('fb.com')) {
    return { id: 'facebook', embedHtml: true };
  }
  return null;
}

export const postRoutes = new Elysia({ prefix: "/posts" })
  // GET all posts
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

  // GET saved/bookmarked posts for current user (before :id to avoid route conflict)
  .get("/saved", async ({ headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const bookmarks = await db.bookmark.findMany({
      where: { userId },
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

  // GET single post with full comments tree
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
      return { error: "Post not found" };
    }
    return post;
  })

  // POST create post
  .post("/", async ({ body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) { set.status = 401; return { error: "User not found" }; }

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

      // Create notifications for subscribers
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

  // POST vote on a post
  .post("/:id/vote", async ({ params: { id }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      set.status = 401;
      return { error: "User not found" };
    }

    const post = await db.post.findUnique({ where: { id } });
    if (!post) {
      set.status = 404;
      return { error: "Post not found" };
    }

    try {
      const existing = await db.vote.findUnique({
        where: { userId_postId: { userId: user.id, postId: id } }
      });

      if (existing && existing.type === body.type) {
        await db.vote.delete({ where: { userId_postId: { userId: user.id, postId: id } } });
        invalidateCache('posts:');
        return { action: "removed" };
      }

      const vote = await db.vote.upsert({
        where: { userId_postId: { userId: user.id, postId: id } },
        update: { type: body.type },
        create: { type: body.type, userId: user.id, postId: id }
      });
      invalidateCache('posts:');
      return vote;
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

  // POST toggle save/unbookmark a post
  .post("/:id/save", async ({ params: { id }, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }

    const post = await db.post.findUnique({ where: { id } });
    if (!post) { set.status = 404; return { error: "Post not found" }; }

    try {
      const existing = await db.bookmark.findUnique({
        where: { userId_postId: { userId, postId: id } }
      });

      if (existing) {
        await db.bookmark.delete({
          where: { userId_postId: { userId, postId: id } }
        });
        invalidateCache('posts:');
        return { saved: false };
      } else {
        await db.bookmark.create({
          data: { userId, postId: id }
        });
        invalidateCache('posts:');
        return { saved: true };
      }
    } catch (e) {
      console.error(e);
      set.status = 400;
      return { error: "Could not toggle save" };
    }
  })

  // DELETE a post (Admin, Author, or Moderator)
  .delete("/:id", async ({ params: { id }, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    const post = await db.post.findUnique({
      where: { id },
      include: { subreddit: { include: { moderators: { select: { id: true } } } } }
    });
    if (!post || !user) { set.status = 404; return { error: "Not found" }; }

    const isMod = post.subreddit.moderators.some(m => m.id === user.id);
    if (post.authorId !== user.id && user.role !== "ADMIN" && !isMod) {
      set.status = 403; return { error: "Forbidden" };
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

  // PATCH edit a post (Author only)
  .patch("/:id", async ({ params: { id }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const post = await db.post.findUnique({ where: { id } });
    if (!post) { set.status = 404; return { error: "Not found" }; }

    if (post.authorId !== userId) {
      set.status = 403; return { error: "Forbidden" };
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

  // PATCH add community note (Admin only)
  .patch("/:id/note", async ({ params: { id }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    if (!userId) { set.status = 401; return { error: "Unauthorized" }; }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== "ADMIN") { set.status = 403; return { error: "Forbidden" }; }

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
