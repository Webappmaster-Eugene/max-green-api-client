import { MaxError } from "./error.js";
import type { MaxConnectInput } from "../shared/max.js";

export function greenApiOrigin(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new MaxError("Скопируйте apiUrl из кабинета GREEN-API.", "invalid"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !/^(?:\d+\.)?api\.green-api\.com$/.test(url.hostname) ||
      !["", "/"].includes(url.pathname) || url.search || url.hash) {
    throw new MaxError("apiUrl должен быть HTTPS-адресом сервера api.green-api.com из кабинета.", "invalid");
  }
  return url.origin;
}

export class GreenMaxClient {
  private readonly origin: string;
  constructor(private readonly credentials: MaxConnectInput, private readonly fetcher: typeof fetch = fetch) {
    this.origin = greenApiOrigin(credentials.apiUrl);
  }

  async call(method: string, verb = "GET", body?: unknown, suffix = ""): Promise<unknown> {
    const url = `${this.origin}/waInstance${this.credentials.idInstance}/${method}/${this.credentials.apiTokenInstance}${suffix}`;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: verb, redirect: "error", signal: AbortSignal.timeout(12_000),
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // Network errors can contain the token-bearing URL. Never forward or log them.
      throw new MaxError("Нет ответа от GREEN-API. Проверьте соединение и состояние инстанса.", "unavailable");
    }
    if (!response.ok) {
      const status = response.status;
      if ([401, 403].includes(status)) throw new MaxError("GREEN-API отказал в доступе. Проверьте ключ и ограничения аккаунта.", "forbidden");
      if ([429, 466, 469].includes(status)) throw new MaxError("Достигнут лимит GREEN-API. Проверьте тариф и повторите позже.", "limit");
      throw new MaxError(`GREEN-API вернул ошибку ${status}. Проверьте настройки инстанса.`, "unavailable");
    }
    try { return await response.json(); } catch {
      throw new MaxError("GREEN-API вернул некорректный ответ.", "unavailable");
    }
  }
}
