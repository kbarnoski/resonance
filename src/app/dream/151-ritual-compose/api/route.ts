import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

// Lyria 3 Pro typically takes 20–60 s per generation.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = (await req.json()) as { prompt?: string; seed?: number };
    const prompt = body.prompt?.trim() || "meditative ambient, reverbed piano, 55 BPM";
    const input: Record<string, unknown> = { prompt };
    if (typeof body.seed === "number") input.seed = body.seed;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/lyria3/pro", { input });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data ?? result;
    const url: string | undefined =
      data?.audio_url ??
      data?.audio?.url ??
      data?.url ??
      (Array.isArray(data?.audio) ? (data.audio[0] as { url?: string })?.url : undefined);

    if (!url) {
      return Response.json({ error: "No audio URL in response", raw: data }, { status: 500 });
    }

    const bpm: number | undefined = data?.bpm ?? data?.metadata?.bpm ?? undefined;
    return Response.json({ url, bpm });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
