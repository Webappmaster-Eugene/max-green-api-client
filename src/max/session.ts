import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GreenMaxClient } from "./client.js";
import { MaxError } from "./error.js";
import { MAX_TEXT_LENGTH } from "../shared/max.js";
import { maxConnectSchema, maxSendSchema } from "./schema.js";
import type { MaxChatDto, MaxContactDto, MaxConnectInput, MaxMessageDto, MaxMessageStatus, MaxSendInput, MaxSessionDto } from "../shared/max.js";

const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_MESSAGES = 10000;
const MAX_CHATS = 10000;
const UNKNOWN_SEND = "Результат отправки неизвестен. Проверьте переписку в MAX перед новой отправкой: сообщение могло попасть в очередь.";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function str(value: unknown, limit = 200): string { return typeof value === "string" ? value.slice(0, limit) : ""; }
function fail(message: string, code: "invalid" | "unavailable" = "invalid"): never { throw new MaxError(message, code); }
export function maxPhone(raw: string): string {
  if (!/^[+\d\s()-]+$/.test(raw)) fail("Введите номер телефона в международном формате.");
  const digits = raw.replace(/\D/g, "");
  if (!/^(7\d{10}|375\d{9})$/.test(digits)) fail("Для поиска по номеру поддерживаются РФ (+7) и Беларусь (+375).");
  return digits;
}

interface SendAttempt { chatId: string; text: string; message?: MaxMessageDto; error?: MaxError }
interface Session {
  client: GreenMaxClient;
  dto: MaxSessionDto;
  busy: boolean;
  lastSendAt: number;
  attempts: Map<string, SendAttempt>;
  historyCounts: Map<string, number>;
}

