// ─────────────────────────────────────────────────────────────────────────────
// physarum.ts — a genuine Physarum polycephalum agent-transport-network sim.
//
//   The model (Jeff Jones 2010, "Characteristics of pathfinding in a simulated
//   transport network"; the agent scheme Sage Jenson / mxsage popularised):
//     • a TRAIL FIELD — a 2D scalar grid (Float32Array).
//     • AGENTS — thousands of {x, y, heading} particles.
//     • each step, per agent: SENSE the trail ahead / ahead-left / ahead-right,
//       TURN toward the strongest sensed cell (+ tiny seeded jitter), MOVE
//       forward, DEPOSIT a fixed amount into the trail at the new cell.
//     • each frame: DIFFUSE (3×3 mean) + DECAY the whole field — this is what
//       makes the veins condense, branch and reorganise into filigree.
//
//   Real audio (or the seeded silent demo) reshapes the colony every frame via
//   an AudioDrive. Pure CPU + Float32Array so it runs headless, no GPU needed.
//
//   All randomness is a seeded mulberry32 PRNG — never Math.random / Date.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG. Same seed → same stream, on every machine, forever. */
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

const TAU = Math.PI * 2;

/** Per-frame control signal — from real audio analysis OR the seeded demo. */
export interface AudioDrive {
  /** Loudness / RMS, 0..1 → deposit strength + agent step speed. */
  loud: number;
  /** Spectral centroid (brightness), 0..1 → sensor angle / branching width. */
  centroid: number;
  /** Low-band energy, 0..1 → trail persistence (bass = denser veins). */
  low: number;
  /** Onset (spectral flux spike), 0..1 → burst of fresh agents feeds growth. */
  onset: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface PhysarumOptions {
  size?: number;
  agentCount?: number;
  seed?: number;
}

export class Physarum {
  readonly W: number;
  readonly H: number;
  readonly agentCount: number;

  private trail: Float32Array; // the chemoattractant field
  private blur: Float32Array; // scratch for the diffuse pass
  private activity: Float32Array; // fast-decaying "just deposited" front glow

  // Agents, structure-of-arrays for cache friendliness.
  private ax: Float32Array;
  private ay: Float32Array;
  private ah: Float32Array; // heading (radians)

  private spawnX: number[] = [];
  private spawnY: number[] = [];

  private rng: () => number;
  private spawnCursor = 0;
  private prevOnset = 0;

  // Warm-ramp lookup table (256 × rgb) — the coral/amber vein colormap.
  private lut: Uint8Array;

  constructor(opts: PhysarumOptions = {}) {
    this.W = opts.size ?? 512;
    this.H = opts.size ?? 512;
    this.agentCount = opts.agentCount ?? 18000;
    this.rng = mulberry32(opts.seed ?? 0x1a2b3c4d);

    const n = this.W * this.H;
    this.trail = new Float32Array(n);
    this.blur = new Float32Array(n);
    this.activity = new Float32Array(n);

    this.ax = new Float32Array(this.agentCount);
    this.ay = new Float32Array(this.agentCount);
    this.ah = new Float32Array(this.agentCount);

    // Scatter agents across the whole field with random headings so a network
    // condenses fast (visible growth within ~1s — critical for the muted glance).
    for (let i = 0; i < this.agentCount; i++) {
      this.ax[i] = this.rng() * this.W;
      this.ay[i] = this.rng() * this.H;
      this.ah[i] = this.rng() * TAU;
    }

    // A handful of seeded spawn nodes where onsets inject fresh growth.
    for (let s = 0; s < 6; s++) {
      this.spawnX.push(this.W * (0.18 + this.rng() * 0.64));
      this.spawnY.push(this.H * (0.18 + this.rng() * 0.64));
    }

    this.lut = buildWarmLut();
  }

