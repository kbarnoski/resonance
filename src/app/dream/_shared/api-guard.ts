/**
 * Lightweight abuse protection for dream-zone API routes.
 *
 * Layered protections (all run in order; first to reject wins):
 *   1. Method check (POST only)
 *   2. Origin / Referer check — request must originate from a known
 *      Resonance domain (preview / production / localhost).
 *   3. Per-IP sliding-window rate limit — 8 requests / 60s.
 *   4. Per-IP daily quota — 40 requests / UTC day.
 *
 * Rate-limit state is held in process memory, so it's per-lambda-instance
 * and resets on cold starts. For true global rate limiting we'd move this
 * to Vercel KV / Upstash Redis. For an experimental public sandbox the
 * in-memory tier raises the bar enough that casual abuse is unprofitable
 * and the FAL account-level budget cap (set in the fal.ai dashboard) is
 * the hard backstop on cost.
 *
 * Returns a Response (to short-circuit) on rejection, or null to pass.
 */

import { NextRequest } from "next/server";

type Bucket = { count: number; reset: number };

const RATE_LIMITS = new Map<string, Bucket>();
const DAILY_QUOTAS = new Map<string, Bucket>();

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

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const DAILY_MAX = 40;

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

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/** Periodically prune expired entries. Called probabilistically (~1% of
 *  requests) to keep the maps bounded without paying the cost every call. */
function maybePrune(now: number): void {
  if (Math.random() >= 0.01) return;
  for (const [k, v] of RATE_LIMITS) if (v.reset < now) RATE_LIMITS.delete(k);
  for (const [k, v] of DAILY_QUOTAS) if (v.reset < now) DAILY_QUOTAS.delete(k);
}

export async function guard(req: NextRequest): Promise<Response | null> {
  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const origin = originOrReferer(req);
  if (!origin || !ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const ip = clientIp(req);
  const now = Date.now();

  const rl = RATE_LIMITS.get(ip);
  if (rl && rl.reset > now) {
    if (rl.count >= RATE_MAX) {
      const retrySec = Math.ceil((rl.reset - now) / 1000);
      return Response.json(
        {
          error: "rate limited",
          retry_after_seconds: retrySec,
          hint: "this prototype is shared; please wait a moment before trying again",
        },
        { status: 429, headers: { "Retry-After": String(retrySec) } }
      );
    }
    rl.count += 1;
  } else {
    RATE_LIMITS.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
  }

  const today = new Date().toISOString().slice(0, 10);
  const dayKey = `${ip}:${today}`;
  const dq = DAILY_QUOTAS.get(dayKey);
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(24, 0, 0, 0);
  if (dq && dq.reset > now) {
    if (dq.count >= DAILY_MAX) {
      return Response.json(
        {
          error: "daily quota exceeded",
          hint: "this sandbox limits each visitor to 40 generations per day to keep API costs predictable",
        },
        { status: 429 }
      );
    }
    dq.count += 1;
  } else {
    DAILY_QUOTAS.set(dayKey, { count: 1, reset: midnightUtc.getTime() });
  }

  maybePrune(now);
  return null;
}
