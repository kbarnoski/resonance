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

    // Beatoven Maestro on fal.ai — text → 2.5-min instrumental + stems.
    // Endpoint: beatoven/music-generation (RESEARCH.md §101).
    // If wrong, the raw error is returned for Karel to paste back next cycle.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal.subscribe as any)("beatoven/music-generation", {
      input: {
        prompt,
        stems: true,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data;

    // Normalize full-track URL
    const trackUrl: string | undefined =
      data?.audio?.url ??
      data?.audio_url ??
      (typeof data?.audio === "string" ? data.audio : undefined) ??
      data?.url;

    // Normalize stem URLs — Beatoven returns stems as an object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawStems = (data?.stems ?? {}) as Record<string, any>;
    const extractUrl = (v: unknown): string | undefined =>
      typeof v === "string" ? v
      : typeof (v as { url?: string })?.url === "string" ? (v as { url: string }).url
      : undefined;

    const stems: Record<string, string | undefined> = {
      drums:  extractUrl(rawStems.drums),
      bass:   extractUrl(rawStems.bass),
      melody: extractUrl(rawStems.melody),
      other:  extractUrl(rawStems.other),
    };

    if (!trackUrl && !stems.drums && !stems.bass && !stems.melody && !stems.other) {
      return Response.json(
        { error: "No audio URL in response", raw: JSON.stringify(data).slice(0, 1000) },
        { status: 500 }
      );
    }

    return Response.json({ trackUrl, stems });
  } catch (err) {
    return Response.json(
      { error: String(err), raw: "" },
      { status: 500 }
    );
  }
}
