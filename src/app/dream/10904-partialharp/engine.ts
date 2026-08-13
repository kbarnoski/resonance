// ─────────────────────────────────────────────────────────────────────────────
// 10904 · PARTIAL HARP — engine.ts
//
// A live sinusoidal model (McAulay–Quatieri 1986). Each frame we run a large FFT
// over the source, peak-pick the spectral magnitude with parabolic refinement,
// then MATCH this frame's peaks to the previous frame's active partial tracks by
// nearest log-frequency. Matched tracks glide on; unmatched old tracks DIE (fade
// to silence); loud unmatched peaks are BORN. A parallel bank of oscillators
// re-synthesizes the tracked partials, so silencing one track literally subtracts
// that one overtone from what you hear.
//
// No Math.random / Date.now / new Date anywhere — all variation flows from a
// seeded mulberry32 PRNG, time from performance.now (supplied by the caller).
// ─────────────────────────────────────────────────────────────────────────────

import type { SafeMaster } from "../_shared/visionary/safeMaster";

/** Deterministic PRNG. Seed with 0x10904 so the demo phrase is identical run-to-run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Partial {
  id: number;
  /** semitone bucket relative to REF_HZ, fixed at birth — the stable handle for mute/solo. */
  bucket: number;
  freq: number; // smoothed display frequency (Hz)
  amp: number; // smoothed display amplitude (0..~1)
  targetFreq: number;
  targetAmp: number;
  age: number; // frames matched (used for bloom-in)
  missing: number; // consecutive frames unmatched (death countdown)
  silenced: boolean; // muted or excluded by solo — recomputed each frame
  history: { t: number; freq: number; amp: number }[];
}

const REF_HZ = 55; // A1 — bucket 0
const F_MIN = 60;
const F_MAX = 6000;
const FFT_SIZE = 4096;
const MAX_TRACKS = 40; // == oscillator pool size (1:1 mapping)
const MAX_PEAKS = 48;
const MATCH_TOL_OCT = 0.045; // ~half a semitone in log2 space
const MAX_MISSING = 14; // frames a track may float unmatched before removal
const HISTORY_MS = 6000;
const PEAK_FLOOR_DB = -78; // absolute magnitude floor
const PEAK_REL_DB = 62; // and must be within this many dB of the frame's loudest bin

export function bucketOf(freq: number): number {
  return Math.round(12 * Math.log2(freq / REF_HZ));
}

interface Peak {
  freq: number;
  amp: number;
}

interface OscSlot {
  osc: OscillatorNode;
  gain: GainNode;
  trackId: number | null;
}

export class PartialHarp {
  readonly analyser: AnalyserNode;
  readonly fMin = F_MIN;
  readonly fMax = F_MAX;

  tracks: Partial[] = [];
  mutedBuckets = new Set<number>();
  soloBucket: number | null = null;

  private ctx: AudioContext;
  private master: SafeMaster;
  private floatData: Float32Array;
  private freqStep: number;
  private source: AudioBufferSourceNode | null = null;
  private oscBank: OscSlot[] = [];
  private idToSlot = new Map<number, number>();
  private nextId = 1;

  constructor(ctx: AudioContext, master: SafeMaster) {
    this.ctx = ctx;
    this.master = master;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.35;
    this.analyser = analyser;
    this.floatData = new Float32Array(analyser.frequencyBinCount);
    this.freqStep = ctx.sampleRate / FFT_SIZE;

    // Pre-allocate the resynthesis oscillator bank. Every slot is running from
    // t=0 at gain 0; frames just steer freq/gain. All audio flows to master.input.
    for (let i = 0; i < MAX_TRACKS; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(master.input);
      osc.start();
      this.oscBank.push({ osc, gain, trackId: null });
    }
  }

  /** Point the analyzer + resynthesis at a decoded buffer (demo phrase or dropped file). */
  setBuffer(buffer: AudioBuffer): void {
    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch {
        /* already stopped */
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.analyser); // analysis path only — never reaches destination
    src.start();
    this.source = src;
    // Fresh source ⇒ drop stale tracks so the model re-derives from the new sound.
    this.tracks = [];
    this.idToSlot.clear();
  }

