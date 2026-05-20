import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = await req.json() as { arc?: string; style?: string };
    const { arc = "", style = "" } = body;

    if (!arc.trim()) {
      return Response.json({ error: "No arc text provided" }, { status: 400 });
    }

    // MiniMax Music — structural section tags in lyrics, style description in prompt.
    // Endpoint: fal-ai/minimax/music-01 (the fal.ai MiniMax Music model).
    // lyrics = the arc text with [Intro] [Build Up] [Chorus] [Outro] etc. section tags.
    // prompt = overall style/genre description.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/minimax/music-01", {
      input: {
        prompt: style || "cinematic orchestra, ambient, dramatic",
        lyrics: arc,
      },
    });

    // Normalize response across possible output shapes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const outUrl: string | undefined =
      data?.audio?.url ??
      data?.audio_url ??
      data?.url ??
      (Array.isArray(data?.audio) ? (data.audio[0] as { url?: string })?.url : undefined);

    if (!outUrl) {
      return Response.json(
        { error: "No audio URL in response", raw: data },
        { status: 500 }
      );
    }

    return Response.json({ url: outUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
