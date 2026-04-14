import { fal } from "@fal-ai/client";

const MODEL_ID = "fal-ai/flux/schnell";

// Appended to every generated prompt across every journey. "Surreal" here means
// dreamlike-but-lifelike — we want rich imaginative scenes rendered with
// photographic materials and lighting, not illustration. The NOT clauses catch
// the most common failure modes where the base prompt drifts toward art styles.
const STYLE_SUFFIX =
  "photorealistic cinematic photograph, real photographic materials and lighting, " +
  "surreal dreamlike but lifelike, luminous, transcendent, ethereal, " +
  "NOT illustration, NOT cartoon, NOT painting, NOT anime, NOT concept art, NOT 3d render";

export async function POST(request: Request) {
  if (!process.env.FAL_KEY) {
    return Response.json(
      { error: "AI image generation not configured" },
      { status: 501 }
    );
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const { prompt, denoisingStrength, width, height } =
      await request.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    const imgWidth = Math.min(width ?? 768, 1024);
    const imgHeight = Math.min(height ?? 768, 1024);
    const fullPrompt = `${prompt}, ${STYLE_SUFFIX}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: Record<string, any> = {
      prompt: fullPrompt,
      num_inference_steps: 4,
      image_size: { width: imgWidth, height: imgHeight },
      enable_safety_checker: false,
    };

    console.log("[AI Generate] Requesting frame:", fullPrompt.substring(0, 80));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fal.subscribe(MODEL_ID, { input } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageUrl = (result.data as any)?.images?.[0]?.url;
    if (!imageUrl) {
      console.warn("[AI Generate] No image in response:", JSON.stringify(result.data).substring(0, 200));
      return Response.json({ error: "No image generated" }, { status: 500 });
    }

    console.log("[AI Generate] Frame generated successfully");

    return Response.json({
      image: imageUrl,
      cost: 0.003,
    });
  } catch (error) {
    console.error("[AI Generate] Error:", error);
    return Response.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
