export class AppError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503 = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
