import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { MaxSessions } from "../src/max/session.js";
import { GreenMaxClient } from "../src/max/client.js";
const origin = "https://max.example.test";
const credentials = { apiUrl: "https://3100.api.green-api.com", idInstance: "3100000001", apiTokenInstance: "test_fake_token_123456", accountConsent: true };
test("HttpOnly sessions isolate visitors, validate CSRF and keep credentials server-side", async () => {
  const fetcher = (async raw => {
    const method = new URL(String(raw)).pathname.split("/")[2];
    const data = method === "getStateInstance" ? { stateInstance: "authorized" } : method === "getSettings" ? { typeInstance: "v3", webhookUrl: "", incomingWebhook: "yes", outgoingWebhook: "yes" } : [];
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  const sessions = new MaxSessions(c => new GreenMaxClient(c, fetcher));
  try {
    const app = createApp(sessions, origin);
    assert.equal((await app.request("/api/max")).status, 403);
    assert.equal((await app.request("/api/max", { headers: { "X-Max-Client": "1", Origin: "https://evil.test" } })).status, 403);
    const initial = await app.request("/api/max", { headers: { "X-Max-Client": "1" } });
    const cookieHeader = initial.headers.get("Set-Cookie")!;
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "__Host-max-client="]) assert.ok(cookieHeader.includes(flag));
    const cookie = cookieHeader.split(";")[0];
    const headers = { "X-Max-Client": "1", "Content-Type": "application/json", Cookie: cookie, Origin: origin };
    const connected = await app.request("/api/max/connect", { method: "POST", headers, body: JSON.stringify(credentials) });
    assert.equal(connected.status, 200);
    const json = await connected.json();
    assert.ok(!JSON.stringify(json).includes(credentials.apiTokenInstance));
    const foreign = await app.request("/api/max/poll", { method: "POST", headers: { ...headers, Cookie: "__Host-max-client=untrusted" }, body: JSON.stringify({ connectionId: json.data.connectionId }) });
    assert.equal(foreign.status, 404);
    const own = await app.request("/api/max", { headers });
    assert.equal((await own.json()).data.connectionId, json.data.connectionId);
    const bad = await app.request("/api/max/send", { method: "POST", headers, body: "not json" });
    assert.equal(bad.status, 400);
    const big = await app.request("/api/max/send", { method: "POST", headers, body: "x".repeat(17000) });
    assert.equal(big.status, 413);
  } finally { sessions.close(); }
});
