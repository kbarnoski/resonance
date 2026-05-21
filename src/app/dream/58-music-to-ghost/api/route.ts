import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";

// Ghost LoRA weights — same URL as 2-ghost-lab, copied to avoid production import.
const GHOST_LORA_URL =
  "https://v3b.fal.media/files/b/0a99ac7a/yzeS5s13BwrPr675RBZrh_pytorch_lora_weights.safetensors";

const GHOST_NEGATIVE =
  "bird feathers, bird wings, plumage, additional people, multiple people, crowds, " +
  "text, watermark, signature, illustration, cartoon, painting, anime, " +
  "deformed anatomy, extra limbs, blurry face, low quality, oversaturated";

const STYLE_SUFFIX =
  "photorealistic cinematic photograph, real photographic materials and lighting, " +
  "surreal dreamlike but lifelike, luminous, transcendent, ethereal";

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = (await req.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    const fullPrompt = `${prompt}, ${STYLE_SUFFIX}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/flux-lora", {
      input: {
        prompt: fullPrompt,
        negative_prompt: GHOST_NEGATIVE,
        image_size: "portrait_4_3",
        num_inference_steps: 28,
        guidance_scale: 3.5,
        loras: [{ path: GHOST_LORA_URL, scale: 1.2 }],
        enable_safety_checker: false,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const imageUrl: string | undefined =
      data?.images?.[0]?.url ??
      data?.image?.url ??
      data?.url;

    if (!imageUrl) {
      return Response.json({ error: "No image URL in response", raw: data }, { status: 500 });
    }

    return Response.json({ url: imageUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