  /** Toggle mute of the partial nearest this frequency (identified by semitone bucket). */
  toggleMuteAt(freq: number): void {
    const b = bucketOf(freq);
    if (this.mutedBuckets.has(b)) this.mutedBuckets.delete(b);
    else this.mutedBuckets.add(b);
  }

  toggleMuteBucket(bucket: number): void {
    if (this.mutedBuckets.has(bucket)) this.mutedBuckets.delete(bucket);
    else this.mutedBuckets.add(bucket);
  }

  /** Solo one bucket (silence all others); calling again with the same bucket clears solo. */
  soloBucketToggle(bucket: number): void {
    this.soloBucket = this.soloBucket === bucket ? null : bucket;
  }

  clearSelection(): void {
    this.mutedBuckets.clear();
    this.soloBucket = null;
  }

  // ── the McAulay–Quatieri step ──────────────────────────────────────────────
  analyze(nowMs: number): Partial[] {
    const data = this.floatData;
    this.analyser.getFloatFrequencyData(data as unknown as Float32Array<ArrayBuffer>);
    const peaks = pickPeaks(data, this.freqStep);

    // greedy nearest-neighbour association, loudest tracks claim first
    const order = [...this.tracks].sort((a, b) => b.amp - a.amp);
    const claimed = new Array<boolean>(peaks.length).fill(false);

    for (const track of order) {
      let best = -1;
      let bestD = MATCH_TOL_OCT;
      for (let i = 0; i < peaks.length; i++) {
        if (claimed[i]) continue;
        const d = Math.abs(Math.log2(peaks[i].freq / track.freq));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        claimed[best] = true;
        track.targetFreq = peaks[best].freq;
        track.targetAmp = peaks[best].amp;
        track.missing = 0;
        track.age++;
      } else {
        track.missing++;
        track.targetAmp = 0; // no supporting peak → fade this overtone out
      }
    }

    // birth: loud unmatched peaks become new tracks, up to the pool cap
    const births: Peak[] = [];
    for (let i = 0; i < peaks.length; i++) if (!claimed[i]) births.push(peaks[i]);
    births.sort((a, b) => b.amp - a.amp);
    for (const p of births) {
      if (this.tracks.length >= MAX_TRACKS) break;
      this.tracks.push({
        id: this.nextId++,
        bucket: bucketOf(p.freq),
        freq: p.freq,
        amp: 0,
        targetFreq: p.freq,
        targetAmp: p.amp,
        age: 0,
        missing: 0,
        silenced: false,
        history: [],
      });
    }

    // smooth, prune, record history, resolve silence
    const survivors: Partial[] = [];
    for (const t of this.tracks) {
      t.freq += (t.targetFreq - t.freq) * 0.35;
      t.amp += (t.targetAmp - t.amp) * 0.35;

      const dead = t.missing > MAX_MISSING || (t.missing > 3 && t.amp < 0.0015);
      if (dead) {
        this.freeSlot(t.id);
        continue;
      }

      t.silenced =
        this.soloBucket !== null ? t.bucket !== this.soloBucket : this.mutedBuckets.has(t.bucket);

      t.history.push({ t: nowMs, freq: t.freq, amp: t.amp });
      const cut = nowMs - HISTORY_MS;
      while (t.history.length > 0 && t.history[0].t < cut) t.history.shift();

      survivors.push(t);
    }
    this.tracks = survivors;

    this.driveOscillators();
    return this.tracks;
  }

  private freeSlot(trackId: number): void {
    const idx = this.idToSlot.get(trackId);
    if (idx === undefined) return;
    this.oscBank[idx].gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    this.oscBank[idx].trackId = null;
    this.idToSlot.delete(trackId);
  }

