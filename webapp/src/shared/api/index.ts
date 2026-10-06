import { z } from "zod";
import { apiResponseSchema, errorResponseSchema } from "../contracts";
import type { RequestOptions } from "./types";

let csrfToken = "";
export function setCsrfToken(value: string): void {
  csrfToken = value;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  options: RequestOptions = {},
): Promise<z.infer<T>> {
  const multipart = options.body instanceof FormData;
  const headers: Record<string, string> = { "X-Max-Client": "1" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (options.body !== undefined && !multipart)
    headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers,
      body:
        options.body === undefined
          ? undefined
          : multipart
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal
        ? AbortSignal.any([
            options.signal,
            AbortSignal.timeout(multipart ? 75000 : 30000),
          ])
        : AbortSignal.timeout(multipart ? 75000 : 30000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      "Нет соединения с сервером. Проверьте интернет и повторите действие.",
    );
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ApiError(response.status, "Сервер вернул некорректный ответ.");
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login") {
      setCsrfToken("");
      window.dispatchEvent(new Event("max:unauthorized"));
    }
    const parsed = errorResponseSchema.safeParse(raw);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error : "Не удалось выполнить запрос.",
    );
  }
  const parsed = apiResponseSchema(schema).safeParse(raw);
  if (!parsed.success)
    throw new ApiError(
      502,
      "Ответ сервера не соответствует контракту. Обновите страницу.",
    );
  return parsed.data.data;
}

export const messageError = (error: unknown): string =>
  error instanceof Error ? error.message : "Не удалось выполнить действие.";
