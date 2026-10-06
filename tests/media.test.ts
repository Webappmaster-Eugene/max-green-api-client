import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeMediaUrl,
  safeFileName,
  validateUpload,
  downloadMedia,
} from "../src/max/media.js";
import { MAX_FILE_SIZE } from "../contracts/constants.js";

test("media accepts trusted HTTPS only and rejects active/oversized uploads", () => {
  for (const value of [
    "https://127.0.0.1/private",
    "http://sw-media-3100.storage.yandexcloud.net/x",
    "https://sw-media-3100.storage.yandexcloud.net.evil.test/x",
    "https://user:password@3100.media.green-api.com/x",
    "https://3100.media.green-api.com:8443/x",
    "javascript:alert(1)",
  ])
    assert.equal(safeMediaUrl(value), undefined);
  assert.equal(
    safeMediaUrl("https://sw-media-3100.storage.yandexcloud.net/file"),
    "https://sw-media-3100.storage.yandexcloud.net/file",
  );
  assert.equal(safeFileName("../../photo\r\n.png"), "photo.png");
  assert.ok(safeFileName("a".repeat(220) + ".pdf").endsWith(".pdf"));
  assert.throws(() => validateUpload(new File(["<svg/>"], "active.svg")));
  assert.throws(() =>
    validateUpload(
      new File([new Uint8Array(MAX_FILE_SIZE + 1)], "too-big.txt"),
    ),
  );
  validateUpload(new File(["safe text"], "note.txt", { type: "text/plain" }));
});
test("media downloader disallows redirects and bounds streamed bytes even without Content-Length", async () => {
  let calls = 0;
  const fetcher = (async (_url, init) => {
    calls++;
    assert.equal(init?.redirect, "error");
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_FILE_SIZE));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
    );
  }) as typeof fetch;
  await assert.rejects(downloadMedia("https://127.0.0.1/x", fetcher));
  assert.equal(calls, 0);
  await assert.rejects(
    downloadMedia("https://3100.media.green-api.com/x", fetcher),
  );
  assert.equal(calls, 1);
});

test("MAX storage host variants and missing MIME metadata remain downloadable", async () => {
  const { normalizeHistory } = await import("../src/max/message.js");
  for (const host of [
    "media-3100.storage.yandexcloud.net",
    "sw-media-out.storage.yandexcloud.net",
    "sw-media-in.storage.yandexcloud.net",
  ]) {
    const normalized = normalizeHistory(
      {
        idMessage: "media",
        chatId: "100",
        type: "incoming",
        timestamp: Date.now() / 1000,
        typeMessage: "videoMessage",
        downloadUrl: `https://${host}/instance/clip.mp4`,
      },
      Date.now(),
    );
    assert.equal(normalized.message.attachment?.available, true);
    assert.equal(normalized.message.attachment?.mimeType, "video/mp4");
    assert.equal(normalized.message.attachment?.fileName, "clip.mp4");
    assert.equal(safeMediaUrl(`https://${host}.evil.test/file`), undefined);
  }
});
