/** Karel's real solo-piano recording id (read-only existing public GET route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

/**
 * Fetch Karel's recording into an AudioBuffer. Proven pattern.
 * Returns null on ANY failure (caller MUST fall back to synthesis).
 */
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

// ---------------------------------------------------------------------------
// Pitch scale: C-major pentatonic, ~5 rails near the bottom of the globe.
// Rail index 0 (leftmost/lowest) → highest pentatonic step is NOT required;
// we map rails left→right to ascending tones so nothing is ever "wrong".
// MIDI: C4 D4 E4 G4 A4  (60 62 64 67 69)
// ---------------------------------------------------------------------------
export const RAIL_MIDI = [60, 62, 64, 67, 69] as const;
export const RAIL_COUNT = RAIL_MIDI.length;

/** Equal-temperament frequency of a MIDI note. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Reference pitch the source slice is assumed to "be" (C4) for rate mapping. */
const SOURCE_REF_MIDI = 60;

/** playbackRate that shifts the source slice to a target MIDI tone. */
export function railPlaybackRate(railIndex: number): number {
  const midi = RAIL_MIDI[railIndex % RAIL_COUNT];
  return midiToFreq(midi) / midiToFreq(SOURCE_REF_MIDI);
}

// ---------------------------------------------------------------------------
// Kids-safe master chain.
//   gain ≤ 0.3 → lowpass ≤ 7500Hz → compressor(thr -10, ratio 20:1) → out
// ---------------------------------------------------------------------------
export interface MasterChain {
  input: GainNode;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
}

export function makeMasterChain(ctx: AudioContext): MasterChain {
  const input = ctx.createGain();
  input.gain.value = 1;

  const master = ctx.createGain();
  master.gain.value = 0.28; // ≤ 0.3

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 6800; // ≤ 7500
  lowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 20;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  input.connect(master);
  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  return { input, master, lowpass, comp };
}

// ---------------------------------------------------------------------------
// Fallback voice: synthesized soft celesta/bell buffer (offline render-free,
// built directly into an AudioBuffer). Used when Karel's recording can't load.
// One buffer at C4; we pitch-shift it with playbackRate like the real slice.
// ---------------------------------------------------------------------------
export function makeFallbackBellBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 1.6;
  const len = Math.round(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const f0 = midiToFreq(SOURCE_REF_MIDI); // C4
  // Inharmonic-ish partials for a soft music-box / celesta timbre.
  const partials = [
    { mult: 1.0, amp: 1.0, decay: 2.6 },
    { mult: 2.0, amp: 0.42, decay: 3.4 },
    { mult: 3.01, amp: 0.2, decay: 4.6 },
    { mult: 4.2, amp: 0.1, decay: 6.0 },
  ];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let s = 0;
    for (const p of partials) {
      s += p.amp * Math.sin(2 * Math.PI * f0 * p.mult * t) * Math.exp(-p.decay * t);
    }
    // Soft attack so there is never a hard transient.
    const attack = Math.min(1, t / 0.008);
    data[i] = s * attack * 0.5;
  }
  return buf;
}

/**
 * Pick a soft ~0.25–0.5s window of Karel's recording as a "chime" buffer.
 * Returns a copy with a Hann-ish in/out envelope baked in so each landing
 * sounds gentle. If `source` is the fallback bell, callers pass it whole.
 */
export function makeSliceBuffer(
  ctx: AudioContext,
  source: AudioBuffer,
): AudioBuffer {
  const sr = source.sampleRate;
  const sliceDur = 0.25 + Math.random() * 0.25; // 0.25–0.5s
  const sliceLen = Math.min(
    source.length,
    Math.round(sliceDur * sr),
  );
  // Avoid the very start/end of the recording.
  const maxStart = Math.max(0, source.length - sliceLen - 1);
  const start = Math.floor(Math.random() * maxStart);
  const out = ctx.createBuffer(1, sliceLen, sr);
  const dst = out.getChannelData(0);
  const src = source.getChannelData(0);
  for (let i = 0; i < sliceLen; i++) {
    // Hann window for a click-free, soft envelope.
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (sliceLen - 1));
    dst[i] = src[start + i] * w;
  }
  return out;
}
