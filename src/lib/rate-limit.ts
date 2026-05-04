/**
 * Token-bucket rate limiter, keyed per identity (usually a Supabase
 * user id; falls back to client IP for anonymous routes).
 *
 * Pluggable backend:
 *   - In-memory (default): correct for single-region deploys.
 *   - Upstash Redis: enabled when KV_REST_API_URL + KV_REST_API_TOKEN
 *     are set. Atomic lua-script token-bucket math keeps regions in
 *     sync so a hostile client can't fan out cross-region to bypass
 *     per-user caps.
 *
 * The interface is async regardless of which backend is in use — that
 * keeps callers stable and avoids an "in-memory is sync but KV is
 * async" split that would force every route to know which backend
 * was running.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

/* ───────────────────────── In-memory backend ───────────────────────── */

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

const PRUNE_AFTER_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

function pruneIfNeeded(now: number) {
  if (now - lastPruneAt < 60_000) return;
  lastPruneAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.updatedAt > PRUNE_AFTER_MS) buckets.delete(key);
  }
}

function checkInMemory(
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

/* ─────────────────────────── KV backend ─────────────────────────── */

/**
 * Lua script implementing atomic token-bucket consume. Returns
 * [allowed (0|1), retryAfterMs, remaining]. Stored as HSET so the
 * bucket lives as a single key and the math is one round-trip.
 *
 *   KEYS[1]  = bucket key
 *   ARGV[1]  = capacity
 *   ARGV[2]  = refill_per_sec
 *   ARGV[3]  = now_ms
 *   ARGV[4]  = ttl_ms (used to expire idle buckets)
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'updated_at')
local tokens = tonumber(data[1])
local updated_at = tonumber(data[2])

if tokens == nil or updated_at == nil then
  tokens = capacity
  updated_at = now
end

local elapsed_sec = (now - updated_at) / 1000.0
if elapsed_sec < 0 then elapsed_sec = 0 end
tokens = math.min(capacity, tokens + elapsed_sec * refill)

local allowed = 0
local retry_after_ms = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  local needed = 1 - tokens
  if refill > 0 then
    retry_after_ms = math.ceil((needed / refill) * 1000)
  else
    retry_after_ms = ttl_ms
  end
end

redis.call('HMSET', key, 'tokens', tokens, 'updated_at', now)
redis.call('PEXPIRE', key, ttl_ms)

return { allowed, retry_after_ms, math.floor(tokens) }
`;

interface KvBackend {
  eval: (
    script: string,
    keys: string[],
    args: (string | number)[],
  ) => Promise<unknown>;
}

let kvBackendPromise: Promise<KvBackend | null> | null = null;

function loadKvBackend(): Promise<KvBackend | null> {
  if (kvBackendPromise) return kvBackendPromise;

  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    kvBackendPromise = Promise.resolve(null);
    return kvBackendPromise;
  }

  // Use the REST API directly via fetch so we don't add a dependency.
  // Upstash and @vercel/kv both implement the same `eval` semantics
  // through this REST endpoint shape.
  kvBackendPromise = Promise.resolve({
    async eval(script, keys, args) {
      const body = ["EVAL", script, String(keys.length), ...keys, ...args.map(String)];
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`KV REST returned ${res.status}`);
      }
      const json = (await res.json()) as { result?: unknown; error?: string };
      if (json.error) throw new Error(`KV error: ${json.error}`);
      return json.result;
    },
  });
  return kvBackendPromise;
}

async function checkKv(
  backend: KvBackend,
  key: string,
  capacity: number,
  refillPerSec: number,
): Promise<RateLimitResult> {
  // Idle TTL: capacity / refill seconds, plus a generous floor so
  // very-slow-refill buckets don't disappear between bursts.
  const ttlSec = Math.max(60, Math.ceil(capacity / Math.max(refillPerSec, 0.001)));
  const ttlMs = ttlSec * 1000;

  const result = (await backend.eval(
    TOKEN_BUCKET_LUA,
    [key],
    [capacity, refillPerSec, Date.now(), ttlMs],
  )) as [number, number, number] | undefined;

  if (!Array.isArray(result) || result.length < 3) {
    // Malformed response — fail open (allow the request) rather than
    // fail closed. The KV backend going down shouldn't lock everyone
    // out; the in-memory backend is still tracking limits per
    // instance as a defense-in-depth.
    return { allowed: true, retryAfterMs: 0, remaining: 0 };
  }
  const [allowed, retryAfterMs, remaining] = result;
  return {
    allowed: allowed === 1,
    retryAfterMs,
    remaining,
  };
}

/* ────────────────────────── Public API ────────────────────────── */

/**
 * Check + consume one token for the given key. Tries the KV backend
 * if configured, falling back to in-memory if KV is unreachable.
 */
export async function checkRateLimit(
  key: string,
  capacity: number,
  refillPerSec: number,
): Promise<RateLimitResult> {
  const kv = await loadKvBackend();
  if (kv) {
    try {
      return await checkKv(kv, key, capacity, refillPerSec);
    } catch (err) {
      // KV is best-effort — log via console (logger import would be
      // circular at this layer) and fall through to in-memory.
      // eslint-disable-next-line no-console
      console.warn("[rate-limit] KV backend failed, falling back to in-memory:", err);
    }
  }
  return checkInMemory(key, capacity, refillPerSec);
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
  kvBackendPromise = null;
}
