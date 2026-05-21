import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

// ACE-Step audio-to-audio commonly takes 60–120s on fal.ai. Vercel's
// default serverless function timeout is 60s on Pro, which clips the
// request mid-generation. Bump to 300s (5 min) — fal.subscribe will
// resolve well before then.
export const maxDuration = 300;

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

      // ACE-Step audio-to-audio requires TWO tag fields:
      //   original_tags — what the input audio sounds like (the hum)
      //   tags          — what you want the output to become (scene + mood)
      // Without original_tags it 422s with "Field required".
      const originalTags =
        "humming, vocal melody, solo voice, unaccompanied, expressive";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal.subscribe as any)("fal-ai/ace-step/audio-to-audio", {
        input: {
          audio_url: inputUrl,
          original_tags: originalTags,
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
    // FAL ValidationError has a `body` field with the actual API response.
    // Surface it so the UI shows *what* validation rule failed rather than
    // just "Unprocessable Entity" with no details. Also log full error to
    // server logs for the agent to see.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const status = typeof e?.status === "number" ? e.status : 500;
    const bodyDetail = e?.body?.detail ?? e?.body ?? null;
    const message = e?.message ?? String(err);
    console.error("[62-collage-compose] FAL error:", { status, message, body: e?.body });
    return Response.json(
      {
        error: message,
        status,
        detail:
          typeof bodyDetail === "string"
            ? bodyDetail
            : bodyDetail
              ? JSON.stringify(bodyDetail)
              : null,
      },
      { status: 500 }
    );
  }
}
