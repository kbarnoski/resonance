/**
 * In-memory token-bucket rate limiter, keyed per identity (usually a
 * Supabase user id; falls back to client IP for anonymous routes).
 *
 * This protects expensive third-party calls (OpenAI TTS, Claude vision,
 * fal.ai realtime) from being burned by a single client — accidentally
 * via a runaway loop, or intentionally via abuse.
 *
 * In-memory is fine for single-instance deploys (Vercel preview, this
 * app's prod). For multi-region we'd need Redis or Vercel KV — left as
 * a follow-up in audit-findings.md.
 */
type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

/** Idle buckets older than this window are pruned on each access so
 *  the map doesn't grow unbounded over a long-lived process. */
const PRUNE_AFTER_MS = 60 * 60 * 1000;

let lastPruneAt = 0;

function pruneIfNeeded(now: number) {
  if (now - lastPruneAt < 60_000) return;
  lastPruneAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.updatedAt > PRUNE_AFTER_MS) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

/**
 * Check + consume one token for the given key.
 *
 * @param key       — caller identity (e.g. `"user:abc123"` or `"ip:1.2.3.4"`)
 * @param capacity  — max tokens in the bucket (the burst limit)
 * @param refillPerSec — tokens added per second (the steady-state rate)
 */
export function checkRateLimit(
  key: string,
  capacity: number,
  refillPerSec: number,
): RateLimitResult {
  const now = Date.now();
  pruneIfNeeded(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, updatedAt: now };
    buckets.set(key, bucket);
  } else {
    const elapsedSec = (now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
    bucket.updatedAt = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0, remaining: Math.floor(bucket.tokens) };
  }

  const tokensNeeded = 1 - bucket.tokens;
  const retryAfterMs = Math.ceil((tokensNeeded / refillPerSec) * 1000);
  return { allowed: false, retryAfterMs, remaining: 0 };
}

/** Build a rate-limit Response (429) with a Retry-After header. */
export function rateLimitedResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    { error: "Rate limit exceeded", retryAfterMs },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

/** Best-effort client identity for rate-limit key. Prefers user id;
 *  falls back to forwarded IP; finally a coarse "anon" bucket. */
export function rateLimitKey(opts: {
  userId?: string | null;
  request: Request;
  scope: string;
}): string {
  const { userId, request, scope } = opts;
  if (userId) return `${scope}:user:${userId}`;
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
  return `${scope}:ip:${ip}`;
}

/** Test-only — wipe internal state between tests. */
export function _resetRateLimitState() {
  buckets.clear();
  lastPruneAt = 0;
}
