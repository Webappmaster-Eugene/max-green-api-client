import { MaxError } from "./error.js";
import type { MaxConnectInput } from "../../types/max.js";

export function greenApiOrigin(raw: string, allowMedia = false): string {
  const field = allowMedia ? "mediaUrl" : "apiUrl";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MaxError(`Скопируйте ${field} из кабинета GREEN-API.`, "invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !(
      allowMedia
        ? /^(?:\d+\.)?(?:api|media)\.green-api\.com$/
        : /^(?:\d+\.)?api\.green-api\.com$/
    ).test(url.hostname) ||
    !["", "/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new MaxError(
      `${field} должен быть HTTPS-адресом сервера ${allowMedia ? "api.green-api.com или media.green-api.com" : "api.green-api.com"} из кабинета.`,
      "invalid",
    );
  }
  return url.origin;
}

export class GreenMaxClient {
  private readonly origin: string;
  private readonly mediaOrigin?: string;
  private readonly abort = new AbortController();
  constructor(
    private readonly credentials: MaxConnectInput,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.origin = greenApiOrigin(credentials.apiUrl);
    if (credentials.mediaUrl) {
      this.mediaOrigin = greenApiOrigin(credentials.mediaUrl, true);
    }
  }

  close(): void {
    this.abort.abort();
  }

  async upload(form: FormData): Promise<unknown> {
    if (!this.mediaOrigin)
      throw new MaxError(
        "Для файлов укажите mediaUrl из кабинета GREEN-API.",
        "invalid",
      );
    return this.request(
      `${this.mediaOrigin}/waInstance${this.credentials.idInstance}/sendFileByUpload/${this.credentials.apiTokenInstance}`,
      { method: "POST", body: form },
    );
  }

  async call(
    method: string,
    verb = "GET",
    body?: unknown,
    suffix = "",
  ): Promise<unknown> {
    const url = `${this.origin}/waInstance${this.credentials.idInstance}/${method}/${this.credentials.apiTokenInstance}${suffix}`;
    return this.request(
      url,
      {
        method: verb,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      method === "deleteMessage",
    );
  }

  private async request(
    url: string,
    init: RequestInit,
    empty = false,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([
          AbortSignal.timeout(init.body instanceof FormData ? 60_000 : 12_000),
          this.abort.signal,
        ]),
      });
    } catch {
      throw new MaxError(
        "Нет ответа от GREEN-API. Проверьте соединение и состояние инстанса.",
        "unavailable",
      );
    }
    if (!response.ok) {
      const status = response.status;
      if ([401, 403].includes(status))
        throw new MaxError(
          "GREEN-API отказал в доступе. Проверьте ключ и ограничения аккаунта.",
          "forbidden",
        );
      if ([429, 466, 469].includes(status))
        throw new MaxError(
          "Достигнут лимит GREEN-API. Проверьте тариф и повторите позже.",
          "limit",
        );
      throw new MaxError(
        `GREEN-API вернул ошибку ${status}. Проверьте настройки инстанса.`,
        "unavailable",
      );
    }
    try {
      const text = await response.text();
      if (!text && empty) return null;
      return JSON.parse(text);
    } catch {
      throw new MaxError("GREEN-API вернул некорректный ответ.", "unavailable");
    }
  }
}
