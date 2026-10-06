import { useCallback, useEffect, useRef, useState } from "react";
import * as messenger from "../../../entities/messenger";
import { ApiError, messageError } from "../../../shared/api";
import type {
  MaxConnectInput,
  MaxMessageDto,
  MaxSessionDto,
  MaxReactionInput,
} from "../../../shared/contracts";
import type { MessageDraft } from "./types";

export function useMessenger() {
  const [session, setSession] = useState<MaxSessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollPaused, setPollPaused] = useState(false);
  const [selected, setSelected] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const operating = useRef(false);
  const polling = useRef<Promise<void> | null>(null);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const live = useRef(true);
  const requestIds = useRef(new Map<string, string>());
  const connectionId = session?.connectionId;

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    messenger
      .getConnection(controller.signal)
      .then((data) => {
        if (live.current) setSession(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(messageError(error));
          if (error instanceof ApiError && error.status === 401)
            setAuthRequired(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      live.current = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!connectionId || pollPaused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      if (controller.signal.aborted) return;
      if (!document.hidden && !operating.current && !polling.current) {
        const job = messenger
          .pollMax(connectionId, selectedRef.current, controller.signal)
          .then((data) => {
            if (controller.signal.aborted) return;
            setSession((current) =>
              current?.connectionId === connectionId ? data : current,
            );
            setPollError("");
            failures = 0;
          })
          .catch((error) => {
            if (controller.signal.aborted) return;
            if (error instanceof ApiError && error.status === 401)
              setAuthRequired(true);
            failures++;
            setPollError(messageError(error));
            if (error instanceof ApiError && error.code === "provider_quota")
              setPollPaused(true);
            if (error instanceof ApiError && error.status === 404) {
              setSession(null);
              setSelected("");
              setDrafts({});
            }
          });
        polling.current = job;
        await job;
        if (polling.current === job) polling.current = null;
      }
      if (!controller.signal.aborted)
        timer = setTimeout(
          tick,
          failures ? Math.min(30000, 3000 * 2 ** Math.min(failures, 4)) : 1500,
        );
    };
    timer = setTimeout(tick, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [connectionId, pollPaused]);

  const run = useCallback(
    async (work: () => Promise<void>): Promise<boolean> => {
      if (operating.current) return false;
      operating.current = true;
      setBusy(true);
      setError("");
      try {
        await polling.current;
        if (!live.current) return false;
        await work();
        return true;
      } catch (error) {
        if (live.current) {
          setError(messageError(error));
          if (error instanceof ApiError && error.status === 401)
            setAuthRequired(true);
          if (error instanceof ApiError && error.status === 404) {
            setSession(null);
            setSelected("");
            setDrafts({});
          }
        }
        return false;
      } finally {
        operating.current = false;
        if (live.current) setBusy(false);
      }
    },
    [],
  );

  const addMessage = (message: MaxMessageDto) =>
    setSession((current) =>
      current
        ? {
            ...current,
            messages: [
              ...current.messages.filter(
                (m) => !(m.id === message.id && m.chatId === message.chatId),
              ),
              message,
            ],
            chats: current.chats.map((c) =>
              c.id === message.chatId
                ? {
                    ...c,
                    lastMessage: message.text || message.attachment?.fileName,
                    lastTimestamp: message.timestamp,
                  }
                : c,
            ),
          }
        : current,
    );
  const requestId = (key: string): string => {
    const id = requestIds.current.get(key) ?? crypto.randomUUID();
    requestIds.current.set(key, id);
    return id;
  };
  const connect = (input: MaxConnectInput) =>
    run(async () => {
      setSession(await messenger.connectMax(input));
      setSelected("");
      setPollError("");
      setPollPaused(false);
      setCounts({});
      setDrafts({});
      requestIds.current.clear();
    });
  const disconnect = () =>
    run(async () => {
      if (!session) return;
      await messenger.disconnectMax(session.connectionId);
      setSession(null);
      setSelected("");
      setDrafts({});
      setCounts({});
      setPollError("");
      requestIds.current.clear();
    });
  const select = async (
    id: string,
    count = counts[id] ?? 100,
    refresh = false,
  ): Promise<boolean> => {
    if (!session || operating.current) return false;
    setSelected(id);
    setHistoryLoading(true);
    try {
      return await run(async () => {
        setSession(
          await messenger.loadHistory(session.connectionId, id, count, refresh),
        );
        setCounts((current) => ({ ...current, [id]: count }));
      });
    } finally {
      if (live.current) setHistoryLoading(false);
    }
  };
  const open = (phone: string) =>
    run(async () => {
      if (!session) return;
      const chat = await messenger.openChat(session.connectionId, phone);
      setSession((current) =>
        current
          ? {
              ...current,
              chats: [...current.chats.filter((c) => c.id !== chat.id), chat],
            }
          : current,
      );
      setSelected(chat.id);
      setHistoryLoading(true);
      try {
        setSession(
          await messenger.loadHistory(session.connectionId, chat.id, 100),
        );
        setCounts((current) => ({ ...current, [chat.id]: 100 }));
      } finally {
        setHistoryLoading(false);
      }
    });
  const updateDraft = (chatId: string, patch: Partial<MessageDraft>) =>
    setDrafts((current) => ({
      ...current,
      [chatId]: { ...(current[chatId] ?? { text: "" }), ...patch },
    }));
  const send = (file?: File) =>
    run(async () => {
      if (!session || !selected) return;
      const draft = drafts[selected] ?? { text: "" };
      const text = draft.text.trim();
      if (draft.edit) {
        setSession(
          await messenger.editMessage({
            connectionId: session.connectionId,
            chatId: selected,
            messageId: draft.edit.id,
            text,
          }),
        );
      } else {
        const key = JSON.stringify([
          session.connectionId,
          selected,
          text,
          draft.quote?.id,
          file?.name,
          file?.size,
          file?.lastModified,
        ]);
        const id = requestId(key);
        let message: MaxMessageDto;
        if (file) {
          const form = new FormData();
          form.set("connectionId", session.connectionId);
          form.set("chatId", selected);
          form.set("caption", text);
          form.set("requestId", id);
          form.set("file", file);
          if (draft.quote) form.set("quotedMessageId", draft.quote.id);
          message = await messenger.uploadFile(form);
        } else
          message = await messenger.sendText({
            connectionId: session.connectionId,
            chatId: selected,
            text,
            requestId: id,
            quotedMessageId: draft.quote?.id,
          });
        addMessage(message);
        requestIds.current.delete(key);
      }
      setDrafts((current) => ({
        ...current,
        [selected]: { text: draft.edit ? (draft.beforeEdit ?? "") : "" },
      }));
    });
  const remove = (message: MaxMessageDto, onlySenderDelete: boolean) =>
    run(async () => {
      if (session)
        setSession(
          await messenger.deleteMessage({
            connectionId: session.connectionId,
            chatId: message.chatId,
            messageId: message.id,
            onlySenderDelete,
          }),
        );
    });
  const forward = (message: MaxMessageDto, targetChatId: string) =>
    run(async () => {
      if (!session) return;
      const key = JSON.stringify([
        "forward",
        session.connectionId,
        message.chatId,
        message.id,
        targetChatId,
      ]);
      addMessage(
        await messenger.forwardMessage({
          connectionId: session.connectionId,
          chatId: message.chatId,
          messageId: message.id,
          targetChatId,
          requestId: requestId(key),
        }),
      );
      requestIds.current.delete(key);
    });
  const react = (
    message: MaxMessageDto,
    reaction: MaxReactionInput["reaction"],
  ) =>
    run(async () => {
      if (session)
        setSession(
          await messenger.reactMessage({
            connectionId: session.connectionId,
            chatId: message.chatId,
            messageId: message.id,
            reaction,
          }),
        );
    });
  const sync = () =>
    run(async () => {
      if (session) setSession(await messenger.syncMax(session.connectionId));
    });
  const read = () =>
    run(async () => {
      if (session && selected)
        setSession(await messenger.readChat(session.connectionId, selected));
    });
  return {
    session,
    loading,
    authRequired,
    busy,
    error,
    pollError,
    pollPaused,
    resumePolling: () => {
      setPollPaused(false);
      setPollError("");
    },
    selected,
    historyLoading,
    counts,
    drafts,
    connect,
    disconnect,
    select,
    open,
    updateDraft,
    send,
    remove,
    forward,
    react,
    sync,
    read,
    back: () => setSelected(""),
    clearError: () => setError(""),
  };
}
