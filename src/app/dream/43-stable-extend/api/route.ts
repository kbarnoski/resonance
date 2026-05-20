import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const body = await req.formData();
    const audio = body.get("audio");
    const prompt =
      (body.get("prompt") as string | null) ??
      "continue this recording naturally, same style and mood";

    if (!(audio instanceof Blob)) {
      return Response.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Upload audio to fal storage — returns a publicly accessible URL
    const audioType = (audio as File).type || "audio/webm";
    const inputUrl = await fal.storage.upload(
      new File([audio], "recording.webm", { type: audioType })
    );

    // Stable Audio 2.5 — audio continuation / inpainting mode.
    // The endpoint extends the supplied audio clip to `seconds_total` duration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/stable-audio-25/inpaint", {
      input: {
        audio_url: inputUrl,
        prompt,
        seconds_total: 45,
        cfg_scale: 7.0,
        steps: 100,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outUrl: string | undefined = (result as any)?.data?.audio?.url;

    if (!outUrl) {
      return Response.json(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { error: "No audio URL in response", raw: (result as any)?.data },
        { status: 500 }
      );
    }

    return Response.json({ url: outUrl, inputUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
