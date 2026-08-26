import { generateText } from "ai";
import { fastVisionModel } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitedResponse, rateLimitKey } from "@/lib/rate-limit";
import {
  readJsonBody,
  requireHttpUrl,
  requireStringArray,
} from "@/lib/api/validate-input";
import { logger } from "@/lib/logger";
import { checkOrigin } from "../origin-check";

/**
 * Fast yes/no visual compliance check for generated journey imagery.
 *
 * Origin-allowlisted, rate-limited (per-IP + global daily), never
 * auth-walled — every call hits paid Anthropic vision inference, and
 * anon visitors at /installation legitimately need it. Image URLs must
 * be on an allowlist (the only legitimate caller is AiImageLayer
 * feeding it fal.ai-generated URLs). Checks array is capped so this
 * can't be turned into an arbitrary multi-prompt fan-out.
 */

/** Global aggregate daily cap across ALL callers (mirrors
 *  ../generate/route.ts). One validate per generated frame, so the
 *  ceiling matches generate's. Env-overridable without a deploy. */
const GLOBAL_DAILY_MAX = Math.max(
  1,
  Number(process.env.AI_IMAGE_VALIDATE_GLOBAL_DAILY_CAP) || 6_000,
);
const GLOBAL_DAILY_REFILL_PER_SEC = GLOBAL_DAILY_MAX / 86_400;

const ALLOWED_IMAGE_HOSTS = [
  "fal.media",
  "fal.run",
  "fal.ai",
  "v3.fal.media",
];

const MAX_CHECKS = 8;
const MAX_CHECK_LENGTH = 240;

const DEFAULT_CHECKS = [
  "a slender feminine figure is visible somewhere in the frame",
  "the figure has long pale/white/silver hair (NOT brown, NOT black, NOT tied up in a bun or ponytail)",
  "two wing shapes are visible behind the figure (can be transparent, wispy, or made of light)",
  "the figure is wearing a dress or flowing garment (NOT nude, NOT bare-skinned)",
  "no classical halo ring above the head",
];

export async function POST(request: Request) {
  // Origin allowlist FIRST — parity with ../generate. No auth wall.
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  if (!process.env.ANTHROPIC_API_KEY) {
    // No key — permissive pass-through so the app still works offline-ish.
    return Response.json({ valid: true, reason: "no-api-key" });
  }

  // Global ceiling before per-identity limits — bounds total daily
  // vision-inference spend no matter how many distinct IPs call.
  const globalDaily = await checkRateLimit(
    "ai-image-validate-daily:GLOBAL",
    GLOBAL_DAILY_MAX,
    GLOBAL_DAILY_REFILL_PER_SEC,
  );
  if (!globalDaily.allowed) {
    return Response.json(
      {
        error: "global daily budget exceeded",
        hint: "image validation reached today's global budget — try again tomorrow",
      },
      { status: 429 },
    );
  }

  // Auth-optional — anon visitors at /installation also need to
  // validate the imagery they generate. Per-IP rate limit bounds
  // anon traffic.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Tighter limits for anon (15 burst / 0.25 per sec ≈ 900/hour)
  // than authed (30 burst / 0.5 per sec ≈ 1800/hour).
  const burst = user ? 30 : 15;
  const refillPerSec = user ? 0.5 : 0.25;
  const rl = await checkRateLimit(
    rateLimitKey({ userId: user?.id, request, scope: "ai-image-validate" }),
    burst,
    refillPerSec,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const payload = body.value as Record<string, unknown>;

  const urlCheck = requireHttpUrl(payload.imageUrl, "imageUrl", {
    allowedHosts: ALLOWED_IMAGE_HOSTS,
  });
  if (!urlCheck.ok) return urlCheck.response;

  let checkList: string[] = DEFAULT_CHECKS;
  if (Array.isArray(payload.checks) && payload.checks.length > 0) {
    const arr = requireStringArray(payload.checks, "checks", {
      maxItems: MAX_CHECKS,
      maxItemLength: MAX_CHECK_LENGTH,
    });
    if (!arr.ok) return arr.response;
    checkList = arr.value;
  }

  const checksBlock = checkList.map((c, i) => `${i + 1}. ${c}`).join("\n");

  try {
    const result = await generateText({
      model: fastVisionModel,
      maxTokens: 20,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Check this image against the following requirements:\n${checksBlock}\n\n` +
                `Answer with a single token: "PASS" if ALL requirements are clearly met, ` +
                `"FAIL" if ANY are not met. Do not explain.`,
            },
            {
              type: "image",
              image: new URL(urlCheck.value),
            },
          ],
        },
      ],
    });

    const answer = (result.text ?? "").trim().toUpperCase();
    const valid = answer.startsWith("PASS");

    return Response.json({ valid, reason: valid ? undefined : answer.slice(0, 40) });
  } catch (error) {
    // On ANY error — network, API, parse — default to permissive so we don't
    // freeze the journey. Prompt-level controls are still the primary defense.
    logger.error("ai-image/validate", "error:", error);
    return Response.json({ valid: true, reason: "error" });
  }
}
