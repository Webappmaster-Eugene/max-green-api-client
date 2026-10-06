import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { maxFixture, credentials } from "./fixtures/max.js";
import { MaxSessions } from "../src/max/session.js";
import { GreenMaxClient } from "../src/max/client.js";

test("quotes, uploads and forwards use canonical IDs and do not repeat provider sends", async () => {
  const f = maxFixture();
  try {
    const c = await f.sessions.connect(1, credentials);
    await f.sessions.history(1, c.connectionId, "100");
    const text = {
      connectionId: c.connectionId,
      chatId: "100",
      text: "Ответ",
      quotedMessageId: "old",
      requestId: randomUUID(),
    };
    await f.sessions.send(1, text);
    await f.sessions.send(1, text);
    assert.deepEqual(f.calls.find((c) => c.method === "sendMessage")?.body, {
      chatId: "100",
      message: "Ответ",
      quotedMessageId: "old",
    });
    assert.equal(f.calls.filter((c) => c.method === "sendMessage").length, 1);
    await assert.rejects(
      f.sessions.send(1, { ...text, quotedMessageId: "foreign" }),
      { code: "invalid" },
    );
    f.advance(3000);
    const upload = {
      connectionId: c.connectionId,
      chatId: "100",
      caption: "Файл",
      requestId: randomUUID(),
      quotedMessageId: "old",
    };
    const file = new File(["fixture text"], "note.txt", { type: "text/plain" });
    const sent = await f.sessions.upload(1, upload, file);
    await f.sessions.upload(1, upload, file);
    const form = f.calls.find((c) => c.method === "sendFileByUpload")?.body;
    assert.ok(form instanceof FormData);
    assert.equal(form.get("chatId"), "100");
    assert.equal(form.get("quotedMessageId"), "old");
    assert.equal(sent.attachment?.fileName, "note.txt");
    assert.equal(
      f.calls.filter((c) => c.method === "sendFileByUpload").length,
      1,
    );
    await assert.rejects(
      f.sessions.upload(
        1,
        upload,
        new File(["different"], "note.txt", { type: "text/plain" }),
      ),
      { code: "invalid" },
    );
    f.advance(3000);
    const forward = {
      connectionId: c.connectionId,
      chatId: "100",
      messageId: "old",
      targetChatId: "200",
      requestId: randomUUID(),
    };
    await f.sessions.forward(1, forward);
    await f.sessions.forward(1, forward);
    assert.equal(
      f.calls.filter((c) => c.method === "forwardMessages").length,
      1,
    );
    assert.deepEqual(
      f.calls.find((c) => c.method === "forwardMessages")?.body,
      { chatId: "200", chatIdFrom: "100", messages: ["old"] },
    );
  } finally {
    f.sessions.close();
  }
});

test("editing/deleting are limited to own sent messages and preserve original IDs", async () => {
  const f = maxFixture();
  try {
    const c = await f.sessions.connect(1, credentials);
    await f.sessions.history(1, c.connectionId, "100");
    const own = {
      connectionId: c.connectionId,
      chatId: "100",
      messageId: "own",
    };
    await assert.rejects(
      f.sessions.edit(1, { ...own, messageId: "old", text: "Change" }),
      { code: "invalid" },
    );
    await assert.rejects(
      f.sessions.delete(1, {
        ...own,
        messageId: "old",
        onlySenderDelete: false,
      }),
      { code: "invalid" },
    );
    await assert.rejects(f.sessions.edit(2, { ...own, text: "Change" }), {
      code: "not_found",
    });
    assert.equal(
      f.calls.some(
        (c) => c.method === "editMessage" || c.method === "deleteMessage",
      ),
      false,
    );
    await f.sessions.edit(1, { ...own, text: "Изменено" });
    const edited = await f.sessions.edit(1, {
      ...own,
      text: "Повторное изменение",
    });
    assert.equal(
      edited.messages.find((m) => m.id === "own")?.text,
      "Повторное изменение",
    );
    assert.ok(
      f.calls
        .filter((c) => c.method === "editMessage")
        .every((c) => (c.body as { idMessage: string }).idMessage === "own"),
    );
    const deleted = await f.sessions.delete(1, {
      ...own,
      onlySenderDelete: false,
    });
    assert.equal(deleted.messages.find((m) => m.id === "own")?.deleted, true);
    assert.deepEqual(f.calls.find((c) => c.method === "deleteMessage")?.body, {
      chatId: "100",
      idMessage: "own",
      onlySenderDelete: false,
    });
    await assert.rejects(f.sessions.edit(1, { ...own, text: "Late" }), {
      code: "invalid",
    });
  } finally {
    f.sessions.close();
  }
});

