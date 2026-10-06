import { z } from "zod";
import { MAX_TEXT_LENGTH } from "./constants.js";

export const chatIdSchema = z.string().regex(/^-?\d{1,30}$/);
export const messageIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const maxConnectSchema = z
  .object({
    apiUrl: z.string().trim().url().max(200),
    mediaUrl: z.string().trim().url().max(200).optional(),
    idInstance: z
      .string()
      .trim()
      .regex(/^\d{6,20}$/),
    apiTokenInstance: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{16,200}$/),
    accountConsent: z.literal(true),
  })
  .strict();
export const maxConnectionSchema = z
  .object({ connectionId: z.string().uuid() })
  .strict();
export const maxChatSchema = maxConnectionSchema.extend({
  phone: z.string().trim().min(5).max(30),
});
export const maxHistorySchema = maxConnectionSchema.extend({
  chatId: chatIdSchema,
  count: z.number().int().min(1).max(5000).default(100),
  refresh: z.boolean().default(false),
});
export const maxPollSchema = maxConnectionSchema.extend({
  activeChatId: chatIdSchema.optional(),
});
export const messageTargetSchema = maxConnectionSchema.extend({
  chatId: chatIdSchema,
  messageId: messageIdSchema,
});
export const maxSendSchema = maxConnectionSchema.extend({
  chatId: chatIdSchema,
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  requestId: z.string().uuid(),
  quotedMessageId: messageIdSchema.optional(),
});
export const maxUploadSchema = maxConnectionSchema.extend({
  chatId: chatIdSchema,
  caption: z.string().trim().max(MAX_TEXT_LENGTH).default(""),
  requestId: z.string().uuid(),
  quotedMessageId: messageIdSchema.optional(),
});
export const maxEditSchema = messageTargetSchema.extend({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});
export const maxDeleteSchema = messageTargetSchema.extend({
  onlySenderDelete: z.boolean().default(false),
});
export const maxForwardSchema = messageTargetSchema.extend({
  targetChatId: chatIdSchema,
  requestId: z.string().uuid(),
});
export const maxReactionSchema = messageTargetSchema.extend({
  reaction: z.enum(["👍", "❤️", "😂", "😮", "😢", "🙏"]),
});
export const maxReadSchema = maxConnectionSchema.extend({
  chatId: chatIdSchema,
});
export const mediaQuerySchema = messageTargetSchema;
export const attachmentSchema = z.object({
  kind: z.enum(["image", "video", "audio", "document"]),
  fileName: z.string().max(200),
  mimeType: z.string().max(100),
  available: z.boolean(),
});
export const quoteSchema = z.object({
  id: messageIdSchema,
  text: z.string().max(MAX_TEXT_LENGTH),
  sender: z.string().max(200).optional(),
});
export const messageStatusSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);
export const maxMessageSchema = z.object({
  id: messageIdSchema,
  chatId: chatIdSchema,
  text: z.string().max(MAX_TEXT_LENGTH),
  direction: z.enum(["incoming", "outgoing"]),
  timestamp: z.number().finite().nonnegative(),
  status: messageStatusSchema.optional(),
  attachment: attachmentSchema.optional(),
  quote: quoteSchema.optional(),
  sender: z.string().max(200).optional(),
  edited: z.boolean().optional(),
  deleted: z.boolean().optional(),
  forwarded: z.boolean().optional(),
  myReaction: z.string().max(20).optional(),
});
export const maxChatDtoSchema = z.object({
  id: chatIdSchema,
  title: z.string().max(200),
  phone: z.string().optional(),
  type: z.enum(["user", "group", "channel", "bot"]).optional(),
  unread: z.number().int().nonnegative().optional(),
  lastMessage: z.string().max(MAX_TEXT_LENGTH).optional(),
  lastTimestamp: z.number().finite().nonnegative().optional(),
});
export const maxSessionSchema = z.object({
  connectionId: z.string().uuid(),
  idInstance: z.string(),
  account: z.string().max(200),
  expiresAt: z.number().finite(),
  chats: z.array(maxChatDtoSchema).max(10000),
  contacts: z.array(maxChatDtoSchema).max(10000),
  messages: z.array(maxMessageSchema).max(10000),
  syncWarning: z.string().optional(),
  syncedAt: z.number().finite().optional(),
  canUpload: z.boolean(),
});
