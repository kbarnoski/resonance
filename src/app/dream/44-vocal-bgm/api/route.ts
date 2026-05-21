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
    const body = await req.formData();
    const audio = body.get("audio");
    const genre =
      (body.get("genre") as string | null) ??
      "jazz piano trio, warm, acoustic, 70 BPM";

    if (!(audio instanceof Blob)) {
      return Response.json({ error: "No audio file provided" }, { status: 400 });
    }

    const audioType = (audio as File).type || "audio/webm";
    const inputUrl = await fal.storage.upload(
      new File([audio], "recording.webm", { type: audioType })
    );

    // ACE-Step 1.5 audio-to-audio: vocal-to-BGM / remix mode.
    // lyrics "[inst]" = instrumental output (no AI vocals, melody only from user).
    // tags = genre/style description that shapes the full band arrangement.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("fal-ai/ace-step/audio-to-audio", {
      input: {
        audio_url: inputUrl,
        lyrics: "[inst]",
        tags: genre,
        duration: 30,
      },
    });

    // Normalise across possible response shapes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const outUrl: string | undefined =
      data?.audio?.url ?? data?.audio_url ?? data?.url;

    if (!outUrl) {
      return Response.json(
        { error: "No audio URL in response", raw: data },
        { status: 500 }
      );
    }

    return Response.json({ url: outUrl, inputUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