  /** Advance the colony one step under the given audio drive. */
  step(d: AudioDrive): void {
    const { W, H, trail, activity } = this;
    const loud = clamp01(d.loud);
    const centroid = clamp01(d.centroid);
    const low = clamp01(d.low);
    const onset = clamp01(d.onset);

    // ── Audio → colony parameters ──────────────────────────────────────────
    // Brightness widens the sensing cone → more exploration, more branching.
    const sensorAngle = lerp(0.28, 0.95, centroid);
    const rotAngle = lerp(0.18, 0.62, centroid);
    const sensorDist = 9;
    // Loudness drives speed + deposit — louder music = faster, brighter growth.
    const stepSize = lerp(0.55, 2.3, loud);
    const deposit = lerp(0.55, 5.2, loud);
    const jitter = 0.22;

    // ── Onset → inject a burst of fresh agents at the seeded spawn nodes ────
    if (onset > 0.5 && this.prevOnset <= 0.5) {
      const burst = Math.floor(this.agentCount * (0.03 + 0.05 * onset));
      const nSpawn = this.spawnX.length;
      for (let k = 0; k < burst; k++) {
        const i = this.spawnCursor++ % this.agentCount;
        const s = (this.rng() * nSpawn) | 0;
        this.ax[i] = this.spawnX[s] + (this.rng() - 0.5) * 8;
        this.ay[i] = this.spawnY[s] + (this.rng() - 0.5) * 8;
        this.ah[i] = this.rng() * TAU;
      }
    }
    this.prevOnset = onset;

    // Fronts glow brighter (cooler / teal) when the music is loud or spiking.
    const actGain = 0.12 + loud * 0.35 + onset * 0.6;

    // ── Agents: sense → turn → move → deposit ──────────────────────────────
    const ax = this.ax;
    const ay = this.ay;
    const ah = this.ah;
    for (let i = 0; i < this.agentCount; i++) {
      const x = ax[i];
      const y = ay[i];
      const h = ah[i];

      const f = senseAt(trail, W, H, x, y, h, sensorDist);
      const fl = senseAt(trail, W, H, x, y, h - sensorAngle, sensorDist);
      const fr = senseAt(trail, W, H, x, y, h + sensorAngle, sensorDist);

      let nh = h;
      if (f > fl && f > fr) {
        // keep heading
      } else if (f < fl && f < fr) {
        // ambiguous ahead — random left/right (classic Jones rule)
        nh += this.rng() < 0.5 ? -rotAngle : rotAngle;
      } else if (fr > fl) {
        nh += rotAngle;
      } else if (fl > fr) {
        nh -= rotAngle;
      }
      nh += (this.rng() - 0.5) * jitter;

      let nx = x + Math.cos(nh) * stepSize;
      let ny = y + Math.sin(nh) * stepSize;

      // Toroidal wrap — the reef has no edges.
      if (nx < 0) nx += W;
      else if (nx >= W) nx -= W;
      if (ny < 0) ny += H;
      else if (ny >= H) ny -= H;

      ax[i] = nx;
      ay[i] = ny;
      ah[i] = nh;

      const idx = (ny | 0) * W + (nx | 0);
      trail[idx] += deposit;
      activity[idx] += actGain;
    }

    // ── Field: diffuse (3×3 mean) + decay → veins condense & reorganise ─────
    // Bass energy makes the trail more persistent (denser, longer-lived veins).
    const decay = lerp(0.9, 0.975, low);
    diffuse(trail, this.blur, W, H);
    for (let p = 0, n = W * H; p < n; p++) {
      trail[p] = this.blur[p] * decay;
      activity[p] *= 0.8; // fast decay → glow rides only the active growth front
    }
  }

  /**
   * Paint the trail field into an ImageData buffer.
   * Warm coral/amber veins on near-black, with a cool teal glow at growth tips.
   */
  render(img: ImageData): void {
    const { trail, activity, lut } = this;
    const data = img.data;
    const n = this.W * this.H;
    for (let p = 0, o = 0; p < n; p++, o += 4) {
      // Tone-map trail density → 0..255 ramp index.
      const t = 1 - Math.exp(-trail[p] * 0.26);
      const li = (t * 255) | 0;
      const l3 = li * 3;
      let r = lut[l3];
      let g = lut[l3 + 1];
      let b = lut[l3 + 2];

      // Teal tip glow from the fast-decaying activity field (additive).
      const a = 1 - Math.exp(-activity[p] * 0.9);
      if (a > 0.004) {
        r += 30 * a;
        g += 200 * a;
        b += 188 * a;
        if (r > 255) r = 255;
        if (g > 255) g = 255;
        if (b > 255) b = 255;
      }

      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
}

/** Sample the trail one sensor-hop away at the given heading (nearest, wrapped). */
function senseAt(
  grid: Float32Array,
  W: number,
  H: number,
  x: number,
  y: number,
  angle: number,
  dist: number,
): number {
  let ix = (x + Math.cos(angle) * dist) | 0;
  let iy = (y + Math.sin(angle) * dist) | 0;
  ix %= W;
  if (ix < 0) ix += W;
  iy %= H;
  if (iy < 0) iy += H;
  return grid[iy * W + ix];
}

/** Separable 3×3 box blur (mean filter) with toroidal wrap → `out`. */
function diffuse(src: Float32Array, out: Float32Array, W: number, H: number): void {
  // Horizontal pass src → out.
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const xm = x === 0 ? W - 1 : x - 1;
      const xp = x === W - 1 ? 0 : x + 1;
      out[row + x] = (src[row + xm] + src[row + x] + src[row + xp]) * (1 / 3);
    }
  }
  // Vertical pass out → src (reuse), then copy back into out.
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const ym = y === 0 ? H - 1 : y - 1;
      const yp = y === H - 1 ? 0 : y + 1;
      src[y * W + x] =
        (out[ym * W + x] + out[y * W + x] + out[yp * W + x]) * (1 / 3);
    }
  }
  out.set(src);
}

