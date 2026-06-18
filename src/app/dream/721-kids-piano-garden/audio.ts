// audio.ts — Paths Grainfield · corpus loader + descriptor analysis + spatial
// concatenative resynthesis of Karel's REAL solo-piano recording.
//
// The whole "Welcome Home" performance is shattered into a cloud of grains.
// Each grain is one ~60–120ms window of his recording, analyzed for RMS energy
// and a spectral-centroid (brightness) proxy, then assigned a position in a
// descriptor space:  x = time-through-the-piece,  y = brightness.  Flying a
// cursor through that field re-sounds the nearest grains, concatenatively, with
// a Hann window and a stereo pan derived from screen position.
//
// CLIENT-SIDE ONLY. This READS an existing public GET route; nothing is
// recorded or sent. No API route is created here, so no guard is needed.

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

// ─── Fallback synthesis ──────────────────────────────────────────────────────
// If the live recording can't be fetched, render a few seconds of a soft,
// detuned arpeggio offline so the grain corpus is NEVER empty. A small notice
// surfaces in the UI that a fallback tone is playing.

const FALLBACK_ROOT_HZ = 196; // ~G3
const FALLBACK_PHRASE = [0, 4, 7, 11, 12, 11, 7, 4, 0, 7, 12, 16, 12, 7, 4, 0];

/**
 * Render a ~14s gentle piano-ish buffer with an OfflineAudioContext: a soft
 * arpeggio with 3–4 detuned partials + a gentle hammer attack, so the grain
 * field always has real harmonic + percussive content to scan.
 */
export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 14;
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
      { mult: 2, gain: 0.22, detune: 5 },
      { mult: 3, gain: 0.12, detune: -6 },
      { mult: 4.01, gain: 0.05, detune: 8 },
    ];
    const bodyGain = offline.createGain();
    bodyGain.connect(master);
    const a = 0.006;
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.3, start + a);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, start + noteSecs * 2.4);
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
      osc.stop(start + noteSecs * 2.6);
    }
    // Soft hammer transient → gives the corpus some bright, percussive grains.
    const hammerLen = Math.floor(0.035 * sampleRate);
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
    hammerFilt.frequency.value = Math.min(4200, freq * 6);
    hammerFilt.Q.value = 0.6;
    const hammerGain = offline.createGain();
    hammerGain.gain.value = 0.35;
    hammer.connect(hammerFilt);
    hammerFilt.connect(hammerGain);
    hammerGain.connect(master);
    hammer.start(start);
  });

  const drone = offline.createOscillator();
  drone.type = "sine";
  drone.frequency.value = FALLBACK_ROOT_HZ / 2;
  const droneGain = offline.createGain();
  droneGain.gain.value = 0.04;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start(0);
  drone.stop(durationSecs);

  return offline.startRendering();
}

// ─── Grain-corpus analysis (CataRT-style descriptor space) ───────────────────

/** One pre-analyzed grain window into the source buffer. */
export interface Grain {
  /** Start offset into the buffer, seconds. */
  offset: number;
  /** Grain duration, seconds (~60–120ms). */
  duration: number;
  /** RMS loudness, 0..1-ish. */
  rms: number;
  /** Spectral brightness proxy (zero-crossing rate), 0..1. */
  brightness: number;
  /** Normalized position in descriptor space, 0..1. x = time-through-piece. */
  nx: number;
  /** Normalized position, 0..1. y = brightness (already == brightness). */
  ny: number;
}

/** The analyzed corpus plus the buffer it points into. */
export interface Corpus {
  grains: Grain[];
  buffer: AudioBuffer;
  kind: AudioSourceKind;
}

/**
 * Slice an AudioBuffer into a dense grid of short grains, each tagged with RMS
 * energy and a brightness proxy, and positioned in a 2D descriptor space:
 *   x  = time through the piece (0 = start, 1 = end)
 *   y  = brightness (0 = dark/low, 1 = bright/high)
 * Silent grains are dropped so the cloud is all signal. The grain set is the
 * particle field the user flies through.
 */
export function buildGrainCorpus(
  buffer: AudioBuffer,
  kind: AudioSourceKind,
): Corpus {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  // ~90ms grains, 50% overlap — squarely in the 60–120ms band.
  const grainSecs = 0.09;
  const strideSecs = 0.045;
  const grainLen = Math.floor(grainSecs * sr);
  const stride = Math.floor(strideSecs * sr);
  const totalSecs = buffer.duration;

  const grains: Grain[] = [];
  for (let start = 0; start + grainLen < data.length; start += stride) {
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
    if (rms < 0.01) continue; // drop silence — keep the cloud all-signal

    // Zero-crossing rate as a cheap spectral-centroid / brightness proxy.
    const zcr = crossings / grainLen;
    const brightness = Math.min(1, zcr / 0.09);
    const nx = totalSecs > 0 ? start / sr / totalSecs : 0;

    grains.push({
      offset: start / sr,
      duration: grainSecs,
      rms: Math.min(1, rms * 4),
      brightness,
      nx,
      ny: brightness,
    });
  }

  // Cap so retrieval + GPU upload stay cheap, but keep it generous (a CLOUD).
  const CAP = 24000;
  if (grains.length > CAP) {
    const step = grains.length / CAP;
    const trimmed: Grain[] = [];
    for (let i = 0; i < CAP; i++) trimmed.push(grains[Math.floor(i * step)]);
    return { grains: trimmed, buffer, kind };
  }
  return { grains, buffer, kind };
}

/**
 * Spatial selection: find up to `k` grains nearest the cursor in descriptor
 * space (distance in the normalized nx/ny plane). This is the concatenative
 * "selection by location" step — navigating a map of his sound, à la CataRT.
 * Returns indices into corpus.grains, sorted nearest-first.
 */
export function selectNearest(
  grains: Grain[],
  cx: number,
  cy: number,
  radius: number,
  k: number,
): number[] {
  const r2 = radius * radius;
  // Collect candidates within radius with their squared distance.
  const hits: Array<{ i: number; d2: number }> = [];
  for (let i = 0; i < grains.length; i++) {
    const g = grains[i];
    const dx = g.nx - cx;
    const dy = g.ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) hits.push({ i, d2 });
  }
  hits.sort((a, b) => a.d2 - b.d2);
  const out: number[] = [];
  for (let i = 0; i < Math.min(k, hits.length); i++) out.push(hits[i].i);
  return out;
}
