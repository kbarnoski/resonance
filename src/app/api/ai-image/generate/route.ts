import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// Default model swapped from flux/schnell → flux/dev. Schnell (4 steps)
// had very weak prompt adherence: negations were ignored, identity
// drifted every gen, and random background figures kept appearing. Dev
// (28 steps) is slower but much more instruction-aware and accepts a
// negative_prompt parameter via fal's wrapper.
const MODEL_FLUX_DEV = "fal-ai/flux/dev";
// Character-reference model. When the caller passes referenceImageUrl,
// we route to PuLID so the angel's face stays consistent across every
// frame of a journey. Without this, every gen produced a different
// woman because flux has no identity memory between calls.
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

const COST_FLUX_DEV = 0.025;
const COST_FLUX_PULID = 0.055;

export async function POST(request: Request) {
  if (!process.env.FAL_KEY) {
    return Response.json(
      { error: "AI image generation not configured" },
      { status: 501 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const { prompt, negativePrompt, referenceImageUrl, width, height } =
      await request.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    const imgWidth = Math.min(width ?? 768, 1024);
    const imgHeight = Math.min(height ?? 768, 1024);
    const fullPrompt = `${prompt}, ${STYLE_SUFFIX}`;
    const fullNegative = negativePrompt
      ? `${GLOBAL_NEGATIVE}, ${negativePrompt}`
      : GLOBAL_NEGATIVE;
    const seed = Math.floor(Math.random() * 4294967295);

    // Choose model — PuLID when we have a face reference, flux/dev otherwise.
    const usePulid = typeof referenceImageUrl === "string" && referenceImageUrl.length > 0;

    const devInput = {
      prompt: fullPrompt,
      negative_prompt: fullNegative,
      image_size: { width: imgWidth, height: imgHeight },
      num_inference_steps: 28,
      guidance_scale: 3.5,
      seed,
      enable_safety_checker: false,
    };

    // PuLID parameters tuned for SCENE + identity lock:
    //   id_weight: 0.6 — moderate face lock. 0.9 (prior) was too strong
    //     and collapsed every generation into a reference-style portrait,
    //     ignoring the scene prompt.
    //   true_cfg: 4.0 — strong classifier-free guidance so the scene
    //     prompt actually drives composition. 1.0 (prior) let the face
    //     reference override the scene entirely.
    //   guidance_scale: 4 — balanced prompt adherence.
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
      enable_safety_checker: false,
    };

    let modelId = usePulid ? MODEL_FLUX_PULID : MODEL_FLUX_DEV;
    let input: Record<string, unknown> = usePulid ? pulidInput : devInput;
    let imageUrl: string | null = null;
    let usedPulid = usePulid;

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
    if (!imageUrl && usePulid) {
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
      cost: usedPulid ? COST_FLUX_PULID : COST_FLUX_DEV,
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
