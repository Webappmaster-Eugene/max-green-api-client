import type { z } from "zod";
import type {
  maxConnectSchema,
  maxSendSchema,
  maxSessionSchema,
  maxMessageSchema,
  maxChatDtoSchema,
  maxUploadSchema,
  maxEditSchema,
  maxDeleteSchema,
  maxForwardSchema,
  maxReactionSchema,
  messageTargetSchema,
} from "../contracts/max.js";
export type MaxConnectInput = z.infer<typeof maxConnectSchema>;
export type MaxSendInput = z.infer<typeof maxSendSchema>;
export type MaxUploadInput = z.infer<typeof maxUploadSchema>;
export type MaxEditInput = z.infer<typeof maxEditSchema>;
export type MaxDeleteInput = z.infer<typeof maxDeleteSchema>;
export type MaxForwardInput = z.infer<typeof maxForwardSchema>;
export type MaxReactionInput = z.infer<typeof maxReactionSchema>;
export type MessageTarget = z.infer<typeof messageTargetSchema>;
export type MaxMessageDto = z.infer<typeof maxMessageSchema>;
export type MaxMessageStatus = NonNullable<MaxMessageDto["status"]>;
export type MaxChatDto = z.infer<typeof maxChatDtoSchema>;
export type MaxContactDto = MaxChatDto;
export type MaxSessionDto = z.infer<typeof maxSessionSchema>;
export type MaxErrorCode =
  "invalid" | "unavailable" | "forbidden" | "limit" | "not_found";
