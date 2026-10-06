import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { environmentSchema } from "../contracts/env.js";
import { createApp } from "./app.js";
import { MaxSessions } from "../src/max/session.js";
import { UserRepository } from "./auth/users.js";
import { AuthSessions } from "./auth/sessions.js";

async function start(): Promise<void> {
  const checked = environmentSchema.safeParse(process.env);
  if (!checked.success)
    throw new Error(
      "Настройте окружение приложения по документации. Запуск без авторизации запрещён.",
    );
  const env = checked.data;
  const bootstrap =
    env.ADMIN_LOGIN && env.ADMIN_PASSWORD_HASH
      ? { login: env.ADMIN_LOGIN, passwordHash: env.ADMIN_PASSWORD_HASH }
      : undefined;
  const users = await UserRepository.open(
    join(env.DATA_DIR, "users.json"),
    bootstrap,
  );
  const auth = new AuthSessions(users, {
    secret: env.AUTH_JWT_SECRET,
    origin: env.PUBLIC_ORIGIN,
  });
  const sessions = new MaxSessions();
  const app = createApp({ sessions, auth, origin: env.PUBLIC_ORIGIN });
  app.get("/docs/user-guide.md", serveStatic({ path: "./docs/USER_GUIDE.md" }));
  app.get("*", serveStatic({ root: "./dist/client" }));
  app.get("*", serveStatic({ path: "./dist/client/index.html" }));
  const server = serve({
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
  });
  console.log("Max client server started");
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      auth.close();
      sessions.close();
      server.close();
    });
}
start().catch(() => {
  console.error(
    "Max client startup failed. Check authentication and data storage configuration.",
  );
  process.exitCode = 1;
});
