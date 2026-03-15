import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const { text, voice, phase, speed: customSpeed } = await request.json();

    if (!text || typeof text !== "string") {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

    const ALLOWED_VOICES = ["shimmer", "nova", "fable", "alloy", "echo", "onyx"] as const;
    const selectedVoice = ALLOWED_VOICES.includes(voice) ? voice : "shimmer";

    // Phase-specific speed mapping
    const phaseSpeedMap: Record<string, number> = {
      threshold: 0.75,
      expansion: 0.85,
      transcendence: 1.0,
      illumination: 0.8,
      return: 0.75,
      integration: 0.7,
    };

    const speed = customSpeed ?? (phase && phaseSpeedMap[phase]) ?? 0.85;

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: selectedVoice,
      input: text,
      speed: Math.max(0.25, Math.min(4.0, speed)),
      response_format: "mp3",
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("TTS API error:", error);
    return Response.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}