/** Warm bioluminescent ramp: deep near-black → maroon → coral → amber → pale. */
function buildWarmLut(): Uint8Array {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [4, 3, 6]], // deep near-black reef ground
    [0.14, [46, 12, 16]], // dark maroon
    [0.34, [128, 34, 26]], // deep coral-red
    [0.55, [220, 78, 44]], // coral
    [0.76, [246, 152, 66]], // warm amber
    [1.0, [255, 226, 172]], // pale warm crest
  ];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let c: [number, number, number] = stops[stops.length - 1][1];
    for (let s = 1; s < stops.length; s++) {
      if (t <= stops[s][0]) {
        const [t0, c0] = stops[s - 1];
        const [t1, c1] = stops[s];
        const f = (t - t0) / (t1 - t0 || 1);
        c = [
          c0[0] + (c1[0] - c0[0]) * f,
          c0[1] + (c1[1] - c0[1]) * f,
          c0[2] + (c1[2] - c0[2]) * f,
        ];
        break;
      }
    }
    lut[i * 3] = c[0];
    lut[i * 3 + 1] = c[1];
    lut[i * 3 + 2] = c[2];
  }
  return lut;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded silent demo driver — makes the reef visibly grow & breathe with NO
// audio at all (the muted-06:30 glance). A fixed mulberry32 seed feeds synthetic
// loudness / centroid / low / onset envelopes. Fully deterministic.
// ─────────────────────────────────────────────────────────────────────────────
export class DemoDriver {
  private rng: () => number;
  private nextBeat: number;
  private onsetVal = 0;

  constructor(seed = 0x9e3779b9) {
    this.rng = mulberry32(seed);
    this.nextBeat = 0.4 + this.rng() * 0.4;
  }

  sample(t: number, dt: number): AudioDrive {
    // Onset envelope: seeded beat times, each fires a spike that decays.
    this.onsetVal *= Math.exp(-dt * 7);
    while (t >= this.nextBeat) {
      this.onsetVal = 1;
      this.nextBeat += 0.4 + this.rng() * 0.95;
    }

    // Slow breathing loudness — layered sines, never a strobe.
    const loud = clamp01(
      0.42 +
        0.24 * Math.sin(t * 0.62) +
        0.16 * Math.sin(t * 1.73 + 1.1) +
        0.08 * Math.sin(t * 3.1 + 2.3),
    );
    // Centroid drifts brightness up & down → branching widens and narrows.
    const centroid = clamp01(0.5 + 0.4 * Math.sin(t * 0.27 + 0.5));
    // Bass swell → periods of denser, more persistent veins.
    const low = clamp01(0.55 + 0.35 * Math.sin(t * 0.19 + 2.0));

    return { loud, centroid, low, onset: clamp01(this.onsetVal) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioFeatures — extracts loudness / centroid / low-band / onset from a live
// AnalyserNode (dropped file OR mic). Spectral-flux onset with an adaptive
// threshold. Pure analysis — this class never touches the audio graph output.
// ─────────────────────────────────────────────────────────────────────────────
export class AudioFeatures {
  private analyser: AnalyserNode;
  private time: Float32Array;
  private freq: Float32Array;
  private prev: Float32Array;
  private fluxAvg = 0;
  private nyquist: number;

  constructor(analyser: AnalyserNode, sampleRate: number) {
    this.analyser = analyser;
    this.time = new Float32Array(analyser.fftSize);
    const bins = analyser.frequencyBinCount;
    this.freq = new Float32Array(bins);
    this.prev = new Float32Array(bins);
    this.nyquist = sampleRate / 2;
  }

  sample(): AudioDrive {
    const a = this.analyser;
    // Casts keep TS happy across lib.dom's ArrayBuffer-generic overloads.
    a.getFloatTimeDomainData(this.time as Float32Array<ArrayBuffer>);

    // RMS loudness (lightly compressed for a musical response curve).
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) sum += this.time[i] * this.time[i];
    const rms = Math.sqrt(sum / this.time.length);
    const loud = clamp01(Math.pow(rms * 3.2, 0.7));

    // Frequency magnitudes in dB → linear-ish weight.
    a.getFloatFrequencyData(this.freq as Float32Array<ArrayBuffer>);
    const bins = this.freq.length;
    let magSum = 0;
    let weighted = 0;
    let lowSum = 0;
    let flux = 0;
    const lowCut = (bins / 8) | 0;
    for (let i = 0; i < bins; i++) {
      // dB (~-140..0) → 0..1 magnitude.
      const m = clamp01((this.freq[i] + 140) / 140);
      magSum += m;
      weighted += m * i;
      if (i < lowCut) lowSum += m;
      const d = m - this.prev[i];
      if (d > 0) flux += d;
      this.prev[i] = m;
    }

    const centroidBin = magSum > 1e-6 ? weighted / magSum : 0;
    const centroidHz = (centroidBin / bins) * this.nyquist;
    // Map ~0..4 kHz of musical centroid onto 0..1.
    const centroid = clamp01(centroidHz / 4000);
    const low = clamp01((lowSum / (lowCut || 1)) * 1.6);

    // Adaptive onset: flux over a slow running average.
    this.fluxAvg = this.fluxAvg * 0.9 + flux * 0.1;
    const onset = clamp01((flux - this.fluxAvg * 1.5) / (this.fluxAvg + 8));

    return { loud, centroid, low, onset };
  }
}
