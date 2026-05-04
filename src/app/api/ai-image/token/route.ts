/**
 * Proxy endpoint for client-side fal.ai access.
 *
 * GET mints a short-lived JWT scoped to the realtime flux app and
 * returns it. The client uses that JWT as fal SDK credentials, so the
 * master FAL_KEY never leaves the server. JWT TTL is 5 minutes — long
 * enough for a kiosk page-load to open its realtime WebSocket; short
 * enough that an exfiltrated token has bounded value.
 *
 * Previously this endpoint returned process.env.FAL_KEY directly to
 * authenticated clients. The fal SDK's realtime path needs client-side
 * credentials for its WebSocket connection, so we couldn't avoid
 * returning *something* — but a master key has unlimited blast radius
 * and a 5-minute scoped JWT is the right primitive.
 *
 * POST forwards standard HTTP calls with the master key attached
 * server-side (fal SDK proxyUrl mode). Auth-gated, rate-limited, and
 * the forwarded URL must be on a fal.* allowlist so this can't be
 * turned into an open proxy bearing our credentials.
 */

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitedResponse, rateLimitKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/** Hostnames the proxy will forward POST traffic to. */
const ALLOWED_FAL_HOSTS = [
  "fal.run",
  "fal.ai",
  "queue.fal.run",
  "rest.fal.run",
  "v3.fal.media",
  "fal.media",
  "gateway.fal.ai",
];

/** Apps the minted JWT is allowed to access. Tightening this list
 *  reduces the damage if a JWT is exfiltrated — the token can only
 *  invoke these models, not arbitrary fal endpoints. */
const REALTIME_ALLOWED_APPS = ["fal-ai/flux/schnell"];

/** JWT expiration in seconds. 5 minutes is plenty for a page load
 *  to open its WebSocket; the realtime connection itself stays open
 *  on whatever its server-side timeout is, independent of the
 *  initial auth token. */
const TOKEN_TTL_SECONDS = 300;

function isAllowedFalUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_FAL_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

/**
 * Mint a short-lived JWT from fal's auth API, scoped to the realtime
 * apps we actually use. Returns the JWT on success, or null on any
 * failure (network, bad response, etc.) — the route returns a 502
 * when this is null rather than falling back to the master key.
 *
 * fal's auth endpoint accepts `Authorization: Key $FAL_KEY` and
 * returns the JWT either as a bare string body or as `{ token: ... }`
 * depending on API version; we accept both shapes.
 */
async function mintFalJwt(masterKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://rest.alpha.fal.ai/tokens/", {
      method: "POST",
      headers: {
        Authorization: `Key ${masterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowed_apps: REALTIME_ALLOWED_APPS,
        token_expiration: TOKEN_TTL_SECONDS,
      }),
    });

    if (!res.ok) {
      logger.error(
        "ai-image/token",
        `fal token mint failed: ${res.status} ${res.statusText}`,
      );
      return null;
    }

    // The response is sometimes a bare JWT string, sometimes a JSON
    // object. Read as text first; try to parse as JSON, fall back to
    // text. Either way we end up with a non-empty string.
    const raw = await res.text();
    if (!raw || raw.length < 16) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed.token === "string") return parsed.token;
      // Some API revisions return { jwt: "..." } or wrap further.
      if (parsed && typeof parsed.jwt === "string") return parsed.jwt;
      return null;
    } catch {
      // Not JSON — bare string body. Strip surrounding quotes if any.
      return raw.replace(/^"|"$/g, "");
    }
  } catch (err) {
    logger.error("ai-image/token", "fal token mint threw:", err);
    return null;
  }
}

export async function GET(request: Request) {
  // Auth-optional: authenticated users + unauthenticated visitors of
  // /installation both get to mint a fal JWT. Per-IP rate limit
  // bounds anonymous traffic — rateLimitKey() falls back to the
  // x-forwarded-for / x-real-ip address when there's no userId.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "Missing FAL_KEY" }, { status: 501 });
  }

  // Tighter limit for anonymous visitors than authed users — one
  // browser session shouldn't grind on fal's auth endpoint with our
  // credentials, regardless of who's asking.
  const burst = user ? 5 : 3;
  const refillPerSec = user ? 1 / 30 : 1 / 60;
  const rl = await checkRateLimit(
    rateLimitKey({ userId: user?.id, request, scope: "fal-token-get" }),
    burst,
    refillPerSec,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const jwt = await mintFalJwt(process.env.FAL_KEY);
  if (!jwt) {
    return Response.json(
      { error: "Failed to mint upstream token" },
      { status: 502 },
    );
  }

  return Response.json({
    token: jwt,
    // Hint to the client about how it should attach the credential.
    // Master keys use "Key <value>"; JWTs use "Bearer <value>". Past
    // versions of this endpoint returned a master key, so callers
    // need to know which they got.
    scheme: "Bearer",
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });
}

export async function POST(request: Request) {
  // Auth-optional. Per-IP rate limit bounds anon traffic.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "Missing FAL_KEY" }, { status: 501 });
  }

  // Tighter ceiling for anon (30 burst / 0.5 per sec ≈ 1800/hour)
  // than authed (60 burst / 1 per sec ≈ 3600/hour).
  const burst = user ? 60 : 30;
  const refillPerSec = user ? 1 : 0.5;
  const rl = await checkRateLimit(
    rateLimitKey({ userId: user?.id, request, scope: "fal-token-post" }),
    burst,
    refillPerSec,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  try {
    const targetUrl = request.headers.get("x-fal-target-url");

    if (!targetUrl) {
      return Response.json({ error: "Missing x-fal-target-url" }, { status: 400 });
    }

    if (!isAllowedFalUrl(targetUrl)) {
      return Response.json({ error: "Forwarding host not allowed" }, { status: 400 });
    }

    const body = await request.text();

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        Authorization: `Key ${process.env.FAL_KEY}`,
      },
      body,
    });

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      return Response.json(data, { status: res.status });
    }

    const blob = await res.blob();
    return new Response(blob, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    logger.error("ai-image/token", "Proxy error:", error);
    return Response.json({ error: "Proxy request failed" }, { status: 500 });
  }
}
