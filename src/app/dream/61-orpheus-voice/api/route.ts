import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = (await req.json()) as {
      engine?: string;
      text?: string;
      styleInstructions?: string;
      voice?: string;
    };

    const { engine = "gemini", text = "", styleInstructions = "", voice } = body;

    if (!text.trim()) {
      return Response.json({ error: "No text provided" }, { status: 400 });
    }

    let result: unknown;

    if (engine === "orpheus") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal.subscribe as any)("fal-ai/orpheus-tts", {
        input: {
          prompt: text,
          voice: voice ?? "leah",
        },
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal.subscribe as any)("fal-ai/gemini-tts", {
        input: {
          prompt: text,
          voice: voice ?? "Charon",
          style_instructions: styleInstructions || "calm, androgynous, slow, resonant",
        },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const outUrl: string | undefined =
      data?.audio?.url ?? data?.audio_url ?? data?.url;

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
