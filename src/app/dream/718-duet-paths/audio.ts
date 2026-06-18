// audio.ts — Karel's real solo-piano recording loader, grain-corpus analysis,
// and an offline synth fallback. Client-side only. READ-ONLY of an existing
// public GET route; nothing is recorded or sent.

/** Karel's real solo-piano recording id (read-only existing API route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

/**
 * Fetch Karel's recording into an AudioBuffer. (Proven pattern, copied verbatim
 * from the lab's piano loaders.)
 * - 4s abort timeout.
 * - If the response is JSON: parse {url}, fetch that for the bytes.
 * - Else: the body itself is the audio bytes.
 * Returns null on ANY failure (caller falls back to synthesis).
 */
export async function fetchPianoBuffer(ctx: BaseAudioContext): Promise<AudioBuffer | null> {
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

// ─── Fallback synthesis ──────────────────────────────────────────────────────

const FALLBACK_ROOT_HZ = 220; // A3-ish
const FALLBACK_PHRASE = [0, 2, 3, 5, 7, 9, 10, 12, 10, 7, 5, 3, 2, 0, 7, 12];

/**
 * Render a ~12s gentle solo-piano-like buffer with an OfflineAudioContext so the
 * grain corpus always has real harmonic + percussive content to scan when the
 * network is unavailable. Mirrors the lab's proven fallback render.
 */
export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 12;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, sampleRate);

  const noteSecs = durationSecs / FALLBACK_PHRASE.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  FALLBACK_PHRASE.forEach((semi, i) => {
    const start = i * noteSecs;
    const freq = FALLBACK_ROOT_HZ * Math.pow(2, semi / 12);
    const partials = [
      { mult: 1, gain: 0.5, detune: 0 },
      { mult: 2, gain: 0.22, detune: 4 },
      { mult: 3, gain: 0.12, detune: -5 },
      { mult: 4, gain: 0.06, detune: 7 },
    ];
    const bodyGain = offline.createGain();
    bodyGain.connect(master);
    const a = 0.006;
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.32, start + a);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, start + noteSecs * 1.8);
    for (const p of partials) {
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const g = offline.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(bodyGain);
      osc.start(start);
      osc.stop(start + noteSecs * 2.0);
    }
    const hammerLen = Math.floor(0.04 * sampleRate);
    const hammerBuf = offline.createBuffer(1, hammerLen, sampleRate);
    const hd = hammerBuf.getChannelData(0);
    for (let n = 0; n < hammerLen; n++) {
      const t = n / hammerLen;
      hd[n] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
    }
    const hammer = offline.createBufferSource();
    hammer.buffer = hammerBuf;
    const hammerFilt = offline.createBiquadFilter();
    hammerFilt.type = "bandpass";
    hammerFilt.frequency.value = Math.min(4000, freq * 6);
    hammerFilt.Q.value = 0.6;
    const hammerGain = offline.createGain();
    hammerGain.gain.value = 0.4;
    hammer.connect(hammerFilt);
    hammerFilt.connect(hammerGain);
    hammerGain.connect(master);
    hammer.start(start);
  });

  const drone = offline.createOscillator();
  drone.type = "sine";
  drone.frequency.value = FALLBACK_ROOT_HZ / 2;
  const droneGain = offline.createGain();
  droneGain.gain.value = 0.05;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start(0);
  drone.stop(durationSecs);

  return offline.startRendering();
}

// ─── Grain-corpus analysis (concatenative / CataRT-style descriptors) ────────

/** One pre-analyzed grain window into the source buffer. */
export interface Grain {
  /** Start offset into the buffer, seconds. */
  offset: number;
  /** Grain duration, seconds. */
  duration: number;
  /** Estimated fundamental, MIDI note number (rough autocorrelation). */
  midi: number;
  /** Estimated fundamental in Hz. */
  hz: number;
  /** RMS loudness (0..1-ish) — used to skip silence and pick singing grains. */
  rms: number;
  /** Spectral brightness proxy: zero-crossing rate (0..1). */
  brightness: number;
}

const MIN_GRAIN_HZ = 55; // ~A1
const MAX_GRAIN_HZ = 1760; // ~A6

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/**
 * Rough monophonic pitch estimate over a window via normalized autocorrelation.
 * Returns Hz, or 0 if no confident pitch (noise / silence).
 */
function estimateHz(data: Float32Array, start: number, len: number, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / MAX_GRAIN_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_GRAIN_HZ), len - 1);
  if (maxLag <= minLag) return 0;

  // Energy for normalization.
  let energy = 0;
  for (let i = 0; i < len; i++) {
    const s = data[start + i] || 0;
    energy += s * s;
  }
  if (energy < 1e-4) return 0;

  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < len - lag; i++) {
      corr += (data[start + i] || 0) * (data[start + i + lag] || 0);
    }
    const norm = corr / energy;
    if (norm > bestCorr) {
      bestCorr = norm;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestCorr < 0.35) return 0; // unconfident
  return sampleRate / bestLag;
}

/**
 * Slice an AudioBuffer into an overlapping grid of grains, each tagged with a
 * rough pitch / loudness / brightness. Lightweight, fixed-stride — good enough
 * to retrieve grains by register for a concatenative answer.
 */
export function buildGrainCorpus(buffer: AudioBuffer): Grain[] {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const grainSecs = 0.24; // ~240ms windows
  const strideSecs = 0.12; // 50% overlap
  const grainLen = Math.floor(grainSecs * sr);
  const stride = Math.floor(strideSecs * sr);
  const grains: Grain[] = [];

  for (let start = 0; start + grainLen < data.length; start += stride) {
    // RMS + zero-crossing over the window.
    let sumSq = 0;
    let crossings = 0;
    let prev = data[start] || 0;
    for (let i = 1; i < grainLen; i++) {
      const s = data[start + i] || 0;
      sumSq += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) crossings++;
      prev = s;
    }
    const rms = Math.sqrt(sumSq / grainLen);
    if (rms < 0.012) continue; // skip silence

    const brightness = Math.min(1, crossings / grainLen / 0.08);
    const hz = estimateHz(data, start, grainLen, sr);
    if (hz < MIN_GRAIN_HZ || hz > MAX_GRAIN_HZ) continue;

    grains.push({
      offset: start / sr,
      duration: grainSecs,
      midi: hzToMidi(hz),
      hz,
      rms: Math.min(1, rms * 4),
      brightness,
    });
  }

  // Hard cap so retrieval stays cheap.
  if (grains.length > 600) {
    const step = grains.length / 600;
    const trimmed: Grain[] = [];
    for (let i = 0; i < 600; i++) trimmed.push(grains[Math.floor(i * step)]);
    return trimmed;
  }
  return grains;
}

/**
 * Retrieve the corpus grain whose estimated pitch is closest to the target MIDI
 * note (preferring louder / more-tonal grains on ties). Returns null on empty
 * corpus. This is the concatenative "selection" step.
 */
export function selectGrain(corpus: Grain[], targetMidi: number): Grain | null {
  if (corpus.length === 0) return null;
  let best: Grain | null = null;
  let bestCost = Infinity;
  for (const g of corpus) {
    const pitchCost = Math.abs(g.midi - targetMidi);
    // Penalize quiet grains a touch; reward singing tone.
    const cost = pitchCost - g.rms * 1.5;
    if (cost < bestCost) {
      bestCost = cost;
      best = g;
    }
  }
  return best;
}
