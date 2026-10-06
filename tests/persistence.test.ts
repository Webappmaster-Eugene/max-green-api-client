import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SavedConnections } from "../src/max/connections.js";
import { maxFixture, credentials } from "./fixtures/max.js";

test("encrypted MAX connection survives time and restart; logout retains only parameters for key-only login", async () => {
  const dir = await mkdtemp(join(tmpdir(), "max-persistence-"));
  const f = maxFixture(new SavedConnections(dir));
  let restored = f.createSessions(new SavedConnections(dir));
  try {
    const first = await f.sessions.connect(1, credentials);
    f.advance(100 * 365 * 86400000);
    assert.equal(f.sessions.status(1)?.connectionId, first.connectionId);
    assert.equal(first.expiresAt, 0);
    const bytes = await readFile(join(dir, "max-connections.enc"));
    assert.equal(
      bytes.includes(Buffer.from(credentials.apiTokenInstance)),
      false,
    );
    assert.equal(
      (await stat(join(dir, "max-connections.enc"))).mode & 0o777,
      0o600,
    );
    assert.equal(
      (await stat(join(dir, "max-connections.key"))).mode & 0o777,
      0o600,
    );
    f.sessions.close();
    restored.close();
    restored = f.createSessions(new SavedConnections(dir));
    const [one, two] = await Promise.all([
      restored.restore(1),
      restored.restore(1),
    ]);
    assert.ok(one);
    assert.equal(one.connectionId, two?.connectionId);
    assert.notEqual(one.connectionId, first.connectionId);
    assert.equal(
      f.calls.filter((c) => c.method === "getStateInstance").length,
      2,
    );
    await assert.rejects(
      restored.send(1, {
        connectionId: first.connectionId,
        chatId: "100",
        text: "stale send",
        requestId: "e8557ebc-9f7c-4d7c-9c77-765771e17b33",
      }),
      { code: "not_found" },
    );
    assert.equal(f.calls.filter((c) => c.method === "sendMessage").length, 0);
    assert.equal(restored.savedState(2), null);
    assert.equal(
      JSON.stringify(restored.savedState(1)).includes(
        credentials.apiTokenInstance,
      ),
      false,
    );
    await assert.rejects(restored.connect(2, credentials), {
      code: "forbidden",
    });
    assert.throws(() => restored.disconnect(2, one.connectionId));
    restored.disconnect(1, one.connectionId);
    restored.close();
    const saved = new SavedConnections(dir);
    assert.equal(saved.get(1)?.credentials, undefined);
    assert.equal(saved.profile(1)?.idInstance, credentials.idInstance);
    restored = f.createSessions(saved);
    assert.equal(await restored.restore(1), null);
    const next = await restored.reconnect(1, {
      apiTokenInstance: credentials.apiTokenInstance,
    });
    assert.equal(next.idInstance, first.idInstance);
    assert.notEqual(next.connectionId, one.connectionId);
    assert.equal(restored.savedState(1)?.connected, true);
  } finally {
    f.sessions.close();
    restored.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("provider failure preserves credentials and directory parameters; corrupt storage fails closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "max-persistence-"));
  const f = maxFixture(new SavedConnections(dir));
  let restored = f.createSessions(new SavedConnections(dir));
  try {
    await f.sessions.connect(1, credentials);
    f.sessions.close();
    restored.close();
    restored = f.createSessions(new SavedConnections(dir));
    f.failConnect(466);
    await assert.rejects(restored.restore(1), { code: "provider_quota" });
    assert.equal(restored.savedState(1)?.connected, true);
    assert.equal(
      new SavedConnections(dir).get(1)?.credentials?.apiTokenInstance,
      credentials.apiTokenInstance,
    );
    f.failConnect();
    assert.ok(await restored.restore(1));
    const bytes = await readFile(join(dir, "max-connections.enc"));
    bytes[bytes.length - 1] ^= 1;
    await writeFile(join(dir, "max-connections.enc"), bytes);
    assert.throws(
      () => new SavedConnections(dir),
      /Cannot open encrypted storage/,
    );
  } finally {
    f.sessions.close();
    restored.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("explicit logout cancels restoration without resurrecting saved credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "max-restore-cancel-"));
  const f = maxFixture(new SavedConnections(dir));
  let restored = f.createSessions(new SavedConnections(dir));
  try {
    await f.sessions.connect(1, credentials);
    f.sessions.close();
    restored.close();
    restored = f.createSessions(new SavedConnections(dir));
    const pending = restored.restore(1);
    restored.disconnectOwner(1);
    await assert.rejects(pending);
    assert.equal(restored.status(1), null);
    assert.equal(new SavedConnections(dir).get(1)?.credentials, undefined);
  } finally {
    f.sessions.close();
    restored.close();
    await rm(dir, { recursive: true, force: true });
  }
});
