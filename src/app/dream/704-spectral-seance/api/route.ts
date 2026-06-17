import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

export async function POST(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }
  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = (await req.json()) as { prompt?: string };
    const prompt = body.prompt?.trim() || "austere monochrome data field, fine white lines on black, ikeda";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/flux/schnell", {
      input: { prompt, image_size: "landscape_4_3", num_inference_steps: 4 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const imageUrl: string | undefined = data?.images?.[0]?.url ?? data?.image?.url ?? data?.url;
    if (!imageUrl) return Response.json({ error: "No image URL", raw: data }, { status: 500 });
    return Response.json({ url: imageUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
