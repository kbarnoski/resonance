// ─────────────────────────────────────────────────────────────────────────────
// 2808-palimpsest — engine (framework-agnostic).
//
// Pure helpers + the additive-score audio bank for the slit-scan palimpsest.
// No React, no DOM chrome here — only math, buffers and Web Audio. Kept in a
// sibling module so page.tsx stays readable. All randomness routes through a
// single mulberry32 seeded with 0x2808 (deterministic; no Math.random / Date).
// ─────────────────────────────────────────────────────────────────────────────

// ── Geometry of the score ────────────────────────────────────────────────────
export const COLS = 128; // playhead columns across the frame (width)
export const ROWS = 96; // vertical resolution — pitch axis (top = high)
export const N_PARTIALS = 32; // additive oscillators; ROWS / N = 3 rows each
export const ROWS_PER_PARTIAL = ROWS / N_PARTIALS;

// Musical range the vertical axis spans — four octaves, CONTINUOUS (never
// snapped to a scale). Top row → F_MAX, bottom row → F_MIN.
export const F_MIN = 110; // A2
export const F_MAX = 1760; // A6

// ── mulberry32 — the lab's only sanctioned PRNG ───────────────────────────────
export function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Continuous log-frequency for partial k (0 = top of frame = highest pitch).
export function partialFreq(k: number): number {
  const centerRow = (k + 0.5) / N_PARTIALS; // 0..1, top→bottom
  return F_MAX * Math.pow(F_MIN / F_MAX, centerRow);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Violet-ramp lookup: score energy 0..1 → [r,g,b] 0..255. Raw art colour lives
// only in this data table (chrome uses semantic tokens). Near-black violet →
// deep violet → brand violet → soft highlight → near-white.
const RAMP: [number, number, number][] = [
  [11, 7, 19], // 0.00  VIOLET 950 wash
  [36, 17, 71], // 0.28  VIOLET 800
  [91, 46, 201], // 0.55  VIOLET 600
  [139, 92, 246], // 0.74  VIOLET 500 (brand)
  [167, 139, 250], // 0.88  VIOLET 400
  [237, 233, 254], // 1.00  VIOLET 100 highlight
];
const RAMP_STOPS = [0, 0.28, 0.55, 0.74, 0.88, 1];

export function rampColor(v: number, out: [number, number, number]): void {
  const t = clamp01(v);
  let i = 0;
  while (i < RAMP_STOPS.length - 2 && t > RAMP_STOPS[i + 1]) i++;
  const a = RAMP_STOPS[i];
  const b = RAMP_STOPS[i + 1];
  const f = b > a ? (t - a) / (b - a) : 0;
  const ca = RAMP[i];
  const cb = RAMP[i + 1];
  out[0] = ca[0] + (cb[0] - ca[0]) * f;
  out[1] = ca[1] + (cb[1] - ca[1]) * f;
  out[2] = ca[2] + (cb[2] - ca[2]) * f;
}

// ── Additive-score audio bank ────────────────────────────────────────────────
// N_PARTIALS pure sines, one per pitch band. The playhead reads one column of
// the palimpsest per frame and pushes that column's per-band energy in as the
// amplitude envelope of each partial. Reading the drawn score IS the sound.
export class PalimpsestAudio {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly partials: { osc: OscillatorNode; gain: GainNode }[] = [];

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    // Warm, evolving bus: bank → lowpass → reverb + dry → compressor → out.
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 1200;
    this.lowpass.Q.value = 0.6;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    const reverb = ctx.createConvolver();
    reverb.buffer = renderImpulse(ctx, 2.8, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;

    this.master.connect(this.lowpass);
    this.lowpass.connect(dry);
    this.lowpass.connect(reverb);
    reverb.connect(wet);
    dry.connect(comp);
    wet.connect(comp);
    comp.connect(ctx.destination);

    const rng = makeMulberry32(0x2808);
    for (let k = 0; k < N_PARTIALS; k++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = partialFreq(k);
      osc.detune.value = (rng() * 2 - 1) * 4; // tiny deterministic warmth
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.partials.push({ osc, gain });
    }
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    // gentle fade-in of the whole bank
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.62, now + 1.5);
  }

  // Push one read column: per-partial energies 0..1. Slew for smoothness.
  setColumn(energies: Float32Array): void {
    const now = this.ctx.currentTime;
    for (let k = 0; k < this.partials.length; k++) {
      const e = clamp01(energies[k]);
      const target = Math.pow(e, 0.8) * 0.34;
      this.partials[k].gain.gain.setTargetAtTime(target, now, 0.05);
    }
  }

  // Long-form warmth: sweep the master lowpass as the piece opens up.
  setBrightness(cutoffHz: number): void {
    this.lowpass.frequency.setTargetAtTime(
      cutoffHz,
      this.ctx.currentTime,
      0.4,
    );
  }

  stop(): void {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.3);
      for (const p of this.partials) {
        p.osc.stop(now + 0.4);
      }
      window.setTimeout(() => {
        void this.ctx.close();
      }, 500);
    } catch {
      // already torn down
    }
  }
}

// Deterministic decaying-noise impulse response for the reverb bus.
function renderImpulse(
  ctx: AudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, len, rate);
  const rng = makeMulberry32(0x2808 ^ 0x9e3779b9);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (rng() * 2 - 1) * env;
    }
  }
  return buf;
}
