import { fal } from "@fal-ai/client";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY not configured" }, { status: 501 });
  }

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const form = await req.formData();
    const audio = form.get("audio");

    if (!(audio instanceof Blob)) {
      return Response.json({ error: "No audio file provided" }, { status: 400 });
    }

    const url = await fal.storage.upload(
      new File([audio], "reference.webm", { type: "audio/webm" })
    );

    return Response.json({ url });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
