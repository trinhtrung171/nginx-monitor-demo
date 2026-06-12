import './monitoring'; // Bắt buộc phải nằm ở dòng đầu tiên của file chính
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { postRoutes } from "./routes/posts";
import { subredditRoutes } from "./routes/subreddits";
import { commentRoutes } from "./routes/comments";
import { authRoutes } from "./routes/auth";
import { reportRoutes } from "./routes/reports";
import { notificationRoutes } from "./routes/notifications";
import { accessLogRoutes } from "./routes/accessLogs";
import { db } from "./db";
import { mkdir } from "fs/promises";

import { registerOTel } from "./otel-middleware";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const app = new Elysia()
  .use(cors())
  .use(staticPlugin({ assets: "public", prefix: "/" }));

registerOTel(app);

app
  .get("/", () => ({ status: "DevShare API is running", version: "2.0" }))
  .post("/upload", async ({ body: { file }, request }) => {
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "File too large. Max 50MB." }), { status: 413 });
    }
    await mkdir("public/uploads", { recursive: true });
    const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'png';
    const filename = `${Date.now()}.${ext}`;
    await Bun.write(`public/uploads/${filename}`, file);
    const urlObj = new URL(request.url);
    const proto = request.headers.get("x-forwarded-proto") || (urlObj.protocol ? urlObj.protocol.slice(0, -1) : "http");
    const host = request.headers.get("x-forwarded-host") || urlObj.host;
    const baseUrl = process.env.BACKEND_URL || process.env.PUBLIC_URL || `${proto}://${host}`;
    return { url: `${baseUrl}/uploads/${filename}` };
  }, {
    body: t.Object({
      file: t.File()
    })
  })
  .get("/uploads/:filename", ({ params: { filename } }) => {
    return Bun.file(`public/uploads/${filename}`);
  })
  .use(authRoutes)
  .use(postRoutes)
  .use(subredditRoutes)
  .use(commentRoutes)
  .use(reportRoutes)
  .use(notificationRoutes)
  .use(accessLogRoutes)
  .listen({ port: Number(process.env.PORT) || 3001, hostname: "0.0.0.0" });

db.$connect().then(() => console.log('Database connected'));

console.log(
  `DevShare API is running at ${app.server?.hostname}:${app.server?.port}`
);
