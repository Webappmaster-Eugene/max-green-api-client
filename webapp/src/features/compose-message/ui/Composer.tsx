import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  FileButton,
  Group,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowUp,
  IconPaperclip,
  IconX,
  IconEdit,
  IconArrowBackUp,
} from "@tabler/icons-react";
import {
  FILE_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_TEXT_LENGTH,
} from "../../../shared/contracts";
import type { ComposerProps } from "../model/types";

export function Composer({
  text,
  quote,
  edit,
  busy,
  canUpload,
  onText,
  onCancel,
  onSend,
}: ComposerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const pickFile = (next: File | null) => {
    if (!next) return;
    const extension = next.name.split(".").at(-1)?.toLowerCase();
    if (
      !next.size ||
      next.size > MAX_FILE_SIZE ||
      !FILE_EXTENSIONS.some((e) => e === extension)
    ) {
      setError("Выберите разрешённый файл до 10 МБ.");
      return;
    }
    setError("");
    setFile(next);
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busy && (text.trim() || file) && (await onSend(file ?? undefined))) {
      setFile(null);
      setError("");
    }
  };
  return (
    <Box component="form" className="composer" onSubmit={send}>
      <Stack gap="xs">
        {(quote || edit) && (
          <Group
            justify="space-between"
            className="composer-context"
            wrap="nowrap"
          >
            <Group gap="sm" wrap="nowrap">
              {edit ? <IconEdit size={18} /> : <IconArrowBackUp size={18} />}
              <Stack gap={1}>
                <Text size="xs" fw={600}>
                  {edit ? "Редактирование сообщения" : "Ответ на сообщение"}
                </Text>
                <Text size="xs" lineClamp={1}>
                  {(edit || quote)?.text || "Вложение"}
                </Text>
              </Stack>
            </Group>
            <ActionIcon
              variant="subtle"
              aria-label="Отменить ответ или редактирование"
              onClick={onCancel}
            >
              <IconX size={17} />
            </ActionIcon>
          </Group>
        )}
        {file && (
          <Group justify="space-between">
            <Badge variant="light" size="lg" className="file-badge">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} МБ
            </Badge>
            <ActionIcon
              variant="subtle"
              aria-label="Убрать файл"
              onClick={() => setFile(null)}
              disabled={busy}
            >
              <IconX size={17} />
            </ActionIcon>
          </Group>
        )}
        {error && (
          <Alert color="red" role="alert" p="xs">
            {error}
          </Alert>
        )}
        <Group gap="xs" align="end" wrap="nowrap">
          {!edit && (
            <FileButton
              onChange={pickFile}
              accept={FILE_EXTENSIONS.map((e) => `.${e}`).join(",")}
            >
              {(props) => (
                <Tooltip
                  label={
                    canUpload
                      ? "Прикрепить файл до 10 МБ"
                      : "Укажите mediaUrl при подключении"
                  }
                >
                  <ActionIcon
                    {...props}
                    variant="subtle"
                    size={42}
                    aria-label="Прикрепить файл"
                    disabled={busy || !canUpload}
                  >
                    <IconPaperclip size={22} />
                  </ActionIcon>
                </Tooltip>
              )}
            </FileButton>
          )}
          <Textarea
            className="composer-input"
            aria-label="Сообщение в MAX"
            placeholder={
              edit ? "Новый текст сообщения…" : "Написать сообщение…"
            }
            value={text}
            onChange={(e) => onText(e.currentTarget.value)}
            maxLength={MAX_TEXT_LENGTH}
            autosize
            minRows={1}
            maxRows={5}
            disabled={busy}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                window.matchMedia("(min-width: 700px)").matches
              ) {
                e.preventDefault();
                void send(e);
              }
            }}
          />
          <ActionIcon
            type="submit"
            size={42}
            radius="xl"
            variant="filled"
            aria-label={edit ? "Сохранить сообщение" : "Отправить"}
            loading={busy}
            disabled={!(text.trim() || file)}
          >
            <IconArrowUp size={23} />
          </ActionIcon>
        </Group>
        <Group justify="space-between">
          <Text size="10px" c="dimmed">
            {edit
              ? "Редактирование доступно в течение 24 часов"
              : "Shift + Enter — новая строка"}
          </Text>
          {text.length > 3600 && (
            <Text
              size="10px"
              c={text.length >= MAX_TEXT_LENGTH ? "red" : "dimmed"}
            >
              {text.length}/{MAX_TEXT_LENGTH}
            </Text>
          )}
        </Group>
      </Stack>
    </Box>
  );
}
