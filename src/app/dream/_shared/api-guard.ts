/**
 * Abuse protection for dream-zone API routes (fal.ai / ElevenLabs / video
 * proxies that spend the master FAL_KEY).
 *
 * Layered protections (all run in order; first to reject wins):
 *   1. Method check (POST only)
 *   2. Origin / Referer check — request must originate from a known
 *      Resonance domain (preview / production / localhost).
 *   3. Authenticated session required — an anonymous request is rejected
 *      before it can spend any budget. (The `/dream/*` middleware rule
 *      already redirects unauthenticated *page* loads, but API routes are
 *      hit directly, so we check here too.)
 *   4. Per-USER sliding-window rate limit — 8 requests / 60s.
 *   5. Per-USER daily quota — ~40 requests / day.
 *
 * Rate limiting uses the shared KV-backed limiter (`checkRateLimit`), which
 * is global across lambda instances when Vercel KV / Upstash is provisioned
 * and falls back to per-instance in-memory otherwise. Keying on the user id
 * (not IP) makes the limit meaningful behind shared NATs/proxies. The
 * fal.ai account-level budget cap remains the hard backstop.
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

export async function guard(req: NextRequest): Promise<Response | null> {
  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const origin = originOrReferer(req);
  if (!origin || !ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Require an authenticated session before spending any budget. Anonymous
  // callers hitting the API route directly (bypassing the page-level
  // middleware redirect) are rejected here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Per-user daily quota first (so a burst can't exhaust today's budget on
  // the short-window check alone).
  const daily = await checkRateLimit(
    `dream-ai-daily:user:${user.id}`,
    DAILY_MAX,
    DAILY_REFILL_PER_SEC,
  );
  if (!daily.allowed) {
    return Response.json(
      {
        error: "daily quota exceeded",
        hint: "this sandbox limits each account to ~40 generations per day to keep API costs predictable",
      },
      { status: 429 },
    );
  }

  const burst = await checkRateLimit(
    `dream-ai:user:${user.id}`,
    RATE_MAX,
    RATE_REFILL_PER_SEC,
  );
  if (!burst.allowed) {
    return rateLimitedResponse(burst.retryAfterMs);
  }

  return null;
}
