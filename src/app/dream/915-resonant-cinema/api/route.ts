import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

// ─────────────────────────────────────────────────────────────────────────────
// Resonant Cinema (915) — the two-model FAL chain.
//
// audio-mood prompt → flux-schnell (still) → ltx-video/image-to-video (clip).
//
// Fires ONLY on an explicit "Dream the film" button click on the client.
// Cost is real (~$0.003 still + ~$0.02 video per run) and bills Karel's
// paid FAL account, so the route is guarded and never called on load/idle.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }
  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = (await req.json()) as { prompt?: string };
    const prompt =
      body.prompt?.trim() ||
      "deep indigo nebula, slow drift, glassy reflections, cinematic, volumetric light";

    // (a) Still seed — flux-schnell, 4 steps, 16:9 cinematic frame.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const img = await (fal.subscribe as any)("fal-ai/flux/schnell", {
      input: { prompt, image_size: "landscape_16_9", num_inference_steps: 4 },
    });
    const imageUrl: string | undefined = img?.data?.images?.[0]?.url;
    if (!imageUrl) {
      return Response.json(
        { error: "No image URL", raw: img?.data },
        { status: 500 }
      );
    }

    // (b) Bloom the still into a living clip — image-to-video.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vid = await (fal.subscribe as any)(
      "fal-ai/ltx-video/image-to-video",
      {
        input: {
          image_url: imageUrl,
          prompt:
            "gentle drifting motion, slow parallax, breathing light, " +
            "particulate atmosphere, cinematic camera float",
        },
      }
    );
    const videoUrl: string | undefined = vid?.data?.video?.url ?? vid?.data?.url;
    if (!videoUrl) {
      return Response.json(
        { imageUrl, error: "No video URL", raw: vid?.data },
        { status: 500 }
      );
    }

    return Response.json({ imageUrl, videoUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
