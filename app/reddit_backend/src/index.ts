import './monitoring';
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { postRoutes } from "./routes/posts";
import { subredditRoutes } from "./routes/subreddits";
import { commentRoutes } from "./routes/comments";
import { authRoutes } from "./routes/auth";
import { reportRoutes } from "./routes/reports";
import { notificationRoutes } from "./routes/notifications";
import { accessLogRoutes } from "./routes/accessLogs";
import { db } from "./db";

import { registerOTel, setAppServer, errorCounter } from "./otel-middleware";
import { registerAccessLogger } from "./access-logger";
import { registerMetricsRoute, recordError } from "./prometheus-exporter";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const app = new Elysia()
  .use(cors());

registerOTel(app);
registerAccessLogger(app);
registerMetricsRoute(app);

app.onError(({ error, request, set }) => {
  const status = set.status || 500;
  if (status >= 500) {
    errorCounter.add(1, {
      method: request.method,
      path: new URL(request.url).pathname,
    });
    recordError(request.method, new URL(request.url).pathname);
  }
});

app
  .get("/", () => ({ status: "DevShare API is running", version: "2.0" }))
  .post("/upload", async ({ body: { file }, request }) => {
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "File too large. Max 50MB." }), { status: 413 });
    }
    const rawExt = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'png';
    const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
    const filename = `${Date.now()}.${ext}`;
    const buffer = await file.arrayBuffer();
    const media = await db.media.create({
      data: {
        filename,
        mimeType: file.type || 'application/octet-stream',
        data: Buffer.from(buffer),
        size: file.size,
      },
    });
    const urlObj = new URL(request.url);
    const proto = request.headers.get("x-forwarded-proto") || (urlObj.protocol ? urlObj.protocol.slice(0, -1) : "http");
    const host = request.headers.get("x-forwarded-host") || urlObj.host;
    const baseUrl = process.env.BACKEND_URL || process.env.PUBLIC_URL || `${proto}://${host}`;
    return { url: `${baseUrl}/uploads/${media.id}` };
  }, {
    body: t.Object({
      file: t.File()
    })
  })
  .get("/uploads/:id", async ({ params: { id }, set }) => {
    const media = await db.media.findUnique({ where: { id } });
    if (media) {
      return new Response(media.data, {
        headers: {
          'content-type': media.mimeType,
          'content-length': String(media.data.byteLength || media.data.length || 0),
          'cache-control': 'public, max-age=31536000',
        },
      });
    }
    const file = Bun.file(`public/uploads/${id}`);
    if (await file.exists()) {
      return file;
    }
    set.status = 404;
    return { error: "File not found" };
  })
  .use(authRoutes)
  .use(postRoutes)
  .use(subredditRoutes)
  .use(commentRoutes)
  .use(reportRoutes)
  .use(notificationRoutes)
  .use(accessLogRoutes)
  .listen({ port: Number(process.env.PORT) || 3001, hostname: "0.0.0.0" });

setAppServer(app.server);

console.log(
  `DevShare API is running at ${app.server?.hostname}:${app.server?.port}`
);
