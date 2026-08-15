/**
 * Abuse protection for dream-zone API routes (fal.ai / ElevenLabs / video
 * proxies that spend the master FAL_KEY).
 *
 * NO LOGIN REQUIRED. These experiments are meant to run for anonymous
 * viewers on Karel's master FAL_KEY — the audience is small and Karel has
 * explicitly opted to eat the cost so the prototypes "just work" without a
 * sign-in wall. We therefore do NOT reject anonymous callers. The budget is
 * protected by cheaper guardrails instead:
 *
 * Layered protections (all run in order; first to reject wins):
 *   1. Method check (POST only)
 *   2. Origin / Referer check — request must originate from a known
 *      Resonance domain (preview / production / localhost). This alone stops
 *      random third-party sites from spending the key.
 *   3. Global daily cap — aggregate ceiling across all identities, so a
 *      swarm of distinct IPs can't multiply the per-identity quotas.
 *   4. Sliding-window rate limit — 8 requests / 60s, keyed per identity.
 *   5. Daily quota — ~40 requests / day, keyed per identity.
 *
 * Identity = the authenticated user id when a session happens to be present
 * (nicer per-user buckets), otherwise the client IP. Login is never demanded.
 *
 * Rate limiting uses the shared KV-backed limiter (`checkRateLimit`), which
 * is global across lambda instances when Vercel KV / Upstash is provisioned
 * and falls back to per-instance in-memory otherwise. The fal.ai
 * account-level budget cap remains the hard backstop.
 *
 * Returns a Response (to short-circuit) on rejection, or null to pass.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  // Production custom domain — getresonance.vercel.app.
  /^https:\/\/getresonance\.vercel\.app$/,
  // Vercel-assigned preview & production URLs in this team scope:
  //   https://resonance-...-kbarnoski-5224s-projects.vercel.app
  //   https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app
  /^https:\/\/resonance(-[\w-]+)?-kbarnoski-5224s-projects\.vercel\.app$/,
  /^https:\/\/resonance\.vercel\.app$/,
  // Local dev.
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

// 8 requests / 60s: token bucket of capacity 8 refilling ~0.133 tok/s.
const RATE_MAX = 8;
const RATE_REFILL_PER_SEC = RATE_MAX / 60;
// ~40 requests / day: capacity 40 refilling 40 tokens per 24h.
const DAILY_MAX = 40;
const DAILY_REFILL_PER_SEC = DAILY_MAX / 86_400;
// Global aggregate daily cap across ALL identities — bounds the worst case
// when many IPs each stay under their per-identity quota (e.g. a botnet of
// 1,000 IPs x 40/day = 40,000 paid calls without this). Truly global only
// when the KV backend is provisioned; otherwise per-lambda (still a bound).
// Override via env without a deploy: DREAM_FAL_GLOBAL_DAILY_CAP.
const GLOBAL_DAILY_MAX = Math.max(
  1,
  Number(process.env.DREAM_FAL_GLOBAL_DAILY_CAP) || 1_500,
);
const GLOBAL_DAILY_REFILL_PER_SEC = GLOBAL_DAILY_MAX / 86_400;

function originOrReferer(req: NextRequest): string {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // bad referer — fall through
    }
  }
  return "";
}

/** Client IP from the standard proxy headers (Vercel sets x-forwarded-for). */
function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Rate-limit identity: the user id if a session is present, else client IP.
 *  Never demands a session — an anonymous caller is keyed by IP, not rejected. */
async function identityKey(req: NextRequest): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return `user:${user.id}`;
  } catch {
    // supabase unavailable — fall back to IP keying
  }
  return `ip:${clientIp(req)}`;
}

export async function guard(req: NextRequest): Promise<Response | null> {
  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const origin = originOrReferer(req);
  if (!origin || !ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Global ceiling before any per-identity checks — no matter how many
  // distinct IPs show up, the lab as a whole can't exceed today's budget.
  const globalDaily = await checkRateLimit(
    "dream-ai-daily:GLOBAL",
    GLOBAL_DAILY_MAX,
    GLOBAL_DAILY_REFILL_PER_SEC,
  );
  if (!globalDaily.allowed) {
    return Response.json(
      {
        error: "global daily budget exceeded",
        hint: "the lab reached today's global generation budget — try again tomorrow",
      },
      { status: 429 },
    );
  }

  // No login required (see file header). Key the budget guardrails by
  // user-or-IP so a single anonymous visitor still can't drain the account.
  const identity = await identityKey(req);

  // Daily quota first (so a burst can't exhaust today's budget on the
  // short-window check alone).
  const daily = await checkRateLimit(
    `dream-ai-daily:${identity}`,
    DAILY_MAX,
    DAILY_REFILL_PER_SEC,
  );
  if (!daily.allowed) {
    return Response.json(
      {
        error: "daily quota exceeded",
        hint: "this sandbox caps generations per viewer per day to keep API costs predictable",
      },
      { status: 429 },
    );
  }

  const burst = await checkRateLimit(
    `dream-ai:${identity}`,
    RATE_MAX,
    RATE_REFILL_PER_SEC,
  );
  if (!burst.allowed) {
    return rateLimitedResponse(burst.retryAfterMs);
  }

  return null;
}
