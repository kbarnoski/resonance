import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { isAdmin } from "@/lib/auth/require-admin";
import { checkRateLimit, rateLimitedResponse, rateLimitKey } from "@/lib/rate-limit";

// Three fal models, billed at very different rates:
//   schnell — 4 inference steps, ~$0.003/frame   (cheap)
//   dev     — 28 inference steps, ~$0.025/frame  (~10x schnell)
//   pulid   — face-reference, ~$0.055/frame      (~18x schnell)
//
// For anonymous /demo + /installation visitors we use schnell only —
// at scale the cost of dev or pulid is prohibitive (a single shared
// demo can burn $60+/day on dev). Authenticated users get the
// higher-quality models (the creator's own workflow needs them, and
// authed traffic is bounded).
const MODEL_FLUX_SCHNELL = "fal-ai/flux/schnell";
const MODEL_FLUX_DEV = "fal-ai/flux/dev";
// Character-reference model. When the caller passes referenceImageUrl,
// we route to PuLID so the angel's face stays consistent across every
// frame of a journey. Without this, every gen produced a different
// woman because flux has no identity memory between calls. Authed-only
// per the cost rationale above.
const MODEL_FLUX_PULID = "fal-ai/flux-pulid";

// Appended to every generated prompt across every journey.
const STYLE_SUFFIX =
  "photorealistic cinematic photograph, real photographic materials and lighting, " +
  "surreal dreamlike but lifelike, luminous, transcendent, ethereal, " +
  "every celestial body (moon planet earth sun) rendered as a perfect round sphere";

// Global negative prompt — concepts that should NEVER appear, regardless
// of journey. Callers can extend via the body.negativePrompt field.
const GLOBAL_NEGATIVE =
  "bird feathers, bird wings, plumage, feathered wings, " +
  "additional people, additional figures, multiple people, multiple women, " +
  "crowds, bystanders, onlookers, distant figures, background person, " +
  "text, watermark, signature, logo, writing, letters, " +
  "illustration, cartoon, painting, anime, concept art, 3d render, " +
  "deformed anatomy, extra limbs, extra arms, missing limb, blurry face, " +
  "low quality, oversaturated";

const COST_FLUX_SCHNELL = 0.003;
const COST_FLUX_DEV = 0.025;
const COST_FLUX_PULID = 0.055;

