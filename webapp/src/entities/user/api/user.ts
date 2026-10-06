import { z } from "zod";
import { request, setCsrfToken } from "../../../shared/api";
import {
  authSessionSchema,
  loginSchema,
  createUserSchema,
  userSchema,
  updateUserSchema,
  resetPasswordSchema,
  changePasswordSchema,
  doneSchema,
} from "../../../shared/contracts";
import type {
  LoginInput,
  CreateUserInput,
  AuthSession,
} from "../../../shared/contracts";

export async function getAuthSession(
  signal?: AbortSignal,
): Promise<AuthSession> {
  const session = await request("/api/auth/session", authSessionSchema, {
    signal,
  });
  setCsrfToken(session.csrfToken);
  return session;
}
export async function login(input: LoginInput): Promise<AuthSession> {
  const session = await request("/api/auth/login", authSessionSchema, {
    method: "POST",
    body: loginSchema.parse(input),
  });
  setCsrfToken(session.csrfToken);
  return session;
}
export async function logout(): Promise<void> {
  await request("/api/auth/logout", doneSchema, { method: "POST" });
  setCsrfToken("");
}
export const getUsers = () => request("/api/admin/users", z.array(userSchema));
export const createUser = (input: CreateUserInput) =>
  request("/api/admin/users", userSchema, {
    method: "POST",
    body: createUserSchema.parse(input),
  });
export const updateAccess = (id: number, active: boolean) =>
  request("/api/admin/users/access", userSchema, {
    method: "POST",
    body: updateUserSchema.parse({ id, active }),
  });
export const resetPassword = (id: number, password: string) =>
  request("/api/admin/users/password", doneSchema, {
    method: "POST",
    body: resetPasswordSchema.parse({ id, password }),
  });
export const changePassword = (currentPassword: string, password: string) =>
  request("/api/auth/password", doneSchema, {
    method: "POST",
    body: changePasswordSchema.parse({ currentPassword, password }),
  });
