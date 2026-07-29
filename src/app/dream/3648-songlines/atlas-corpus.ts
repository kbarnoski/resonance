// ════════════════════════════════════════════════════════════════════════════
// SONGLINES (3648) — corpus builder + descriptor analysis + descriptor→space map.
// Copied from 3608-atlas and extended with deterministic k-means WAYPOINTING
// (see `computeWaypoints` / `computeRestPoint` below) so the atlas can be played
// like a keyboard instead of only wandered with a pointer.
//
// This module turns an audio buffer into a NAVIGABLE TIMBRE ATLAS: it slices the
// signal into short grains, measures real spectral descriptors for each grain
// (centroid, RMS, pitch/periodicity, flatness, spread), then PROJECTS every
// grain to a 2-D position from those descriptors. That descriptor→space map is
// the instrument — see Diemo Schwarz, CataRT / corpus-based concatenative
// synthesis (IRCAM): "the actual instrument is the space of sound
// characteristics the performer navigates," and that navigation "can be
// recorded for later playback."
// ════════════════════════════════════════════════════════════════════════════

// ── Determinism: an inline mulberry32, seeded, for the default demo corpus.
// No Math.random() / Date.now() on this path.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Analysis frame (~46 ms @ 44.1 k) — a power of two so the FFT is radix-2. Also
// used as the grain playback length, which keeps grains in the 40–90 ms band.
const FRAME = 2048;
const MAX_GRAINS = 5000;
const PITCH_MIN_HZ = 50;
const PITCH_MAX_HZ = 2000;

export interface GrainMeta {
  startSec: number;
  durSec: number;
  centroidHz: number;
  rms: number;
  pitchHz: number;
  periodicity: number;
  flatness: number;
  spreadHz: number;
}

export interface Corpus {
  /** The audio the grains are cut from — the granular engine plays slices of it. */
  buffer: AudioBuffer;
  grains: GrainMeta[];
  n: number;
  /** Interleaved [x0,y0, x1,y1, …] in atlas space, each component in [-0.95, 0.95]. */
  positions: Float32Array;
  /** Per-grain color parameter (violet-ramp t, 0 dim → 1 bright/loud). */
  colorT: Float32Array;
  /** Per-grain normalized loudness (0..1) — drives point size + gain. */
  loud: Float32Array;
  /** Per-grain start time in seconds (for the audio engine, avoids object churn). */
  startSec: Float32Array;
  durSec: number;
  label: string;
}

// ── Radix-2 iterative FFT (in place). ─────────────────────────────────────────
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vr = re[b] * cwr - im[b] * cwi;
        const vi = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] = re[a] + vr;
        im[a] = im[a] + vi;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
      }
    }
  }
}

// ── Autocorrelation pitch estimate → { hz, confidence 0..1 }. ─────────────────
function autocorrPitch(
  buf: Float32Array,
  start: number,
  len: number,
  sampleRate: number,
): { hz: number; confidence: number } {
  const total = buf.length;
  const avail = Math.min(len, total - start);
  if (avail < 512) return { hz: -1, confidence: 0 };

  // Decimate by 2 for the pitch search — halves the effective sample rate and
  // makes the O(lag·n) autocorrelation ~4× cheaper, which keeps a large dropped
  // file's corpus build responsive. Frequencies stay correct via effSr.
  const effSr = sampleRate / 2;
  const n = avail >> 1;
  const x = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[start + i * 2];
  mean /= n;
  for (let i = 0; i < n; i++) x[i] = buf[start + i * 2] - mean;

  const c0 = (() => {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i] * x[i];
    return s;
  })();
  if (c0 < 1e-7) return { hz: -1, confidence: 0 };

  const minLag = Math.floor(effSr / PITCH_MAX_HZ);
  const maxLag = Math.min(n - 1, Math.floor(effSr / PITCH_MIN_HZ));

  // Skip the initial descent past the zero-lag peak, then find the top peak.
  let d = 1;
  while (d < maxLag && x.length > d) {
    let cur = 0;
    for (let i = 0; i < n - d; i++) cur += x[i] * x[i + d];
    let next = 0;
    for (let i = 0; i < n - (d + 1); i++) next += x[i] * x[i + d + 1];
    if (cur < next) break;
    d++;
    if (d > minLag) break;
  }
  let bestLag = -1;
  let bestVal = 0;
  let prev = 0;
  let prevPrev = 0;
  for (let lag = Math.max(minLag, d); lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += x[i] * x[i + lag];
    if (prev > prevPrev && prev >= sum && prev > bestVal) {
      bestVal = prev;
      bestLag = lag - 1;
    }
    prevPrev = prev;
    prev = sum;
  }
  if (bestLag <= 0) return { hz: -1, confidence: 0 };
  const hz = effSr / bestLag;
  if (hz < PITCH_MIN_HZ || hz > PITCH_MAX_HZ) return { hz: -1, confidence: 0 };
  return { hz, confidence: Math.max(0, Math.min(1, bestVal / c0)) };
}

