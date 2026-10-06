import type { z } from "zod";
import { request } from "../../../shared/api";
import {
  maxSessionSchema,
  maxSavedStateSchema,
  maxChatDtoSchema,
  maxMessageSchema,
  doneSchema,
} from "../../../shared/contracts";
import type {
  MaxConnectInput,
  MaxReconnectInput,
  MaxSendInput,
  MaxEditInput,
  MaxDeleteInput,
  MaxForwardInput,
  MaxReactionInput,
} from "../../../shared/contracts";

const post = <T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  body: unknown,
  signal?: AbortSignal,
): Promise<z.infer<T>> =>
  request(path, schema, { method: "POST", body, signal });
export const getConnection = (signal?: AbortSignal) =>
  request("/api/max", maxSessionSchema.nullable(), { signal });
export const getSavedConnection = (signal?: AbortSignal) =>
  request("/api/max/profile", maxSavedStateSchema.nullable(), { signal });
export const reconnectMax = (input: MaxReconnectInput) =>
  post("/api/max/reconnect", maxSessionSchema, input);
export const connectMax = (input: MaxConnectInput) =>
  post("/api/max/connect", maxSessionSchema, input);
export const disconnectMax = (connectionId: string) =>
  post("/api/max/disconnect", doneSchema, { connectionId });
export const syncMax = (connectionId: string) =>
  post("/api/max/sync", maxSessionSchema, { connectionId });
export const pollMax = (
  connectionId: string,
  activeChatId?: string,
  signal?: AbortSignal,
) =>
  post(
    "/api/max/poll",
    maxSessionSchema,
    { connectionId, activeChatId: activeChatId || undefined },
    signal,
  );
export const loadHistory = (
  connectionId: string,
  chatId: string,
  count: number,
  refresh = false,
) =>
  post("/api/max/history", maxSessionSchema, {
    connectionId,
    chatId,
    count,
    refresh,
  });
export const openChat = (connectionId: string, phone: string) =>
  post("/api/max/chats", maxChatDtoSchema, { connectionId, phone });
export const sendText = (input: MaxSendInput) =>
  post("/api/max/send", maxMessageSchema, input);
export const uploadFile = (form: FormData) =>
  post("/api/max/upload", maxMessageSchema, form);
export const editMessage = (input: MaxEditInput) =>
  post("/api/max/edit", maxSessionSchema, input);
export const deleteMessage = (input: MaxDeleteInput) =>
  post("/api/max/delete", maxSessionSchema, input);
export const forwardMessage = (input: MaxForwardInput) =>
  post("/api/max/forward", maxMessageSchema, input);
export const reactMessage = (input: MaxReactionInput) =>
  post("/api/max/reaction", maxSessionSchema, input);
export const readChat = (connectionId: string, chatId: string) =>
  post("/api/max/read", maxSessionSchema, { connectionId, chatId });
