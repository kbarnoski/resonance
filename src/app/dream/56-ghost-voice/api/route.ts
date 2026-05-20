import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = await req.json() as { text?: string; voice?: string };
    const { text = "", voice = "" } = body;

    if (!text.trim()) {
      return Response.json({ error: "No text provided" }, { status: 400 });
    }

    // Inworld TTS on fal.ai — text + voice description → speech audio.
    // Endpoint: fal-ai/inworld/tts (naming-convention guess; raw error shown in UI
    // for Karel to report back if the endpoint path is wrong).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/inworld/tts", {
      input: {
        text,
        voice_description: voice || "calm, androgynous, slow, resonant",
      },
    });

    // Normalize response across possible output shapes from fal.ai wrappers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const outUrl: string | undefined =
      data?.audio?.url ??
      data?.audio_file?.url ??
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
