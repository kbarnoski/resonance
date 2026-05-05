import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitedResponse, rateLimitKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Installation kiosk heartbeat — POST upserts, GET reads.
 *
 * The kiosk POSTs `{ token, payload }` every 60s. The status page
 * GETs with `?token=...` and renders the latest payload.
 *
 * Token is the auth: anyone with it can read/write that row.
 * Operator generates a 16-byte hex string once and stamps it into
 * both the kiosk URL (?heartbeat_token=...) and the status URL.
 *
 * Rate limited per IP to bound abuse — a misbehaving / hostile
 * client can't fill the table.
 */

const TOKEN_RE = /^[a-f0-9]{16,64}$/i;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  const rl = await checkRateLimit(
    rateLimitKey({ request, scope: "installation-heartbeat-post" }),
    20, 0.2, // 20 burst, refill 1/5s ≈ 720/hr per IP — generous for legit kiosk
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  let body: { token?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { token, payload } = body;
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  // Bound payload size to prevent table bloat.
  const json = JSON.stringify(payload);
  if (json.length > 4_096) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  const sb = admin();
  if (!sb) return Response.json({ error: "Heartbeats not configured" }, { status: 501 });

  const { error } = await sb
    .from("installation_heartbeats")
    .upsert({ token, payload, last_seen: new Date().toISOString() });
  if (error) {
    logger.error("installation-heartbeat", "upsert failed:", error.message);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || !TOKEN_RE.test(token)) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }

  const rl = await checkRateLimit(
    rateLimitKey({ request, scope: "installation-heartbeat-get" }),
    30, 0.5,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const sb = admin();
  if (!sb) return Response.json({ error: "Heartbeats not configured" }, { status: 501 });

  const { data, error } = await sb
    .from("installation_heartbeats")
    .select("payload, last_seen")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    logger.error("installation-heartbeat", "read failed:", error.message);
    return Response.json({ error: "Failed to read" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  const ageMs = Date.now() - new Date(data.last_seen).getTime();
  return Response.json({
    payload: data.payload,
    lastSeen: data.last_seen,
    ageMs,
  });
}
