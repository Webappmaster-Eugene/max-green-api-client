import { z } from "zod";
import { chatIdSchema, messageIdSchema } from "./max.js";

const string = z.string().max(100000);
export const stateSchema = z.object({ stateInstance: z.string() });
export const settingsSchema = z.object({
  typeInstance: z.string(),
  wid: z.string().optional(),
  webhookUrl: z.string(),
  incomingWebhook: z.string(),
  outgoingWebhook: z.string(),
  outgoingMessageWebhook: z.string().optional(),
  outgoingAPIMessageWebhook: z.string().optional(),
});
export const directorySchema = z.array(
  z.object({
    chatId: chatIdSchema,
    name: z.string().optional(),
    contactName: z.string().optional(),
    phoneNumber: z.union([z.string(), z.number().int().safe()]).optional(),
    type: z.string().optional(),
  }),
);
export const sendResultSchema = z.object({
  idMessage: messageIdSchema,
  urlFile: z.string().optional(),
});
export const accountResultSchema = z.object({
  exist: z.boolean(),
  chatId: chatIdSchema.optional(),
});
export const ackSchema = z.object({ result: z.literal(true) });
export const forwardResultSchema = z.object({
  messages: z.array(messageIdSchema).min(1),
});
export const readResultSchema = z.object({ setRead: z.literal(true) });
export const deleteResultSchema = z.null();
export const quotedProviderSchema = z.object({
  idMessage: z.string().optional(),
  stanzaId: z.string().optional(),
  textMessage: string.optional(),
  text: string.optional(),
  senderName: string.optional(),
});
export const fileProviderSchema = z.object({
  downloadUrl: z.string().max(2000).optional(),
  caption: string.optional(),
  fileName: z.string().max(2000).optional(),
  mimeType: z.string().max(100).optional(),
  isForwarded: z.boolean().optional(),
});
export const historyMessageSchema = z.object({
  idMessage: messageIdSchema,
  chatId: chatIdSchema,
  type: z.enum(["incoming", "outgoing"]),
  timestamp: z.number().finite().nonnegative(),
  typeMessage: z.string().optional(),
  textMessage: string.optional(),
  caption: string.optional(),
  extendedTextMessage: z.object({ text: string.optional() }).optional(),
  statusMessage: z.string().optional(),
  downloadUrl: z.string().max(2000).optional(),
  fileName: z.string().max(2000).optional(),
  mimeType: z.string().max(100).optional(),
  isForwarded: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  deletedMessageId: z.string().optional(),
  quotedMessage: quotedProviderSchema.optional(),
  senderName: string.optional(),
  senderContactName: string.optional(),
});
export const historySchema = z.array(historyMessageSchema);
export const notificationSchema = z
  .object({
    receiptId: z.number().int().positive().safe(),
    body: z.object({
      instanceData: z.object({
        idInstance: z.union([z.string(), z.number().int().safe()]),
        typeInstance: z.string(),
      }),
      typeWebhook: z.string(),
      timestamp: z.number().finite().nonnegative().optional(),
      idMessage: z.string().optional(),
      chatId: z.string().optional(),
      status: z.string().optional(),
      senderData: z
        .object({
          chatId: chatIdSchema,
          chatName: string.optional(),
          chatType: z.string().optional(),
          senderName: string.optional(),
          senderContactName: string.optional(),
        })
        .optional(),
      messageData: z
        .object({
          typeMessage: z.string(),
          textMessageData: z.object({ textMessage: string }).optional(),
          extendedTextMessageData: z
            .object({
              text: string.optional(),
              stanzaId: z.string().optional(),
            })
            .optional(),
          fileMessageData: fileProviderSchema.optional(),
          quotedMessage: quotedProviderSchema.optional(),
          editedMessageData: z
            .object({ stanzaId: messageIdSchema, textMessage: string })
            .optional(),
          deletedMessageData: z
            .object({ stanzaId: messageIdSchema })
            .optional(),
        })
        .optional(),
    }),
  })
  .superRefine(({ body }, ctx) => {
    if (
      ![
        "incomingMessageReceived",
        "outgoingMessageReceived",
        "outgoingAPIMessageReceived",
      ].includes(body.typeWebhook)
    )
      return;
    const data = body.messageData;
    const invalid =
      !body.senderData ||
      !messageIdSchema.safeParse(body.idMessage).success ||
      !data ||
      (data.typeMessage === "textMessage" &&
        !data.textMessageData?.textMessage) ||
      (data.typeMessage === "extendedTextMessage" &&
        !data.extendedTextMessageData?.text) ||
      (data.typeMessage === "editedMessage" && !data.editedMessageData) ||
      (data.typeMessage === "deletedMessage" && !data.deletedMessageData) ||
      ([
        "imageMessage",
        "videoMessage",
        "audioMessage",
        "documentMessage",
        "stickerMessage",
      ].includes(data.typeMessage) &&
        !data.fileMessageData);
    if (invalid)
      ctx.addIssue({
        code: "custom",
        path: ["body", "messageData"],
        message: "Некорректное уведомление сообщения.",
      });
  });
