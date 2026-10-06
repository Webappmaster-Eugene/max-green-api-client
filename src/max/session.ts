import { createHash, randomUUID } from "node:crypto";
import type { z } from "zod";
import { GreenMaxClient } from "./client.js";
import { MaxError } from "./error.js";
import { normalizeHistory, normalizeNotification } from "./message.js";
import {
  safeFileName,
  safeMediaUrl,
  validateUpload,
  mediaMimeType,
} from "./media.js";
import {
  maxConnectSchema,
  maxSendSchema,
  maxUploadSchema,
} from "../../contracts/max.js";
import {
  stateSchema,
  settingsSchema,
  directorySchema,
  accountResultSchema,
  historySchema,
  notificationSchema,
  sendResultSchema,
  ackSchema,
  forwardResultSchema,
  readResultSchema,
  deleteResultSchema,
} from "../../contracts/provider.js";
import type {
  MaxChatDto,
  MaxConnectInput,
  MaxMessageDto,
  MaxMessageStatus,
  MaxSendInput,
  MaxSessionDto,
  MaxUploadInput,
  MaxEditInput,
  MaxDeleteInput,
  MaxForwardInput,
  MaxReactionInput,
  MessageTarget,
} from "../../types/max.js";
import type {
  MaxSession,
  SendAttempt,
  MediaSource,
} from "../../types/internal.js";
import type { NormalizedMessage } from "../../types/provider.js";

const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_MESSAGES = 10000;
const MAX_CHATS = 10000;
const UNKNOWN_SEND =
  "Результат отправки неизвестен. Проверьте переписку в MAX перед новой отправкой: сообщение могло попасть в очередь.";
const RANK = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new MaxError("GREEN-API вернул некорректный ответ.", "unavailable");
  return result.data;
}
function fail(message: string): never {
  throw new MaxError(message, "invalid");
}
export function maxPhone(raw: string): string {
  if (!/^[+\d\s()-]+$/.test(raw))
    fail("Введите номер телефона в международном формате.");
  const digits = raw.replace(/\D/g, "");
  if (!/^(7\d{10}|375\d{9})$/.test(digits))
    fail("Для поиска по номеру поддерживаются РФ (+7) и Беларусь (+375).");
  return digits;
}

