import { useState } from "react";
import { ActionIcon, Group, Menu, Text } from "@mantine/core";
import {
  IconDots,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconEdit,
  IconTrash,
} from "@tabler/icons-react";
import type { MessageActionsProps } from "../model/types";

export function MessageActions({
  message,
  disabled,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onReact,
}: MessageActionsProps) {
  const [opened, setOpened] = useState(false);
  const [now, setNow] = useState(Date.now);
  const sent =
    message.direction === "outgoing" &&
    !["queued", "failed"].includes(message.status ?? "sent");
  if (message.deleted) return null;
  return (
    <Menu
      position="bottom-end"
      opened={opened}
      onChange={(value) => {
        setOpened(value);
        if (value) setNow(Date.now());
      }}
    >
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          disabled={disabled}
          aria-label={`Действия с сообщением ${message.id}`}
        >
          <IconDots size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconArrowBackUp size={17} />}
          onClick={onReply}
        >
          Ответить
        </Menu.Item>
        <Menu.Item
          leftSection={<IconArrowForwardUp size={17} />}
          onClick={onForward}
        >
          Переслать
        </Menu.Item>
        {sent && !message.attachment && now - message.timestamp < 86400000 && (
          <Menu.Item leftSection={<IconEdit size={17} />} onClick={onEdit}>
            Редактировать
          </Menu.Item>
        )}
        {sent && (
          <Menu.Item
            leftSection={<IconTrash size={17} />}
            color="red"
            onClick={onDelete}
          >
            Удалить
          </Menu.Item>
        )}
        <Menu.Divider />
        <Text size="xs" c="dimmed" px="sm">
          Реакция
        </Text>
        <Group gap={2} p="xs">
          {(["👍", "❤️", "😂", "😮", "😢", "🙏"] as const).map((reaction) => (
            <ActionIcon
              key={reaction}
              variant="subtle"
              aria-label={`Поставить реакцию ${reaction}`}
              onClick={() => {
                onReact(reaction);
                setOpened(false);
              }}
            >
              {reaction}
            </ActionIcon>
          ))}
        </Group>
      </Menu.Dropdown>
    </Menu>
  );
}
