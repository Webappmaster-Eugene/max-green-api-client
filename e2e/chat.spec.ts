import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { MaxMessageDto, MaxSessionDto } from "../types/max.js";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/Логин/).fill("owner");
  await page.getByLabel(/^Пароль/).fill("e2e-fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}

test("user guide is readable without opening access to MAX", async ({
  page,
}) => {
  await page.goto("/help");
  await expect(
    page.getByRole("heading", {
      name: "Max: руководство пользователя",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Для администратора", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/max", { headers: { "X-Max-Client": "1" } })
    ).status(),
  ).toBe(401);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
async function messengerFixture(page: Page) {
  const session: MaxSessionDto = {
    connectionId: "d72c3040-32e0-4f79-86d5-23d103cff213",
    idInstance: "3100000001",
    account: "Демо",
    expiresAt: Date.now() + 28800000,
    canUpload: true,
    chats: [{ id: "100", title: "Анна", type: "user" }],
    contacts: [
      { id: "100", title: "Анна", type: "user" },
      { id: "200", title: "Семья", type: "group" },
    ],
    messages: [],
  };
  const actions: { path: string; body: Record<string, unknown> }[] = [];
  let sends = 0;
  await page.route("**/api/max**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/max/profile")
      return route.fulfill({ json: { ok: true, data: null } });
    let data: unknown = session;
    if (path.endsWith("/history") && !session.messages.length)
      session.messages = [
        {
          id: "old",
          chatId: "100",
          direction: "incoming",
          text: "Существующая история переписки",
          timestamp: Date.now() - 60000,
        },
        {
          id: "own",
          chatId: "100",
          direction: "outgoing",
          text: "Мой исходящий текст",
          status: "delivered",
          timestamp: Date.now() - 30000,
        },
      ];
    if (route.request().method() === "POST" && !path.endsWith("/poll")) {
      expect(route.request().headers()["x-csrf-token"]).toMatch(
        /^[a-f0-9]{64}$/,
      );
      const body = path.endsWith("/upload")
        ? {}
        : route.request().postDataJSON();
      actions.push({ path, body });
      if (path.endsWith("/send")) {
        sends++;
        const message: MaxMessageDto = {
          id: `sent-${sends}`,
          chatId: "100",
          direction: "outgoing",
          text: String(body.text),
          status: "queued",
          timestamp: Date.now(),
          quote: body.quotedMessageId
            ? { id: "old", text: "Существующая история переписки" }
            : undefined,
        };
        session.messages.push(message);
        data = message;
      }
      if (path.endsWith("/edit")) {
        const m = session.messages.find((m) => m.id === body.messageId)!;
        m.text = String(body.text);
        m.edited = true;
      }
      if (path.endsWith("/delete")) {
        const m = session.messages.find((m) => m.id === body.messageId)!;
        m.text = "Сообщение удалено";
        m.deleted = true;
      }
      if (path.endsWith("/upload")) {
        expect(route.request().postDataBuffer()?.toString()).toContain(
          "note.txt",
        );
        const message: MaxMessageDto = {
          id: "uploaded",
          chatId: "100",
          direction: "outgoing",
          text: "",
          status: "queued",
          timestamp: Date.now(),
          attachment: {
            kind: "document",
            fileName: "note.txt",
            mimeType: "text/plain",
            available: true,
          },
        };
        session.messages.push(message);
        data = message;
      }
      if (path.endsWith("/forward")) {
        data = {
          id: "forwarded",
          chatId: "200",
          text: "Существующая история переписки",
          direction: "outgoing",
          timestamp: Date.now(),
          status: "queued",
          forwarded: true,
        };
      }
      if (path.endsWith("/reaction"))
        session.messages.find((m) => m.id === body.messageId)!.myReaction =
          String(body.reaction);
    }
    if (path.endsWith("/poll") && sends) {
      for (const m of session.messages)
        if (m.status === "queued") m.status = "delivered";
      if (!session.messages.some((m) => m.id === "reply"))
        session.messages.push({
          id: "reply",
          chatId: "100",
          direction: "incoming",
          text: "Получила сообщение. Спасибо!",
          timestamp: Date.now(),
        });
    }
    await route.fulfill({ json: { ok: true, data } });
  });
  return { actions, session };
}

test("anonymous access is blocked, login works and logout revokes the JWT", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Переписка для своих" }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/max", { headers: { "X-Max-Client": "1" } })
    ).status(),
  ).toBe(401);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Подключите аккаунт MAX" }),
  ).toBeVisible();
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "max-auth",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => /jwt|token/i.test(key)),
    ),
  ).toEqual([]);
  await page.getByLabel("Аккаунт и настройки").click();
  await page
    .getByRole("button", { name: "Выйти из сайта", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Переписка для своих" }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/max", { headers: { "X-Max-Client": "1" } })
    ).status(),
  ).toBe(401);
});

