import { FILE_EXTENSIONS, MAX_FILE_SIZE } from "../../contracts/constants.js";
import { MaxError } from "./error.js";
import type { DownloadedMedia } from "../../types/internal.js";

export function safeMediaUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !/^(?:(?:media-\d+|sw-media(?:-\d+|-in|-out)?)\.storage\.yandexcloud\.net|(?:\d+\.)?media\.green-api\.com)$/.test(
        url.hostname,
      )
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function safeFileName(value: string): string {
  const name =
    value
      .split(/[\\/]/)
      .at(-1)
      ?.split("")
      .filter(
        (character) =>
          character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
      )
      .join("") || "file";
  if (name.length <= 180) return name;
  const extension = name.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? "";
  return name.slice(0, 180 - extension.length) + extension;
}

export function validateUpload(file: File): void {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (
    !file.size ||
    file.size > MAX_FILE_SIZE ||
    !FILE_EXTENSIONS.some((value) => value === extension)
  )
    throw new MaxError(
      "Выберите разрешённый файл размером до 10 МБ.",
      "invalid",
    );
}

export async function downloadMedia(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<DownloadedMedia> {
  const safe = safeMediaUrl(url);
  if (!safe) throw new MaxError("Ссылка на вложение недоступна.", "invalid");
  let response: Response;
  try {
    response = await fetcher(safe, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MaxError("Не удалось скачать вложение.", "unavailable");
  }
  if (!response.ok || !response.body)
    throw new MaxError(
      "Вложение недоступно или срок ссылки истёк.",
      "unavailable",
    );
  if (Number(response.headers.get("Content-Length")) > MAX_FILE_SIZE) {
    await response.body.cancel();
    throw new MaxError("Вложение превышает 10 МБ.", "invalid");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_SIZE) {
        await reader.cancel();
        throw new MaxError("Вложение превышает 10 МБ.", "invalid");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof MaxError) throw error;
    throw new MaxError("Загрузка вложения прервана.", "unavailable");
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    bytes,
    mimeType:
      response.headers.get("Content-Type")?.split(";")[0].trim() ||
      "application/octet-stream",
  };
}

export function mediaMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    pdf: "application/pdf",
  };
  return (
    types[fileName.split(".").at(-1)?.toLowerCase() ?? ""] ??
    "application/octet-stream"
  );
}
