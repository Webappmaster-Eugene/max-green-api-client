import { useState } from "react";
import {
  Stack,
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Text,
} from "@mantine/core";
import { IconAlertCircle, IconLock } from "@tabler/icons-react";
import { login } from "../../../entities/user";
import { loginSchema } from "../../../shared/contracts";
import { messageError } from "../../../shared/api";
import type { LoginFormProps } from "../model/types";

export function LoginForm({ onLogin }: LoginFormProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsed = loginSchema.safeParse({ login: name, password });
    if (!parsed.success) {
      setError("Введите логин и пароль, выданные администратором.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onLogin(await login(parsed.data));
      setPassword("");
    } catch (error) {
      setError(messageError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<IconAlertCircle size={18} />} role="alert">
            {error}
          </Alert>
        )}
        <TextInput
          label="Логин"
          autoComplete="username"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          maxLength={40}
          disabled={busy}
        />
        <PasswordInput
          label="Пароль"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          maxLength={128}
          disabled={busy}
        />
        <Button
          type="submit"
          size="md"
          leftSection={<IconLock size={18} />}
          loading={busy}
        >
          Войти
        </Button>
        <Text size="sm" c="dimmed">
          Доступ выдаёт администратор. Публичной регистрации нет.
        </Text>
      </Stack>
    </form>
  );
}
