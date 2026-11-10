import { addSeconds, get, nowIso, run } from "./db";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Fixed-window rate limiting backed by SQLite. Suitable for a single Node
 * instance; for multi-instance deployments point `rateLimit` at Redis/Upstash
 * (see docs/DEPLOYMENT.md).
 */
export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const row = get<{ count: number; reset_at: string }>(
    `SELECT count, reset_at FROM rate_limits WHERE key = ?`,
    key,
  );

  if (!row || new Date(row.reset_at).getTime() <= now) {
    run(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`,
      key,
      addSeconds(windowSeconds, now),
    );
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }

  if (row.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - now) / 1000)),
    };
  }

  run(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`, key);
  return { allowed: true, remaining: Math.max(0, limit - 1 - row.count), retryAfterSeconds: 0 };
}

export function rateLimitKey(scope: string, identifier: string) {
  return `${scope}:${identifier.toLowerCase()}`;
}

export function pruneRateLimits() {
  run(`DELETE FROM rate_limits WHERE reset_at < ?`, nowIso());
}
