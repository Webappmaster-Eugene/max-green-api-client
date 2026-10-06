import { z } from "zod";
export const environmentSchema = z
  .object({
    PUBLIC_ORIGIN: z.string().url().default("http://127.0.0.1:18792"),
    AUTH_JWT_SECRET: z.string().min(32).max(200),
    ADMIN_LOGIN: z.string().optional(),
    ADMIN_PASSWORD_HASH: z.string().optional(),
    DATA_DIR: z.string().min(1).default("./data"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(18792),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  })
  .superRefine((value, ctx) => {
    const origin = new URL(value.PUBLIC_ORIGIN);
    if (
      origin.origin !== value.PUBLIC_ORIGIN ||
      origin.username ||
      origin.password ||
      (value.NODE_ENV === "production" && origin.protocol !== "https:") ||
      !["http:", "https:"].includes(origin.protocol)
    )
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_ORIGIN"],
        message: "Используйте HTTPS origin без пути для production.",
      });
  });
