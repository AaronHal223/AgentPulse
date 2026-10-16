import "server-only";
import { HttpError } from "./errors";

/**
 * Small in-memory limiter for login/signup. AgentPulse runs as one server, so memory is enough
 * to stop password-guessing; it resets if the server restarts.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Throws 429 once a key has been used more than `limit` times in `minutes`. */
export function limit(keys: string[], limitPerKey: number, minutes: number) {
  let allowed = true;
  for (const k of keys) if (!hit(k, limitPerKey, minutes * 60_000)) allowed = false;
  if (!allowed) throw new HttpError(429, `Too many attempts. Please wait ${minutes} minutes and try again.`);
}

/** Forget failed attempts after a successful login. */
export function reset(key: string) {
  buckets.delete(key);
}
