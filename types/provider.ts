import type { z } from "zod";
import type {
  historyMessageSchema,
  notificationSchema,
} from "../contracts/provider.js";
import type { MaxMessageDto } from "./max.js";
export type ProviderHistoryMessage = z.infer<typeof historyMessageSchema>;
export type ProviderNotification = z.infer<typeof notificationSchema>;
export interface NormalizedMessage {
  message: MaxMessageDto;
  mediaUrl?: string;
}
