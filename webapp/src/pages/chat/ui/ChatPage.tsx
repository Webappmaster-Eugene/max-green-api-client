import { useState } from "react";
import { Alert, Box, Loader, Stack, Text } from "@mantine/core";
import { useMessenger } from "../../../features/messenger";
import { ChatWorkspace } from "../../../widgets/chat-workspace";
import { AccountPanel } from "../../../widgets/account-panel";
import type { ChatPageProps } from "../model/types";

export function ChatPage({
  identity,
  onLogout,
  onPasswordChanged,
}: ChatPageProps) {
  const controller = useMessenger();
  const [settings, setSettings] = useState(false);
  if (controller.loading)
    return (
      <Stack align="center" justify="center" h="100dvh">
        <Loader />
        <Text c="dimmed">Загружаем Max…</Text>
      </Stack>
    );
  return (
    <Box className="chat-page">
      {controller.error && (
        <Alert
          color="red"
          role="alert"
          withCloseButton
          onClose={controller.clearError}
        >
          {controller.error}
        </Alert>
      )}
      {controller.pollError && (
        <Alert color="yellow" role="status">
          {controller.pollError} Получение сообщений повторится автоматически.
        </Alert>
      )}
      {controller.session?.syncWarning && (
        <Alert color="yellow" role="status">
          {controller.session.syncWarning}
        </Alert>
      )}
      <ChatWorkspace
        controller={controller}
        identity={identity}
        onSettings={() => setSettings(true)}
      />
      <AccountPanel
        opened={settings}
        onClose={() => setSettings(false)}
        identity={identity}
        connection={controller.session}
        busy={controller.busy}
        onDisconnect={controller.disconnect}
        onLogout={onLogout}
        onPasswordChanged={onPasswordChanged}
      />
    </Box>
  );
}
