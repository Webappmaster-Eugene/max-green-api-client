import { useState } from "react";
import {
  Accordion,
  Alert,
  Button,
  Checkbox,
  PasswordInput,
  Stack,
  TextInput,
  Text,
  Anchor,
} from "@mantine/core";
import { maxConnectSchema } from "../../../shared/contracts";
import type { ConnectionFormProps } from "../model/types";

export function ConnectionForm({ busy, onConnect }: ConnectionFormProps) {
  const [apiUrl, setApiUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [instance, setInstance] = useState("");
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = maxConnectSchema.safeParse({
      apiUrl,
      mediaUrl: mediaUrl.trim() || undefined,
      idInstance: instance,
      apiTokenInstance: token,
      accountConsent: consent,
    });
    if (!parsed.success) {
      setError(
        "Проверьте реквизиты и подтвердите разрешение владельца аккаунта.",
      );
      return;
    }
    setError("");
    if (await onConnect(parsed.data)) setToken("");
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <TextInput
          label="Адрес API"
          description="apiUrl из карточки инстанса GREEN-API"
          placeholder="https://3100.api.green-api.com"
          type="url"
          required
          value={apiUrl}
          onChange={(e) => setApiUrl(e.currentTarget.value)}
          disabled={busy}
        />
        <TextInput
          label="Адрес для файлов"
          description="mediaUrl, нужен для отправки фото и файлов"
          placeholder="https://3100.media.green-api.com"
          type="url"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.currentTarget.value)}
          disabled={busy}
        />
        <TextInput
          label="Номер инстанса"
          description="idInstance"
          inputMode="numeric"
          required
          value={instance}
          onChange={(e) => setInstance(e.currentTarget.value)}
          disabled={busy}
        />
        <PasswordInput
          label="Ключ GREEN-API"
          description="apiTokenInstance"
          autoComplete="off"
          required
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
          maxLength={200}
          disabled={busy}
        />
        <Checkbox
          label="Владелец разрешил чтение чатов и отправку сообщений от своего имени"
          checked={consent}
          onChange={(e) => setConsent(e.currentTarget.checked)}
          disabled={busy}
          required
        />
        <Button type="submit" loading={busy} disabled={!consent}>
          Подключить MAX
        </Button>
        <Accordion variant="contained">
          <Accordion.Item value="help">
            <Accordion.Control>Где взять реквизиты?</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  Откройте инстанс MAX в{" "}
                  <Anchor
                    href="https://console.green-api.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GREEN-API
                  </Anchor>
                  . Авторизацию аккаунта подтверждает его владелец.
                </Text>
                <Text size="sm">
                  Включите уведомления о входящих сообщениях, исходящих с
                  телефона и через API, статусах доставки, редактировании и
                  удалении. Поле webhookUrl оставьте пустым.
                </Text>
                <Text size="sm">
                  Отключите этот инстанс в других клиентах. Ключ остаётся в
                  памяти сервера до отключения, перезапуска или истечения восьми
                  часов.
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </form>
  );
}