// Scratch buffers reused across grains (analysis is single-threaded).
const reBuf = new Float32Array(FRAME);
const imBuf = new Float32Array(FRAME);
const hann = (() => {
  const w = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  return w;
})();

function analyzeGrain(
  mono: Float32Array,
  start: number,
  sampleRate: number,
): Omit<GrainMeta, "startSec" | "durSec"> {
  const total = mono.length;
  // Windowed copy for the spectral descriptors; zero-pad past the end.
  let rms = 0;
  for (let i = 0; i < FRAME; i++) {
    const s = start + i < total ? mono[start + i] : 0;
    rms += s * s;
    reBuf[i] = s * hann[i];
    imBuf[i] = 0;
  }
  rms = Math.sqrt(rms / FRAME);

  fft(reBuf, imBuf);

  const halfN = FRAME >> 1;
  const binHz = sampleRate / FRAME;
  let magSum = 0;
  let weighted = 0;
  let logSum = 0;
  const mags = new Float32Array(halfN);
  for (let k = 1; k < halfN; k++) {
    const m = Math.sqrt(reBuf[k] * reBuf[k] + imBuf[k] * imBuf[k]);
    mags[k] = m;
    magSum += m;
    weighted += m * (k * binHz);
    logSum += Math.log(m + 1e-9);
  }
  const centroidHz = magSum > 1e-9 ? weighted / magSum : 0;

  let spreadAcc = 0;
  for (let k = 1; k < halfN; k++) {
    const f = k * binHz;
    spreadAcc += mags[k] * (f - centroidHz) * (f - centroidHz);
  }
  const spreadHz = magSum > 1e-9 ? Math.sqrt(spreadAcc / magSum) : 0;

  const geoMean = Math.exp(logSum / (halfN - 1));
  const ariMean = magSum / (halfN - 1);
  const flatness = ariMean > 1e-9 ? Math.min(1, geoMean / ariMean) : 0;

  const { hz, confidence } = autocorrPitch(mono, start, FRAME, sampleRate);
  // Unvoiced grains still get a position: fall back to the centroid frequency,
  // so noisy material lands consistently by its brightness rather than nowhere.
  const pitchHz = hz > 0 ? hz : Math.max(PITCH_MIN_HZ, Math.min(PITCH_MAX_HZ, centroidHz));

  return { centroidHz, rms, pitchHz, periodicity: confidence, flatness, spreadHz };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/** Average all channels of an AudioBuffer to a single mono Float32Array. */
export function downmixToMono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  if (ch > 1) for (let i = 0; i < len; i++) out[i] /= ch;
  return out;
}

/**
 * Slice + analyze + project a mono signal into a Corpus.
 *
 * DESCRIPTOR → SPACE MAP (the instrument):
 *   x  = spectral centroid (brightness), log-scaled + percentile-normalized
 *   y  = pitch / periodicity estimate, log-scaled + percentile-normalized
 *   t  = color on the violet ramp, from brightness blended with loudness
 *   size/gain = RMS loudness
 */
