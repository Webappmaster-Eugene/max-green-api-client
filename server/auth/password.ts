import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)) return false;
  const [, salt, expected] = encoded.split("$");
  const hash = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(hash, Buffer.from(expected, "hex"));
}
