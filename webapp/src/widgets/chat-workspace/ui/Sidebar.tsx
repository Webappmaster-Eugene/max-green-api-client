import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
  Box,
  ScrollArea,
} from "@mantine/core";
import { IconPlus, IconRefresh, IconSearch } from "@tabler/icons-react";
import { ChatItem } from "../../../entities/chat";
import type { MessengerViewProps } from "../model/types";

export function Sidebar({ controller }: MessengerViewProps) {
  const { session, selected, busy, select, open, sync } = controller;
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("chats");
  const [newChat, setNewChat] = useState(false);
  const [phone, setPhone] = useState("");
  const list = useMemo(() => {
    const q = query.toLocaleLowerCase("ru").trim();
    const rows =
      tab === "contacts"
        ? (session?.contacts ?? [])
        : [...(session?.chats ?? [])].sort(
            (a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0),
          );
    return rows.filter((row) =>
      `${row.title} ${row.phone ?? ""} ${row.id}`
        .toLocaleLowerCase("ru")
        .includes(q),
    );
  }, [session?.chats, session?.contacts, query, tab]);
  return (
    <Box component="aside" className="chat-sidebar" aria-label="Диалоги MAX">
      <Stack gap="sm" p="md">
        <Group justify="space-between">
          <Text size="lg" fw={700}>
            Сообщения
          </Text>
          <Group gap={4}>
            <Tooltip label="Новый чат">
              <ActionIcon
                variant="subtle"
                aria-label="Новый чат"
                onClick={() => setNewChat(true)}
                disabled={busy}
              >
                <IconPlus size={21} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Обновить список">
              <ActionIcon
                variant="subtle"
                aria-label="Обновить контакты и чаты"
                onClick={() => void sync()}
                disabled={busy}
              >
                <IconRefresh size={21} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <TextInput
          aria-label="Поиск чата или контакта"
          placeholder="Имя или номер"
          leftSection={<IconSearch size={17} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <SegmentedControl
          value={tab}
          onChange={setTab}
          fullWidth
          data={[
            {
              value: "chats",
              label: (
                <Group gap={6} justify="center">
                  Чаты
                  <Badge variant="light" size="xs">
                    {session?.chats.length ?? 0}
                  </Badge>
                </Group>
              ),
            },
            {
              value: "contacts",
              label: (
                <Group gap={6} justify="center">
                  Контакты
                  <Badge variant="light" size="xs">
                    {session?.contacts.length ?? 0}
                  </Badge>
                </Group>
              ),
            },
          ]}
        />
      </Stack>
      <ScrollArea className="chat-list" type="auto">
        {list.map((chat) => (
          <ChatItem
            key={chat.id}
            chat={chat}
            selected={selected === chat.id}
            disabled={busy}
            contact={tab === "contacts"}
            onSelect={() => void select(chat.id)}
          />
        ))}
        {!list.length && (
          <Stack p="xl" gap="sm">
            <Text size="sm" c="dimmed">
              {query
                ? "Ничего не найдено. Попробуйте другое имя или номер."
                : tab === "contacts"
                  ? "Контакты пока не появились. Обновите список через несколько минут."
                  : "Выберите контакт или добавьте номер, чтобы начать переписку."}
            </Text>
            {!query && (
              <Button
                variant="light"
                size="sm"
                onClick={() => setTab("contacts")}
              >
                Открыть контакты
              </Button>
            )}
          </Stack>
        )}
      </ScrollArea>
      <Modal
        opened={newChat}
        onClose={() => setNewChat(false)}
        title="Новый чат"
        centered
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await open(phone)) {
              setPhone("");
              setNewChat(false);
            }
          }}
        >
          <Stack>
            <TextInput
              label="Номер телефона"
              type="tel"
              placeholder="+7 999 123-45-67"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              required
              maxLength={30}
            />
            <Text size="xs" c="dimmed">
              Поиск поддерживает РФ и Беларусь и зависит от настроек приватности
              получателя.
            </Text>
            <Button type="submit" loading={busy}>
              Открыть чат
            </Button>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
