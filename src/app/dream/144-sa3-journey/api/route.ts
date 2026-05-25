import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

// SA3 generation can take 60–180 s for long durations
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // Mode B — audio continuation: upload recording, let SA3 extend it
      const body = await req.formData();
      const audio = body.get("audio");
      const prompt =
        (body.get("prompt") as string | null) ??
        "continue this piano journey, same mood and style";
      const duration = parseInt(
        (body.get("duration") as string | null) ?? "120",
        10
      );

      if (!(audio instanceof Blob)) {
        return Response.json({ error: "No audio file" }, { status: 400 });
      }

      const audioType = (audio as File).type || "audio/webm";
      const inputUrl = await fal.storage.upload(
        new File([audio], "recording.webm", { type: audioType })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.subscribe as any)("fal-ai/stable-audio-3", {
        input: { audio_url: inputUrl, prompt, seconds_total: duration },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (result as any)?.data;
      const url: string | undefined =
        data?.audio?.url ?? data?.audio_url ?? data?.url;

      if (!url) {
        return Response.json(
          { error: "No audio URL in response", raw: data },
          { status: 500 }
        );
      }
      return Response.json({ url });
    } else {
      // Mode A — text-to-audio journey generation
      const body = (await req.json()) as {
        prompt?: string;
        duration?: number;
      };
      const prompt =
        (body.prompt ?? "").trim() ||
        "ambient meditative piano, slow reverb, contemplative, 50 BPM, instrumental";
      const duration =
        typeof body.duration === "number" ? body.duration : 120;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.subscribe as any)("fal-ai/stable-audio-3", {
        input: { prompt, seconds_total: duration },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (result as any)?.data;
      const url: string | undefined =
        data?.audio?.url ?? data?.audio_url ?? data?.url;

      if (!url) {
        return Response.json(
          { error: "No audio URL in response", raw: data },
          { status: 500 }
        );
      }
      return Response.json({ url });
    }
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
