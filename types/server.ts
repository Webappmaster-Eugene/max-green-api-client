import type { AuthGrant } from "./auth.js";
import type { Context } from "hono";
import type { AuthSessions } from "../server/auth/sessions.js";
import type { MaxSessions } from "../src/max/session.js";
export interface AppOptions {
  auth: AuthSessions;
  sessions: MaxSessions;
  origin: string;
}
export interface AppEnv {
  Variables: { grant: AuthGrant };
}
export type AppContext = Context<AppEnv>;
