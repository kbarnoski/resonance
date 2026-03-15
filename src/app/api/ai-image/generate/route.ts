import { fal } from "@fal-ai/client";

const STYLE_SUFFIX =
  "mystical art, luminous, sacred, transcendent, visionary, otherworldly beauty";

export async function POST(request: Request) {
  if (!process.env.FAL_KEY) {
    return Response.json(
      { error: "AI image generation not configured" },
      { status: 501 }
    );
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const { prompt, denoisingStrength, previousFrame, width, height } =
      await request.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    const imgWidth = Math.min(width ?? 768, 1024);
    const imgHeight = Math.min(height ?? 768, 1024);
    const strength = Math.max(0.1, Math.min(0.9, denoisingStrength ?? 0.5));
    const fullPrompt = `${prompt}, ${STYLE_SUFFIX}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: Record<string, any> = {
      prompt: fullPrompt,
      num_inference_steps: 4,
      guidance_scale: 1.0,
      image_size: { width: imgWidth, height: imgHeight },
      enable_safety_checker: false,
    };

    // img2img: feed previous frame for visual continuity
    if (previousFrame) {
      input.image_url = previousFrame;
      input.strength = strength;
    }

    console.log("[AI Generate] Requesting frame:", fullPrompt.substring(0, 80));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fal.subscribe("fal-ai/fast-lcm-diffusion", { input } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageUrl = (result.data as any)?.images?.[0]?.url;
    if (!imageUrl) {
      console.warn("[AI Generate] No image in response:", JSON.stringify(result.data).substring(0, 200));
      return Response.json({ error: "No image generated" }, { status: 500 });
    }

    console.log("[AI Generate] Frame generated successfully");

    return Response.json({
      image: imageUrl,
      cost: 0.002,
    });
  } catch (error) {
    console.error("[AI Generate] Error:", error);
    return Response.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
