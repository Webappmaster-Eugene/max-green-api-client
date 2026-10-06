import { lazy, Suspense, useEffect, useState } from "react";
import { Alert, Button, Loader, Stack, Text } from "@mantine/core";
import { LoginPage } from "../pages/login";
import { getAuthSession, logout } from "../entities/user";
import { ApiError, messageError, setCsrfToken } from "../shared/api";
import type { AuthSession } from "../shared/contracts";
const ChatPage = lazy(() =>
  import("../pages/chat").then((module) => ({ default: module.ChatPage })),
);
const HelpPage = lazy(() =>
  import("../pages/help").then((module) => ({ default: module.HelpPage })),
);

export function App() {
  const [identity, setIdentity] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getAuthSession(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setIdentity(data);
      })
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          !(error instanceof ApiError && error.status === 401)
        )
          setError(messageError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const clear = () => {
      setCsrfToken("");
      setIdentity(null);
    };
    window.addEventListener("max:unauthorized", clear);
    return () => window.removeEventListener("max:unauthorized", clear);
  }, []);
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    const refresh = () => {
      if (document.hidden) return;
      void getAuthSession(controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setIdentity(data);
        })
        .catch((error) => {
          if (
            !controller.signal.aborted &&
            error instanceof ApiError &&
            error.status === 401
          )
            setIdentity(null);
        });
    };
    const timer = setInterval(refresh, 3600000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [identity?.user.id]);
  const exit = async () => {
    try {
      await logout();
      setIdentity(null);
      setError("");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401))
        setError(messageError(error));
    }
  };
  if (window.location.pathname === "/help")
    return (
      <Suspense
        fallback={
          <Stack h="100dvh" align="center" justify="center">
            <Loader />
          </Stack>
        }
      >
        <HelpPage />
      </Suspense>
    );
  if (loading)
    return (
      <Stack align="center" justify="center" h="100dvh">
        <Loader />
        <Text c="dimmed">Проверяем вход…</Text>
      </Stack>
    );
  if (error && !identity)
    return (
      <Stack align="center" justify="center" h="100dvh" p="xl">
        <Alert color="red" role="alert">
          {error}
        </Alert>
        <Button onClick={() => setRetry((n) => n + 1)}>Повторить</Button>
      </Stack>
    );
  return (
    <>
      {error && (
        <Alert
          color="red"
          role="alert"
          withCloseButton
          onClose={() => setError("")}
        >
          {error}
        </Alert>
      )}
      {identity ? (
        <Suspense
          fallback={
            <Stack h="100dvh" align="center" justify="center">
              <Loader />
            </Stack>
          }
        >
          <ChatPage
            identity={identity}
            onLogout={exit}
            onPasswordChanged={() => {
              setCsrfToken("");
              setIdentity(null);
            }}
          />
        </Suspense>
      ) : (
        <LoginPage onLogin={setIdentity} />
      )}
    </>
  );
}
