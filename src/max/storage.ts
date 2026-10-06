import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { z } from "zod";

export class EncryptedStore<T> {
  private readonly key: Buffer;
  private readonly file: string;
  private value: T;
  constructor(
    directory: string,
    private readonly name: string,
    private readonly schema: z.ZodType<T>,
    initial: T,
  ) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, `${name}.enc`);
    const keyFile = join(directory, `${name}.key`);
    if (!existsSync(keyFile)) {
      if (existsSync(this.file))
        throw new Error("Encrypted storage key is missing");
      try {
        writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    this.key = readFileSync(keyFile);
    if (this.key.length !== 32)
      throw new Error("Invalid encrypted storage key");
    this.value = schema.parse(initial);
    try {
      const bytes = readFileSync(this.file);
      if (bytes.length < 29 || bytes[0] !== 1)
        throw new Error("Invalid encrypted storage");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        bytes.subarray(1, 13),
      );
      decipher.setAAD(Buffer.from(name));
      decipher.setAuthTag(bytes.subarray(13, 29));
      const decoded = Buffer.concat([
        decipher.update(bytes.subarray(29)),
        decipher.final(),
      ]);
      this.value = schema.parse(JSON.parse(decoded.toString("utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("Cannot open encrypted storage");
    }
  }
  read(): T {
    return structuredClone(this.value);
  }
  write(value: T): void {
    const checked = this.schema.parse(value);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(this.name));
    const payload = Buffer.concat([
      cipher.update(JSON.stringify(checked)),
      cipher.final(),
    ]);
    const bytes = Buffer.concat([
      Buffer.from([1]),
      nonce,
      cipher.getAuthTag(),
      payload,
    ]);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const fd = openSync(temporary, "wx", 0o600);
      try {
        writeFileSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, this.file);
      this.value = structuredClone(checked);
    } finally {
      try {
        unlinkSync(temporary);
      } catch {}
    }
  }
}
