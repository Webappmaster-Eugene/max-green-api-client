import { z } from "zod";
export const errorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string().max(500),
  code: z.string().optional(),
});
export const doneSchema = z.object({ done: z.literal(true) });
export const apiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ ok: z.literal(true), data });
