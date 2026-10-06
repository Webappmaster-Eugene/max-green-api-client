import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadAttachment, safeMediaUrl } from "../src/max/media.js";
import { maxFixture, credentials } from "./fixtures/max.js";

test("outgoing MAX storage URLs from real history are retained, with hostile lookalikes rejected", async () => {
  const f = maxFixture();
  try {
    f.history[2].downloadUrl =
      "https://mediaout-3100.storage.yandexcloud.net/fixture/photo.png";
    const c = await f.sessions.connect(1, credentials);
    const history = await f.sessions.history(1, c.connectionId, "100");
    assert.equal(
      history.messages.find((m) => m.id === "image")?.attachment?.available,
      true,
    );
    const target = {
      connectionId: c.connectionId,
      chatId: "100",
      messageId: "image",
    };
    assert.equal(
      (await f.sessions.media(1, target)).url,
      f.history[2].downloadUrl,
    );
    assert.equal(
      f.calls.some((c) => c.method === "downloadFile"),
      false,
    );
    for (const url of [
      "https://mediaout-3100.storage.yandexcloud.net.evil.test/a",
      "https://user:pass@mediaout-3100.storage.yandexcloud.net/a",
      "http://mediaout-3100.storage.yandexcloud.net/a",
      "https://attacker.storage.yandexcloud.net/a",
    ])
      assert.equal(safeMediaUrl(url), undefined);
  } finally {
    f.sessions.close();
  }
});

test("missing media URL is resolved on demand, coalesced and never resolved for another owner or deleted message", async () => {
  const f = maxFixture();
  try {
    f.history[2].downloadUrl = "";
    const c = await f.sessions.connect(1, credentials);
    await f.sessions.history(1, c.connectionId, "100");
    const target = {
      connectionId: c.connectionId,
      chatId: "100",
      messageId: "image",
    };
    await assert.rejects(f.sessions.media(2, target));
    assert.equal(
      f.calls.some((c) => c.method === "downloadFile"),
      false,
    );
    const [one, two] = await Promise.all([
      f.sessions.media(1, target),
      f.sessions.media(1, target),
    ]);
    assert.equal(one.url, two.url);
    assert.equal(f.calls.filter((c) => c.method === "downloadFile").length, 1);
    assert.deepEqual(f.calls.find((c) => c.method === "downloadFile")?.body, {
      chatId: "100",
      idMessage: "image",
    });
    assert.equal(
      JSON.stringify(f.sessions.status(1)).includes("storage.yandexcloud.net"),
      false,
    );
    await f.sessions.history(1, c.connectionId, "100", 100, true);
    assert.equal((await f.sessions.media(1, target)).url, one.url);
    assert.equal(f.calls.filter((c) => c.method === "downloadFile").length, 1);
    f.sessions.disconnect(1, c.connectionId);
    await assert.rejects(f.sessions.media(1, target));
    assert.equal(f.calls.filter((c) => c.method === "downloadFile").length, 1);
  } finally {
    f.sessions.close();
  }
});

test("expired media refreshes once, while oversized files never request another link", async () => {
  const f = maxFixture();
  try {
    const c = await f.sessions.connect(1, credentials);
    await f.sessions.history(1, c.connectionId, "100");
    const target = {
      connectionId: c.connectionId,
      chatId: "100",
      messageId: "image",
    };
    let calls = 0;
    const result = await downloadAttachment(
      (refresh) => f.sessions.media(1, target, refresh),
      (async (_url, init) => {
        assert.equal(init?.redirect, "error");
        return ++calls === 1
          ? new Response(null, { status: 403 })
          : new Response("fixture binary");
      }) as typeof fetch,
    );
    assert.equal(calls, 2);
    assert.equal(result.message.id, "image");
    assert.equal(f.calls.filter((c) => c.method === "downloadFile").length, 1);
    const resolve = async (refresh: boolean) => {
      assert.equal(refresh, false);
      return f.sessions.media(1, target);
    };
    await assert.rejects(
      downloadAttachment(
        resolve,
        (async () =>
          new Response("oversized", {
            headers: { "Content-Length": "999999999" },
          })) as typeof fetch,
      ),
    );
    assert.equal(f.calls.filter((c) => c.method === "downloadFile").length, 1);
  } finally {
    f.sessions.close();
  }
});

test("id-only uploads remain downloadable, and unsafe resolver URLs never reach the binary fetch", async () => {
  const f = maxFixture();
  try {
    f.omitUploadUrl();
    const c = await f.sessions.connect(1, credentials);
    const uploaded = await f.sessions.upload(
      1,
      {
        connectionId: c.connectionId,
        chatId: "100",
        caption: "",
        requestId: "47f99e3b-5dc9-43d2-801f-8e987dc6307d",
      },
      new File(["fixture"], "note.txt", { type: "text/plain" }),
    );
    assert.equal(uploaded.attachment?.available, true);
    f.setMediaUrl("https://127.0.0.1/private");
    let binaryCalls = 0;
    await assert.rejects(
      downloadAttachment(
        (refresh) =>
          f.sessions.media(
            1,
            {
              connectionId: c.connectionId,
              chatId: "100",
              messageId: uploaded.id,
            },
            refresh,
          ),
        (async () => {
          binaryCalls++;
          return new Response("unexpected");
        }) as typeof fetch,
      ),
    );
    assert.equal(binaryCalls, 0);
    assert.equal(f.calls.filter((c) => c.method === "downloadFile").length, 1);
    assert.equal(f.sessions.status(1)?.connectionId, c.connectionId);
  } finally {
    f.sessions.close();
  }
});
