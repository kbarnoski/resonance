// audio.ts — the SOLOIST.
// Loads Karel's real "Welcome Home" recording and plays it WHOLE as the lead
// voice. Never granulated, never resynthesized — it is the human in the room.
// If the fetch fails, we synthesize a warm ~16s lyrical piano-ish phrase via
// OfflineAudioContext so the piece is never silent.
//
// Copied VERBATIM from 770-answering-room (the soloist contract is identical).

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

// ─── The his-recording loader (READ-only GET, no guard) ──────────────────────
export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }
    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Fallback soloist (synthesized warm lyrical phrase) ───────────────────────
// A simple, honest, ~16s piano-ish melody so the room always sounds.
// Built offline as a single AudioBuffer; played the same way as his recording.

// A gentle ascending/descending lyrical line in A minor / C major space.
// MIDI note numbers; rests are -1.
const FALLBACK_PHRASE: ReadonlyArray<{ note: number; dur: number }> = [
  { note: 69, dur: 0.9 }, // A4
  { note: 72, dur: 0.9 }, // C5
  { note: 76, dur: 1.3 }, // E5
  { note: 74, dur: 0.7 }, // D5
  { note: 72, dur: 1.1 }, // C5
  { note: -1, dur: 0.9 }, // (his phrase ends — a gap)
  { note: 67, dur: 0.9 }, // G4
  { note: 71, dur: 0.9 }, // B4
  { note: 74, dur: 1.3 }, // D5
  { note: 72, dur: 0.7 }, // C5
  { note: 69, dur: 1.4 }, // A4
  { note: -1, dur: 1.0 }, // (gap)
  { note: 65, dur: 0.9 }, // F4
  { note: 69, dur: 0.9 }, // A4
  { note: 72, dur: 1.5 }, // C5
  { note: 71, dur: 0.7 }, // B4
  { note: 69, dur: 1.8 }, // A4 (resolve)
];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Render one soft piano-ish note into an offline context at time t.
function renderNote(
  ctx: OfflineAudioContext,
  freq: number,
  t: number,
  dur: number,
  gain: number,
): void {
  // Two partials for a slightly bell/piano timbre.
  const partials = [
    { mult: 1, g: 1 },
    { mult: 2, g: 0.32 },
    { mult: 3, g: 0.12 },
  ];
  for (const p of partials) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * p.mult;
    const peak = gain * p.g;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.012);
    env.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * 0.18),
      t + dur * 0.6,
    );
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

export async function makeFallbackSoloist(
  sampleRate: number,
): Promise<AudioBuffer> {
  const total = FALLBACK_PHRASE.reduce((s, n) => s + n.dur, 0) + 0.6;
  const offline = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);
  let t = 0.05;
  for (const step of FALLBACK_PHRASE) {
    if (step.note >= 0) {
      renderNote(offline, midiToFreq(step.note), t, step.dur, 0.5);
    }
    t += step.dur;
  }
  return offline.startRendering();
}
