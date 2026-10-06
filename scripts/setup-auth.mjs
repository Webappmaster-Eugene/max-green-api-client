import { randomBytes, scrypt } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = await promisify(scrypt)(password, salt, 64);
const environment = `PUBLIC_ORIGIN=http://127.0.0.1:18792\nAUTH_JWT_SECRET=${randomBytes(48).toString("base64url")}\nADMIN_LOGIN=owner\nADMIN_PASSWORD_HASH=scrypt$${salt}$${hash.toString("hex")}\nDATA_DIR=./data\nHOST=127.0.0.1\nPORT=18792\n`;
try {
  await writeFile(".env.local", environment, { mode: 0o600, flag: "wx" });
  await writeFile(
    ".admin-credentials",
    `Сайт Max\nЛогин: owner\nПароль: ${password}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Настройки созданы в .env.local. Реквизиты входа — в .admin-credentials; оба файла приватные и исключены из Git.",
  );
} catch {
  console.error(
    "Настройки уже существуют или запись недоступна. Существующие секреты не изменены.",
  );
  process.exitCode = 1;
}
