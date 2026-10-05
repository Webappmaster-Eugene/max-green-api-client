import { randomBytes, randomInt } from "node:crypto";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { MaxSessions } from "../src/max/session.js";
import { MaxError } from "../src/max/error.js";
import { maxConnectSchema, maxChatSchema, maxConnectionSchema, maxSendSchema, maxHistorySchema } from "../src/max/schema.js";
import type { ZodSchema } from "zod";

const TTL = 8 * 60 * 60 * 1000;
export function createApp(sessions = new MaxSessions(), origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:18792") {
  const app = new Hono<{ Variables: { owner: number } }>();
  const visitors = new Map<string, { owner: number; expires: number }>();
  const limits = new Map<string, { count: number; expires: number }>();
  const secure = origin.startsWith("https:");
  const cookie = secure ? "__Host-max-client" : "max-client";
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store"); c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer"); c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (secure) c.header("Strict-Transport-Security", "max-age=31536000");
    await next();
  });
  app.get("/health", c => c.json({ ok: true }));
  app.use("/api/*", bodyLimit({ maxSize: 16000, onError: c => c.json({ ok: false, error: "Слишком большой запрос." }, 413) }));
  app.use("/api/*", async (c, next) => {
    if (c.req.header("X-Max-Client") !== "1" || (c.req.header("Origin") && c.req.header("Origin") !== origin)) {
      return c.json({ ok: false, error: "Откройте клиент Max на его сайте." }, 403);
    }
    const now = Date.now();
    for (const [key, value] of visitors) if (value.expires <= now) { try { const s = sessions.status(value.owner); if (s) sessions.disconnect(value.owner, s.connectionId); } catch { /* Busy sessions expire in the core. */ } visitors.delete(key); }
    for (const [key, value] of limits) if (value.expires <= now) limits.delete(key);
    const ip = c.req.header("X-Forwarded-For")?.split(",").at(-1)?.trim() || "local";
    const bucket = `${ip}:${c.req.path.endsWith("/connect") ? "connect" : "api"}`;
    const limit = limits.get(bucket) ?? { count: 0, expires: now + 60000 };
    if (++limit.count > (bucket.endsWith(":connect") ? 5 : 120) || limits.size > 5000) return c.json({ ok: false, error: "Слишком много запросов. Подождите минуту." }, 429);
    limits.set(bucket, limit);
    let key = getCookie(c, cookie); let visitor = key ? visitors.get(key) : undefined;
    if (!visitor) {
      if (c.req.path !== "/api/max" && !c.req.path.endsWith("/connect")) return c.json({ ok: false, error: "Сессия завершена. Подключите Max заново." }, 404);
      if (visitors.size >= 500) return c.json({ ok: false, error: "Слишком много подключений. Попробуйте позже." }, 503);
      key = randomBytes(32).toString("hex");
      visitor = { owner: randomInt(1, 2 ** 47), expires: now + TTL }; visitors.set(key, visitor);
      setCookie(c, cookie, key, { httpOnly: true, secure, sameSite: "Strict", path: "/", maxAge: TTL / 1000 });
    }
    c.set("owner", visitor.owner); await next();
  });
  app.get("/api/max", c => c.json({ ok: true, data: sessions.status(c.get("owner")) }));
  function route<T>(path: string, schema: ZodSchema<T>, action: (owner: number, input: T) => Promise<unknown> | unknown) {
    app.post(`/api/max/${path}`, async c => {
      let input: unknown;
      try { input = await c.req.json(); } catch { return c.json({ ok: false, error: "Некорректный запрос." }, 400); }
      const parsed = schema.safeParse(input);
      if (!parsed.success) return c.json({ ok: false, error: "Проверьте заполненные поля." }, 400);
      try { return c.json({ ok: true, data: await action(c.get("owner"), parsed.data) }); }
      catch (error) { return c.json({ ok: false, error: error instanceof MaxError ? error.message : "Не удалось выполнить запрос Max." }, error instanceof MaxError ? error.status : 500); }
    });
  }
  route("connect", maxConnectSchema, (owner, input) => sessions.connect(owner, input));
  route("disconnect", maxConnectionSchema, (owner, input) => { sessions.disconnect(owner, input.connectionId); return { disconnected: true }; });
  route("chats", maxChatSchema, (owner, input) => sessions.openChat(owner, input.connectionId, input.phone));
  route("send", maxSendSchema, (owner, input) => sessions.send(owner, input));
  route("poll", maxConnectionSchema, (owner, input) => sessions.poll(owner, input.connectionId));
  route("sync", maxConnectionSchema, (owner, input) => sessions.sync(owner, input.connectionId));
  route("history", maxHistorySchema, (owner, input) => sessions.history(owner, input.connectionId, input.chatId, input.count));
  app.onError((_error, c) => c.json({ ok: false, error: "Сервер временно недоступен." }, 500));
  return app;
}
