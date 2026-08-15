// ─────────────────────────────────────────────────────────────────────────────
// spectralEngine.ts — the instrument. A real STFT → magnitude/phase → freeze
// (hold magnitudes, accumulate phase by each bin's measured true frequency) →
// ISTFT overlap-add resynthesis of ONE of Karel's recordings, all in TypedArrays.
//
// Two modes share one overlap-add stream so scrub↔freeze crossings never click:
//   • PLAY   — analyse a Hann frame at the playhead, rebuild it, advance the head
//              by one hop. Left alone it plays his piece; drag the head to scrub.
//   • FREEZE — lock the captured frame's magnitudes and, each synthesis hop,
//              advance every bin's phase by its measured per-hop increment
//              (expected bin phase + principal-value deviation between two capture
//              frames) → a single instant sustains forever as a shimmering pad.
//
//   SMEAR  — while frozen, dragging retargets the freeze position; the held
//            magnitudes crossfade toward that frame's magnitudes → time smears.
//   SPREAD — a box blur across neighbouring magnitude bins, from a crisp frozen
//            chord to a wide harmonic wash of his own overtones.
//
// Output is rendered a block at a time into short AudioBuffers scheduled ahead of
// the clock (no ScriptProcessor, no worklet) and routed into the shared safeMaster
// bus by the caller. References: Flanagan & Golden 1966; Dolson 1986 (phase
// vocoder); Laroche & Dolson 1999 (identity/phase-locked resynthesis).
// ─────────────────────────────────────────────────────────────────────────────

import { FFT, makeHann, princarg, mulberry32 } from "./fft";

const N = 2048; // frame size (~46 ms @ 44.1k) — good freq resolution for piano
const H = 512; // hop = N/4 → 4× overlap
const HALF = N / 2; // usable bins 0..HALF
const BLOCK = 2048; // samples per scheduled AudioBuffer (~46 ms)
const RING = 8192; // internal produced-sample ring
const LOOKAHEAD = 0.2; // seconds of audio scheduled ahead of the clock
const SMEAR_RATE = 0.06; // per-hop crossfade toward the smear target
const JITTER = 0.015; // tiny phase jitter to keep the freeze from ringing metallic
const MAX_SPREAD_BINS = 26; // widest harmonic wash

export interface SpectrogramData {
  width: number; // number of time columns
  height: number; // number of frequency rows (low freq = row 0)
  data: Uint8Array; // row-major [row * width + col], 0..255 log magnitude
  spanFrac: number; // fraction of the track shown in the scrolling viewport
}

export class SpectralEngine {
  private readonly ctx: AudioContext;
  private readonly dest: AudioNode;
  private readonly mono: Float32Array;
  private readonly total: number;
  private readonly fft = new FFT(N);
  private readonly hann = makeHann(N);
  private readonly rng = mulberry32(0x5c5eed);

  // per-frame scratch
  private readonly re = new Float32Array(N);
  private readonly im = new Float32Array(N);
  private readonly mag = new Float32Array(HALF + 1);
  private readonly phase = new Float32Array(HALF + 1);
  private readonly workMag = new Float32Array(HALF + 1);

  // freeze state
  private frozenMag = new Float32Array(HALF + 1);
  private targetMag = new Float32Array(HALF + 1);
  private trueOmega = new Float32Array(HALF + 1);
  private phaseAccum = new Float32Array(HALF + 1);
  private smearing = false;

  // overlap-add state
  private readonly acc = new Float32Array(N);
  private readonly winAcc = new Float32Array(N);
  private readonly ring = new Float32Array(RING);
  private ringLen = 0;

  // transport
  private playPos = 0; // source sample position of the playhead (float)
  private mode: "play" | "freeze" = "play";
  private spreadBins = 0;

  // scheduler
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private running = false;

  constructor(ctx: AudioContext, dest: AudioNode, buffer: AudioBuffer) {
    this.ctx = ctx;
    this.dest = dest;
    this.mono = toMono(buffer);
    this.total = this.mono.length;
    this.playPos = Math.min(this.total * 0.12, Math.max(0, this.total - N));
  }

