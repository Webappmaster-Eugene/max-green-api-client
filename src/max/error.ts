import type { MaxErrorCode } from "../../types/max.js";
const STATUS = {
  invalid: 400,
  unavailable: 503,
  forbidden: 403,
  limit: 429,
  not_found: 404,
} as const;
export class MaxError extends Error {
  readonly status: (typeof STATUS)[MaxErrorCode];
  constructor(
    message: string,
    readonly code: MaxErrorCode,
  ) {
    super(message);
    this.name = "MaxError";
    this.status = STATUS[code];
  }
}
