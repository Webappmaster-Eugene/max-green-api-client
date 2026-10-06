import {
  ActionIcon,
  Box,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconMessageCircle, IconSettings } from "@tabler/icons-react";
import { ThemeToggle } from "../../../shared/ui";
import { ConnectionForm } from "../../../features/connect-max";
import { Sidebar } from "./Sidebar";
import { Conversation } from "./Conversation";
import type { ChatWorkspaceProps } from "../model/types";

export function ChatWorkspace({
  controller,
  identity,
  onSettings,
}: ChatWorkspaceProps) {
  return (
    <Box className={`messenger ${controller.selected ? "has-chat" : ""}`}>
      <Group
        component="header"
        className="messenger-topbar"
        justify="space-between"
      >
        <Group gap="sm">
          <ThemeIcon size={34} radius="md">
            <IconMessageCircle size={23} />
          </ThemeIcon>
          <Title order={1} size={23}>
            Max
          </Title>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed" className="account-login">
            {identity.user.login}
          </Text>
          <ThemeToggle />
          <Tooltip label="Аккаунт и настройки">
            <ActionIcon
              aria-label="Аккаунт и настройки"
              variant="subtle"
              onClick={onSettings}
            >
              <IconSettings size={21} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {!controller.session ? (
        <Box className="connection-page">
          <Container size={460}>
            <Stack gap="xl">
              <Stack gap="xs">
                <Title order={2}>Подключите аккаунт MAX</Title>
                <Text size="sm" c="dimmed">
                  Чаты, контакты и история из вашего аккаунта. Сообщения
                  отправляются от его имени.
                </Text>
              </Stack>
              <Paper withBorder p="lg" radius="md">
                <ConnectionForm
                  busy={controller.busy}
                  onConnect={controller.connect}
                />
              </Paper>
            </Stack>
          </Container>
        </Box>
      ) : (
        <Box className="chat-workspace">
          <Sidebar controller={controller} />
          <Conversation key={controller.selected} controller={controller} />
        </Box>
      )}
    </Box>
  );
}
