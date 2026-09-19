import { checkRateLimit, rateLimitedResponse, rateLimitKey } from "@/lib/rate-limit";

/**
 * Shared gates for every route that forwards user input to a paid LLM
 * (Anthropic/OpenAI). Added after the 2026-09-19 audit: with self-signup
 * open, "authenticated" means "anyone on the internet", and eleven LLM
 * routes had neither a rate limit nor an input-size cap — a registered
 * account could loop multi-hundred-KB prompts into direct API spend.
 *
 * Usage, right after the route's own auth check:
 *
 *   const limited = await enforceLlmLimit(request, user.id, "chat");
 *   if (limited) return limited;
 *   const body = await readCappedJson(request);
 *   if (body instanceof Response) return body;
 *   const { messages } = body;
 */

/** Per-user token bucket: burst 10, ~180 requests/hour steady state. */
export async function enforceLlmLimit(
  request: Request,
  userId: string,
  scope: string,
  opts?: { burst?: number; refillPerSec?: number },
): Promise<Response | null> {
  const rl = await checkRateLimit(
    rateLimitKey({ userId, request, scope: `llm-${scope}` }),
    opts?.burst ?? 10,
    opts?.refillPerSec ?? 0.05,
  );
  return rl.allowed ? null : rateLimitedResponse(rl.retryAfterMs);
}

/**
 * Body parse with a size ceiling (default 64KB — generous for real chat
 * histories, hostile to prompt-stuffing) and safe JSON handling: bad
 * JSON is a 400, not an unhandled 500. Returns the parsed body, or a
 * Response the route should return as-is.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readCappedJson(
  request: Request,
  maxBytes = 64 * 1024,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Response | any> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Unreadable body" }, { status: 400 });
  }
  if (raw.length > maxBytes) {
    return Response.json(
      { error: `Request body too large (max ${Math.floor(maxBytes / 1024)}KB)` },
      { status: 413 },
    );
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    return parsed;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
