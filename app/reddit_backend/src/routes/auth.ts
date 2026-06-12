import { Elysia, t } from "elysia";
import { db } from "../db";
// Trigger TS refresh

export const authRoutes = new Elysia({ prefix: "/auth" })
  // POST /auth/register
  .post("/register", async ({ body, set }) => {
    const existing = await db.user.findFirst({
      where: { OR: [{ username: body.username }, { email: body.email }] }
    });
    if (existing) {
      set.status = 400;
      return { error: "Username or email already taken" };
    }
    try {
      const hashedPassword = await Bun.password.hash(body.password);
      const user = await db.user.create({
        data: {
          username: body.username,
          email: body.email,
          password: hashedPassword,
        },
        select: { id: true, username: true, email: true, bio: true, avatarColor: true, avatarUrl: true, bannerUrl: true, role: true, karma: true, createdAt: true }
      });
      return { user, message: "Account created successfully" };
    } catch (e) {
      console.error(e);
      set.status = 500;
      return { error: "Failed to create account" };
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 3, maxLength: 20 }),
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 6 }),
    })
  })

  // POST /auth/login
  .post("/login", async ({ body, set }) => {
    const user = await db.user.findFirst({
      where: { OR: [{ username: body.identifier }, { email: body.identifier }] },
      include: { subscriptions: true }
    });
    if (!user) {
      set.status = 401;
      return { error: "Invalid credentials" };
    }
    const valid = await Bun.password.verify(body.password, user.password);
    if (!valid) {
      set.status = 401;
      return { error: "Invalid credentials" };
    }
    return {
      user: { id: user.id, username: user.username, email: user.email, bio: user.bio, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl, bannerUrl: user.bannerUrl, role: user.role, karma: user.karma, createdAt: user.createdAt, subscriptions: user.subscriptions },
      message: "Login successful"
    };
  }, {
    body: t.Object({
      identifier: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 }),
    })
  })

  // GET /auth/me/:username - get profile
  .get("/me/:username", async ({ params: { username }, set }) => {
    const user = await db.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: {
        id: true, username: true, email: true, bio: true, avatarColor: true, avatarUrl: true, bannerUrl: true, role: true,
        karma: true, createdAt: true, subscriptions: true,
        posts: {
          include: { subreddit: true, _count: { select: { comments: true, votes: true } }, votes: { select: { type: true, userId: true } }, bookmarks: { select: { userId: true } } },
          orderBy: { createdAt: "desc" }, take: 10
        },
        comments: {
          include: { post: { include: { subreddit: true } } },
          orderBy: { createdAt: "desc" }, take: 10
        },
        _count: { select: { posts: true, comments: true } }
      }
    });
    if (!user) { set.status = 404; return { error: "User not found" }; }
    return user;
  })

  // PATCH /auth/me/:username - update profile
  .patch("/me/:username", async ({ params: { username }, body, headers, set }) => {
    const userId = headers["x-user-id"];
    const target = await db.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } });
    if (!target) { set.status = 404; return { error: "User not found" }; }
    if (!userId || target.id !== userId) {
      set.status = 403; return { error: "Forbidden" };
    }
    try {
      if (body.newUsername && body.newUsername !== username) {
        const existing = await db.user.findFirst({ where: { username: { equals: body.newUsername, mode: 'insensitive' } } });
        if (existing) { set.status = 400; return { error: "Username already taken" }; }
      }

      const user = await db.user.update({
        where: { id: target.id },
        data: {
          username: body.newUsername ?? undefined,
          bio: body.bio ?? undefined,
          avatarColor: body.avatarColor ?? undefined,
          avatarUrl: body.avatarUrl ?? undefined,
          bannerUrl: body.bannerUrl ?? undefined,
        },
        select: { id: true, username: true, email: true, bio: true, avatarColor: true, avatarUrl: true, bannerUrl: true, role: true, karma: true, createdAt: true }
      });
      return user;
    } catch (e) {
      set.status = 400;
      return { error: "Update failed" };
    }
  }, {
    body: t.Object({
      newUsername: t.Optional(t.String({ minLength: 3, maxLength: 20 })),
      bio: t.Optional(t.String({ maxLength: 1000 })),
      avatarColor: t.Optional(t.String()),
      avatarUrl: t.Optional(t.String()),
      bannerUrl: t.Optional(t.String()),
    })
  });
