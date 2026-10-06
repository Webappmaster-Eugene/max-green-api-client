import {
  Accordion,
  Anchor,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { IconLogout, IconUnlink } from "@tabler/icons-react";
import { UserManager } from "../../../features/user-access";
import { PasswordForm } from "../../../features/change-password";
import type { AccountPanelProps } from "../model/types";

export function AccountPanel({
  opened,
  onClose,
  identity,
  connection,
  busy,
  onDisconnect,
  onLogout,
  onPasswordChanged,
}: AccountPanelProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Аккаунт и настройки"
      position="right"
      size="md"
      closeButtonProps={{ "aria-label": "Закрыть настройки" }}
    >
      <Stack gap="lg">
        <Group justify="space-between">
          <Text fw={600}>{identity.user.login}</Text>
          <Badge variant="light">
            {identity.user.role === "admin" ? "Администратор" : "Пользователь"}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Вход сохраняется при закрытии страницы и перезапуске сервера. При
          явном выходе ключ MAX удаляется, остальные реквизиты остаются для
          входа по ключу.
        </Text>
        {connection && (
          <Stack gap="sm">
            <Divider label="Подключение MAX" />
            <Text size="sm">
              Аккаунт: {connection.account || connection.idInstance}
            </Text>
            <Text size="xs" c="dimmed">
              Подключение сохранено до вашего выхода. Для одного инстанса
              используйте один клиент.
            </Text>
            <Button
              variant="light"
              color="red"
              leftSection={<IconUnlink size={17} />}
              disabled={busy}
              onClick={() => void onDisconnect()}
            >
              Отключить MAX
            </Button>
          </Stack>
        )}
        <Anchor
          href="https://console.green-api.com/"
          target="_blank"
          rel="noreferrer"
          size="sm"
        >
          Настройки инстанса в GREEN-API
        </Anchor>
        <Anchor href="/help" target="_blank" rel="noreferrer" size="sm">
          Полное руководство пользователя
        </Anchor>
        <Accordion variant="contained">
          <Accordion.Item value="password">
            <Accordion.Control>Пароль сайта</Accordion.Control>
            <Accordion.Panel>
              <PasswordForm onChanged={onPasswordChanged} />
            </Accordion.Panel>
          </Accordion.Item>
          {identity.user.role === "admin" && (
            <Accordion.Item value="users">
              <Accordion.Control>Управление доступом</Accordion.Control>
              <Accordion.Panel>
                <UserManager currentUser={identity.user} />
              </Accordion.Panel>
            </Accordion.Item>
          )}
        </Accordion>
        <Divider />
        <Button
          color="gray"
          variant="outline"
          leftSection={<IconLogout size={17} />}
          disabled={busy}
          onClick={() => void onLogout()}
        >
          Выйти из сайта
        </Button>
      </Stack>
    </Drawer>
  );
}
