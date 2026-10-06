import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Paper,
} from "@mantine/core";
import {
  getUsers,
  createUser,
  updateAccess,
  resetPassword,
} from "../../../entities/user";
import { createUserSchema, passwordSchema } from "../../../shared/contracts";
import type { User } from "../../../shared/contracts";
import { messageError } from "../../../shared/api";
import type { UserManagerProps } from "../model/types";

export function UserManager({ currentUser }: UserManagerProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [reset, setReset] = useState<User | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [disable, setDisable] = useState<User | null>(null);
  useEffect(() => {
    let active = true;
    getUsers()
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch((e) => {
        if (active) setError(messageError(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await work();
      setUsers(await getUsers());
    } catch (error) {
      setError(messageError(error));
    } finally {
      setBusy(false);
    }
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createUserSchema.safeParse({ login: name, password, role });
    if (!parsed.success) {
      setError(
        "Логин: 3–40 латинских символов, цифр или ._-; пароль: 12–128 символов.",
      );
      return;
    }
    void run(async () => {
      await createUser(parsed.data);
      setName("");
      setPassword("");
      setSuccess("Пользователь создан. Передайте ему логин и пароль лично.");
    });
  };
  return (
    <Stack gap="md">
      <Text fw={600}>Пользователи сайта</Text>
      <Text size="sm" c="dimmed">
        Только пользователи из этого списка могут подключать MAX. Отключение
        доступа завершает их сессии.
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {success && (
        <Alert color="teal" role="status">
          {success}
        </Alert>
      )}
      {users.map((user) => (
        <Paper
          key={user.id}
          role="group"
          aria-label={`Пользователь ${user.login}`}
          withBorder
          p="sm"
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600}>{user.login}</Text>
              <Badge color={user.active ? "teal" : "gray"}>
                {user.active ? "Доступ открыт" : "Отключён"}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {user.role === "admin" ? "Администратор" : "Пользователь"}
              {user.id === currentUser.id ? " · Вы" : ""}
            </Text>
            <Group gap="xs">
              <Button
                size="compact-xs"
                variant="light"
                disabled={busy}
                onClick={() => {
                  setResetValue("");
                  setReset(user);
                }}
              >
                Сбросить пароль
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                color={user.active ? "red" : "teal"}
                disabled={busy || user.id === currentUser.id}
                onClick={() =>
                  user.active
                    ? setDisable(user)
                    : void run(async () => {
                        await updateAccess(user.id, true);
                      })
                }
              >
                {user.active ? "Отключить доступ" : "Открыть доступ"}
              </Button>
            </Group>
          </Stack>
        </Paper>
      ))}
      <form onSubmit={create}>
        <Stack gap="sm">
          <Text fw={600}>Выдать доступ</Text>
          <TextInput
            label="Логин нового пользователя"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            maxLength={40}
            disabled={busy}
          />
          <PasswordInput
            label="Временный пароль"
            description="Не менее 12 символов; пользователь сможет изменить его"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            disabled={busy}
          />
          <Select
            label="Роль"
            value={role}
            onChange={(value) =>
              setRole(value === "admin" ? "admin" : "member")
            }
            data={[
              { value: "member", label: "Пользователь" },
              { value: "admin", label: "Администратор" },
            ]}
            allowDeselect={false}
            disabled={busy}
          />
          <Button type="submit" loading={busy}>
            Создать пользователя
          </Button>
        </Stack>
      </form>
      <Modal
        opened={!!reset}
        onClose={() => {
          setReset(null);
          setResetValue("");
        }}
        title={`Новый пароль для ${reset?.login ?? ""}`}
        centered
      >
        <Stack>
          <PasswordInput
            label="Новый пароль"
            autoComplete="new-password"
            description="Не менее 12 символов"
            value={resetValue}
            onChange={(e) => setResetValue(e.currentTarget.value)}
            maxLength={128}
          />
          <Text size="sm" c="dimmed">
            Все сессии пользователя будут завершены.
          </Text>
          <Button
            loading={busy}
            disabled={!passwordSchema.safeParse(resetValue).success}
            onClick={() =>
              void run(async () => {
                if (reset) {
                  await resetPassword(reset.id, resetValue);
                  setReset(null);
                  setResetValue("");
                  setSuccess("Пароль изменён.");
                }
              })
            }
          >
            Изменить пароль
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={!!disable}
        onClose={() => setDisable(null)}
        title="Отключить доступ?"
        centered
      >
        <Stack>
          <Text>
            {disable?.login} больше не сможет войти. Его подключение MAX будет
            завершено.
          </Text>
          <Button
            color="red"
            loading={busy}
            onClick={() =>
              void run(async () => {
                if (disable) {
                  await updateAccess(disable.id, false);
                  setDisable(null);
                }
              })
            }
          >
            Отключить доступ
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