/** One consumer per instance, bounded RAM, no credentials in persistence or snapshots. */
export class MaxSessions {
  private readonly sessions = new Map<number, Session>();
  private readonly connecting = new Set<number>();
  private readonly claimed = new Set<string>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly makeClient = (credentials: MaxConnectInput) => new GreenMaxClient(credentials),
    private readonly now = Date.now,
  ) {
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }
  close(): void { clearInterval(this.timer); this.sessions.clear(); }
  private sweep(): void {
    for (const [owner, s] of this.sessions) if (!s.busy && s.dto.expiresAt <= this.now()) this.sessions.delete(owner);
  }
  private session(owner: number, connectionId?: string): Session {
    this.sweep();
    const s = this.sessions.get(owner);
    if (!s || s.dto.expiresAt <= this.now() || (connectionId && connectionId !== s.dto.connectionId)) {
      throw new MaxError("Подключение MAX завершено. Подключите аккаунт заново.", "not_found");
    }
    return s;
  }
  status(owner: number): MaxSessionDto | null {
    this.sweep();
    const s = this.sessions.get(owner);
    return s && s.dto.expiresAt > this.now() ? structuredClone(s.dto) : null;
  }
  private async use<T>(owner: number, connectionId: string, work: (s: Session) => Promise<T>): Promise<T> {
    const s = this.session(owner, connectionId);
    if (s.busy) throw new MaxError("Предыдущий запрос MAX ещё выполняется. Повторите через несколько секунд.", "limit");
    s.busy = true;
    try { return await work(s); } finally { s.busy = false; }
  }
  async connect(owner: number, input: MaxConnectInput): Promise<MaxSessionDto> {
    const parsed = maxConnectSchema.safeParse(input);
    if (!parsed.success) fail("Проверьте реквизиты GREEN-API и согласие владельца аккаунта.");
    const credentials = { ...parsed.data, idInstance: BigInt(parsed.data.idInstance).toString() };
    const client = this.makeClient(credentials);
    this.sweep();
    if (this.connecting.has(owner) || this.sessions.get(owner)?.busy) throw new MaxError("Дождитесь предыдущего запроса MAX.", "limit");
    if (this.sessions.has(owner)) fail("Сначала отключите текущий аккаунт MAX.");
    if (this.sessions.size + this.connecting.size >= 50) throw new MaxError("Сейчас слишком много подключений MAX. Попробуйте позже.", "limit");
    // idInstance is global in GREEN-API, regardless of which cluster alias is used.
    const instance = credentials.idInstance;
    if (this.claimed.has(instance) || [...this.sessions.values()].some(s => s.dto.idInstance === instance)) {
      throw new MaxError("Этот инстанс уже подключён в Советнике. Используйте отдельный инстанс.", "forbidden");
    }
    this.connecting.add(owner); this.claimed.add(instance);
    try {
      const state = record(await client.call("getStateInstance"));
      if (state.stateInstance !== "authorized") fail("Авторизуйте инстанс MAX в кабинете GREEN-API; аккаунт должен быть без блокировок.");
      const settings = record(await client.call("getSettings"));
      if (settings.typeInstance !== "v3") fail("Выберите инстанс MAX, а не WhatsApp или Telegram.");
      if (settings.webhookUrl !== "" || settings.incomingWebhook !== "yes" || settings.outgoingWebhook !== "yes") {
        fail("В кабинете GREEN-API очистите webhookUrl и включите входящие сообщения и статусы отправки. Настройки применяются примерно за минуту.");
      }
      const dto: MaxSessionDto = {
        connectionId: randomUUID(), idInstance: instance, account: str(settings.wid),
        expiresAt: this.now() + SESSION_MS, chats: [], contacts: [], messages: [],
      };
      this.sessions.set(owner, { client, dto, busy: false, lastSendAt: -Infinity, attempts: new Map(), historyCounts: new Map() });
      const session = this.sessions.get(owner)!;
      session.busy = true;
      try { await this.syncDirectory(session); }
      catch { dto.syncWarning = "Контакты пока не загрузились. Нажмите «Обновить»; у GREEN-API синхронизация может занять несколько минут."; }
      finally { session.busy = false; }
      return structuredClone(dto);
    } finally { this.connecting.delete(owner); this.claimed.delete(instance); }
  }
  disconnect(owner: number, connectionId: string): void {
    const s = this.session(owner, connectionId);
    if (s.busy) throw new MaxError("Дождитесь завершения запроса MAX и отключитесь ещё раз.", "limit");
    this.sessions.delete(owner);
  }
  async openChat(owner: number, connectionId: string, rawPhone: string): Promise<MaxChatDto> {
    const phone = maxPhone(rawPhone);
    return this.use(owner, connectionId, async s => {
      const existing = s.dto.chats.find(c => c.phone === phone);
      if (existing) return { ...existing };
      if (s.dto.chats.length >= MAX_CHATS) fail("Достигнут лимит списка чатов.");
      const answer = record(await s.client.call("checkAccount", "POST", { phoneNumber: Number(phone) }));
      if (answer.exist === false) fail("Аккаунт MAX не найден. Проверьте номер и настройки поиска получателя.");
      const id = str(answer.chatId, 30);
      if (answer.exist !== true || !/^-?\d+$/.test(id)) fail("Не удалось найти получателя. Проверьте настройки приватности MAX и лимиты поиска.");
      const chat = s.dto.chats.find(c => c.id === id);
      if (chat) { chat.phone = phone; return { ...chat }; }
      const created = { id, title: `+${phone}`, phone };
      s.dto.chats.push(created);
      return { ...created };
    });
  }
  async send(owner: number, input: MaxSendInput): Promise<MaxMessageDto> {
    const parsed = maxSendSchema.safeParse(input);
    if (!parsed.success) fail("Выберите чат и введите текст до 4000 символов.");
    const a = parsed.data;
    return this.use(owner, a.connectionId, async s => {
      const previous = s.attempts.get(a.requestId);
      if (previous) {
        if (previous.chatId !== a.chatId || previous.text !== a.text) fail("Этот запрос уже использован для другого сообщения.");
        if (previous.error) throw previous.error;
        return { ...previous.message! };
      }
      if (!s.dto.chats.some(c => c.id === a.chatId)) fail("Сначала выберите чат или контакт.");
      if (s.attempts.size >= 300) fail("Достигнут лимит отправок этой сессии. Подключите аккаунт заново.");
      if (this.now() - s.lastSendAt < 3000) throw new MaxError("Подождите 3 секунды между отправками.", "limit");
      const state = record(await s.client.call("getStateInstance"));
      if (state.stateInstance !== "authorized") fail("Инстанс MAX не авторизован или ограничен. Отправка остановлена.");
      const attempt: SendAttempt = { chatId: a.chatId, text: a.text };
      s.attempts.set(a.requestId, attempt);
      s.lastSendAt = this.now();
      let result: unknown;
      try { result = await s.client.call("sendMessage", "POST", { chatId: a.chatId, message: a.text }); }
      catch (err) {
        if (err instanceof MaxError && ["limit", "forbidden"].includes(err.code)) {
          s.attempts.delete(a.requestId);
          throw err;
        }
        attempt.error = new MaxError(UNKNOWN_SEND, "unavailable");
        throw attempt.error;
      }
      const id = str(record(result).idMessage);
      if (!id) { attempt.error = new MaxError(UNKNOWN_SEND, "unavailable"); throw attempt.error; }
      const message: MaxMessageDto = { id, chatId: a.chatId, text: a.text, direction: "outgoing", timestamp: this.now(), status: "queued" };
      attempt.message = message;
      this.addMessage(s, message);
      return { ...message };
    });
  }
  private addMessage(s: Session, message: MaxMessageDto, notify = false): void {
    const previous = s.dto.messages.find(m => m.id === message.id && m.chatId === message.chatId && m.direction === message.direction);
    if (previous) {
      if (message.status) {
        const rank = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
        if (rank[message.status] > rank[previous.status ?? "queued"]) previous.status = message.status;
      }
      return;
    }
    s.dto.messages.push(message);
    s.dto.messages.sort((a, b) => a.timestamp - b.timestamp);
    s.dto.messages = s.dto.messages.slice(-MAX_MESSAGES);
    const chat = s.dto.chats.find(c => c.id === message.chatId);
    if (chat) {
      if (!chat.lastTimestamp || message.timestamp >= chat.lastTimestamp) {
        chat.lastMessage = message.text; chat.lastTimestamp = message.timestamp;
      }
      if (notify && message.direction === "incoming") chat.unread = (chat.unread ?? 0) + 1;
    }
  }
  private directory(raw: unknown): MaxContactDto[] {
    if (!Array.isArray(raw)) fail("GREEN-API не вернул список контактов.", "unavailable");
    return raw.slice(0, MAX_CHATS).flatMap(value => {
      const row = record(value); const id = str(row.chatId, 30);
      if (!/^-?\d+$/.test(id)) return [];
      const phone = typeof row.phoneNumber === "number" && Number.isSafeInteger(row.phoneNumber) && row.phoneNumber > 0
        ? String(row.phoneNumber) : typeof row.phoneNumber === "string" && /^\d{7,15}$/.test(row.phoneNumber) ? row.phoneNumber : undefined;
      const kind = str(row.type);
      return [{ id, title: str(row.contactName) || str(row.name) || (phone ? `+${phone}` : id), phone,
        type: ["group", "channel", "bot"].includes(kind) ? kind as MaxChatDto["type"] : "user" as const }];
    });
  }
  private async syncDirectory(s: Session): Promise<void> {
    const results = await Promise.allSettled([s.client.call("getChats"), s.client.call("getContacts")]);
    const chats = results[0].status === "fulfilled" ? this.directory(results[0].value) : null;
    const contacts = results[1].status === "fulfilled" ? this.directory(results[1].value) : null;
    if (!chats && !contacts) throw (results[0] as PromiseRejectedResult).reason;
    const titles = new Map(contacts?.map(c => [c.id, c]) ?? []);
    const existing = new Map(s.dto.chats.map(c => [c.id, c]));
    for (const chat of chats ?? []) existing.set(chat.id, { ...existing.get(chat.id), ...chat, title: titles.get(chat.id)?.title || chat.title });
    s.dto.chats = [...existing.values()].slice(0, MAX_CHATS);
    if (contacts) s.dto.contacts = [...new Map(contacts.map(c => [c.id, c])).values()];
    s.dto.syncedAt = this.now();
    s.dto.syncWarning = !chats || !contacts ? "Часть списка не обновилась. Повторите обновление позже." : undefined;
  }
  async sync(owner: number, connectionId: string): Promise<MaxSessionDto> {
    return this.use(owner, connectionId, async s => { await this.syncDirectory(s); s.historyCounts.clear(); return structuredClone(s.dto); });
  }
  async history(owner: number, connectionId: string, chatId: string, count = 100): Promise<MaxSessionDto> {
    if (!/^-?\d{1,30}$/.test(chatId) || !Number.isInteger(count) || count < 1 || count > 5000) fail("Некорректный запрос истории.");
    return this.use(owner, connectionId, async s => {
      let chat = s.dto.chats.find(c => c.id === chatId);
      if (!chat) {
        const contact = s.dto.contacts?.find(c => c.id === chatId);
        if (!contact) fail("Выберите чат или контакт из списка.");
        if (s.dto.chats.length >= MAX_CHATS) fail("Достигнут лимит списка чатов.");
        chat = { ...contact }; s.dto.chats.push(chat);
      }
      if ((s.historyCounts.get(chatId) ?? 0) < count) {
        const result = await s.client.call("getChatHistory", "POST", { chatId, count });
        if (!Array.isArray(result)) fail("Не удалось получить историю MAX.", "unavailable");
        for (const item of result.slice(0, count).reverse()) {
          const row = record(item); const id = str(row.idMessage);
          if (!id || row.chatId !== chatId || !["incoming", "outgoing"].includes(str(row.type))) continue;
          const text = str(row.textMessage, MAX_TEXT_LENGTH) || str(record(row.extendedTextMessage).text, MAX_TEXT_LENGTH) || str(row.caption, MAX_TEXT_LENGTH);
          const status = str(row.statusMessage) as MaxMessageStatus;
          this.addMessage(s, { id, chatId, text: row.isDeleted ? "Сообщение удалено" : text || "Вложение — откройте в MAX",
            direction: row.type as "incoming" | "outgoing", timestamp: typeof row.timestamp === "number" ? row.timestamp * 1000 : this.now(),
            status: ["sent", "delivered", "read", "failed"].includes(status) ? status : undefined });
        }
        s.historyCounts.set(chatId, count);
      }
      chat.unread = 0;
      return structuredClone(s.dto);
    });
  }
  async poll(owner: number, connectionId: string): Promise<MaxSessionDto> {
    return this.use(owner, connectionId, async s => {
      const result = await s.client.call("receiveNotification", "GET", undefined, "?receiveTimeout=1");
      if (result === null) return structuredClone(s.dto);
      const envelope = z.object({ receiptId: z.number().int().positive().safe(), body: z.record(z.unknown()) }).safeParse(result);
      if (!envelope.success) fail("Некорректное уведомление GREEN-API; оно оставлено в очереди.", "unavailable");
      const { receiptId, body } = envelope.data;
      const instanceData = record(body.instanceData);
      const instanceId = typeof instanceData.idInstance === "number" && Number.isSafeInteger(instanceData.idInstance)
        ? String(instanceData.idInstance) : str(instanceData.idInstance);
      if (instanceId !== s.dto.idInstance || instanceData.typeInstance !== "v3") {
        fail("Уведомление не принадлежит подключённому инстансу MAX.", "unavailable");
      }
      if (body.typeWebhook === "outgoingMessageStatus") {
        const message = s.dto.messages.find(m => m.id === body.idMessage && m.chatId === body.chatId && m.direction === "outgoing");
        const status = str(body.status);
        if (message) {
          const mapped = ["failed", "noAccount", "notInGroup"].includes(status) ? "failed" : status;
          const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
          if (mapped in rank && rank[mapped] > rank[message.status ?? "queued"]) message.status = mapped as MaxMessageStatus;
        }
      } else if (["incomingMessageReceived", "outgoingMessageReceived", "outgoingAPIMessageReceived"].includes(str(body.typeWebhook))) {
        const sender = record(body.senderData);
        const data = record(body.messageData);
        const text = data.typeMessage === "textMessage" ? str(record(data.textMessageData).textMessage, MAX_TEXT_LENGTH)
          : data.typeMessage === "extendedTextMessage" ? str(record(data.extendedTextMessageData).text, MAX_TEXT_LENGTH) : "";
        const chatId = str(sender.chatId, 30); const id = str(body.idMessage);
        if (["textMessage", "extendedTextMessage"].includes(str(data.typeMessage)) && (!text || !id || !/^-?\d+$/.test(chatId))) {
          fail("Некорректное текстовое уведомление MAX; оно оставлено в очереди.", "unavailable");
        }
        if (text && id && /^-?\d+$/.test(chatId)) {
          if (!s.dto.chats.some(c => c.id === chatId)) {
            if (s.dto.chats.length >= MAX_CHATS) fail("Достигнут лимит чатов. Уведомление оставлено в очереди.", "unavailable");
            s.dto.chats.push({ id: chatId, title: str(sender.chatName) || str(sender.senderName) || chatId });
          }
          this.addMessage(s, { id, chatId, text, direction: body.typeWebhook === "incomingMessageReceived" ? "incoming" : "outgoing", timestamp: typeof body.timestamp === "number" ? body.timestamp * 1000 : this.now() }, body.typeWebhook === "incomingMessageReceived");
        }
      }
      // Store before ACK. A failed ACK is retried, and message IDs prevent duplicates.
      const ack = record(await s.client.call("deleteNotification", "DELETE", undefined, `/${receiptId}`));
      if (ack.result !== true) fail("GREEN-API не подтвердил обработку уведомления. Повторите получение.", "unavailable");
      return structuredClone(s.dto);
    });
  }
}
