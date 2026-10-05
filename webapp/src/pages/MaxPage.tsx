import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { MaxChatDto, MaxMessageDto, MaxMessageStatus, MaxSessionDto } from "@shared/max";
import { MAX_TEXT_LENGTH } from "@shared/max";
import "./MaxPage.css";

const STATUS: Record<MaxMessageStatus, string> = { queued: "В очереди", sent: "Отправлено", delivered: "Доставлено", read: "Прочитано", failed: "Не отправлено" };
const errorText = (err: unknown) => err instanceof Error ? err.message : "Не удалось выполнить запрос Max.";
const time = (stamp: number) => new Date(stamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const kind = (chat?: MaxChatDto) => chat?.type === "group" ? "Группа" : chat?.type === "channel" ? "Канал" : chat?.type === "bot" ? "Бот" : "Личный чат";

export function MaxPage({ client = api, standalone = false }: { client?: Pick<typeof api, "get" | "post">; standalone?: boolean }) {
  const [session, setSession] = useState<MaxSessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState("");
  const [instance, setInstance] = useState("");
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [newChat, setNewChat] = useState(false);
  const [settings, setSettings] = useState(false);
  const [historyCount, setHistoryCount] = useState<Record<string, number>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const operation = useRef(false);
  const polling = useRef<Promise<void> | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const bottom = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const earlierScroll = useRef<{ top: number; height: number } | null>(null);
  const connectionId = session?.connectionId;
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  useEffect(() => {
    let active = true;
    client.get<MaxSessionDto | null>("/api/max").then(data => { if (active) setSession(data); })
      .catch(err => { if (active) setError(errorText(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    if (!connectionId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (!operation.current && !polling.current && !document.hidden) {
        const job = client.post<MaxSessionDto>("/api/max/poll", { connectionId }).then(data => {
          if (stopped) return;
          setSession(current => current?.connectionId === connectionId ? data : current);
          setPollError("");
        }).catch(err => {
          if (stopped) return;
          setPollError(errorText(err));
          if (err instanceof ApiError && err.status === 404) { setSession(null); setDrafts({}); setSelected(""); }
        });
        polling.current = job;
        await job;
        if (polling.current === job) polling.current = null;
      }
      if (!stopped) timer = setTimeout(tick, 1500);
    };
    timer = setTimeout(tick, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [connectionId, client]);

  const messages = session?.messages.filter(m => m.chatId === selected).sort((a, b) => a.timestamp - b.timestamp) ?? [];
  useEffect(() => {
    if (historyLoading) return;
    const saved = earlierScroll.current;
    if (saved && messageList.current) {
      messageList.current.scrollTop = saved.top + messageList.current.scrollHeight - saved.height;
      earlierScroll.current = null;
    } else bottom.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected, messages.length, historyLoading]);

  const run = async (work: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    try { await polling.current; if (live.current) await work(); }
    catch (err) {
      if (!live.current) return;
      setError(errorText(err));
      if (err instanceof ApiError && err.status === 404) { setSession(null); setDrafts({}); setSelected(""); }
    } finally { operation.current = false; if (live.current) setBusy(false); }
  };
  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const data = await client.post<MaxSessionDto>("/api/max/connect", { apiUrl, idInstance: instance, apiTokenInstance: token, accountConsent: consent });
      setToken(""); setSession(data); setSelected(""); setPollError(""); setHistoryCount({}); requestIds.current.clear();
    });
  };
  const selectChat = (id: string, count = 100) => {
    if (!session || operation.current) return;
    earlierScroll.current = count > 100 && id === selected && messageList.current
      ? { top: messageList.current.scrollTop, height: messageList.current.scrollHeight } : null;
    setSelected(id); setSettings(false); setNewChat(false);
    setHistoryLoading(true);
    void run(async () => {
      try {
        const data = await client.post<MaxSessionDto>("/api/max/history", { connectionId: session.connectionId, chatId: id, count });
        setSession(data); setHistoryCount(current => ({ ...current, [id]: count }));
      } finally { setHistoryLoading(false); }
    });
  };
  const openChat = (e: React.FormEvent) => {
    e.preventDefault(); if (!session) return;
    void run(async () => {
      const chat = await client.post<MaxChatDto>("/api/max/chats", { connectionId: session.connectionId, phone });
      setSession(current => current ? { ...current, chats: [...current.chats.filter(c => c.id !== chat.id), chat] } : null);
      setSelected(chat.id); setPhone(""); setNewChat(false);
      setHistoryLoading(true);
      try {
        const data = await client.post<MaxSessionDto>("/api/max/history", { connectionId: session.connectionId, chatId: chat.id, count: 100 });
        setSession(data); setHistoryCount(current => ({ ...current, [chat.id]: 100 }));
      } finally { setHistoryLoading(false); }
    });
  };
  const send = (e: React.FormEvent) => {
    e.preventDefault(); const text = (drafts[selected] ?? "").trim();
    if (!session || !selected || !text || busy) return;
    const chatId = selected;
    const key = JSON.stringify([session.connectionId, chatId, text]);
    const requestId = requestIds.current.get(key) ?? crypto.randomUUID(); requestIds.current.set(key, requestId);
    void run(async () => {
      const message = await client.post<MaxMessageDto>("/api/max/send", { connectionId: session.connectionId, chatId, text, requestId });
      setSession(current => current ? { ...current, messages: [...current.messages.filter(m => !(m.id === message.id && m.chatId === chatId)), message],
        chats: current.chats.map(c => c.id === chatId ? { ...c, lastMessage: text, lastTimestamp: message.timestamp } : c) } : null);
      setDrafts(current => current[chatId]?.trim() === text ? { ...current, [chatId]: "" } : current); requestIds.current.delete(key);
    });
  };
  const chat = session?.chats.find(c => c.id === selected);
  const contact = session?.contacts?.find(c => c.id === selected);
  const list = tab === "contacts" ? session?.contacts ?? [] : [...(session?.chats ?? [])].sort((a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));
  const query = search.toLocaleLowerCase("ru").trim();
  const visible = list.filter(c => `${c.title} ${c.phone ?? ""} ${c.id}`.toLocaleLowerCase("ru").includes(query));

  if (loading) return <div className="max-loading" role="status">Проверяем подключение Max…</div>;
  return <div className={`max-client ${standalone ? "is-standalone" : "is-miniapp"} ${selected ? "has-chat" : ""}`}>
    <header className="max-topbar"><div className="max-brand"><span aria-hidden="true">m</span><h1>Max</h1></div>
      <div className="max-top-actions">{!standalone && <a className="max-text-button" href="https://max.nadtocheev.ru" target="_blank" rel="noreferrer">Открыть сайт ↗</a>}
        {session && <button className="max-icon-button" aria-label="Настройки подключения" aria-expanded={settings} onClick={() => setSettings(!settings)}>⚙</button>}</div>
    </header>
    {error && <div role="alert" className="max-error">{error}</div>}
    {!session ? <main className="max-login"><div className="max-login-intro"><span className="max-login-icon" aria-hidden="true">m</span><h2>Подключите аккаунт MAX</h2><p>Ваши чаты и контакты в одном месте.<br />Отправляйте сообщения и получайте ответы.</p></div>
      <form onSubmit={connect}>
        <label>Адрес API (apiUrl)<input type="url" required value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://3100.api.green-api.com" autoComplete="off" /></label>
        <label>Номер инстанса (idInstance)<input required inputMode="numeric" value={instance} onChange={e => setInstance(e.target.value)} autoComplete="off" /></label>
        <label>Ключ доступа (apiTokenInstance)<input required type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" maxLength={200} /></label>
        <label className="max-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>Владелец разрешил доступ к чатам и отправку от своего имени.</span></label>
        <button className="max-primary" disabled={busy || !consent}>{busy ? "Подключаем…" : "Подключить MAX"}</button>
        <details><summary>Где взять реквизиты?</summary><p>Создайте инстанс MAX в <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">GREEN-API</a> и авторизуйте аккаунт. Включите входящие сообщения и статусы отправки, оставьте webhookUrl пустым. Закройте другие клиенты этого инстанса.</p><p>Ключ хранится на сервере в памяти до отключения, перезапуска или окончания 8-часовой сессии.</p></details>
      </form></main> : <>
      {settings && <section className="max-settings"><h2>Подключение</h2><p>Аккаунт {session.account || session.idInstance}</p><p>Сессия до {time(session.expiresAt)}. Ключ и сообщения хранятся временно.</p>
        <p>Сайт и Mini App работают независимо. Отключитесь здесь перед подключением того же инстанса на сайте, чтобы не разделить очередь ответов между клиентами.</p>
        <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">Настройки аккаунта в GREEN-API ↗</a>
        <button disabled={busy} className="max-danger" onClick={() => void run(async () => {
          await client.post("/api/max/disconnect", { connectionId: session.connectionId }); setSession(null); setSelected(""); setDrafts({}); setSettings(false); setPollError(""); requestIds.current.clear();
        })}>Отключить</button></section>}
      {pollError && <div role="alert" className="max-error">{pollError}</div>}
      {session.syncWarning && <div className="max-notice">{session.syncWarning}</div>}
      <div className="max-workspace"><aside className="max-sidebar" aria-label="Диалоги MAX">
        <div className="max-sidebar-heading"><h2>Сообщения</h2><button className="max-icon-button" aria-label="Новый чат" onClick={() => setNewChat(!newChat)}>＋</button><button className="max-icon-button" aria-label="Обновить контакты и чаты" disabled={busy} onClick={() => void run(async () => setSession(await client.post<MaxSessionDto>("/api/max/sync", { connectionId: session.connectionId })))}>↻</button></div>
        <div className="max-search"><input aria-label="Поиск чата или контакта" placeholder="Поиск по имени или номеру" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="max-tabs" role="tablist" aria-label="Список Max"><button role="tab" aria-selected={tab === "chats"} onClick={() => setTab("chats")}>Чаты <span>{session.chats.length}</span></button><button role="tab" aria-selected={tab === "contacts"} onClick={() => setTab("contacts")}>Контакты <span>{session.contacts?.length ?? 0}</span></button></div>
        {newChat && <form onSubmit={openChat} className="max-new-chat"><label htmlFor="max-phone">Новый чат по номеру</label><input id="max-phone" type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 999 123-45-67" /><button className="max-primary" disabled={busy || !phone.trim()}>Создать чат</button></form>}
        <div className="max-dialogs">{visible.map(item => <button key={item.id} disabled={busy} className={`max-dialog ${selected === item.id ? "is-selected" : ""}`} aria-pressed={selected === item.id} onClick={() => selectChat(item.id)}>
          <span className={`max-avatar tone-${Math.abs(Number(item.id.slice(-2))) % 5}`} aria-hidden="true">{item.type === "group" ? "♧" : item.title.replace(/^\+/, "")[0]?.toUpperCase() || "М"}</span>
          <span className="max-dialog-content"><span className="max-dialog-title">{item.title}</span><small>{tab === "chats" ? (item as MaxChatDto).lastMessage || kind(item) : item.phone ? `+${item.phone}` : "Номер скрыт"}</small></span>
          <span className="max-dialog-meta">{(item as MaxChatDto).lastTimestamp && <time>{time((item as MaxChatDto).lastTimestamp!)}</time>}{!!(item as MaxChatDto).unread && <b>{(item as MaxChatDto).unread}</b>}</span>
        </button>)}{!visible.length && <p className="max-list-empty">{query ? "Ничего не найдено" : tab === "contacts" ? "Контакты пока не появились. Обновите список через несколько минут." : "Чаты появятся после синхронизации. Выберите контакт или добавьте номер."}</p>}</div>
      </aside><section className="max-conversation" aria-label="Переписка MAX">
        {selected ? <><header className="max-chat-header"><button className="max-back max-icon-button" aria-label="Назад к чатам" onClick={() => setSelected("")}>‹</button><span className="max-avatar" aria-hidden="true">{(chat?.title || contact?.title || "M")[0]}</span><div><h2>{chat?.title || contact?.title || selected}</h2><p>{kind(chat)}{chat?.phone ? ` · +${chat.phone}` : ""}</p></div></header>
          <div ref={messageList} className="max-messages" role="log" aria-live="polite" aria-relevant="additions text">{historyLoading && <p role="status" className="max-history-note">Загружаем историю…</p>}
            {!historyLoading && (historyCount[selected] ?? 0) < 5000 && <button className="max-history-button" disabled={busy} onClick={() => selectChat(selected, Math.min(5000, (historyCount[selected] ?? 100) + 100))}>Загрузить более ранние сообщения</button>}
            {!messages.length && !historyLoading && <p className="max-empty">Начните разговор.<br />Ответы появятся здесь.</p>}
            {messages.map((message, index) => {
              const date = new Date(message.timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
              const previousDate = index ? new Date(messages[index - 1].timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
              return <div className="max-message-row" key={`${message.direction}:${message.id}`}>{date !== previousDate && <div className="max-day"><span>{date}</span></div>}<article className={`max-bubble ${message.direction}`}><p>{message.text}</p><footer><time>{time(message.timestamp)}</time>{message.status && <span className={message.status === "failed" ? "max-failed" : ""}>{STATUS[message.status]}</span>}</footer></article></div>;
            })}<div ref={bottom} /></div>
          <form className="max-composer" onSubmit={send}><textarea aria-label="Сообщение в MAX" disabled={busy} value={drafts[selected] ?? ""} onChange={e => setDrafts(current => ({ ...current, [selected]: e.target.value }))} maxLength={MAX_TEXT_LENGTH} placeholder="Написать сообщение…" rows={1} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(min-width: 700px)").matches) { e.preventDefault(); send(e); } }} /><button className="max-send" aria-label="Отправить" disabled={busy || !(drafts[selected] ?? "").trim()}>{busy ? "…" : "↑"}</button></form>
        </> : <div className="max-welcome"><span aria-hidden="true">m</span><h2>Ваша переписка в Max</h2><p>Выберите чат или контакт слева.<br />Последние сообщения загрузятся автоматически.</p></div>}
      </section></div></>}
  </div>;
}
