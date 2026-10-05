/**
 * A rule the user broke — a limit, bad input, someone else's id, a missing record.
 * The message is written for the user: the bot shows it as is, and the API answers
 * with `status` instead of a 500, since nothing went wrong on the server.
 */
export type ServiceErrorStatus = 400 | 403 | 404 | 409 | 429 | 503;

export class ServiceError extends Error {
  constructor(message: string, readonly status: ServiceErrorStatus = 400) {
    super(message);
    this.name = "ServiceError";
  }
}

export function serviceErrorStatus(err: unknown): ServiceErrorStatus | 500 {
  return err instanceof ServiceError ? err.status : 500;
}

/** The user-facing text of a rule violation, or `fallback` for an unexpected failure. */
export function userErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ServiceError ? err.message : fallback;
}

/**
 * For the bot's catch blocks: a rule violation goes to the user through `send`,
 * anything else is rethrown so the global error handler still sees real bugs.
 */
export async function showServiceError(
  err: unknown,
  send: (text: string) => Promise<unknown>,
  prefix: string = ""
): Promise<void> {
  if (!(err instanceof ServiceError)) throw err;
  await send(prefix + err.message);
}