export function buildCorpus(
  buffer: AudioBuffer,
  mono: Float32Array,
  sampleRate: number,
  label: string,
): Corpus {
  const len = mono.length;
  const usable = Math.max(0, len - FRAME);
  // Choose a hop that keeps the corpus under MAX_GRAINS; default ≈50% overlap.
  let hop = Math.floor(FRAME / 2);
  const estimate = Math.floor(usable / hop) + 1;
  if (estimate > MAX_GRAINS) hop = Math.ceil(usable / MAX_GRAINS);
  const count = Math.max(1, Math.floor(usable / hop) + 1);

  const grains: GrainMeta[] = [];
  const logCent: number[] = [];
  const logPit: number[] = [];
  const rmsAll: number[] = [];

  for (let i = 0; i < count; i++) {
    const startSample = i * hop;
    const d = analyzeGrain(mono, startSample, sampleRate);
    const g: GrainMeta = {
      startSec: startSample / sampleRate,
      durSec: FRAME / sampleRate,
      ...d,
    };
    grains.push(g);
    logCent.push(Math.log2(Math.max(40, Math.min(16000, d.centroidHz || 40))));
    logPit.push(Math.log2(Math.max(PITCH_MIN_HZ, Math.min(4000, d.pitchHz))));
    rmsAll.push(d.rms);
  }

  // Robust normalization on the 2nd/98th percentiles (ignore outliers).
  const cSort = [...logCent].sort((a, b) => a - b);
  const pSort = [...logPit].sort((a, b) => a - b);
  const rSort = [...rmsAll].sort((a, b) => a - b);
  const cLo = percentile(cSort, 0.02);
  const cHi = percentile(cSort, 0.98);
  const pLo = percentile(pSort, 0.02);
  const pHi = percentile(pSort, 0.98);
  const rLo = percentile(rSort, 0.02);
  const rHi = percentile(rSort, 0.98);
  const norm = (v: number, lo: number, hi: number) =>
    hi - lo < 1e-6 ? 0.5 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

  const n = grains.length;
  const positions = new Float32Array(n * 2);
  const colorT = new Float32Array(n);
  const loud = new Float32Array(n);
  const startSec = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const nc = norm(logCent[i], cLo, cHi);
    const np = norm(logPit[i], pLo, pHi);
    const nr = norm(rmsAll[i], rLo, rHi);
    positions[i * 2] = nc * 1.9 - 0.95;
    positions[i * 2 + 1] = np * 1.9 - 0.95;
    colorT[i] = Math.max(0, Math.min(1, 0.12 + 0.6 * nc + 0.34 * nr));
    loud[i] = nr;
    startSec[i] = grains[i].startSec;
  }

  return {
    buffer,
    grains,
    n,
    positions,
    colorT,
    loud,
    startSec,
    durSec: FRAME / sampleRate,
    label,
  };
}

// ── Default corpus: an expressive piano-ish phrase rendered offline. ──────────
// FM voices across registers with varied attack / brightness / decay give the
// atlas real timbral structure (a warm low drone region, a shimmering bright
// region) so a headless reviewer immediately sees + hears a shaped cloud.

function scheduleNote(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  dur: number,
  bright: number,
  attack: number,
  peak: number,
): void {
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * (bright > 0.6 ? 3.0 : 2.0);
  const modGain = ctx.createGain();
  const depth = freq * (1.5 + bright * 6);
  modGain.gain.setValueAtTime(depth, t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, depth * 0.12), t + dur);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(500 + bright * 5000, t);
  lp.frequency.exponentialRampToValueAtTime(350, t + dur);
  lp.Q.value = 0.5;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0004, t + dur);

  carrier.connect(lp);
  lp.connect(amp);
  amp.connect(ctx.destination);
  carrier.start(t);
  mod.start(t);
  carrier.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

export async function renderDefaultPhrase(sampleRate: number): Promise<AudioBuffer> {
  const duration = 9;
  const OAC: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new OAC(1, Math.ceil(sampleRate * duration), sampleRate);
  const rng = mulberry32(0x3608);

  // C minor pentatonic across four octaves (Hz), semitone set {0,3,5,7,10}.
  const roots = [130.81, 174.61, 196.0, 233.08, 261.63]; // C3-ish scale tones
  const scale: number[] = [];
  for (let oct = 0; oct < 4; oct++) {
    for (const r of roots) scale.push(r * Math.pow(2, oct));
  }

  // A slow warm drone in the low register (the atlas's warm/dense region).
  let t = 0.0;
  for (let i = 0; i < 4; i++) {
    const f = scale[Math.floor(rng() * 4)];
    scheduleNote(ctx, t, f, 2.6, 0.12 + rng() * 0.15, 0.4 + rng() * 0.3, 0.16);
    t += 1.9 + rng() * 0.4;
  }

  // A melodic line drifting upward in register with brighter, pluckier notes —
  // varied attack + brightness spreads grains across the whole atlas.
  t = 0.6;
  while (t < duration - 0.6) {
    const reg = Math.min(scale.length - 1, Math.floor(rng() * scale.length));
    const f = scale[reg];
    const high = reg > scale.length * 0.55;
    const bright = high ? 0.55 + rng() * 0.4 : 0.15 + rng() * 0.35;
    const dur = high ? 0.28 + rng() * 0.5 : 0.6 + rng() * 0.9;
    const attack = high ? 0.004 + rng() * 0.02 : 0.03 + rng() * 0.12;
    const peak = 0.1 + rng() * 0.09;
    scheduleNote(ctx, t, f, dur, bright, attack, peak);
    t += 0.22 + rng() * 0.4;
  }

  return await ctx.startRendering();
}

