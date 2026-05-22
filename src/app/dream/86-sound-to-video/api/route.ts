import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

// Image generation: ~10–20s. Video generation: ~20–60s.
// Both well within 300s.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = (await req.json()) as {
      step: "image" | "video";
      prompt?: string;
      imageUrl?: string;
      motionPrompt?: string;
    };

    // ── Step 1: generate a cinematic 16:9 scene image from acoustic prompt ──
    if (body.step === "image") {
      const prompt =
        body.prompt?.trim() ||
        "a vast dark atmospheric landscape, cinematic lighting, photorealistic";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.subscribe as any)("fal-ai/flux/dev", {
        input: {
          prompt,
          image_size: "landscape_16_9",
          num_inference_steps: 28,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (result as any)?.data;
      const imageUrl: string | undefined =
        data?.images?.[0]?.url ?? data?.image?.url ?? data?.url;

      if (!imageUrl) {
        return Response.json(
          { error: "No image URL in fal response", raw: data },
          { status: 500 },
        );
      }

      return Response.json({ imageUrl });
    }

    // ── Step 2: animate the scene image into a short video ──
    if (body.step === "video") {
      const { imageUrl, motionPrompt } = body;
      if (!imageUrl) {
        return Response.json({ error: "imageUrl is required" }, { status: 400 });
      }

      const prompt =
        motionPrompt?.trim() ||
        "slow cinematic drift, atmospheric motion, dreamlike, 4K";

      // LTX-Video: image_url conditions the first frame; prompt drives motion.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.subscribe as any)("fal-ai/lightricks/ltx-video", {
        input: {
          prompt,
          image_url: imageUrl,
          duration_seconds: 5,
          aspect_ratio: "16:9",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (result as any)?.data;
      const videoUrl: string | undefined = data?.video?.url ?? data?.url;

      if (!videoUrl) {
        return Response.json(
          { error: "No video URL in fal response", raw: data },
          { status: 500 },
        );
      }

      return Response.json({ videoUrl });
    }

    return Response.json({ error: "step must be 'image' or 'video'" }, { status: 400 });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const status = typeof e?.status === "number" ? e.status : 500;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyDetail = e?.body?.detail ?? e?.body ?? null;
    const message = e?.message ?? String(err);
    console.error("[86-sound-to-video] fal error:", { status, message, body: e?.body });
    return Response.json(
      {
        error: message,
        detail:
          typeof bodyDetail === "string"
            ? bodyDetail
            : bodyDetail
              ? JSON.stringify(bodyDetail)
              : null,
      },
      { status: 500 },
    );
  }
}
