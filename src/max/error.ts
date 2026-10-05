import { ServiceError } from "../services/serviceError.js";
export type MaxErrorCode = "invalid" | "unavailable" | "forbidden" | "limit" | "not_found";
const STATUS = { invalid: 400, unavailable: 503, forbidden: 403, limit: 429, not_found: 404 } as const;
export class MaxError extends ServiceError {
  constructor(message: string, readonly code: MaxErrorCode) { super(message, STATUS[code]); this.name = "MaxError"; }
}
