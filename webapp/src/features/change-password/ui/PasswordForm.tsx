import { useState } from "react";
import { Alert, Button, PasswordInput, Stack, Text } from "@mantine/core";
import { changePassword } from "../../../entities/user";
import { changePasswordSchema } from "../../../shared/contracts";
import { messageError } from "../../../shared/api";
import type { PasswordFormProps } from "../model/types";

export function PasswordForm({ onChanged }: PasswordFormProps) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const input = changePasswordSchema.safeParse({
      currentPassword: current,
      password,
    });
    if (!input.success || password !== repeat) {
      setError(
        "Новый пароль должен содержать 12–128 символов. Повтор пароля должен совпадать.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await changePassword(input.data.currentPassword, input.data.password);
      setCurrent("");
      setPassword("");
      setRepeat("");
      onChanged();
    } catch (error) {
      setError(messageError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <Text fw={600}>Изменить пароль</Text>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <PasswordInput
          label="Текущий пароль"
          value={current}
          onChange={(e) => setCurrent(e.currentTarget.value)}
          required
          autoComplete="current-password"
          maxLength={128}
        />
        <PasswordInput
          label="Новый пароль"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          required
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
        />
        <PasswordInput
          label="Повторите новый пароль"
          value={repeat}
          onChange={(e) => setRepeat(e.currentTarget.value)}
          required
          autoComplete="new-password"
          maxLength={128}
        />
        <Text size="xs" c="dimmed">
          После смены пароля нужно войти заново на всех устройствах.
        </Text>
        <Button type="submit" loading={busy}>
          Изменить пароль
        </Button>
      </Stack>
    </form>
  );
}