// ── Waypointing: cluster the atlas into ~12 playable timbre regions. ─────────
// A deterministic k-means over `positions` turns the continuous cloud into a
// small set of nameable "notes" — the keyboard/MIDI layer plays THESE, and the
// granular engine's cursor glides toward whichever one is held. Seeded with
// mulberry32 + a fixed iteration count, so the same corpus always yields the
// same waypoints (no Math.random on this path).

export interface Waypoint {
  /** Index after low→high (by pitch-axis y) sort — also the keyboard slot. */
  index: number;
  x: number;
  y: number;
  /** Nearest real grain to the centroid — gives the waypoint a representative
   *  pitch/brightness for labelling and for MIDI note→waypoint matching. */
  grainIndex: number;
  pitchHz: number;
  centroidHz: number;
}

export function computeWaypoints(corpus: Corpus, k: number, seed: number): Waypoint[] {
  const { positions: pos, n } = corpus;
  if (n === 0) return [];
  const kEff = Math.max(1, Math.min(k, n));
  const rng = mulberry32(seed);

  // Seeded init: sample kEff distinct grain positions as starting centroids.
  const cx = new Float64Array(kEff);
  const cy = new Float64Array(kEff);
  const used = new Set<number>();
  let filled = 0;
  let guard = 0;
  while (filled < kEff && guard < n * 4) {
    guard++;
    const idx = Math.min(n - 1, Math.floor(rng() * n));
    if (used.has(idx)) continue;
    used.add(idx);
    cx[filled] = pos[idx * 2];
    cy[filled] = pos[idx * 2 + 1];
    filled++;
  }
  // Fallback fill (tiny corpora) — evenly spaced indices.
  for (let c = filled; c < kEff; c++) {
    const idx = Math.floor((c * n) / kEff);
    cx[c] = pos[idx * 2];
    cy[c] = pos[idx * 2 + 1];
  }

  const assign = new Int32Array(n);
  const ITERS = 14;
  const sumX = new Float64Array(kEff);
  const sumY = new Float64Array(kEff);
  const cnt = new Int32Array(kEff);

  for (let iter = 0; iter < ITERS; iter++) {
    for (let i = 0; i < n; i++) {
      const px = pos[i * 2];
      const py = pos[i * 2 + 1];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kEff; c++) {
        const dx = px - cx[c];
        const dy = py - cy[c];
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    sumX.fill(0);
    sumY.fill(0);
    cnt.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assign[i];
      sumX[c] += pos[i * 2];
      sumY[c] += pos[i * 2 + 1];
      cnt[c]++;
    }
    for (let c = 0; c < kEff; c++) {
      if (cnt[c] > 0) {
        cx[c] = sumX[c] / cnt[c];
        cy[c] = sumY[c] / cnt[c];
      }
    }
  }

  const waypoints: Waypoint[] = [];
  for (let c = 0; c < kEff; c++) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 2] - cx[c];
      const dy = pos[i * 2 + 1] - cy[c];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const g = corpus.grains[bestI];
    waypoints.push({
      index: c,
      x: cx[c],
      y: cy[c],
      grainIndex: bestI,
      pitchHz: g.pitchHz,
      centroidHz: g.centroidHz,
    });
  }

  // Low → high by the pitch axis (y), so a keyboard laid out left→right maps
  // to low→high register, the way a real keyboard does.
  waypoints.sort((a, b) => a.y - b.y);
  waypoints.forEach((w, i) => {
    w.index = i;
  });
  return waypoints;
}

/** The atlas-space point farthest from every waypoint centroid — silence. A
 *  held note glides here on release so the voice actually fades to nothing
 *  rather than idling over data. */
export function computeRestPoint(waypoints: Waypoint[]): [number, number] {
  if (waypoints.length === 0) return [0, 0];
  const GRID = 17;
  let bestX = 0;
  let bestY = 0;
  let bestD = -Infinity;
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) {
      const x = -0.95 + (1.9 * gx) / (GRID - 1);
      const y = -0.95 + (1.9 * gy) / (GRID - 1);
      let minD = Infinity;
      for (const w of waypoints) {
        const dx = w.x - x;
        const dy = w.y - y;
        const d = dx * dx + dy * dy;
        if (d < minD) minD = d;
      }
      if (minD > bestD) {
        bestD = minD;
        bestX = x;
        bestY = y;
      }
    }
  }
  return [bestX, bestY];
}
