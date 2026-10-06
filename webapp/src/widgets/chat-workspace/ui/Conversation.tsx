import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconSearch,
  IconX,
  IconRefresh,
  IconChecks,
  IconDots,
  IconDownload,
  IconMessageCircle,
} from "@tabler/icons-react";
import { MessageBubble } from "../../../entities/message";
import { MessageActions } from "../../../features/message-actions";
import { Composer } from "../../../features/compose-message";
import { formatDate, chatKind } from "../../../shared/lib";
import type { MaxMessageDto } from "../../../shared/contracts";
import type { MessengerViewProps } from "../model/types";

export function Conversation({ controller }: MessengerViewProps) {
  const {
    session,
    selected,
    busy,
    historyLoading,
    counts,
    drafts,
    select,
    updateDraft,
    send,
    remove,
    forward,
    react,
    read,
    back,
  } = controller;
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deleted, setDeleted] = useState<MaxMessageDto | null>(null);
  const [onlyMe, setOnlyMe] = useState(false);
  const [forwarded, setForwarded] = useState<MaxMessageDto | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const preserve = useRef<{ height: number; top: number } | null>(null);
  const previousChat = useRef("");
  const previousOutgoing = useRef("");
  const messages = useMemo(
    () =>
      (session?.messages ?? [])
        .filter((m) => m.chatId === selected)
        .sort((a, b) => a.timestamp - b.timestamp),
    [session?.messages, selected],
  );
  const visible = useMemo(() => {
    const q = search.toLocaleLowerCase("ru").trim();
    return q
      ? messages.filter((m) =>
          `${m.text} ${m.sender ?? ""} ${m.attachment?.fileName ?? ""}`
            .toLocaleLowerCase("ru")
            .includes(q),
        )
      : messages;
  }, [messages, search]);
  const chat =
    session?.chats.find((c) => c.id === selected) ||
    session?.contacts.find((c) => c.id === selected);
  const draft = drafts[selected] ?? { text: "" };
  useEffect(() => {
    if (historyLoading || !viewport.current) return;
    const saved = preserve.current;
    if (saved) {
      viewport.current.scrollTop =
        saved.top + viewport.current.scrollHeight - saved.height;
      preserve.current = null;
    } else if (
      selected !== previousChat.current ||
      (messages.at(-1)?.direction === "outgoing" &&
        messages.at(-1)?.id !== previousOutgoing.current &&
        Date.now() - messages.at(-1)!.timestamp < 10000) ||
      viewport.current.scrollHeight -
        viewport.current.scrollTop -
        viewport.current.clientHeight <
        250
    )
      bottom.current?.scrollIntoView?.({ block: "nearest" });
    previousChat.current = selected;
    if (messages.at(-1)?.direction === "outgoing")
      previousOutgoing.current = messages.at(-1)!.id;
  }, [selected, visible.length, historyLoading, messages]);
  const earlier = () => {
    if (viewport.current)
      preserve.current = {
        height: viewport.current.scrollHeight,
        top: viewport.current.scrollTop,
      };
    void select(selected, Math.min(5000, (counts[selected] ?? 100) + 100));
  };
  const exportChat = () => {
    const content = messages
      .map(
        (m) =>
          `[${new Date(m.timestamp).toLocaleString("ru-RU")}] ${m.direction === "outgoing" ? "Вы" : m.sender || chat?.title || "Собеседник"}: ${m.text}${m.attachment ? ` [${m.attachment.fileName}]` : ""}`,
      )
      .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "max-conversation.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!selected || !session)
    return (
      <Box className="conversation-welcome">
        <Stack align="center" gap="md">
          <IconMessageCircle size={54} stroke={1.3} />
          <Text size="xl" fw={700}>
            Ваша переписка в Max
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            Выберите чат или контакт.
            <br />
            История загрузится автоматически.
          </Text>
        </Stack>
      </Box>
    );
  return (
    <Box
      component="section"
      className="conversation"
      aria-label="Переписка MAX"
    >
      <Group className="conversation-header" gap="sm" wrap="nowrap">
        <ActionIcon
          className="mobile-back"
          variant="subtle"
          aria-label="Назад к чатам"
          onClick={back}
        >
          <IconArrowLeft size={21} />
        </ActionIcon>
        <Avatar color="violet" radius="xl" size={40}>
          {chat?.title[0] || "M"}
        </Avatar>
        <Stack gap={1} className="conversation-title">
          <Text fw={700} size="sm" truncate>
            {chat?.title || selected}
          </Text>
          <Text size="xs" c="dimmed">
            {chatKind(chat?.type)}
            {chat?.phone ? ` · +${chat.phone}` : ""}
          </Text>
        </Stack>
        <Tooltip label="Поиск в истории">
          <ActionIcon
            aria-label="Поиск в истории"
            variant="subtle"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <IconSearch size={20} />
          </ActionIcon>
        </Tooltip>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label="Действия с чатом">
              <IconDots size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconRefresh size={17} />}
              disabled={busy}
              onClick={() =>
                void select(selected, counts[selected] ?? 100, true)
              }
            >
              Обновить историю
            </Menu.Item>
            <Menu.Item
              leftSection={<IconChecks size={17} />}
              disabled={busy}
              onClick={() => void read()}
            >
              Отметить прочитанным
            </Menu.Item>
            <Menu.Item
              leftSection={<IconDownload size={17} />}
              onClick={exportChat}
            >
              Сохранить загруженную историю
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {searchOpen && (
        <Group p="sm" gap="xs" wrap="nowrap">
          <TextInput
            className="history-search"
            aria-label="Поиск по загруженной истории"
            placeholder="Найти сообщение…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
          />
          <Badge variant="light">{visible.length}</Badge>
          <ActionIcon
            aria-label="Закрыть поиск"
            variant="subtle"
            onClick={() => {
              setSearchOpen(false);
              setSearch("");
            }}
          >
            <IconX size={17} />
          </ActionIcon>
        </Group>
      )}
      <Box
        ref={viewport}
        className="message-list"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {historyLoading && (
          <Text ta="center" size="sm" c="dimmed" role="status">
            Загружаем историю…
          </Text>
        )}
        {!historyLoading && session.historyPages?.[selected]?.hasMore && (
          <Group justify="center" mb="md">
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={busy}
              onClick={earlier}
            >
              Загрузить более ранние сообщения
            </Button>
          </Group>
        )}
        {!visible.length && !historyLoading && (
          <Text ta="center" size="sm" c="dimmed" py="xl">
            {search
              ? "Совпадений в загруженной истории нет."
              : "Начните разговор — ответы появятся здесь."}
          </Text>
        )}
        {visible.map((message, index) => (
          <Box
            key={`${message.direction}:${message.id}`}
            className="message-row"
          >
            {(!index ||
              formatDate(visible[index - 1].timestamp) !==
                formatDate(message.timestamp)) && (
              <Group justify="center" my="md">
                <Badge variant="light" color="gray" size="sm">
                  {formatDate(message.timestamp)}
                </Badge>
              </Group>
            )}
            <MessageBubble
              message={message}
              connectionId={session.connectionId}
              actions={
                <MessageActions
                  message={message}
                  disabled={busy}
                  onReply={() =>
                    updateDraft(selected, {
                      quote: message,
                      edit: undefined,
                      text: draft.edit ? (draft.beforeEdit ?? "") : draft.text,
                      beforeEdit: undefined,
                    })
                  }
                  onEdit={() =>
                    updateDraft(selected, {
                      text: message.text,
                      edit: message,
                      quote: undefined,
                      beforeEdit: draft.edit ? draft.beforeEdit : draft.text,
                    })
                  }
                  onDelete={() => {
                    setOnlyMe(false);
                    setDeleted(message);
                  }}
                  onForward={() => {
                    setTarget(null);
                    setForwarded(message);
                  }}
                  onReact={(reaction) => void react(message, reaction)}
                />
              }
            />
          </Box>
        ))}
        <div ref={bottom} />
      </Box>
      <Composer
        key={selected}
        text={draft.text}
        quote={draft.quote}
        edit={draft.edit}
        busy={busy}
        canUpload={session.canUpload}
        onText={(text) => updateDraft(selected, { text })}
        onCancel={() =>
          updateDraft(selected, {
            quote: undefined,
            edit: undefined,
            beforeEdit: undefined,
            text: draft.edit ? (draft.beforeEdit ?? "") : draft.text,
          })
        }
        onSend={send}
      />
      <Modal
        opened={!!deleted}
        onClose={() => setDeleted(null)}
        title="Удалить сообщение?"
        centered
      >
        <Stack>
          <Text size="sm">
            {deleted?.text || deleted?.attachment?.fileName}
          </Text>
          <Checkbox
            label="Удалить только у меня"
            checked={onlyMe}
            onChange={(e) => setOnlyMe(e.currentTarget.checked)}
          />
          <Text size="xs" c="dimmed">
            {onlyMe
              ? "Сообщение останется у собеседника."
              : "Сообщение будет удалено у всех участников. Отменить действие нельзя."}
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={() => setDeleted(null)}>
              Отмена
            </Button>
            <Button
              color="red"
              loading={busy}
              onClick={async () => {
                if (deleted && (await remove(deleted, onlyMe)))
                  setDeleted(null);
              }}
            >
              Удалить сообщение
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={!!forwarded}
        onClose={() => setForwarded(null)}
        title="Переслать сообщение"
        centered
      >
        <Stack>
          <Text size="sm" lineClamp={3}>
            {forwarded?.text || forwarded?.attachment?.fileName}
          </Text>
          <Select
            label="Получатель"
            placeholder="Выберите чат или контакт"
            searchable
            value={target}
            onChange={setTarget}
            data={[
              ...new Map(
                [...session.chats, ...session.contacts].map((c) => [c.id, c]),
              ).values(),
            ].map((c) => ({ value: c.id, label: c.title }))}
          />
          <Text size="xs" c="dimmed">
            Пересылка доступна для сообщений, известных GREEN-API.
          </Text>
          <Button
            loading={busy}
            disabled={!target}
            onClick={async () => {
              if (forwarded && target && (await forward(forwarded, target)))
                setForwarded(null);
            }}
          >
            Переслать
          </Button>
        </Stack>
      </Modal>
    </Box>
  );
}
