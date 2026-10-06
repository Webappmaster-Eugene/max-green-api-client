import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Image,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconCheck,
  IconChecks,
  IconClock,
  IconFile,
  IconPhoto,
  IconPlayerPlay,
  IconAlertCircle,
} from "@tabler/icons-react";
import { formatTime } from "../../../shared/lib";
import { MAX_FILE_SIZE } from "../../../shared/contracts";
import { messageError } from "../../../shared/api";
import type { MessageBubbleProps } from "../model/types";

export function MessageBubble({
  message,
  connectionId,
  actions,
}: MessageBubbleProps) {
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const url = `/api/max/media?${new URLSearchParams({ connectionId, chatId: message.chatId, messageId: message.id })}`;
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const showPreview = async () => {
    setLoading(true);
    setError("");
    const request = new AbortController();
    controller.current = request;
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        signal: request.signal,
      });
      if (!response.ok)
        throw new Error("Вложение недоступно. Обновите историю и повторите.");
      const blob = await response.blob();
      if (blob.size > MAX_FILE_SIZE)
        throw new Error("Вложение превышает 10 МБ.");
      if (!request.signal.aborted)
        setPreview(
          URL.createObjectURL(
            new Blob([blob], { type: message.attachment!.mimeType }),
          ),
        );
    } catch (error) {
      if (!request.signal.aborted) setError(messageError(error));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  };
  const status = message.status;
  const label =
    status === "queued"
      ? "В очереди"
      : status === "sent"
        ? "Отправлено"
        : status === "delivered"
          ? "Доставлено"
          : status === "read"
            ? "Прочитано"
            : "Не отправлено";
  const media = message.attachment;
  const previewable =
    media?.kind === "image" &&
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      media.mimeType,
    );
  return (
    <Box
      className={`message-bubble ${message.direction}`}
      data-message-id={message.id}
    >
      <Group gap="xs" align="start" justify="space-between" wrap="nowrap">
        <Stack gap={7} className="message-content">
          {message.sender && (
            <Text size="xs" fw={600} c="violet">
              {message.sender}
            </Text>
          )}
          {message.forwarded && (
            <Text size="xs" c="dimmed">
              Переслано
            </Text>
          )}
          {message.quote && (
            <Box className="message-quote">
              <Text size="xs" fw={600}>
                {message.quote.sender || "Ответ на сообщение"}
              </Text>
              <Text size="xs" lineClamp={2}>
                {message.quote.text || "Вложение"}
              </Text>
            </Box>
          )}
          {message.text && (
            <Text
              className="message-text"
              size="sm"
              c={message.deleted ? "dimmed" : undefined}
            >
              {message.text}
            </Text>
          )}
          {media && (
            <Box className="message-attachment">
              <Group wrap="nowrap" gap="xs">
                {media.kind === "image" ? (
                  <IconPhoto size={22} />
                ) : media.kind === "audio" || media.kind === "video" ? (
                  <IconPlayerPlay size={22} />
                ) : (
                  <IconFile size={22} />
                )}
                <Stack gap={2}>
                  <Text size="sm" lineClamp={2}>
                    {media.fileName}
                  </Text>
                  {media.available ? (
                    <Anchor href={url} size="xs">
                      Скачать
                    </Anchor>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Обновите историю для загрузки
                    </Text>
                  )}
                </Stack>
              </Group>
              {previewable && media.available && (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  mt="sm"
                  onClick={showPreview}
                  loading={loading}
                >
                  Посмотреть фото
                </Button>
              )}
            </Box>
          )}
          {error && (
            <Alert color="red" p="xs" role="alert">
              {error}
            </Alert>
          )}
        </Stack>
        {actions}
      </Group>
      <Group gap={6} mt={6} justify="end">
        <Text size="10px" c="dimmed">
          {message.edited ? "изменено · " : ""}
          {formatTime(message.timestamp)}
        </Text>
        {status && (
          <Group gap={3} title={label}>
            <Text size="10px" c={status === "failed" ? "red" : "dimmed"}>
              {label}
            </Text>
            {status === "queued" ? (
              <IconClock size={13} />
            ) : status === "failed" ? (
              <IconAlertCircle size={13} />
            ) : ["read", "delivered"].includes(status) ? (
              <IconChecks size={14} />
            ) : (
              <IconCheck size={14} />
            )}
          </Group>
        )}
      </Group>
      {message.myReaction && (
        <Badge variant="light" mt={5}>
          {message.myReaction}
        </Badge>
      )}
      <Modal
        opened={!!preview}
        onClose={() => setPreview("")}
        title={media?.fileName}
        size="lg"
        centered
      >
        <Image
          src={preview}
          alt={media?.fileName || "Фото из переписки"}
          fit="contain"
        />
      </Modal>
    </Box>
  );
}
