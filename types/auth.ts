import type { z } from "zod";
import type {
  userSchema,
  storedUserSchema,
  userStoreSchema,
  authSessionSchema,
  loginSchema,
  createUserSchema,
} from "../contracts/auth.js";
export type User = z.infer<typeof userSchema>;
export type StoredUser = z.infer<typeof storedUserSchema>;
export type UserStore = z.infer<typeof userStoreSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export interface AuthGrant {
  user: User;
  jti: string;
  csrf: string;
  expiresAt: number;
}
export interface AuthOptions {
  secret: string;
  origin: string;
  ttlSeconds?: number;
  now?: () => number;
}
export interface LoginResult {
  token: string;
  session: AuthSession;
}
export interface BootstrapUser {
  login: string;
  passwordHash: string;
}
