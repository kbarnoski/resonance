/**
 * Shared utilities for text overlay components (Poetry & Story).
 * Extracted from poetry-overlay.tsx to avoid duplication.
 */

export const WHISPER_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable",
  "nova", "onyx", "shimmer", "sage", "verse", "marin", "cedar",
] as const;

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Create a cathedral-style reverb impulse response for TTS whisper effect */
export function createCathedralImpulse(ctx: AudioContext): AudioBuffer {
  const duration = 6;
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.pow(1 - t, 1.8);
      const earlyBoost = i < ctx.sampleRate * 0.08 ? 1.4 : 1.0;
      const noise = Math.random() * 2 - 1;
      data[i] = noise * envelope * earlyBoost * 0.7;
    }
  }
  return impulse;
}

/** Speak a line of text via the TTS endpoint with optional reverb */
export async function speakLine(
  text: string,
  opts: {
    audioCtx: AudioContext;
    convolver: ConvolverNode;
    dryGain: GainNode;
    voice?: string | null;
    phase?: string | null;
    language?: string;
    cancelled?: { current: boolean };
  }
): Promise<void> {
  const { audioCtx, convolver, dryGain, voice, phase, language, cancelled } = opts;

  try {
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const selectedVoice = voice ?? pickRandom(WHISPER_VOICES);

    const res = await fetch("/api/poetry/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: selectedVoice, phase, language }),
    });

    if (!res.ok || cancelled?.current) return;

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    if (cancelled?.current) return;

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dryGain);
    source.connect(convolver);
    source.start();
  } catch {
    // Silently fail
  }
}