test("incoming media, external edits/deletes and duplicate events are retained before ACK", async () => {
  const f = maxFixture();
  try {
    const c = await f.sessions.connect(1, credentials);
    await f.sessions.history(1, c.connectionId, "100");
    const target = {
      connectionId: c.connectionId,
      chatId: "100",
      messageId: "image",
    };
    assert.ok(
      f.sessions
        .media(1, target)
        .url.startsWith("https://sw-media-3100.storage.yandexcloud.net/"),
    );
    assert.ok(
      !JSON.stringify(f.sessions.status(1)).includes("storage.yandexcloud.net"),
    );
    assert.throws(() => f.sessions.media(2, target), { code: "not_found" });
    f.notify({
      typeWebhook: "incomingMessageReceived",
      idMessage: "edit-event",
      senderData: { chatId: "100" },
      messageData: {
        typeMessage: "editedMessage",
        editedMessageData: {
          stanzaId: "old",
          textMessage: "Правка с телефона",
        },
      },
    });
    const edited = await f.sessions.poll(1, c.connectionId);
    assert.equal(
      edited.messages.find((m) => m.id === "old")?.text,
      "Правка с телефона",
    );
    f.notify({
      typeWebhook: "incomingMessageReceived",
      idMessage: "delete-event",
      senderData: { chatId: "100" },
      messageData: {
        typeMessage: "deletedMessage",
        deletedMessageData: { stanzaId: "image" },
      },
    });
    f.ack(false);
    await assert.rejects(f.sessions.poll(1, c.connectionId), {
      code: "unavailable",
    });
    f.ack(true);
    const deleted = await f.sessions.poll(1, c.connectionId);
    assert.equal(deleted.messages.find((m) => m.id === "image")?.deleted, true);
    assert.throws(() => f.sessions.media(1, target));
    await f.sessions.react(1, {
      connectionId: c.connectionId,
      chatId: "100",
      messageId: "old",
      reaction: "👍",
    });
    assert.equal(
      f.sessions.status(1)?.messages.find((m) => m.id === "old")?.myReaction,
      "👍",
    );
    await f.sessions.read(1, c.connectionId, "100");
    assert.ok(f.calls.some((c) => c.method === "readChat"));
  } finally {
    f.sessions.close();
  }
});

test("ambiguous send results are never retried, and logout cancels an in-flight connection", async () => {
  const f = maxFixture();
  try {
    const c = await f.sessions.connect(1, credentials);
    f.failSend();
    const input = {
      connectionId: c.connectionId,
      chatId: "100",
      text: "Привет",
      requestId: randomUUID(),
    };
    await assert.rejects(f.sessions.send(1, input), { code: "unavailable" });
    await assert.rejects(f.sessions.send(1, input), { code: "unavailable" });
    assert.equal(f.calls.filter((c) => c.method === "sendMessage").length, 1);
  } finally {
    f.sessions.close();
  }
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sessions = new MaxSessions(
    (c) =>
      new GreenMaxClient(c, (async (raw) => {
        const method = new URL(String(raw)).pathname.split("/")[2];
        if (method === "getSettings") await gate;
        return new Response(
          JSON.stringify(
            method === "getStateInstance"
              ? { stateInstance: "authorized" }
              : {
                  typeInstance: "v3",
                  webhookUrl: "",
                  incomingWebhook: "yes",
                  outgoingWebhook: "yes",
                },
          ),
        );
      }) as typeof fetch),
  );
  try {
    const connect = sessions.connect(1, credentials);
    sessions.disconnectOwner(1);
    release();
    await assert.rejects(connect);
    assert.equal(sessions.status(1), null);
  } finally {
    sessions.close();
  }
});

test("history continuation requires an extra provider row, not merely reaching the page size", async () => {
  const f = maxFixture();
  try {
    const c = await f.sessions.connect(1, credentials);
    const first = await f.sessions.history(1, c.connectionId, "100", 3);
    assert.equal(first.historyPages?.["100"].hasMore, false);
    f.history.push({ ...f.history[0], idMessage: "extra" });
    const more = await f.sessions.history(1, c.connectionId, "100", 3, true);
    assert.equal(more.historyPages?.["100"].hasMore, true);
    assert.equal(more.historyPages?.["100"].requested, 3);
    const end = await f.sessions.history(1, c.connectionId, "100", 4);
    assert.equal(end.historyPages?.["100"].hasMore, false);
    f.history.splice(0);
    const empty = await f.sessions.history(1, c.connectionId, "200", 100);
    assert.equal(empty.historyPages?.["200"].hasMore, false);
  } finally {
    f.sessions.close();
  }
});