export async function POST(request: Request) {
  if (!process.env.FAL_KEY) {
    return Response.json(
      { error: "AI image generation not configured" },
      { status: 501 }
    );
  }

  // Auth-optional. Anon visitors burn fal credits on every frame —
  // tighten the per-IP rate limit aggressively to bound the cost
  // exposure: 8 burst, 1 per 8s ≈ 450 frames/hour/IP. At schnell
  // (~$0.003/frame) that's ~$1.35/hour/IP worst case. Authed users
  // (creator's own workflow) get the original generous limits.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const burst = user ? 30 : 8;
  const refillPerSec = user ? 0.5 : 0.125;
  const rl = await checkRateLimit(
    rateLimitKey({ userId: user?.id, request, scope: "ai-image-generate" }),
    burst,
    refillPerSec,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const { prompt, negativePrompt, referenceImageUrl, width, height, disableSafetyChecker } =
      await request.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Safety-checker policy: ON by default for regular users. Only an
    // authenticated admin can opt out (via disableSafetyChecker:true in
    // the request body). Previously the checker was hardcoded OFF for
    // everyone, which was the right default for the creator's own
    // creative workflow but a real liability for an installation
    // playing to general audiences (galleries, schools, kids). The
    // built-in journey prompts go through their own visual-compliance
    // check (ai-image/validate); the fal safety_checker is the
    // belt-and-suspenders backstop against truly egregious output.
    const safetyCheckerOn =
      !(disableSafetyChecker === true && (await isAdmin()));

    const imgWidth = Math.min(width ?? 768, 1024);
    const imgHeight = Math.min(height ?? 768, 1024);
    const fullPrompt = `${prompt}, ${STYLE_SUFFIX}`;
    const fullNegative = negativePrompt
      ? `${GLOBAL_NEGATIVE}, ${negativePrompt}`
      : GLOBAL_NEGATIVE;
    const seed = Math.floor(Math.random() * 4294967295);

    // Model selection by auth:
    //   anon  → schnell (no PuLID, no dev) — bounds cost exposure
    //   authed + reference → PuLID (Ghost identity lock)
    //   authed, no reference → dev (better prompt adherence)
    const isAuthed = !!user;
    const wantsPulid =
      typeof referenceImageUrl === "string" && referenceImageUrl.length > 0;

    const schnellInput = {
      prompt: fullPrompt,
      image_size: { width: imgWidth, height: imgHeight },
      num_inference_steps: 4,
      seed,
      enable_safety_checker: safetyCheckerOn,
    };

    const devInput = {
      prompt: fullPrompt,
      negative_prompt: fullNegative,
      image_size: { width: imgWidth, height: imgHeight },
      num_inference_steps: 28,
      guidance_scale: 3.5,
      seed,
      enable_safety_checker: safetyCheckerOn,
    };

    // PuLID parameters tuned for SCENE + identity lock:
    //   id_weight: 0.6 — moderate face lock. 0.9 (prior) was too strong
    //     and collapsed every generation into a reference-style portrait,
    //     ignoring the scene prompt.
    //   true_cfg: 4.0 — strong classifier-free guidance so the scene
    //     prompt actually drives composition.
    const pulidInput = {
      prompt: fullPrompt,
      negative_prompt: fullNegative,
      reference_image_url: referenceImageUrl,
      image_size: { width: imgWidth, height: imgHeight },
      num_inference_steps: 20,
      guidance_scale: 4,
      true_cfg: 4.0,
      id_weight: 0.6,
      seed,
      enable_safety_checker: safetyCheckerOn,
    };

    let modelId: string;
    let input: Record<string, unknown>;
    if (!isAuthed) {
      modelId = MODEL_FLUX_SCHNELL;
      input = schnellInput;
    } else if (wantsPulid) {
      modelId = MODEL_FLUX_PULID;
      input = pulidInput;
    } else {
      modelId = MODEL_FLUX_DEV;
      input = devInput;
    }
    let imageUrl: string | null = null;
    let usedPulid = isAuthed && wantsPulid;

    async function runModel(id: string, payload: Record<string, unknown>): Promise<string | null> {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await fal.subscribe(id, { input: payload } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (result.data as any)?.images?.[0]?.url ?? null;
      } catch (err) {
        logger.warn("ai-image/generate", `${id} threw:`, err);
        return null;
      }
    }

    logger.debug("ai-generate", `model=${modelId} len=${fullPrompt.length}`, fullPrompt.substring(0, 80));
    imageUrl = await runModel(modelId, input);

    // PuLID fallback — if the reference-locked call fails (timeout, bad
    // reference URL, fal throttling), retry on plain flux/dev. Better to
    // lose identity lock for one frame than to show nothing.
    if (!imageUrl && wantsPulid && isAuthed) {
      logger.debug("ai-generate", "pulid failed — falling back to flux/dev");
      modelId = MODEL_FLUX_DEV;
      input = devInput;
      usedPulid = false;
      imageUrl = await runModel(modelId, input);
    }

    if (!imageUrl) {
      return Response.json({ error: "No image generated" }, { status: 500 });
    }

    return Response.json({
      image: imageUrl,
      cost:
        modelId === MODEL_FLUX_SCHNELL
          ? COST_FLUX_SCHNELL
          : usedPulid
            ? COST_FLUX_PULID
            : COST_FLUX_DEV,
      model: modelId,
    });
  } catch (error) {
    logger.error("ai-image/generate", "Error:", error);
    return Response.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
