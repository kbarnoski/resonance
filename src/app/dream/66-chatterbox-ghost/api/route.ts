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
    const body = await req.json() as {
      text?: string;
      voice_url?: string;
      exaggeration?: number;
    };
    const { text = "", voice_url, exaggeration = 0.5 } = body;

    if (!text.trim()) {
      return Response.json({ error: "No text provided" }, { status: 400 });
    }

    const input: Record<string, unknown> = {
      text,
      exaggeration_factor: Math.max(0, Math.min(1, exaggeration)),
    };

    if (voice_url) {
      // audio_prompt_url: Chatterbox's voice-clone reference field (naming-convention guess;
      // paste error text to the agent if the endpoint rejects this field name).
      input.audio_prompt_url = voice_url;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/chatterbox/text-to-speech", { input });

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