export class MaxSessions {
  private readonly sessions = new Map<number, MaxSession>();
  private readonly connecting = new Map<number, GreenMaxClient>();
  private readonly claimed = new Set<string>();
  private readonly generations = new Map<number, number>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly makeClient = (credentials: MaxConnectInput) =>
      new GreenMaxClient(credentials),
    private readonly now = Date.now,
  ) {
    this.timer = setInterval(() => this.sweep(), 60000);
    this.timer.unref();
  }
  close(): void {
    clearInterval(this.timer);
    for (const s of this.sessions.values()) s.client.close();
    for (const c of this.connecting.values()) c.close();
    this.sessions.clear();
    this.connecting.clear();
    this.claimed.clear();
  }
  disconnectOwner(owner: number): void {
    this.generations.set(owner, (this.generations.get(owner) ?? 0) + 1);
    this.sessions.get(owner)?.client.close();
    this.connecting.get(owner)?.close();
    this.sessions.delete(owner);
  }
  private sweep(): void {
    for (const [owner, s] of this.sessions)
      if (s.dto.expiresAt <= this.now()) this.disconnectOwner(owner);
  }
  private session(owner: number, connectionId?: string): MaxSession {
    this.sweep();
    const s = this.sessions.get(owner);
    if (!s || (connectionId && connectionId !== s.dto.connectionId))
      throw new MaxError(
        "Подключение MAX завершено. Подключите аккаунт заново.",
        "not_found",
      );
    return s;
  }
  status(owner: number): MaxSessionDto | null {
    this.sweep();
    const s = this.sessions.get(owner);
    return s ? structuredClone(s.dto) : null;
  }
  private async use<T>(
    owner: number,
    connectionId: string,
    work: (s: MaxSession) => Promise<T>,
  ): Promise<T> {
    const s = this.session(owner, connectionId);
    if (s.busy)
      throw new MaxError(
        "Предыдущий запрос MAX ещё выполняется. Повторите через несколько секунд.",
        "limit",
      );
    s.busy = true;
    try {
      return await work(s);
    } finally {
      s.busy = false;
    }
  }
  async connect(owner: number, input: MaxConnectInput): Promise<MaxSessionDto> {
    const parsed = maxConnectSchema.safeParse(input);
    if (!parsed.success)
      fail("Проверьте реквизиты GREEN-API и согласие владельца аккаунта.");
    const credentials = {
      ...parsed.data,
      idInstance: BigInt(parsed.data.idInstance).toString(),
    };
    this.sweep();
    if (this.connecting.has(owner) || this.sessions.has(owner))
      fail("Сначала отключите текущий аккаунт или дождитесь подключения.");
    if (this.sessions.size + this.connecting.size >= 50)
      throw new MaxError("Сейчас слишком много подключений MAX.", "limit");
    const instance = credentials.idInstance;
    if (
      this.claimed.has(instance) ||
      [...this.sessions.values()].some((s) => s.dto.idInstance === instance)
    )
      throw new MaxError(
        "Этот инстанс уже подключён. Используйте отдельный инстанс.",
        "forbidden",
      );
    const generation = this.generations.get(owner) ?? 0;
    const client = this.makeClient(credentials);
    this.connecting.set(owner, client);
    this.claimed.add(instance);
    try {
      const state = checked(stateSchema, await client.call("getStateInstance"));
      if (state.stateInstance !== "authorized")
        fail("Авторизуйте инстанс MAX в кабинете GREEN-API.");
      const settings = checked(
        settingsSchema,
        await client.call("getSettings"),
      );
      if (settings.typeInstance !== "v3")
        fail("Выберите инстанс MAX, а не WhatsApp или Telegram.");
      if (
        settings.webhookUrl ||
        settings.incomingWebhook !== "yes" ||
        settings.outgoingWebhook !== "yes"
      )
        fail(
          "Очистите webhookUrl и включите входящие сообщения и статусы отправки в GREEN-API.",
        );
      if (generation !== (this.generations.get(owner) ?? 0))
        throw new MaxError("Подключение отменено.", "forbidden");
      const dto: MaxSessionDto = {
        connectionId: randomUUID(),
        idInstance: instance,
        account: (settings.wid ?? "").slice(0, 200),
        expiresAt: this.now() + SESSION_MS,
        chats: [],
        contacts: [],
        messages: [],
        canUpload: !!credentials.mediaUrl,
        historyPages: {},
      };
      const session: MaxSession = {
        client,
        dto,
        busy: true,
        lastSendAt: -Infinity,
        attempts: new Map(),
        historyCounts: new Map(),
        media: new Map(),
      };
      this.sessions.set(owner, session);
      try {
        await this.syncDirectory(session);
      } catch {
        dto.syncWarning =
          "Контакты пока не загрузились. Обновите список через несколько минут.";
      } finally {
        session.busy = false;
      }
      if (generation !== (this.generations.get(owner) ?? 0))
        throw new MaxError("Подключение отменено.", "forbidden");
      return structuredClone(dto);
    } catch (error) {
      client.close();
      this.sessions.delete(owner);
      throw error;
    } finally {
      this.connecting.delete(owner);
      this.claimed.delete(instance);
    }
  }
  disconnect(owner: number, connectionId: string): void {
    this.session(owner, connectionId);
    this.disconnectOwner(owner);
  }
  private chat(s: MaxSession, chatId: string): MaxChatDto {
    let chat = s.dto.chats.find((c) => c.id === chatId);
    if (!chat) {
      const contact = s.dto.contacts.find((c) => c.id === chatId);
      if (!contact) fail("Выберите чат или контакт из списка.");
      if (s.dto.chats.length >= MAX_CHATS) fail("Достигнут лимит чатов.");
      chat = { ...contact };
      s.dto.chats.push(chat);
    }
    return chat;
  }
  private message(s: MaxSession, chatId: string, id: string): MaxMessageDto {
    this.chat(s, chatId);
    const message = s.dto.messages.find(
      (m) => m.chatId === chatId && m.id === id,
    );
    if (!message || message.deleted)
      fail("Сообщение не найдено или удалено. Обновите историю.");
    return message;
  }
  async openChat(
    owner: number,
    connectionId: string,
    rawPhone: string,
  ): Promise<MaxChatDto> {
    const phone = maxPhone(rawPhone);
    return this.use(owner, connectionId, async (s) => {
      const existing = [...s.dto.chats, ...s.dto.contacts].find(
        (c) => c.phone === phone,
      );
      if (existing) return { ...this.chat(s, existing.id) };
      const answer = checked(
        accountResultSchema,
        await s.client.call("checkAccount", "POST", {
          phoneNumber: Number(phone),
        }),
      );
      if (!answer.exist || !answer.chatId)
        fail(
          "Аккаунт не найден. Проверьте номер, приватность получателя и квоты GREEN-API.",
        );
      const chat = s.dto.chats.find((c) => c.id === answer.chatId);
      if (chat) {
        chat.phone = phone;
        return { ...chat };
      }
      if (s.dto.chats.length >= MAX_CHATS) fail("Достигнут лимит чатов.");
      const created: MaxChatDto = {
        id: answer.chatId,
        title: `+${phone}`,
        phone,
        type: "user",
      };
      s.dto.chats.push(created);
      return { ...created };
    });
  }
  private async sendOnce(
    s: MaxSession,
    requestId: string,
    signature: string,
    action: () => Promise<MaxMessageDto>,
  ): Promise<MaxMessageDto> {
    const previous = s.attempts.get(requestId);
    if (previous) {
      if (previous.signature !== signature)
        fail("Этот запрос уже использован для другого сообщения.");
      if (previous.error) throw previous.error;
      return { ...previous.message! };
    }
    if (s.attempts.size >= 300)
      fail("Достигнут лимит отправок сессии. Подключитесь заново.");
    if (this.now() - s.lastSendAt < 3000)
      throw new MaxError("Подождите 3 секунды между отправками.", "limit");
    const state = checked(stateSchema, await s.client.call("getStateInstance"));
    if (state.stateInstance !== "authorized")
      fail("Инстанс не авторизован. Отправка остановлена.");
    const attempt: SendAttempt = { signature };
    s.attempts.set(requestId, attempt);
    s.lastSendAt = this.now();
    try {
      const message = await action();
      attempt.message = message;
      this.addMessage(s, { message });
      return { ...message };
    } catch (error) {
      if (
        error instanceof MaxError &&
        [
          "limit",
          "forbidden",
          "provider_quota",
          "provider_rate_limit",
        ].includes(error.code)
      ) {
        s.attempts.delete(requestId);
        throw error;
      }
      attempt.error = new MaxError(UNKNOWN_SEND, "unavailable");
      throw attempt.error;
    }
  }
  async send(owner: number, input: MaxSendInput): Promise<MaxMessageDto> {
    const a = maxSendSchema.parse(input);
    return this.use(owner, a.connectionId, async (s) => {
      this.chat(s, a.chatId);
      const quote = a.quotedMessageId
        ? this.message(s, a.chatId, a.quotedMessageId)
        : undefined;
      return this.sendOnce(
        s,
        a.requestId,
        JSON.stringify(["text", a.chatId, a.text, a.quotedMessageId]),
        async () => {
          const result = checked(
            sendResultSchema,
            await s.client.call("sendMessage", "POST", {
              chatId: a.chatId,
              message: a.text,
              ...(a.quotedMessageId
                ? { quotedMessageId: a.quotedMessageId }
                : {}),
            }),
          );
          return {
            id: result.idMessage,
            chatId: a.chatId,
            text: a.text,
            direction: "outgoing",
            timestamp: this.now(),
            status: "queued",
            quote: quote
              ? { id: quote.id, text: quote.text, sender: quote.sender }
              : undefined,
          };
        },
      );
    });
  }
  async upload(
    owner: number,
    input: MaxUploadInput,
    file: File,
  ): Promise<MaxMessageDto> {
    const a = maxUploadSchema.parse(input);
    validateUpload(file);
    const hash = createHash("sha256")
      .update(new Uint8Array(await file.arrayBuffer()))
      .digest("hex");
    return this.use(owner, a.connectionId, async (s) => {
      this.chat(s, a.chatId);
      if (!s.dto.canUpload) fail("Укажите mediaUrl в настройках подключения.");
      const quote = a.quotedMessageId
        ? this.message(s, a.chatId, a.quotedMessageId)
        : undefined;
      return this.sendOnce(
        s,
        a.requestId,
        JSON.stringify([
          "file",
          a.chatId,
          hash,
          file.name,
          a.caption,
          a.quotedMessageId,
        ]),
        async () => {
          const form = new FormData();
          form.set("chatId", a.chatId);
          form.set("file", file, safeFileName(file.name));
          form.set("fileName", safeFileName(file.name));
          if (a.caption) form.set("caption", a.caption);
          if (a.quotedMessageId) form.set("quotedMessageId", a.quotedMessageId);
          const result = checked(sendResultSchema, await s.client.upload(form));
          const mediaUrl = safeMediaUrl(result.urlFile);
          const mimeType = mediaMimeType(file.name, file.type);
          const message: MaxMessageDto = {
            id: result.idMessage,
            chatId: a.chatId,
            text: a.caption,
            direction: "outgoing",
            timestamp: this.now(),
            status: "queued",
            attachment: {
              kind: mimeType.startsWith("image/")
                ? "image"
                : mimeType.startsWith("video/")
                  ? "video"
                  : mimeType.startsWith("audio/")
                    ? "audio"
                    : "document",
              fileName: safeFileName(file.name),
              mimeType,
              available: !!mediaUrl,
            },
            quote: quote
              ? { id: quote.id, text: quote.text, sender: quote.sender }
              : undefined,
          };
          if (mediaUrl) s.media.set(`${a.chatId}:${message.id}`, mediaUrl);
          return message;
        },
      );
    });
  }
  async edit(owner: number, a: MaxEditInput): Promise<MaxSessionDto> {
    return this.use(owner, a.connectionId, async (s) => {
      const m = this.message(s, a.chatId, a.messageId);
      if (
        m.direction !== "outgoing" ||
        m.attachment ||
        this.now() - m.timestamp > 86400000 ||
        m.status === "queued" ||
        m.status === "failed"
      )
        fail(
          "Редактировать можно отправленный исходящий текст в течение 24 часов.",
        );
      checked(
        sendResultSchema,
        await s.client.call("editMessage", "POST", {
          chatId: a.chatId,
          idMessage: m.id,
          message: a.text,
        }),
      );
      m.text = a.text;
      m.edited = true;
      this.updatePreview(s, m);
      return structuredClone(s.dto);
    });
  }
  async delete(owner: number, a: MaxDeleteInput): Promise<MaxSessionDto> {
    return this.use(owner, a.connectionId, async (s) => {
      const m = this.message(s, a.chatId, a.messageId);
      if (
        m.direction !== "outgoing" ||
        m.status === "queued" ||
        m.status === "failed"
      )
        fail("Удалять можно только отправленные исходящие сообщения.");
      checked(
        deleteResultSchema,
        await s.client.call("deleteMessage", "POST", {
          chatId: a.chatId,
          idMessage: m.id,
          onlySenderDelete: a.onlySenderDelete,
        }),
      );
      m.deleted = true;
      m.text = "Сообщение удалено";
      m.attachment = undefined;
      m.quote = undefined;
      s.media.delete(`${m.chatId}:${m.id}`);
      this.updatePreview(s, m);
      return structuredClone(s.dto);
    });
  }
  async forward(owner: number, a: MaxForwardInput): Promise<MaxMessageDto> {
    return this.use(owner, a.connectionId, async (s) => {
      const source = this.message(s, a.chatId, a.messageId);
      this.chat(s, a.targetChatId);
      return this.sendOnce(
        s,
        a.requestId,
        JSON.stringify(["forward", a.chatId, a.messageId, a.targetChatId]),
        async () => {
          const result = checked(
            forwardResultSchema,
            await s.client.call("forwardMessages", "POST", {
              chatId: a.targetChatId,
              chatIdFrom: a.chatId,
              messages: [a.messageId],
            }),
          );
          const message: MaxMessageDto = {
            ...source,
            id: result.messages[0],
            chatId: a.targetChatId,
            direction: "outgoing",
            timestamp: this.now(),
            status: "queued",
            forwarded: true,
            myReaction: undefined,
            sender: undefined,
          };
          const media = s.media.get(`${a.chatId}:${a.messageId}`);
          if (media) s.media.set(`${a.targetChatId}:${message.id}`, media);
          return message;
        },
      );
    });
  }
  async react(owner: number, a: MaxReactionInput): Promise<MaxSessionDto> {
    return this.use(owner, a.connectionId, async (s) => {
      const message = this.message(s, a.chatId, a.messageId);
      checked(
        sendResultSchema,
        await s.client.call("sendReaction", "POST", {
          chatId: a.chatId,
          idMessage: a.messageId,
          reaction: a.reaction,
        }),
      );
      message.myReaction = a.reaction;
      return structuredClone(s.dto);
    });
  }
  async read(
    owner: number,
    connectionId: string,
    chatId: string,
  ): Promise<MaxSessionDto> {
    return this.use(owner, connectionId, async (s) => {
      const chat = this.chat(s, chatId);
      checked(
        readResultSchema,
        await s.client.call("readChat", "POST", { chatId }),
      );
      chat.unread = 0;
      return structuredClone(s.dto);
    });
  }
  media(owner: number, target: MessageTarget): MediaSource {
    const s = this.session(owner, target.connectionId);
    const message = this.message(s, target.chatId, target.messageId);
    const url = s.media.get(`${target.chatId}:${target.messageId}`);
    if (!url || !message.attachment)
      throw new MaxError(
        "Вложение пока недоступно. Обновите историю.",
        "not_found",
      );
    return { url, message: structuredClone(message) };
  }
  private updatePreview(s: MaxSession, m: MaxMessageDto): void {
    const chat = s.dto.chats.find((c) => c.id === m.chatId);
    if (chat && (!chat.lastTimestamp || m.timestamp >= chat.lastTimestamp)) {
      chat.lastMessage = m.text || m.attachment?.fileName;
      chat.lastTimestamp = m.timestamp;
    }
  }
  private addMessage(
    s: MaxSession,
    normalized: NormalizedMessage,
    notify = false,
  ): void {
    const m = normalized.message;
    if (normalized.mediaUrl)
      s.media.set(`${m.chatId}:${m.id}`, normalized.mediaUrl);
    const previous = s.dto.messages.find(
      (p) =>
        p.id === m.id && p.chatId === m.chatId && p.direction === m.direction,
    );
    if (previous) {
      const status =
        previous.status && RANK[previous.status] > RANK[m.status ?? "queued"]
          ? previous.status
          : (m.status ?? previous.status);
      if (!previous.deleted)
        Object.assign(previous, m, {
          status,
          edited: previous.edited || m.edited,
        });
      return;
    }
    s.dto.messages.push(m);
    s.dto.messages.sort((a, b) => a.timestamp - b.timestamp);
    if (s.dto.messages.length > MAX_MESSAGES) {
      s.dto.messages = s.dto.messages.slice(-MAX_MESSAGES);
      const keep = new Set(s.dto.messages.map((p) => `${p.chatId}:${p.id}`));
      for (const key of s.media.keys()) if (!keep.has(key)) s.media.delete(key);
    }
    this.updatePreview(s, m);
    const chat = s.dto.chats.find((c) => c.id === m.chatId);
    if (notify && chat && m.direction === "incoming")
      chat.unread = (chat.unread ?? 0) + 1;
  }
  private async syncDirectory(s: MaxSession): Promise<void> {
    const results = await Promise.allSettled([
      s.client.call("getChats"),
      s.client.call("getContacts"),
    ]);
    const parse = (
      result: PromiseSettledResult<unknown>,
    ): MaxChatDto[] | null => {
      if (result.status !== "fulfilled") return null;
      const rows = directorySchema.safeParse(result.value);
      if (!rows.success) return null;
      return rows.data.slice(0, MAX_CHATS).map((row) => {
        const phone =
          row.phoneNumber && /^\d{7,15}$/.test(String(row.phoneNumber))
            ? String(row.phoneNumber)
            : undefined;
        return {
          id: row.chatId,
          title: (
            row.contactName ||
            row.name ||
            (phone ? `+${phone}` : row.chatId)
          ).slice(0, 200),
          phone,
          type: ["group", "channel", "bot"].includes(row.type ?? "")
            ? (row.type as MaxChatDto["type"])
            : "user",
        };
      });
    };
    const chats = parse(results[0]);
    const contacts = parse(results[1]);
    if (!chats && !contacts)
      throw new MaxError("Контакты пока недоступны.", "unavailable");
    const names = new Map(contacts?.map((c) => [c.id, c]) ?? []);
    const existing = new Map(s.dto.chats.map((c) => [c.id, c]));
    for (const chat of chats ?? [])
      existing.set(chat.id, {
        ...existing.get(chat.id),
        ...chat,
        title: names.get(chat.id)?.title || chat.title,
      });
    s.dto.chats = [...existing.values()].slice(0, MAX_CHATS);
    if (contacts)
      s.dto.contacts = [...new Map(contacts.map((c) => [c.id, c])).values()];
    s.dto.syncedAt = this.now();
    s.dto.syncWarning =
      !chats || !contacts
        ? "Часть списка не обновилась. Повторите позже."
        : undefined;
  }
  async sync(owner: number, connectionId: string): Promise<MaxSessionDto> {
    return this.use(owner, connectionId, async (s) => {
      await this.syncDirectory(s);
      s.historyCounts.clear();
      s.dto.historyPages = {};
      return structuredClone(s.dto);
    });
  }
  async history(
    owner: number,
    connectionId: string,
    chatId: string,
    count = 100,
    refresh = false,
  ): Promise<MaxSessionDto> {
    if (
      !/^-?\d{1,30}$/.test(chatId) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 5000
    )
      fail("Некорректный запрос истории.");
    return this.use(owner, connectionId, async (s) => {
      const chat = this.chat(s, chatId);
      if (refresh || (s.historyCounts.get(chatId) ?? 0) < count) {
        const result = checked(
          historySchema,
          await s.client.call("getChatHistory", "POST", {
            chatId,
            count: Math.min(count + 1, 5000),
          }),
        );
        for (const row of result.slice(0, count).reverse())
          if (row.chatId === chatId)
            this.addMessage(s, normalizeHistory(row, this.now()));
        s.historyCounts.set(chatId, count);
        s.dto.historyPages ??= {};
        s.dto.historyPages[chatId] = {
          requested: count,
          received: Math.min(result.length, count),
          hasMore: result.length > count && count < 5000,
        };
      }
      chat.unread = 0;
      return structuredClone(s.dto);
    });
  }
  async poll(
    owner: number,
    connectionId: string,
    activeChatId?: string,
  ): Promise<MaxSessionDto> {
    return this.use(owner, connectionId, async (s) => {
      const result = await s.client.call(
        "receiveNotification",
        "GET",
        undefined,
        "?receiveTimeout=1",
      );
      if (result === null) return structuredClone(s.dto);
      const { receiptId, body } = checked(notificationSchema, result);
      if (
        String(body.instanceData.idInstance) !== s.dto.idInstance ||
        body.instanceData.typeInstance !== "v3"
      )
        throw new MaxError(
          "Уведомление не принадлежит этому инстансу.",
          "unavailable",
        );
      if (body.typeWebhook === "outgoingMessageStatus") {
        const message = s.dto.messages.find(
          (m) =>
            m.id === body.idMessage &&
            m.chatId === body.chatId &&
            m.direction === "outgoing",
        );
        const mapped = ["failed", "noAccount", "notInGroup"].includes(
          body.status ?? "",
        )
          ? "failed"
          : body.status;
        if (
          message &&
          mapped &&
          mapped in RANK &&
          RANK[mapped as MaxMessageStatus] > RANK[message.status ?? "queued"]
        )
          message.status = mapped as MaxMessageStatus;
      } else if (
        [
          "incomingMessageReceived",
          "outgoingMessageReceived",
          "outgoingAPIMessageReceived",
        ].includes(body.typeWebhook)
      ) {
        const data = body.messageData;
        const chatId = body.senderData?.chatId;
        const edited = data?.editedMessageData;
        const deleted = data?.deletedMessageData;
        if (chatId && (edited || deleted)) {
          const message = s.dto.messages.find(
            (m) =>
              m.chatId === chatId &&
              m.id === (edited?.stanzaId || deleted?.stanzaId),
          );
          if (message && edited && !message.deleted) {
            message.text = edited.textMessage.slice(0, 4000);
            message.edited = true;
            this.updatePreview(s, message);
          }
          if (message && deleted) {
            message.deleted = true;
            message.text = "Сообщение удалено";
            message.attachment = undefined;
            message.quote = undefined;
            s.media.delete(`${message.chatId}:${message.id}`);
            this.updatePreview(s, message);
          }
        } else if (
          data &&
          !["reactionMessage", "editedMessage", "deletedMessage"].includes(
            data.typeMessage,
          )
        ) {
          const normalized = normalizeNotification(body, this.now());
          if (!normalized)
            throw new MaxError(
              "Некорректное уведомление оставлено в очереди.",
              "unavailable",
            );
          if (!s.dto.chats.some((c) => c.id === normalized.message.chatId)) {
            if (s.dto.chats.length >= MAX_CHATS)
              throw new MaxError("Достигнут лимит чатов.", "unavailable");
            s.dto.chats.push({
              id: normalized.message.chatId,
              title: (
                body.senderData?.chatName ||
                body.senderData?.senderContactName ||
                body.senderData?.senderName ||
                normalized.message.chatId
              ).slice(0, 200),
            });
          }
          this.addMessage(
            s,
            normalized,
            body.typeWebhook === "incomingMessageReceived",
          );
          if (activeChatId) {
            const active = s.dto.chats.find((c) => c.id === activeChatId);
            if (active) active.unread = 0;
          }
        }
      }
      checked(
        ackSchema,
        await s.client.call(
          "deleteNotification",
          "DELETE",
          undefined,
          `/${receiptId}`,
        ),
      );
      return structuredClone(s.dto);
    });
  }
}
