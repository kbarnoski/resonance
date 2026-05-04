import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitedResponse, rateLimitKey } from "@/lib/rate-limit";
import {
  readJsonBody,
  requireString,
  optionalEnum,
  optionalString,
} from "@/lib/api/validate-input";

const ALLOWED_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable",
  "nova", "onyx", "shimmer", "sage", "verse", "marin", "cedar",
] as const;

type Voice = (typeof ALLOWED_VOICES)[number];

const ALLOWED_PHASES = [
  "threshold", "expansion", "transcendence", "illumination", "return", "integration",
] as const;

const VOICE_INSTRUCTIONS: Record<string, string> = {
  threshold: "Speak in a gentle, barely audible whisper. Very slow, contemplative.",
  expansion: "Speak with growing warmth and quiet wonder. Slightly faster.",
  transcendence: "Speak with raw intensity and awe. Breathless.",
  illumination: "Speak with calm clarity, as if seeing everything for the first time.",
  return: "Speak tenderly, gently. Like welcoming someone home.",
  integration: "Speak in the softest possible whisper. Peaceful. Final.",
};

/** Hard ceiling on the text we forward to OpenAI. OpenAI's TTS API
 *  itself caps at 4096 chars; we cap lower so a single client can't
 *  burn a full max-length call per request. */
const MAX_TEXT_CHARS = 1500;

export async function POST(request: Request) {
  // Auth gate — this hits a paid OpenAI endpoint per call. Previously
  // unauthenticated; anyone could burn TTS credits.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user rate limit — 10 burst, 1 every 6 seconds steady-state.
  // Comfortably above normal listening usage; well below abuse rate.
  const rl = checkRateLimit(
    rateLimitKey({ userId: user.id, request, scope: "poetry-speak" }),
    10,
    1 / 6,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const payload = body.value as Record<string, unknown>;

  const textCheck = requireString(payload.text, "text", { max: MAX_TEXT_CHARS });
  if (!textCheck.ok) return textCheck.response;

  const voiceCheck = optionalEnum(payload.voice, "voice", ALLOWED_VOICES);
  if (!voiceCheck.ok) return voiceCheck.response;

  const phaseCheck = optionalEnum(payload.phase, "phase", ALLOWED_PHASES);
  if (!phaseCheck.ok) return phaseCheck.response;

  const langCheck = optionalString(payload.language, "language", { max: 16 });
  if (!langCheck.ok) return langCheck.response;

  const text = textCheck.value;
  const selectedVoice: Voice = voiceCheck.value ?? "shimmer";
  const phase = phaseCheck.value;
  const language = langCheck.value;

  const phaseSpeedMap: Record<string, number> = {
    threshold: 0.75,
    expansion: 0.85,
    transcendence: 1.0,
    illumination: 0.8,
    return: 0.75,
    integration: 0.7,
  };

  // Speed: clamp client-supplied value, fall back to phase default.
  const rawSpeed = typeof payload.speed === "number" ? payload.speed : undefined;
  const speed = rawSpeed !== undefined
    ? Math.max(0.25, Math.min(4.0, rawSpeed))
    : (phase ? phaseSpeedMap[phase] ?? 0.85 : 0.85);

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

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: selectedVoice,
      input: text,
      speed,
      response_format: "mp3",
      ...(instructions ? { instructions } : {}),
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[poetry/speak] TTS error:", error);
    return Response.json({ error: "Failed to generate speech" }, { status: 500 });
  }
}
