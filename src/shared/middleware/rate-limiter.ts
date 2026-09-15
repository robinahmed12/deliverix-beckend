import type { NextFunction, Request, Response } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

export function rateLimiter(options?: { windowMs?: number; max?: number; keyPrefix?: string }) {
  const windowMs = options?.windowMs ?? 60_000;
  const max = options?.max ?? 100;
  const keyPrefix = options?.keyPrefix ?? "rl";

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${keyPrefix}:${req.ip ?? "unknown"}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", max - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil((now + windowMs) / 1000));
      next();
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfterMs = entry.resetAt - now;
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
      res.status(429).json({
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
        detail: "Rate limit exceeded",
        code: "RATE_LIMITED",
        requestId: req.requestId,
      });
      return;
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", max - entry.count);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    next();
  };
}