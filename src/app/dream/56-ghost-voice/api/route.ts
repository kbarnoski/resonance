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
    const body = await req.json() as { text?: string; voice?: string };
    const { text = "", voice = "" } = body;

    if (!text.trim()) {
      return Response.json({ error: "No text provided" }, { status: 400 });
    }

    // Gemini TTS on fal.ai — supports natural-language style_instructions,
    // which maps perfectly to the Ghost scene voice descriptions.
    // Endpoint confirmed: fal-ai/gemini-tts. Input: prompt, style_instructions, voice.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/gemini-tts", {
      input: {
        prompt: text,
        voice: "Charon",
        style_instructions: voice || "calm, androgynous, slow, resonant",
      },
    });

    // Response: data.audio.url (confirmed from fal.ai Gemini TTS API docs).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const outUrl: string | undefined =
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
