import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
const data = await mkdtemp(join(tmpdir(), "max-browser-test-"));
const salt = randomBytes(16).toString("hex");
const hash = await promisify(scrypt)("e2e-fixture-password", salt, 64);
const child = spawn(process.execPath, ["dist/server/index.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    PUBLIC_ORIGIN: "http://127.0.0.1:18793",
    PORT: "18793",
    HOST: "127.0.0.1",
    AUTH_JWT_SECRET: randomBytes(48).toString("base64url"),
    ADMIN_LOGIN: "owner",
    ADMIN_PASSWORD_HASH: `scrypt$${salt}$${hash.toString("hex")}`,
    DATA_DIR: data,
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
child.once("exit", async (code) => {
  await rm(data, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
