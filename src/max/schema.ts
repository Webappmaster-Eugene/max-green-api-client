import { z } from "zod";
import { MAX_TEXT_LENGTH } from "../shared/max.js";

export const maxConnectSchema = z.object({
  apiUrl: z.string().trim().max(200),
  idInstance: z.string().trim().regex(/^\d{6,20}$/),
  apiTokenInstance: z.string().trim().regex(/^[A-Za-z0-9_-]{16,200}$/),
  accountConsent: z.literal(true),
});
export const maxConnectionSchema = z.object({ connectionId: z.string().uuid() });
export const maxChatSchema = maxConnectionSchema.extend({ phone: z.string().trim().min(5).max(30) });
export const maxSendSchema = maxConnectionSchema.extend({
  chatId: z.string().regex(/^-?\d{1,30}$/),
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  requestId: z.string().uuid(),
});

export const maxHistorySchema = maxConnectionSchema.extend({
  chatId: z.string().regex(/^-?\d{1,30}$/),
  count: z.number().int().min(1).max(5000).default(100),
});
