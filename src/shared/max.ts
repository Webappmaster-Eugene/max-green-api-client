export const MAX_TEXT_LENGTH = 4000;
export interface MaxConnectInput {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
  accountConsent: true;
}
export interface MaxSendInput { connectionId: string; chatId: string; text: string; requestId: string }
export type MaxMessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export interface MaxMessageDto {
  id: string;
  chatId: string;
  text: string;
  direction: "incoming" | "outgoing";
  timestamp: number;
  status?: MaxMessageStatus;
}
export interface MaxChatDto {
  id: string; title: string; phone?: string;
  type?: "user" | "group" | "channel" | "bot";
  unread?: number;
  lastMessage?: string;
  lastTimestamp?: number;
}
export interface MaxContactDto { id: string; title: string; phone?: string; type?: MaxChatDto["type"] }
export interface MaxSessionDto {
  connectionId: string;
  idInstance: string;
  account: string;
  expiresAt: number;
  chats: MaxChatDto[];
  messages: MaxMessageDto[];
  contacts?: MaxContactDto[];
  syncWarning?: string;
  syncedAt?: number;
}
