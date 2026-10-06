import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { AuthSessions } from "../server/auth/sessions.js";
import { UserRepository } from "../server/auth/users.js";
import { hashPassword } from "../server/auth/password.js";
import { maxFixture, credentials } from "./fixtures/max.js";
import { authSessionSchema, storedUserSchema } from "../contracts/auth.js";

const origin = "https://max.example.test";
const password = "fixture-password-12345";
async function fixture() {
  const max = maxFixture();
  const passwordHash = await hashPassword(password);
  const users = UserRepository.memory(
    [1, 2].map((id) =>
      storedUserSchema.parse({
        id,
        login: id === 1 ? "owner" : "member",
        role: id === 1 ? "admin" : "member",
        active: true,
        version: 0,
        passwordHash,
      }),
    ),
  );
  const auth = new AuthSessions(users, {
    secret: "fixture-only-signing-key-for-http-tests",
    origin,
  });
  const app = createApp({ sessions: max.sessions, auth, origin });
  const base = {
    "X-Max-Client": "1",
    "Content-Type": "application/json",
    Origin: origin,
  };
  const login = async (name: string) => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: base,
      body: JSON.stringify({ login: name, password }),
    });
    assert.equal(response.status, 200);
    const json = await response.json();
    const session = authSessionSchema.parse(json.data);
    const cookie = response.headers.get("Set-Cookie")!;
    return {
      session,
      cookie,
      headers: {
        ...base,
        Cookie: cookie.split(";")[0],
        "X-CSRF-Token": session.csrfToken,
      },
    };
  };
  return {
    ...max,
    app,
    auth,
    users,
    base,
    login,
    close: () => {
      auth.close();
      max.sessions.close();
    },
  };
}

test("all MAX entry points require login; JWT is HttpOnly/Secure and CSRF is mandatory", async () => {
  const f = await fixture();
  try {
    for (const path of [
      "/api/max",
      "/api/auth/session",
      "/api/admin/users",
      "/api/max/media?connectionId=fake&chatId=100&messageId=old",
    ])
      assert.equal(
        (await f.app.request(path, { headers: f.base })).status,
        401,
      );
    assert.equal(
      (
        await f.app.request("/api/max/connect", {
          method: "POST",
          headers: f.base,
          body: JSON.stringify(credentials),
        })
      ).status,
      401,
    );
    assert.equal(f.calls.length, 0);
    const owner = await f.login("owner");
    for (const flag of [
      "__Host-max-auth=",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/",
    ])
      assert.ok(owner.cookie.includes(flag));
    const headers = { ...owner.headers, "X-CSRF-Token": "" };
    assert.equal(
      (
        await f.app.request("/api/max/connect", {
          method: "POST",
          headers,
          body: JSON.stringify(credentials),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.app.request("/api/max/connect", {
          method: "POST",
          headers: { ...owner.headers, Origin: "https://evil.test" },
          body: JSON.stringify(credentials),
        })
      ).status,
      403,
    );
    assert.equal(f.calls.length, 0);
    assert.equal(
      (
        await f.app.request("/api/max/connect", {
          method: "POST",
          headers: owner.headers,
          body: JSON.stringify({ ...credentials, owner: 2 }),
        })
      ).status,
      400,
    );
  } finally {
    f.close();
  }
});

test("MAX ownership, logout invalidation and administrator access cannot be bypassed", async () => {
  const f = await fixture();
  try {
    const owner = await f.login("owner");
    const member = await f.login("member");
    const connection = await f.app.request("/api/max/connect", {
      method: "POST",
      headers: owner.headers,
      body: JSON.stringify(credentials),
    });
    assert.equal(connection.status, 200);
    const json = await connection.json();
    assert.ok(!JSON.stringify(json).includes(credentials.apiTokenInstance));
    assert.equal(
      (
        await f.app.request("/api/max/poll", {
          method: "POST",
          headers: member.headers,
          body: JSON.stringify({ connectionId: json.data.connectionId }),
        })
      ).status,
      404,
    );
    assert.equal(
      (await f.app.request("/api/max", { headers: member.headers })).status,
      200,
    );
    assert.equal(
      (
        await (
          await f.app.request("/api/max", { headers: member.headers })
        ).json()
      ).data,
      null,
    );
    for (const path of [
      "/api/admin/users",
      "/api/admin/users/access",
      "/api/admin/users/password",
    ]) {
      const response = await f.app.request(path, {
        method: path === "/api/admin/users" ? "GET" : "POST",
        headers: member.headers,
        body: path === "/api/admin/users" ? undefined : "{}",
      });
      assert.equal(response.status, 403);
    }
    const out = await f.app.request("/api/auth/logout", {
      method: "POST",
      headers: owner.headers,
    });
    assert.equal(out.status, 200);
    assert.equal(f.sessions.status(1), null);
    assert.equal(
      (await f.app.request("/api/max", { headers: owner.headers })).status,
      401,
    );
  } finally {
    f.close();
  }
});

test("validation, limits, bad requests and security headers fail safely", async () => {
  const f = await fixture();
  try {
    const owner = await f.login("owner");
    const status = await f.app.request("/api/auth/session", {
      headers: owner.headers,
    });
    assert.equal(status.headers.get("Cache-Control"), "no-store");
    assert.equal(status.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(status.headers.get("X-Frame-Options"), "DENY");
    assert.ok(
      status.headers
        .get("Content-Security-Policy")
        ?.includes("object-src 'none'"),
    );
    const malformed = await f.app.request("/api/max/send", {
      method: "POST",
      headers: owner.headers,
      body: "not JSON",
    });
    assert.equal(malformed.status, 400);
    const huge = await f.app.request("/api/max/send", {
      method: "POST",
      headers: owner.headers,
      body: "x".repeat(33000),
    });
    assert.equal(huge.status, 413);
    const unknown = await f.app.request("/api/unknown", {
      headers: owner.headers,
    });
    assert.equal(unknown.status, 404);
    for (let i = 0; i < 4; i++)
      assert.equal(
        (
          await f.app.request("/api/auth/login", {
            method: "POST",
            headers: f.base,
            body: JSON.stringify({ login: "owner", password: "incorrect" }),
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await f.app.request("/api/auth/login", {
          method: "POST",
          headers: f.base,
          body: JSON.stringify({ login: "owner", password }),
        })
      ).status,
      429,
    );
  } finally {
    f.close();
  }
});

test("revoking account access terminates its existing JWT and MAX connection", async () => {
  const f = await fixture();
  try {
    const owner = await f.login("owner");
    const member = await f.login("member");
    const connected = await f.app.request("/api/max/connect", {
      method: "POST",
      headers: member.headers,
      body: JSON.stringify(credentials),
    });
    assert.equal(connected.status, 200);
    const revoked = await f.app.request("/api/admin/users/access", {
      method: "POST",
      headers: owner.headers,
      body: JSON.stringify({ id: 2, active: false }),
    });
    assert.equal(revoked.status, 200);
    assert.equal(f.sessions.status(2), null);
    assert.equal(
      (await f.app.request("/api/max", { headers: member.headers })).status,
      401,
    );
  } finally {
    f.close();
  }
});
