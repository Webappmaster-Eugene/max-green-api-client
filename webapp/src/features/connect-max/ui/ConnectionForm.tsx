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
import {
  maxConnectSchema,
  maxReconnectSchema,
} from "../../../shared/contracts";
import type { ConnectionFormProps } from "../model/types";

export function ConnectionForm({
  busy,
  onConnect,
  onReconnect,
  profile,
}: ConnectionFormProps) {
  const [editing, setEditing] = useState(false);
  const keyOnly = !!profile && !editing;
  const [apiUrl, setApiUrl] = useState(profile?.apiUrl ?? "");
  const [sameMedia, setSameMedia] = useState(
    !profile?.mediaUrl || profile.mediaUrl === profile.apiUrl,
  );
  const [mediaUrl, setMediaUrl] = useState(profile?.mediaUrl ?? "");
  const [instance, setInstance] = useState(profile?.idInstance ?? "");
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (keyOnly) {
      const parsed = maxReconnectSchema.safeParse({ apiTokenInstance: token });
      if (!parsed.success) {
        setError("Проверьте ключ GREEN-API.");
        return;
      }
      setError("");
      if (await onReconnect(parsed.data)) setToken("");
      return;
    }
    const parsed = maxConnectSchema.safeParse({
      apiUrl,
      mediaUrl: sameMedia ? apiUrl.trim() : mediaUrl.trim() || undefined,
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
        {keyOnly && (
          <Text size="sm" c="dimmed">
            Инстанс {profile.idInstance}. Остальные реквизиты уже сохранены.
          </Text>
        )}
        {!keyOnly && (
          <>
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
            <Checkbox
              label="Адрес для файлов совпадает с адресом API"
              checked={sameMedia}
              onChange={(e) => setSameMedia(e.currentTarget.checked)}
              disabled={busy}
            />
            {!sameMedia && (
              <TextInput
                label="Адрес для файлов"
                description="mediaUrl из кабинета; может совпадать с адресом API"
                placeholder="https://3100.api.green-api.com"
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.currentTarget.value)}
                disabled={busy}
              />
            )}
            <TextInput
              label="Номер инстанса"
              description="idInstance"
              inputMode="numeric"
              required
              value={instance}
              onChange={(e) => setInstance(e.currentTarget.value)}
              disabled={busy}
            />
          </>
        )}
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
        {!keyOnly && (
          <Checkbox
            label="Владелец разрешил чтение чатов и отправку сообщений от своего имени"
            checked={consent}
            onChange={(e) => setConsent(e.currentTarget.checked)}
            disabled={busy}
            required
          />
        )}
        <Button type="submit" loading={busy} disabled={!keyOnly && !consent}>
          {keyOnly ? "Войти в MAX" : "Подключить MAX"}
        </Button>
        {profile && (
          <Button
            variant="subtle"
            disabled={busy}
            onClick={() => {
              setEditing(!editing);
              setToken("");
              setError("");
            }}
          >
            {editing
              ? "Вернуться ко входу по ключу"
              : "Подключить другой инстанс"}
          </Button>
        )}
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
                  Отключите этот инстанс в других клиентах. Ключ сохраняется в
                  зашифрованном хранилище сервера до явного отключения.
                  Перезапуск приложения не завершает подключение.
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </form>
  );
}
