/**
 * Proxy endpoint for client-side fal.ai access.
 *
 * GET returns { token } so the fal SDK can open a realtime WebSocket
 * (which requires client-side credentials). Auth-gated, rate-limited.
 *
 * POST forwards standard HTTP calls with the key attached server-side
 * (fal SDK `proxyUrl` mode). Auth-gated, rate-limited, and the
 * forwarded URL must be on a fal.* allowlist so this can't be turned
 * into an open proxy.
 *
 * Known limitation: the GET path still hands the master FAL_KEY to
 * the authenticated client (the fal realtime SDK wants direct
 * credentials for its WebSocket). Tracking this in audit-findings.md
 * as a P1 follow-up — the proper fix is to mint short-lived, scoped
 * fal tokens server-side and only return those. That requires SDK-
 * side support we haven't yet wired up.
 */

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitedResponse, rateLimitKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/** Hostnames the proxy will forward POST traffic to. Anything not on
 *  this list returns 400 — closes the open-proxy hole entirely. */
const ALLOWED_FAL_HOSTS = [
  "fal.run",
  "fal.ai",
  "queue.fal.run",
  "rest.fal.run",
  "v3.fal.media",
  "fal.media",
  "gateway.fal.ai",
];

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

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "Missing FAL_KEY" }, { status: 501 });
  }

  // Even authenticated users shouldn't be able to extract the key in
  // a tight loop. 5 burst / 1 every 30s is plenty for legitimate
  // session opens (one per page load) but blocks scripted exfil.
  const rl = checkRateLimit(
    rateLimitKey({ userId: user.id, request, scope: "fal-token-get" }),
    5,
    1 / 30,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  return Response.json({ token: process.env.FAL_KEY });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "Missing FAL_KEY" }, { status: 501 });
  }

  // Rate limit the proxy too — every POST here is a paid fal.ai
  // inference. 60 burst / 1 per second is roughly the fal realtime
  // cadence with headroom for retries.
  const rl = checkRateLimit(
    rateLimitKey({ userId: user.id, request, scope: "fal-token-post" }),
    60,
    1,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  try {
    const targetUrl = request.headers.get("x-fal-target-url");

    if (!targetUrl) {
      return Response.json({ error: "Missing x-fal-target-url" }, { status: 400 });
    }

    if (!isAllowedFalUrl(targetUrl)) {
      // Open-proxy guard — without this, an authenticated user could
      // turn this endpoint into a relay for arbitrary HTTPS calls
      // bearing OUR fal credentials.
      return Response.json({ error: "Forwarding host not allowed" }, { status: 400 });
    }

    // Read the request body
    const body = await request.text();

    // Forward to fal.ai with our API key
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

    // Non-JSON response (e.g., binary data)
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