test("contacts, quotes, editing, confirmation, uploads and history search on desktop/mobile", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const f = await messengerFixture(page);
  await login(page);
  await page
    .getByRole("radiogroup")
    .locator("label")
    .filter({ hasText: "Контакты" })
    .click();
  await page.getByLabel("Поиск чата или контакта").fill("Анна");
  await page.getByRole("button", { name: /Анна/ }).click();
  await expect(
    page.getByRole("log").getByText("Существующая история переписки"),
  ).toBeVisible();
  await page.getByLabel("Действия с сообщением old", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Ответить", exact: true }).click();
  await page.getByLabel("Сообщение в MAX").fill("Ответ с цитатой");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(
    page.getByRole("log").getByText("Ответ с цитатой", { exact: true }),
  ).toBeVisible();
  expect(
    f.actions.find((a) => a.path.endsWith("/send"))?.body.quotedMessageId,
  ).toBe("old");
  await page.getByLabel("Действия с сообщением own", { exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Редактировать", exact: true })
    .click();
  await page.getByLabel("Сообщение в MAX").fill("Новый исходящий текст");
  await page
    .getByRole("button", { name: "Сохранить сообщение", exact: true })
    .click();
  await expect(
    page.getByRole("log").getByText("Новый исходящий текст", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Действия с сообщением own", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  expect(f.actions.some((a) => a.path.endsWith("/delete"))).toBe(false);
  await page
    .getByRole("button", { name: "Удалить сообщение", exact: true })
    .click();
  await expect(
    page.getByRole("log").getByText("Сообщение удалено", { exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("fixture"),
  });
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(
    page.getByRole("log").getByText("note.txt", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Поиск в истории", { exact: true }).click();
  await page.getByLabel("Поиск по загруженной истории").fill("Существующая");
  await expect(
    page
      .getByRole("log")
      .getByText("Существующая история переписки", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Закрыть поиск").click();
  await page.getByLabel("Действия с сообщением old", { exact: true }).click();
  await page.getByLabel("Поставить реакцию 👍").click();
  await expect(
    page.getByRole("log").getByText("👍", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(
    page
      .locator('[data-message-id="sent-1"]')
      .getByText("Доставлено", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("log")
      .getByText("Получила сообщение. Спасибо!", { exact: true }),
  ).toBeVisible();
  const colors = await page.evaluate(() => ({
    conversation: getComputedStyle(document.querySelector(".conversation")!)
      .backgroundColor,
    outgoing: getComputedStyle(
      document.querySelector(".message-bubble.outgoing")!,
    ).backgroundColor,
  }));
  expect(colors.conversation).not.toBe(colors.outgoing);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-mantine-chat.png`,
    fullPage: true,
  });
  await page.getByLabel("Сменить тему", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "dark",
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-mantine-dark-chat.png`,
    fullPage: true,
  });
  if (info.project.name === "mobile") {
    await page.getByLabel("Назад к чатам").click();
    await expect(page.getByLabel("Поиск чата или контакта")).toBeVisible();
  }
});

test("administrator creates a user and can revoke site access", async ({
  page,
}, info) => {
  await login(page);
  await page.getByLabel("Аккаунт и настройки").click();
  await page
    .getByRole("button", { name: "Управление доступом", exact: true })
    .click();
  const name = `viewer_${info.project.name}`;
  await page.getByLabel("Логин нового пользователя").fill(name);
  await page.getByLabel("Временный пароль").fill("fixture-viewer-password");
  await page
    .getByRole("button", { name: "Создать пользователя", exact: true })
    .click();
  await expect(
    page.getByText("Пользователь создан. Передайте ему логин и пароль лично.", {
      exact: true,
    }),
  ).toBeVisible();
  const userRow = page.getByRole("group", {
    name: `Пользователь ${name}`,
    exact: true,
  });
  await userRow
    .getByRole("button", { name: "Отключить доступ", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Отключить доступ?", exact: true })
    .getByRole("button", { name: "Отключить доступ", exact: true })
    .click();
  await expect(userRow.getByText("Отключён", { exact: true })).toBeVisible();
});

test("saved MAX survives reload, provider failure and explicit exit offers key-only login", async ({
  page,
}) => {
  const saved = {
    profile: {
      apiUrl: "https://3100.api.green-api.com",
      mediaUrl: "https://3100.api.green-api.com",
      idInstance: "3100000001",
    },
    connectionId: "d72c3040-32e0-4f79-86d5-23d103cff213",
    connected: true,
  };
  const session = {
    connectionId: saved.connectionId,
    idInstance: saved.profile.idInstance,
    account: "Fixture",
    expiresAt: 0,
    canUpload: true,
    chats: [{ id: "100", title: "Анна" }],
    contacts: [],
    messages: [],
  };
  let failed = true;
  let enteredKey = false;
  await page.route("**/api/max**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/profile"))
      return route.fulfill({ json: { ok: true, data: saved } });
    if (path.endsWith("/disconnect")) {
      saved.connected = false;
      return route.fulfill({ json: { ok: true, data: { done: true } } });
    }
    if (path.endsWith("/reconnect")) {
      expect(route.request().postDataJSON()).toEqual({
        apiTokenInstance: "fixture_not_a_real_green_token",
      });
      enteredKey = true;
      saved.connected = true;
    }
    if (failed)
      return route.fulfill({
        status: 429,
        json: {
          ok: false,
          code: "provider_quota",
          error: "Достигнут лимит GREEN-API.",
        },
      });
    return route.fulfill({
      json: { ok: true, data: saved.connected ? session : null },
    });
  });
  await login(page);
  await expect(
    page.getByRole("button", { name: "Повторить подключение" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Ключ GREEN-API/)).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Повторить подключение" }).click();
  await expect(page.getByRole("button", { name: /Анна/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Анна/ })).toBeVisible();
  await expect(page.getByLabel(/^Ключ GREEN-API/)).toHaveCount(0);
  await page.getByRole("button", { name: "Аккаунт и настройки" }).click();
  await page.getByRole("button", { name: "Отключить MAX" }).click();
  await page
    .getByRole("button", { name: "Закрыть настройки", exact: true })
    .click();
  await expect(page.getByLabel(/^Ключ GREEN-API/)).toBeVisible();
  await expect(page.getByLabel(/^Адрес API/)).toHaveCount(0);
  await expect(page.getByLabel(/^Номер инстанса/)).toHaveCount(0);
  await page
    .getByLabel(/^Ключ GREEN-API/)
    .fill("fixture_not_a_real_green_token");
  await page.getByRole("button", { name: "Войти в MAX" }).click();
  await expect(page.getByRole("button", { name: /Анна/ })).toBeVisible();
  expect(enteredKey).toBe(true);
});
