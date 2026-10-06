import { z } from "zod";

export const loginNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.-]{2,39}$/);
export const passwordSchema = z.string().min(12).max(128);
export const roleSchema = z.enum(["admin", "member"]);
export const userSchema = z.object({
  id: z.number().int().positive().safe(),
  login: loginNameSchema,
  role: roleSchema,
  active: z.boolean(),
});
export const loginSchema = z
  .object({ login: loginNameSchema, password: z.string().min(1).max(128) })
  .strict();
export const authSessionSchema = z.object({
  user: userSchema,
  expiresAt: z.number().int().positive(),
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const createUserSchema = z
  .object({
    login: loginNameSchema,
    password: passwordSchema,
    role: roleSchema.default("member"),
  })
  .strict();
export const updateUserSchema = z
  .object({ id: z.number().int().positive().safe(), active: z.boolean() })
  .strict();
export const resetPasswordSchema = z
  .object({ id: z.number().int().positive().safe(), password: passwordSchema })
  .strict();
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password: passwordSchema,
  })
  .strict();
export const storedUserSchema = userSchema.extend({
  passwordHash: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/),
  version: z.number().int().nonnegative(),
});
export const userStoreSchema = z
  .object({ version: z.literal(1), users: z.array(storedUserSchema).max(100) })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.users.map((u) => u.login)).size !== value.users.length ||
      new Set(value.users.map((u) => u.id)).size !== value.users.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate user" });
  });
export const jwtPayloadSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  jti: z.string().uuid(),
  version: z.number().int().nonnegative(),
  csrf: z.string().regex(/^[a-f0-9]{64}$/),
  exp: z.number().int().positive(),
});
