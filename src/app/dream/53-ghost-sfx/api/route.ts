import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = await req.json() as { prompt?: string };
    const { prompt = "" } = body;

    if (!prompt.trim()) {
      return Response.json({ error: "No prompt provided" }, { status: 400 });
    }

    // ElevenLabs Sound Effects on fal.ai — text → short ambient sound clip.
    // Endpoint: fal-ai/elevenlabs/sound-generation (naming-convention guess;
    // if wrong the raw error is displayed in the UI for Karel to report back).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/elevenlabs/sound-generation", {
      input: {
        text: prompt,
        duration_seconds: 5,
        prompt_influence: 0.3,
      },
    });

    // Normalize response across possible output shapes from fal.ai wrappers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const outUrl: string | undefined =
      (data?.audio_file as { url?: string } | undefined)?.url ??
      data?.audio?.url ??
      data?.audio_url ??
      data?.url;

    if (!outUrl) {
      return Response.json(
        { error: "No audio URL in response", raw: JSON.stringify(data) },
        { status: 500 }
      );
    }

    return Response.json({ url: outUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
