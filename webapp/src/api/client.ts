export class ApiError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) { super(message); this.name = "ApiError"; }
}
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Max-Client": "1" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(40000) }); }
  catch { throw new ApiError(0, "NETWORK", "Нет связи с сервером. Проверьте интернет; результат отправки может быть неизвестен."); }
  let result: { ok: boolean; error?: string; data: T };
  try { result = await response.json(); } catch { throw new ApiError(response.status, "PARSE", "Сервер вернул некорректный ответ."); }
  if (!response.ok || !result.ok) throw new ApiError(response.status, undefined, result.error || "Ошибка запроса.");
  return result.data;
}
export const api = { get: <T>(path: string) => request<T>("GET", path), post: <T>(path: string, body?: unknown) => request<T>("POST", path, body) };
