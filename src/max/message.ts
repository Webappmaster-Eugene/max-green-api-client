import { MAX_TEXT_LENGTH } from "../../contracts/constants.js";
import { messageIdSchema, messageStatusSchema } from "../../contracts/max.js";
import { historyMessageSchema } from "../../contracts/provider.js";
import type {
  ProviderHistoryMessage,
  ProviderNotification,
  NormalizedMessage,
} from "../../types/provider.js";
import type { MaxMessageDto } from "../../types/max.js";
import { safeFileName, safeMediaUrl, mediaMimeType } from "./media.js";

export function normalizeHistory(
  row: ProviderHistoryMessage,
  now: number,
): NormalizedMessage {
  const fileKinds = {
    imageMessage: "image",
    stickerMessage: "image",
    videoMessage: "video",
    audioMessage: "audio",
    documentMessage: "document",
  } as const;
  const fileKind =
    row.typeMessage && row.typeMessage in fileKinds
      ? fileKinds[row.typeMessage as keyof typeof fileKinds]
      : undefined;
  const mediaUrl = safeMediaUrl(row.downloadUrl);
  const fileName = safeFileName(
    row.fileName ||
      (mediaUrl ? new URL(mediaUrl).pathname.split("/").at(-1) : undefined) ||
      "Вложение",
  );
  const status = messageStatusSchema.safeParse(row.statusMessage);
  const quoteId = messageIdSchema.safeParse(
    row.quotedMessage?.idMessage || row.quotedMessage?.stanzaId,
  );
  const timestamp = row.timestamp * 1000;
  const message: MaxMessageDto = {
    id: row.idMessage,
    chatId: row.chatId,
    direction: row.type,
    text: (
      row.textMessage ||
      row.extendedTextMessage?.text ||
      row.caption ||
      (fileKind ? "" : "Сообщение другого типа — откройте в MAX")
    ).slice(0, MAX_TEXT_LENGTH),
    timestamp:
      Number.isFinite(timestamp) && timestamp <= 8640000000000000
        ? timestamp
        : now,
    status: status.success ? status.data : undefined,
    sender:
      row.type === "incoming"
        ? (row.senderContactName || row.senderName)?.slice(0, 200)
        : undefined,
    forwarded: row.isForwarded,
    quote: quoteId.success
      ? {
          id: quoteId.data,
          text: (
            row.quotedMessage?.textMessage ||
            row.quotedMessage?.text ||
            "Сообщение"
          ).slice(0, MAX_TEXT_LENGTH),
          sender: row.quotedMessage?.senderName?.slice(0, 200),
        }
      : undefined,
    attachment: fileKind
      ? {
          kind: fileKind,
          fileName,
          mimeType: mediaMimeType(fileName, row.mimeType),
          available: !!mediaUrl,
        }
      : undefined,
    deleted: row.isDeleted || !!row.deletedMessageId,
  };
  if (message.deleted) {
    message.text = "Сообщение удалено";
    message.attachment = undefined;
    message.quote = undefined;
  }
  return { message, mediaUrl: message.deleted ? undefined : mediaUrl };
}

export function normalizeNotification(
  body: ProviderNotification["body"],
  now: number,
): NormalizedMessage | null {
  const data = body.messageData;
  if (!data || !body.senderData || !body.idMessage) return null;
  const parsed = historyMessageSchema.safeParse({
    idMessage: body.idMessage,
    chatId: body.senderData.chatId,
    type:
      body.typeWebhook === "incomingMessageReceived" ? "incoming" : "outgoing",
    timestamp: body.timestamp ?? now / 1000,
    typeMessage: data.typeMessage,
    textMessage:
      data.textMessageData?.textMessage || data.extendedTextMessageData?.text,
    ...data.fileMessageData,
    quotedMessage: data.quotedMessage,
    senderName: body.senderData.senderName,
    senderContactName: body.senderData.senderContactName,
  });
  return parsed.success ? normalizeHistory(parsed.data, now) : null;
}
