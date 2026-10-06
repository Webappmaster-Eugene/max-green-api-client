import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";
import { hashPassword, verifyPassword } from "../server/auth/password.js";
import { UserRepository } from "../server/auth/users.js";
import { AuthSessions } from "../server/auth/sessions.js";
import { AppError } from "../server/lib/error.js";

const password = "fixture-password-12345";
const secret = "fixture-only-auth-signing-key-32-characters";
const origin = "https://max.example.test";
async function fixture() {
  const passwordHash = await hashPassword(password);
  const users = UserRepository.memory([
    {
      id: 1,
      login: "owner",
      role: "admin",
      active: true,
      version: 0,
      passwordHash,
    },
    {
      id: 2,
      login: "member",
      role: "member",
      active: true,
      version: 0,
      passwordHash,
    },
  ]);
  let now = Date.now();
  const auth = new AuthSessions(users, { secret, origin, now: () => now });
  return {
    auth,
    users,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test("scrypt uses individual salts and never accepts a wrong or malformed hash", async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrect-password", first), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
});
test("JWT signature, expiry, CSRF, logout and server-side account status are enforced", async () => {
  const { auth, users, advance } = await fixture();
  try {
    const { token, session } = await auth.login({ login: "member", password });
    const grant = await auth.verify(token);
    assert.equal(grant.user.id, 2);
    auth.verifyCsrf(grant, session.csrfToken);
    assert.throws(() => auth.verifyCsrf(grant, "0".repeat(64)), AppError);
    const forged = await new SignJWT({ version: 0, csrf: session.csrfToken })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("2")
      .setJti(grant.jti)
      .setIssuer(origin)
      .setAudience("max-client")
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(randomBytes(32));
    await assert.rejects(auth.verify(forged), { status: 401 });
    await assert.rejects(auth.verify(token.slice(0, -4) + "fake"), {
      status: 401,
    });
    auth.logout(grant.jti);
    await assert.rejects(auth.verify(token), { status: 401 });
    const second = await auth.login({ login: "member", password });
    await users.setActive(2, false, 1);
    await assert.rejects(auth.verify(second.token), { status: 401 });
    await assert.rejects(auth.login({ login: "member", password }), {
      status: 401,
    });
    const admin = await auth.login({ login: "owner", password });
    advance(8 * 3600000 + 1);
    await assert.rejects(auth.verify(admin.token), { status: 401 });
  } finally {
    auth.close();
  }
});
test("password change revokes old JWTs; self-disable and duplicate logins are blocked", async () => {
  const { auth, users } = await fixture();
  try {
    const old = await auth.login({ login: "member", password });
    await assert.rejects(
      users.changePassword(2, "incorrect", "a-new-valid-password"),
      { status: 403 },
    );
    await users.changePassword(2, password, "a-new-valid-password");
    await assert.rejects(auth.verify(old.token), { status: 401 });
    await assert.rejects(auth.login({ login: "member", password }), {
      status: 401,
    });
    assert.equal(
      (await auth.login({ login: "member", password: "a-new-valid-password" }))
        .session.user.id,
      2,
    );
    await assert.rejects(users.setActive(1, false, 1), { status: 400 });
    await assert.rejects(
      users.create({ login: "member", role: "member", password }),
      { status: 409 },
    );
    assert.ok(
      users.list().every((u) => !JSON.stringify(u).includes("passwordHash")),
    );
  } finally {
    auth.close();
  }
});
test("user accounts persist privately and corrupt storage fails closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "max-auth-test-"));
  const file = join(dir, "users.json");
  try {
    const bootstrap = {
      login: "owner",
      passwordHash: await hashPassword(password),
    };
    const users = await UserRepository.open(file, bootstrap);
    const created = await users.create({
      login: "alice",
      role: "member",
      password,
    });
    const reopened = await UserRepository.open(file);
    assert.equal(reopened.find(created.id)?.login, "alice");
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.ok(!(await readFile(file, "utf8")).includes(password));
    await writeFile(file, "invalid JSON");
    await assert.rejects(UserRepository.open(file, bootstrap));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
