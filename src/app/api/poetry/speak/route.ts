import OpenAI from "openai";

const ALLOWED_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable",
  "nova", "onyx", "shimmer", "sage", "verse", "marin", "cedar",
] as const;

const VOICE_INSTRUCTIONS: Record<string, string> = {
  threshold: "Speak in a gentle, barely audible whisper. Very slow, contemplative.",
  expansion: "Speak with growing warmth and quiet wonder. Slightly faster.",
  transcendence: "Speak with raw intensity and awe. Breathless.",
  illumination: "Speak with calm clarity, as if seeing everything for the first time.",
  return: "Speak tenderly, gently. Like welcoming someone home.",
  integration: "Speak in the softest possible whisper. Peaceful. Final.",
};

export async function POST(request: Request) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { text, voice, phase, speed: customSpeed, language } = await request.json();

    if (!text || typeof text !== "string") {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

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

    // Build voice steering instructions
    const instructionParts: string[] = [];
    if (phase && VOICE_INSTRUCTIONS[phase]) {
      instructionParts.push(VOICE_INSTRUCTIONS[phase]);
    }
    if (language && language !== "en") {
      const { LANGUAGE_NAMES } = await import("@/lib/audio/languages");
      const langName = LANGUAGE_NAMES[language] ?? language;
      instructionParts.push(`Speak in ${langName}.`);
    }
    const instructions = instructionParts.length > 0 ? instructionParts.join(" ") : undefined;

    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: selectedVoice,
      input: text,
      speed: Math.max(0.25, Math.min(4.0, speed)),
      response_format: "mp3",
      ...(instructions ? { instructions } : {}),
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