  private driveOscillators(): void {
    const now = this.ctx.currentTime;
    for (const t of this.tracks) {
      let idx = this.idToSlot.get(t.id);
      if (idx === undefined) {
        idx = this.oscBank.findIndex((s) => s.trackId === null);
        if (idx < 0) continue; // pool full this frame
        this.oscBank[idx].trackId = t.id;
        this.idToSlot.set(t.id, idx);
      }
      const slot = this.oscBank[idx];
      slot.osc.frequency.setTargetAtTime(t.freq, now, 0.02);
      const g = t.silenced ? 0 : Math.min(0.32, t.amp * 0.7);
      slot.gain.gain.setTargetAtTime(g, now, 0.02);
    }
  }

  teardown(): void {
    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch {
        /* ok */
      }
      this.source = null;
    }
    for (const s of this.oscBank) {
      try {
        s.osc.stop();
        s.osc.disconnect();
        s.gain.disconnect();
      } catch {
        /* ok */
      }
    }
    this.oscBank = [];
    try {
      this.analyser.disconnect();
    } catch {
      /* ok */
    }
  }
}

/** Local-maxima peak picking with parabolic (quadratic) interpolation on the dB curve. */
function pickPeaks(data: Float32Array, freqStep: number): Peak[] {
  const nBins = data.length;
  const loBin = Math.max(2, Math.floor(F_MIN / freqStep));
  const hiBin = Math.min(nBins - 2, Math.ceil(F_MAX / freqStep));

  let maxDb = -Infinity;
  for (let i = loBin; i <= hiBin; i++) if (data[i] > maxDb) maxDb = data[i];
  if (!isFinite(maxDb)) return [];
  const thresh = Math.max(PEAK_FLOOR_DB, maxDb - PEAK_REL_DB);

  const peaks: Peak[] = [];
  for (let i = loBin; i <= hiBin; i++) {
    const b = data[i];
    if (b < thresh) continue;
    const a = data[i - 1];
    const c = data[i + 1];
    if (!(b > a && b >= c)) continue; // local maximum
    // quadratic interpolation of the sub-bin peak position + magnitude
    const denom = a - 2 * b + c;
    const p = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    const trueBin = i + Math.max(-0.5, Math.min(0.5, p));
    const peakDb = b - 0.25 * (a - c) * p;
    peaks.push({ freq: trueBin * freqStep, amp: Math.pow(10, peakDb / 20) });
  }

  peaks.sort((a, b) => b.amp - a.amp);
  return peaks.slice(0, MAX_PEAKS);
}

// ─── seeded demo phrase ───────────────────────────────────────────────────────
// A short arpeggiated, piano-ish loop: each note is a small stack of slightly
// inharmonic, decaying partials so the tracker has real overtone threads to find.
export function renderDemoBuffer(ctx: AudioContext, prng: () => number): AudioBuffer {
  const dur = 9;
  const sr = ctx.sampleRate;
  const len = Math.floor(dur * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);

  // A-minor pentatonic, a couple of octaves — gentle, intimate
  const scale = [220, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
  const noteEvery = 0.5; // seconds between onsets
  const notes = Math.floor(dur / noteEvery);

  for (let n = 0; n < notes; n++) {
    const idx = Math.floor(prng() * scale.length);
    const f0 = scale[idx] * (1 + (prng() - 0.5) * 0.004); // tiny detune per strike
    const start = Math.floor(n * noteEvery * sr);
    const noteLen = Math.floor(1.9 * sr);
    const attack = 0.006 * sr;

    for (let h = 1; h <= 6; h++) {
      const inharm = 1 + 0.0009 * h * h; // string-stiffness stretch
      const fh = f0 * h * inharm;
      if (fh > sr * 0.45) break;
      const hAmp = (1 / h) * (0.75 + 0.4 * prng());
      const decay = 1.6 / Math.sqrt(h); // higher partials die sooner
      const phase = prng() * Math.PI * 2;
      const w = (2 * Math.PI * fh) / sr;
      for (let i = 0; i < noteLen && start + i < len; i++) {
        const env = Math.exp(-(i / sr) / decay) * Math.min(1, i / attack);
        out[start + i] += hAmp * env * Math.sin(w * i + phase);
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < len; i++) out[i] *= g;
  }
  return buf;
}
