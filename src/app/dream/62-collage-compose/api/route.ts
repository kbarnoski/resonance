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
    const tags =
      (body.get("tags") as string | null)?.trim() ||
      "ambient, meditative, piano, 70 BPM";

    const hasAudio = audio instanceof Blob && audio.size > 1000;

    let result: unknown;

    if (hasAudio) {
      // Audio-to-audio: ACE-Step hears the hum's melodic contour and builds around it.
      const audioType = (audio as File).type || "audio/webm";
      const inputUrl = await fal.storage.upload(
        new File([audio as Blob], "hum.webm", { type: audioType })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal.subscribe as any)("fal-ai/ace-step/audio-to-audio", {
        input: {
          audio_url: inputUrl,
          tags,
          lyrics: "[inst]",
          duration: 30,
        },
      });
    } else {
      // Text-to-audio: build from scene + mood tags only.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal.subscribe as any)("fal-ai/ace-step", {
        input: {
          tags,
          lyrics: "[inst]",
          duration: 30,
        },
      });
    }

    // Normalise across possible response shapes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;
    const outUrl: string | undefined =
      data?.audio?.url ??
      data?.audio_url ??
      data?.url ??
      (Array.isArray(data?.audio)
        ? (data.audio[0] as { url?: string })?.url
        : undefined);

    if (!outUrl) {
      return Response.json(
        { error: "No audio URL in response", raw: data },
        { status: 500 }
      );
    }

    return Response.json({ url: outUrl, audioToAudio: hasAudio });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
