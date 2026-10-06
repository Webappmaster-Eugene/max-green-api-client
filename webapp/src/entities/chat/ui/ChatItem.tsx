import {
  Avatar,
  Badge,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { chatKind, formatTime } from "../../../shared/lib";
import type { ChatItemProps } from "../model/types";

export function ChatItem({
  chat,
  selected,
  disabled,
  contact,
  onSelect,
}: ChatItemProps) {
  const colors = ["violet", "teal", "pink", "orange", "blue"];
  return (
    <UnstyledButton
      className={`chat-item ${selected ? "selected" : ""}`}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
    >
      <Group gap="sm" wrap="nowrap">
        <Avatar
          color={colors[Math.abs(Number(chat.id.slice(-2))) % colors.length]}
          radius="xl"
          size={46}
        >
          {chat.type === "group" ? (
            <IconUsers size={22} />
          ) : (
            chat.title.replace(/^\+/, "")[0]
          )}
        </Avatar>
        <Stack gap={3} className="chat-item-content">
          <Text size="sm" fw={600} truncate>
            {chat.title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {contact
              ? chat.phone
                ? `+${chat.phone}`
                : "Номер скрыт"
              : chat.lastMessage || chatKind(chat.type)}
          </Text>
        </Stack>
        <Stack gap={5} align="end">
          {chat.lastTimestamp && (
            <Text size="xs" c="dimmed">
              {formatTime(chat.lastTimestamp)}
            </Text>
          )}
          {!contact && !!chat.unread && (
            <Badge size="sm" circle>
              {chat.unread}
            </Badge>
          )}
        </Stack>
      </Group>
    </UnstyledButton>
  );
}
