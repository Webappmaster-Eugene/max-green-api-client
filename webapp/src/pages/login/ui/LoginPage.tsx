import {
  Box,
  Container,
  Paper,
  Stack,
  Title,
  Text,
  ThemeIcon,
  Group,
  Anchor,
} from "@mantine/core";
import { IconMessageCircle, IconShieldLock } from "@tabler/icons-react";
import { LoginForm } from "../../../features/login";
import type { LoginPageProps } from "../model/types";

export function LoginPage({ onLogin }: LoginPageProps) {
  return (
    <Box className="login-page">
      <Container size={420}>
        <Stack gap="xl">
          <Group gap="sm">
            <ThemeIcon size={44} radius="md">
              <IconMessageCircle size={28} />
            </ThemeIcon>
            <Title order={1} size={30}>
              Max
            </Title>
          </Group>
          <Stack gap="xs">
            <Title order={2}>Переписка для своих</Title>
            <Text c="dimmed">
              Войдите, чтобы открыть чаты и подключить свой аккаунт MAX.
            </Text>
          </Stack>
          <Paper p="xl" radius="lg" withBorder>
            <LoginForm onLogin={onLogin} />
          </Paper>
          <Group gap="xs" wrap="nowrap">
            <IconShieldLock size={20} />
            <Text size="xs" c="dimmed">
              Закрытый доступ. Ваши чаты доступны только вашей учётной записи.
            </Text>
          </Group>
          <Anchor href="/help" size="sm" target="_blank" rel="noreferrer">
            Руководство пользователя
          </Anchor>
        </Stack>
      </Container>
    </Box>
  );
}
