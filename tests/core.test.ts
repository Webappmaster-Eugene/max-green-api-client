import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MaxSessions } from "../src/max/session.js";
import { GreenMaxClient, greenApiOrigin } from "../src/max/client.js";

const credentials = {
  apiUrl: "https://3100.api.green-api.com",
  idInstance: "3100000001",
  apiTokenInstance: "test_fake_token_123456",
  accountConsent: true,
};
test("existing contacts, refreshed history, idempotent sends and acknowledged replies", async () => {
  const calls: string[] = [];
  let notification: unknown = null;
  let ack = true;
  const fetcher = (async (raw, init) => {
    const method = new URL(String(raw)).pathname.split("/")[2];
    calls.push(method);
    let data: unknown;
    switch (method) {
      case "getStateInstance":
        data = { stateInstance: "authorized" };
        break;
      case "getSettings":
        data = {
          typeInstance: "v3",
          webhookUrl: "",
          incomingWebhook: "yes",
          outgoingWebhook: "yes",
        };
        break;
      case "getChats":
        data = [{ chatId: "100", name: "Profile", type: "user" }];
        break;
      case "getContacts":
        data = [
          { chatId: "100", contactName: "Анна", type: "user", phoneNumber: 0 },
        ];
        break;
      case "getChatHistory":
        data = [
          {
            chatId: "100",
            idMessage: "new",
            type: "incoming",
            textMessage: "Новое",
            timestamp: 1800000002,
          },
          {
            chatId: "100",
            idMessage: "old",
            type: "incoming",
            textMessage: "Ранее",
            timestamp: 1800000001,
          },
        ];
        break;
      case "sendMessage":
        assert.equal(JSON.parse(String(init?.body)).chatId, "100");
        data = { idMessage: "sent-1" };
        break;
      case "receiveNotification":
        data = notification;
        break;
      case "deleteNotification":
        data = { result: ack };
        break;
      default:
        throw new Error("Unexpected method");
    }
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  const sessions = new MaxSessions((c) => new GreenMaxClient(c, fetcher));
  try {
    const connected = await sessions.connect(1, credentials);
    const id = connected.connectionId;
    assert.equal(connected.chats[0].title, "Анна");
    assert.equal(connected.contacts?.[0].phone, undefined);
    const history = await sessions.history(1, id, "100");
    assert.deepEqual(
      history.messages.map((m) => m.id),
      ["old", "new"],
    );
    await sessions.history(1, id, "100");
    assert.equal(calls.filter((c) => c === "getChatHistory").length, 1);
    await sessions.sync(1, id);
    await sessions.history(1, id, "100");
    assert.equal(calls.filter((c) => c === "getChatHistory").length, 2);
    const input = {
      connectionId: id,
      chatId: "100",
      text: "Привет",
      requestId: randomUUID(),
    };
    await sessions.send(1, input);
    await sessions.send(1, input);
    assert.equal(calls.filter((c) => c === "sendMessage").length, 1);
    assert.equal(calls.includes("checkAccount"), false);
    await assert.rejects(sessions.send(2, input), /завершено/);
    const envelope = (body: object) => ({
      receiptId: 1,
      body: {
        instanceData: { idInstance: 3100000001, typeInstance: "v3" },
        timestamp: 1800000003,
        ...body,
      },
    });
    notification = envelope({
      typeWebhook: "incomingMessageReceived",
      idMessage: "reply",
      senderData: { chatId: "100" },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "Ответ" },
      },
    });
    ack = false;
    await assert.rejects(sessions.poll(1, id), { code: "unavailable" });
    ack = true;
    await sessions.poll(1, id);
    assert.equal(
      sessions.status(1)?.messages.filter((m) => m.id === "reply").length,
      1,
    );
    for (const status of ["read", "sent"]) {
      notification = envelope({
        typeWebhook: "outgoingMessageStatus",
        chatId: "100",
        idMessage: "sent-1",
        status,
      });
      await sessions.poll(1, id);
    }
    assert.equal(
      sessions.status(1)?.messages.find((m) => m.id === "sent-1")?.status,
      "read",
    );
  } finally {
    sessions.close();
  }
});

test("provider address restrictions and errors do not expose credentials", async () => {
  for (const url of [
    "https://127.0.0.1",
    "http://api.green-api.com",
    "https://api.green-api.com.evil.test",
    "https://api.green-api.com:8443",
  ])
    assert.throws(() => greenApiOrigin(url));
  const client = new GreenMaxClient(credentials, (async () => {
    throw new Error(credentials.apiTokenInstance);
  }) as typeof fetch);
  await assert.rejects(
    client.call("getSettings"),
    (error) =>
      error instanceof Error &&
      !error.message.includes(credentials.apiTokenInstance),
  );
});

test("mediaUrl accepts the exact API or media host from the console for uploads", async () => {
  for (const origin of [
    "https://3100.api.green-api.com",
    "https://api.green-api.com",
    "https://3100.media.green-api.com",
    "https://media.green-api.com",
  ]) {
    const client = new GreenMaxClient(
      { ...credentials, mediaUrl: `${origin}/` },
      (async (raw, init) => {
        assert.equal(
          String(raw),
          `${origin}/waInstance${credentials.idInstance}/sendFileByUpload/${credentials.apiTokenInstance}`,
        );
        assert.equal(init?.method, "POST");
        assert.equal(init?.redirect, "error");
        assert.ok(init?.body instanceof FormData);
        return Response.json({ idMessage: "uploaded" });
      }) as typeof fetch,
    );
    try {
      assert.deepEqual(await client.upload(new FormData()), {
        idMessage: "uploaded",
      });
    } finally {
      client.close();
    }
  }
});

test("mediaUrl rejects untrusted hosts and URL credentials before any request", () => {
  for (const mediaUrl of [
    "not-a-url",
    "http://3100.api.green-api.com",
    "https://127.0.0.1",
    "https://3100.media.green-api.com.evil.test",
    "https://3100.api.green-api.com:8443",
    "https://user:pass@3100.api.green-api.com",
    "https://3100.api.green-api.com/path",
    "https://3100.media.green-api.com?token=secret",
    "https://3100.media.green-api.com#fragment",
  ])
    assert.throws(() => new GreenMaxClient({ ...credentials, mediaUrl }), {
      code: "invalid",
    });
  assert.throws(() => greenApiOrigin("https://3100.media.green-api.com"));
});

test("temporary provider throttling retries reads but never repeats a send or a quota refusal", async () => {
  let reads = 0;
  const client = new GreenMaxClient(credentials, (async () => {
    reads++;
    return reads === 1
      ? new Response(null, { status: 429 })
      : Response.json({ stateInstance: "authorized" });
  }) as typeof fetch);
  try {
    assert.deepEqual(await client.call("getStateInstance"), {
      stateInstance: "authorized",
    });
    assert.equal(reads, 2);
  } finally {
    client.close();
  }
  for (const status of [429, 466, 469]) {
    let calls = 0;
    const refused = new GreenMaxClient(credentials, (async () => {
      calls++;
      return new Response(null, { status });
    }) as typeof fetch);
    try {
      await assert.rejects(
        refused.call("sendMessage", "POST", { chatId: "100", message: "Test" }),
        {
          code:
            status === 429
              ? "provider_rate_limit"
              : status === 466
                ? "provider_quota"
                : "limit",
        },
      );
      assert.equal(calls, 1);
    } finally {
      refused.close();
    }
  }
});
