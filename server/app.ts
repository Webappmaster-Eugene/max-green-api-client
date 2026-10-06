import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";
import { AppError } from "./lib/error.js";
import { RateLimiter } from "./lib/rateLimit.js";
import { MaxError } from "../src/max/error.js";
import { downloadMedia } from "../src/max/media.js";
import { AUTH_TTL_SECONDS, MAX_FILE_SIZE } from "../contracts/constants.js";
import {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../contracts/auth.js";
import {
  maxConnectSchema,
  maxReconnectSchema,
  maxChatSchema,
  maxConnectionSchema,
  maxSendSchema,
  maxHistorySchema,
  maxPollSchema,
  maxUploadSchema,
  maxEditSchema,
  maxDeleteSchema,
  maxForwardSchema,
  maxReactionSchema,
  maxReadSchema,
  mediaQuerySchema,
} from "../contracts/max.js";
import type { AppOptions, AppEnv, AppContext } from "../types/server.js";

export function createApp({
  sessions,
  auth,
  origin,
}: AppOptions): Hono<AppEnv> {
  if (!auth || !sessions || new URL(origin).origin !== origin)
    throw new Error("Настройте авторизацию приложения.");
  const app = new Hono<AppEnv>();
  const limiter = new RateLimiter();
  const secure = origin.startsWith("https:");
  const cookie = secure ? "__Host-max-auth" : "max-auth";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "Strict" as const,
    path: "/",
  };
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (secure) c.header("Strict-Transport-Security", "max-age=31536000");
    await next();
  });
  app.get("/health", (c) => c.json({ ok: true }));
  app.use("/api/*", async (c, next) => {
    const media = c.req.method === "GET" && c.req.path === "/api/max/media";
    if (
      (!media && c.req.header("X-Max-Client") !== "1") ||
      (c.req.header("Origin") && c.req.header("Origin") !== origin) ||
      c.req.header("Sec-Fetch-Site") === "cross-site"
    )
      throw new AppError("Откройте клиент Max на его сайте.", 403);
    const ip =
      c.req.header("X-Forwarded-For")?.split(",").at(-1)?.trim() || "local";
    limiter.consume(`${ip}:api`, 180);
    if (c.req.path === "/api/auth/login") {
      if (c.req.method !== "POST")
        throw new AppError("Неизвестный запрос.", 404);
      limiter.consume(`${ip}:login`, 5, 60000);
    } else {
      const grant = await auth.verify(getCookie(c, cookie));
      c.set("grant", grant);
      if (c.req.method !== "GET" && c.req.method !== "HEAD")
        auth.verifyCsrf(grant, c.req.header("X-CSRF-Token"));
      if (c.req.path.startsWith("/api/admin/") && grant.user.role !== "admin")
        throw new AppError("Требуются права администратора.", 403);
      if (c.req.path.endsWith("/connect") || c.req.path.endsWith("/reconnect"))
        limiter.consume(`${grant.user.id}:connect`, 5);
      if (
        ["/api/max/send", "/api/max/upload", "/api/max/forward"].includes(
          c.req.path,
        )
      )
        limiter.consume(`${grant.user.id}:send`, 20);
    }
    await next();
  });
  app.use("/api/*", async (c, next) =>
    bodyLimit({
      maxSize: c.req.path === "/api/max/upload" ? MAX_FILE_SIZE + 32768 : 32768,
      onError: (ctx) =>
        ctx.json({ ok: false, error: "Слишком большой запрос." }, 413),
    })(c, next),
  );
  function post<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    work: (c: AppContext, input: z.output<S>) => Promise<unknown> | unknown,
  ): void {
    app.post(path, async (c) => {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        throw new AppError("Некорректный запрос.");
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new AppError("Проверьте заполненные поля.");
      return c.json({ ok: true, data: await work(c, parsed.data) });
    });
  }
  post("/api/auth/login", loginSchema, async (c, input) => {
    limiter.consume(`${input.login}:login`, 10, 15 * 60000);
    const result = await auth.login(input);
    setCookie(c, cookie, result.token, {
      ...cookieOptions,
      maxAge: AUTH_TTL_SECONDS,
    });
    return result.session;
  });
  app.get("/api/auth/session", async (c) => {
    const grant = c.get("grant");
    const renewed = await auth.renew(grant);
    if (renewed) {
      setCookie(c, cookie, renewed.token, {
        ...cookieOptions,
        maxAge: AUTH_TTL_SECONDS,
      });
      return c.json({ ok: true, data: renewed.session });
    }
    return c.json({
      ok: true,
      data: {
        user: grant.user,
        expiresAt: grant.expiresAt,
        csrfToken: grant.csrf,
      },
    });
  });
  app.post("/api/auth/logout", (c) => {
    const grant = c.get("grant");
    auth.logout(grant.jti);
    sessions.disconnectOwner(grant.user.id);
    deleteCookie(c, cookie, cookieOptions);
    return c.json({ ok: true, data: { done: true } });
  });
  post("/api/auth/password", changePasswordSchema, async (c, input) => {
    const id = c.get("grant").user.id;
    await auth.users.changePassword(id, input.currentPassword, input.password);
    auth.revokeUser(id);
    sessions.disconnectOwner(id);
    deleteCookie(c, cookie, cookieOptions);
    return { done: true };
  });
  app.get("/api/admin/users", (c) =>
    c.json({ ok: true, data: auth.users.list() }),
  );
  post("/api/admin/users", createUserSchema, (_c, input) =>
    auth.users.create(input),
  );
  post("/api/admin/users/access", updateUserSchema, async (c, input) => {
    const user = await auth.users.setActive(
      input.id,
      input.active,
      c.get("grant").user.id,
    );
    auth.revokeUser(user.id);
    sessions.disconnectOwner(user.id);
    return user;
  });
  post("/api/admin/users/password", resetPasswordSchema, async (_c, input) => {
    await auth.users.setPassword(input.id, input.password);
    auth.revokeUser(input.id);
    sessions.disconnectOwner(input.id);
    return { done: true };
  });
  app.get("/api/max", async (c) =>
    c.json({ ok: true, data: await sessions.restore(c.get("grant").user.id) }),
  );
  app.get("/api/max/profile", (c) =>
    c.json({ ok: true, data: sessions.savedState(c.get("grant").user.id) }),
  );
  post("/api/max/reconnect", maxReconnectSchema, (c, input) =>
    sessions.reconnect(c.get("grant").user.id, input),
  );
  post("/api/max/connect", maxConnectSchema, (c, input) =>
    sessions.connect(c.get("grant").user.id, input),
  );
  post("/api/max/disconnect", maxConnectionSchema, (c, input) => {
    sessions.disconnect(c.get("grant").user.id, input.connectionId);
    return { done: true };
  });
  post("/api/max/chats", maxChatSchema, (c, input) =>
    sessions.openChat(c.get("grant").user.id, input.connectionId, input.phone),
  );
  post("/api/max/send", maxSendSchema, (c, input) =>
    sessions.send(c.get("grant").user.id, input),
  );
  post("/api/max/poll", maxPollSchema, (c, input) =>
    sessions.poll(
      c.get("grant").user.id,
      input.connectionId,
      input.activeChatId,
    ),
  );
  post("/api/max/sync", maxConnectionSchema, (c, input) =>
    sessions.sync(c.get("grant").user.id, input.connectionId),
  );
  post("/api/max/history", maxHistorySchema, (c, input) =>
    sessions.history(
      c.get("grant").user.id,
      input.connectionId,
      input.chatId,
      input.count,
      input.refresh,
    ),
  );
  post("/api/max/edit", maxEditSchema, (c, input) =>
    sessions.edit(c.get("grant").user.id, input),
  );
  post("/api/max/delete", maxDeleteSchema, (c, input) =>
    sessions.delete(c.get("grant").user.id, input),
  );
  post("/api/max/forward", maxForwardSchema, (c, input) =>
    sessions.forward(c.get("grant").user.id, input),
  );
  post("/api/max/reaction", maxReactionSchema, (c, input) =>
    sessions.react(c.get("grant").user.id, input),
  );
  post("/api/max/read", maxReadSchema, (c, input) =>
    sessions.read(c.get("grant").user.id, input.connectionId, input.chatId),
  );
  app.post("/api/max/upload", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Выберите файл.");
    const fields = Object.fromEntries(
      [...form.entries()].filter(([key]) => key !== "file"),
    );
    const input = maxUploadSchema.safeParse(fields);
    if (!input.success) throw new AppError("Проверьте файл и выбранный чат.");
    const message = await sessions.upload(
      c.get("grant").user.id,
      input.data,
      file,
    );
    return c.json({ ok: true, data: message });
  });
  app.get("/api/max/media", async (c) => {
    const query = mediaQuerySchema.safeParse(c.req.query());
    if (!query.success) throw new AppError("Некорректное вложение.");
    const media = sessions.media(c.get("grant").user.id, query.data);
    const result = await downloadMedia(media.url);
    const fileName = media.message.attachment!.fileName;
    c.header(
      "Content-Disposition",
      `attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/'/g, "%27")}`,
    );
    c.header("Content-Type", "application/octet-stream");
    c.header("Content-Security-Policy", "default-src 'none'; sandbox");
    return c.body(Buffer.from(result.bytes));
  });
  app.all("/api/*", () => {
    throw new AppError("Неизвестный запрос Max.", 404);
  });
  app.onError((error, c) =>
    c.json(
      {
        ok: false,
        code: error instanceof MaxError ? error.code : undefined,
        error:
          error instanceof AppError || error instanceof MaxError
            ? error.message
            : "Сервер временно недоступен.",
      },
      error instanceof AppError || error instanceof MaxError
        ? error.status
        : 500,
    ),
  );
  return app;
}
