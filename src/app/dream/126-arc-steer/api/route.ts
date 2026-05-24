import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

// ACE-Step takes 20–40 s per 30 s clip.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = (await req.json()) as { tags?: string; duration?: number };
    const tags = body.tags?.trim() || "ambient piano, meditative, 60 BPM";
    const duration = typeof body.duration === "number" ? body.duration : 30;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/ace-step", {
      input: { tags, lyrics: "[inst]", duration },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const url: string | undefined =
      data?.audio?.url ??
      data?.audio_url ??
      data?.url ??
      (Array.isArray(data?.audio) ? (data.audio[0] as { url?: string })?.url : undefined);

    if (!url) {
      return Response.json({ error: "No audio URL in response", raw: data }, { status: 500 });
    }

    return Response.json({ url });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