  // ── precomputed scrolling spectrogram of his real STFT magnitudes ──────────
  // Chunked so the main thread keeps painting a progress bar while ~1400 FFTs run.
  async buildSpectrogram(
    onProgress: (frac: number) => void,
    targetCols = 1400,
    height = 256,
  ): Promise<SpectrogramData> {
    const colHop = Math.max(H, Math.floor(this.total / targetCols));
    const width = Math.max(1, Math.floor((this.total - N) / colHop) + 1);
    const data = new Uint8Array(width * height);
    const CHUNK = 96;
    for (let c = 0; c < width; c++) {
      this.analyze(c * colHop);
      for (let row = 0; row < height; row++) {
        // log-scale magnitude; piano energy lives in the low bins
        const m = this.mag[row] ?? 0;
        const db = 20 * Math.log10(m + 1e-6);
        const norm = clamp01((db + 66) / 66); // ~ -66 dB floor → 0
        data[row * width + c] = Math.round(255 * Math.pow(norm, 0.85));
      }
      if (c % CHUNK === CHUNK - 1) {
        onProgress((c + 1) / width);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress(1);
    const spanFrac = clamp01((6 * this.ctx.sampleRate) / this.total);
    return { width, height, data, spanFrac: Math.max(0.06, spanFrac) };
  }

  // ── transport / control (all safe to call at any time) ─────────────────────
  scrubTo(frac: number): void {
    this.playPos = clamp01(frac) * Math.max(0, this.total - N);
    if (this.mode === "freeze") this.setSmearTarget(frac);
  }

  freeze(): void {
    if (this.mode === "freeze") return;
    this.capture(this.playPos);
    this.mode = "freeze";
    this.smearing = false;
  }

  release(): void {
    this.mode = "play";
    this.smearing = false;
  }

  setSmearTarget(frac: number): void {
    const pos = clamp01(frac) * Math.max(0, this.total - N);
    this.analyze(pos);
    this.targetMag.set(this.mag.subarray(0, HALF + 1));
    this.smearing = true;
  }

  stopSmear(): void {
    this.smearing = false;
  }

  /** 0..1 spectral spread control → box-blur radius across bins. */
  setSpread(v: number): void {
    this.spreadBins = Math.round(clamp01(v) * MAX_SPREAD_BINS);
  }

  get playFrac(): number {
    return this.total > N ? this.playPos / (this.total - N) : 0;
  }

  get frozen(): boolean {
    return this.mode === "freeze";
  }

  // ── analysis: Hann-windowed forward FFT → magnitude + phase at `pos` ───────
  private analyze(pos: number): void {
    const start = Math.floor(pos);
    const re = this.re;
    const im = this.im;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      const v = s >= 0 && s < this.total ? this.mono[s] : 0;
      re[i] = v * this.hann[i];
      im[i] = 0;
    }
    this.fft.transform(re, im, false);
    for (let k = 0; k <= HALF; k++) {
      const rr = re[k];
      const ii = im[k];
      this.mag[k] = Math.hypot(rr, ii);
      this.phase[k] = Math.atan2(ii, rr);
    }
  }

  // ── capture a freeze: hold magnitudes, measure each bin's true frequency ───
  private capture(pos: number): void {
    this.analyze(pos);
    this.frozenMag.set(this.mag.subarray(0, HALF + 1));
    this.targetMag.set(this.mag.subarray(0, HALF + 1));
    this.phaseAccum.set(this.phase.subarray(0, HALF + 1));
    const phaseA = Float32Array.from(this.phase.subarray(0, HALF + 1));
    this.analyze(pos + H);
    for (let k = 0; k <= HALF; k++) {
      const expected = (2 * Math.PI * k * H) / N;
      const dev = princarg(this.phase[k] - phaseA[k] - expected);
      this.trueOmega[k] = expected + dev;
    }
  }

  // ── box blur (spectral spread) into workMag ────────────────────────────────
  private blurInto(src: Float32Array): void {
    const r = this.spreadBins;
    const w = this.workMag;
    if (r <= 0) {
      w.set(src.subarray(0, HALF + 1));
      return;
    }
    const inv = 1 / (2 * r + 1);
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[clampIdx(k, HALF)];
    for (let k = 0; k <= HALF; k++) {
      w[k] = sum * inv;
      sum += src[clampIdx(k + r + 1, HALF)] - src[clampIdx(k - r, HALF)];
    }
  }

  // ── produce one synthesis hop (H samples) into the ring ────────────────────
  private produceHop(): void {
    const re = this.re;
    const im = this.im;

    if (this.mode === "freeze") {
      if (this.smearing) {
        const fm = this.frozenMag;
        const tm = this.targetMag;
        for (let k = 0; k <= HALF; k++) fm[k] += (tm[k] - fm[k]) * SMEAR_RATE;
      }
      this.blurInto(this.frozenMag);
      for (let k = 0; k <= HALF; k++) {
        const p = this.phaseAccum[k];
        re[k] = this.workMag[k] * Math.cos(p);
        im[k] = this.workMag[k] * Math.sin(p);
        this.phaseAccum[k] += this.trueOmega[k] + (this.rng() - 0.5) * JITTER;
      }
    } else {
      this.analyze(this.playPos);
      this.blurInto(this.mag);
      for (let k = 0; k <= HALF; k++) {
        const p = this.phase[k];
        re[k] = this.workMag[k] * Math.cos(p);
        im[k] = this.workMag[k] * Math.sin(p);
      }
      this.playPos += H;
      if (this.playPos >= this.total - N) this.playPos = 0; // loop his piece
    }

    // hermitian-mirror the upper half to get a real inverse transform
    for (let k = 1; k < HALF; k++) {
      re[N - k] = re[k];
      im[N - k] = -im[k];
    }
    im[0] = 0;
    im[HALF] = 0;
    this.fft.transform(re, im, true);

    // overlap-add with a synthesis Hann; normalise by the accumulated window^2
    const acc = this.acc;
    const winAcc = this.winAcc;
    const hann = this.hann;
    for (let i = 0; i < N; i++) {
      const wsyn = hann[i];
      acc[i] += re[i] * wsyn;
      winAcc[i] += wsyn * wsyn;
    }
    // emit the first H finished samples
    let w = this.ringLen;
    for (let i = 0; i < H; i++) {
      const norm = winAcc[i];
      this.ring[w++] = norm > 1e-6 ? acc[i] / norm : 0;
    }
    this.ringLen = w;
    // slide the accumulators left by one hop
    acc.copyWithin(0, H);
    acc.fill(0, N - H);
    winAcc.copyWithin(0, H);
    winAcc.fill(0, N - H);
  }

  private pull(dst: Float32Array): void {
    const need = dst.length;
    while (this.ringLen < need) this.produceHop();
    dst.set(this.ring.subarray(0, need));
    this.ring.copyWithin(0, need, this.ringLen);
    this.ringLen -= need;
  }

  // ── scheduler: keep short buffers scheduled ahead of the audio clock ───────
  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.pump();
  }

  pump(): void {
    if (!this.running) return;
    const sr = this.ctx.sampleRate;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const buf = this.ctx.createBuffer(1, BLOCK, sr);
      this.pull(buf.getChannelData(0));
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.dest);
      src.start(this.nextTime);
      this.sources.add(src);
      src.onended = () => {
        try {
          src.disconnect();
        } catch {
          /* ctx closing */
        }
        this.sources.delete(src);
      };
      this.nextTime += BLOCK / sr;
    }
  }

  stop(): void {
    this.running = false;
    for (const src of this.sources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.sources.clear();
  }
}

function toMono(buffer: AudioBuffer): Float32Array {
  const chs = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i];
  }
  const inv = 1 / Math.max(1, chs);
  for (let i = 0; i < len; i++) out[i] *= inv;
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampIdx(k: number, hi: number): number {
  return k < 0 ? 0 : k > hi ? hi : k;
}
