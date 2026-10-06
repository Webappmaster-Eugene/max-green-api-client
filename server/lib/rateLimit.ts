import { AppError } from "./error.js";

export class RateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; expires: number }
  >();
  constructor(private readonly now = Date.now) {}
  consume(key: string, max: number, windowMs = 60000): void {
    const now = this.now();
    for (const [id, bucket] of this.buckets)
      if (bucket.expires <= now) this.buckets.delete(id);
    if (!this.buckets.has(key) && this.buckets.size >= 5000)
      throw new AppError("Слишком много запросов. Повторите позже.", 429);
    const bucket = this.buckets.get(key) ?? {
      count: 0,
      expires: now + windowMs,
    };
    this.buckets.set(key, bucket);
    if (++bucket.count > max)
      throw new AppError("Слишком много запросов. Повторите позже.", 429);
  }
}
