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
    const body = (await req.json()) as { backend?: string; tags?: string };
    const tags = body.tags?.trim() || "ambient piano, meditative, 60 BPM, gentle";
    const backend = body.backend === "cassette" ? "cassette" : "ace";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;

    if (backend === "cassette") {
      // CassetteAI: lightweight distilled model, ~2s generation, $0.02/min
      // ⚠ Parameter names are best-guess from fal.ai naming conventions.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal.subscribe as any)("cassetteai/music-generator", {
        input: {
          prompt: tags,
          duration: 30,
        },
      });
    } else {
      // ACE-Step: full diffusion model, ~20–40s, $0.006/30s
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal.subscribe as any)("fal-ai/ace-step", {
        input: {
          tags,
          lyrics: "[inst]",
          duration: 30,
        },
      });
    }

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

    return Response.json({ url: outUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
