// ─────────────────────────────────────────────────────────────────────────────
// modal.ts — NON-LINEAR modal synthesis engine, main-thread Web Audio graph.
//
// Linear modal synthesis: a struck object rings as a sum of decaying sinusoids
// ("modes"), each at f_i = f0·ratio_i with its own decay time tau_i and gain.
// That alone sounds static and dead. This engine adds the two non-linearities
// that make real struck plates/gongs sing (ref: Diaz, Constanzo & Sandler,
// "nlm: Real-Time Non-linear Modal Synthesis," arXiv:2603.10240, 2026; Adrien's
// modal formalism; Ernst Chladni, plate figures, 1787):
//
//   1. TENSION MODULATION ("bloom"). The instantaneous total vibrational
//      energy E(t) stiffens the surface, raising EVERY mode's frequency:
//          f_i_eff(t) = f_i · (1 + beta · tanh(E(t)))
//      A hard strike starts sharp (pitch blooms UP), then glides back toward
//      f_i as it decays. This is the signature "pyow" of gongs/cymbals.
//   2. MODE COUPLING ("shimmer"). Energy sloshes between neighbouring modes
//      via a discrete diffusion term each frame, so the spectral centroid
//      drifts during the decay and the timbre evolves instead of sitting still.
//
// Realisation: a fixed pool of always-on OscillatorNodes, each through its own
// GainNode envelope. A small JS energy model (one float per mode) is integrated
// every animation frame from audioCtx.currentTime deltas; that model is mirrored
// onto the gains (loudness) and onto the oscillator frequencies (bloom) with
// short setTargetAtTime ramps. The SAME energy array drives the Chladni visual,
// so picture and sound are one object. No AudioWorklet; all randomness seeded.
// ─────────────────────────────────────────────────────────────────────────────

export type MaterialId = "plate" | "gong" | "membrane" | "bar" | "string";

export type Material = {
  id: MaterialId;
  label: string;
  ratios: number[]; // modal frequency ratios (mode i sits at f0 · ratios[i])
  gains: number[]; // relative loudness per mode
  tau: number; // base decay time (s) of the fundamental
  decaySpread: number; // >1 → higher modes decay faster
  beta: number; // tension-modulation depth (the bloom); high = dramatic
  kappa: number; // mode-coupling / diffusion rate (the shimmer)
  bright: number; // exciter brightness (bandpass centre multiple of f0)
};

export const MODE_COUNT = 12;

// Build a default gain profile (1/(1+i) falloff) when a preset omits one.
function makeGains(n: number, falloff: number): number[] {
  const g: number[] = [];
  for (let i = 0; i < n; i++) g.push(1 / (1 + falloff * i));
  return g;
}

// Near-harmonic string ratios with a slight inharmonicity stretch:
// ratio_i = i·sqrt(1 + B·i²)  (piano-style partial stretching).
function makeStringRatios(n: number, B: number): number[] {
  const r: number[] = [];
  for (let i = 1; i <= n; i++) r.push(i * Math.sqrt(1 + B * i * i));
  return r;
}

export const MATERIALS: Record<MaterialId, Material> = {
  plate: {
    id: "plate",
    label: "Plate",
    // inharmonic 2D flat-plate ratios (clamped-square approximation)
    ratios: [1, 2.08, 3.41, 3.89, 5.0, 6.43, 6.99, 8.28, 9.01, 10.1, 11.4, 12.9],
    gains: makeGains(MODE_COUNT, 0.55),
    tau: 2.4,
    decaySpread: 1.9,
    beta: 0.035,
    kappa: 2.2,
    bright: 3.5,
  },
  gong: {
    id: "gong",
    label: "Gong / Tam-tam",
    // dense inharmonic ratios — a crowded spectrum that shimmers hard
    ratios: [1, 1.19, 1.42, 1.68, 1.99, 2.33, 2.71, 3.14, 3.63, 4.19, 4.83, 5.57],
    gains: makeGains(MODE_COUNT, 0.28),
    tau: 6.5,
    decaySpread: 1.35,
    beta: 0.075, // dramatic bloom
    kappa: 6.5, // dramatic shimmer
    bright: 4.5,
  },
  membrane: {
    id: "membrane",
    label: "Membrane / Drum",
    // ideal circular membrane — ratios from Bessel-function zeros
    ratios: [1, 1.593, 2.136, 2.295, 2.653, 2.917, 3.156, 3.5, 3.598, 3.652, 4.06, 4.153],
    gains: makeGains(MODE_COUNT, 0.7),
    tau: 0.9,
    decaySpread: 2.4,
    beta: 0.05,
    kappa: 3.0,
    bright: 2.6,
  },
  bar: {
    id: "bar",
    label: "Bar / Marimba",
    // free-free bar ratios (marimba/xylophone partials)
    ratios: [1, 2.756, 5.404, 8.933, 13.34, 18.6, 24.7, 31.6, 39.4, 48.0, 57.4, 67.6],
    gains: [1, 0.5, 0.28, 0.16, 0.09, 0.05, 0.03, 0.02, 0.012, 0.008, 0.005, 0.003],
    tau: 1.1,
    decaySpread: 2.8,
    beta: 0.02,
    kappa: 1.2,
    bright: 2.0,
  },
  string: {
    id: "string",
    label: "String / Piano",
    ratios: makeStringRatios(MODE_COUNT, 0.0006),
    gains: makeGains(MODE_COUNT, 0.35),
    tau: 4.5,
    decaySpread: 1.6,
    beta: 0.018,
    kappa: 1.0,
    bright: 3.0,
  },
};

export const MATERIAL_ORDER: MaterialId[] = [
  "plate",
  "gong",
  "membrane",
  "bar",
  "string",
];

function makeSoftClipCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(1.8 * x);
  }
  return c;
}

// A deterministic pink-ish noise buffer for the exciter "thunk" (seeded PRNG).
function makeNoiseBuffer(ctx: AudioContext, rand: () => number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = rand() * 2 - 1;
    last = 0.96 * last + 0.04 * white; // gentle low-pass → warmer burst
    d[i] = (white * 0.4 + last * 3) * 0.5;
  }
  return buf;
}

export class NonLinearModalEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private comp: DynamicsCompressorNode;
  private bus: GainNode;

  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];

  private noiseBuf: AudioBuffer;

  private material: Material;
  private f0 = 110;

  // JS energy model — one live amplitude per mode. Mirrored to audio + visual.
  readonly energy = new Float32Array(MODE_COUNT);
  private ratios = new Float32Array(MODE_COUNT);
  private taus = new Float32Array(MODE_COUNT);

  private started = false;
  private lastT = 0;

  // last strike, exposed for the ripple origin in the visual (unit square 0..1)
  strikeX = 0.5;
  strikeY = 0.5;
  strikeFlash = 0; // 0..1, decays; brightens the whole field briefly

  constructor(rand: () => number, initial: MaterialId = "plate") {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.material = MATERIALS[initial];

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // soft limiter: tanh waveshaper → compressor → master (keeps it safe & loud-ish)
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.comp.connect(this.master);

    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeSoftClipCurve();
    this.shaper.oversample = "2x";
    this.shaper.connect(this.comp);

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 9000;
    this.lp.Q.value = 0.3;
    this.lp.connect(this.shaper);

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.lp);

    for (let i = 0; i < MODE_COUNT; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 220 * (i + 1);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(this.bus);
      this.oscs.push(osc);
      this.gains.push(g);
    }

    this.noiseBuf = makeNoiseBuffer(this.ctx, rand);
    this.applyMaterial(this.material);
  }

  get running(): boolean {
    return this.started && this.ctx.state === "running";
  }

  get materialId(): MaterialId {
    return this.material.id;
  }

  get fundamental(): number {
    return this.f0;
  }

  // Total live vibrational energy (drives the bloom + overall visual brightness).
  get totalEnergy(): number {
    let e = 0;
    for (let i = 0; i < MODE_COUNT; i++) e += this.energy[i];
    return e;
  }

  private applyMaterial(m: Material) {
    this.material = m;
    for (let i = 0; i < MODE_COUNT; i++) {
      this.ratios[i] = m.ratios[i] ?? m.ratios[m.ratios.length - 1];
      // higher modes decay faster → tau shrinks with mode index
      this.taus[i] = Math.max(0.06, m.tau / Math.pow(m.decaySpread, i * 0.5));
    }
  }

  setMaterial(id: MaterialId) {
    if (id === this.material.id) return;
    this.applyMaterial(MATERIALS[id]);
  }

  setFundamental(hz: number) {
    this.f0 = Math.min(440, Math.max(55, hz));
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.started) return;
    this.started = true;
    for (const o of this.oscs) o.start();
    this.lastT = this.ctx.currentTime;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    // master kept low — many summed sines + soft-clip can get loud
    this.master.gain.linearRampToValueAtTime(0.16, now + 0.6);
  }

  /**
   * Strike the surface.
   *   f0        — fundamental in Hz (continuous, never quantised)
   *   hardness  — 0..1; harder = louder AND brighter (more high-mode energy)
   *   ux, uy    — strike location on the unit square, for the ripple origin
   */
  strike(f0: number, hardness: number, ux = 0.5, uy = 0.5) {
    this.setFundamental(f0);
    const h = Math.min(1, Math.max(0, hardness));
    this.strikeX = Math.min(1, Math.max(0, ux));
    this.strikeY = Math.min(1, Math.max(0, uy));
    this.strikeFlash = Math.min(1.5, this.strikeFlash + 0.5 + 0.9 * h);

    const m = this.material;
    const strength = 0.4 + 0.9 * h;
    for (let i = 0; i < MODE_COUNT; i++) {
      // spectral tilt: soft strike → energy in low modes; hard → flatter/brighter
      const soft = Math.exp(-i * 0.95);
      const hard = Math.exp(-i * 0.16);
      const tilt = soft * (1 - h) + hard * h;
      const inj = m.gains[i] * tilt * strength;
      this.energy[i] += inj;
    }

    // exciter "thunk": a short filtered noise burst, brighter for harder strikes
    if (this.started) {
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(
        9000,
        this.f0 * m.bright * (0.7 + 1.2 * h)
      );
      bp.Q.value = 0.7;
      const g = this.ctx.createGain();
      const amp = 0.12 + 0.22 * h;
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.09 + 0.05 * h);
      src.connect(bp).connect(g).connect(this.bus);
      src.start(now);
      src.stop(now + 0.3);
      src.onended = () => {
        try {
          src.disconnect();
          bp.disconnect();
          g.disconnect();
        } catch {
          /* already gone */
        }
      };
    }
  }

  /**
   * Integrate the non-linear energy model one animation frame and mirror it
   * onto the audio graph. Call from rAF. Returns nothing; read `energy` and
   * `totalEnergy` for the visual. `nowSec` is audioCtx.currentTime.
   */
  step(nowSec: number) {
    if (!this.started) return;
    let dt = nowSec - this.lastT;
    this.lastT = nowSec;
    if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1; // clamp after a stall so nothing explodes

    const m = this.material;
    const e = this.energy;

    // 1) exponential decay per mode
    for (let i = 0; i < MODE_COUNT; i++) {
      e[i] *= Math.exp(-dt / this.taus[i]);
      if (e[i] < 1e-5) e[i] = 0;
    }

    // 2) MODE COUPLING — discrete diffusion sloshes energy to neighbours.
    //    (conserves energy; only decay removes it) → the evolving shimmer.
    const flow = Math.min(0.45, m.kappa * dt);
    const prev = Float32Array.from(e);
    for (let i = 0; i < MODE_COUNT; i++) {
      const lo = i > 0 ? prev[i - 1] : prev[i];
      const hi = i < MODE_COUNT - 1 ? prev[i + 1] : prev[i];
      e[i] += flow * (lo + hi - 2 * prev[i]);
      if (e[i] < 0) e[i] = 0;
    }

    // 3) TENSION MODULATION — total energy stiffens the surface, sharpening
    //    every mode; bounded by tanh so a huge strike can't run away.
    const E = this.totalEnergy;
    const bloom = 1 + m.beta * Math.tanh(E * 0.7);

    const nyq = this.ctx.sampleRate * 0.5;
    const now = this.ctx.currentTime;
    for (let i = 0; i < MODE_COUNT; i++) {
      const f = this.f0 * this.ratios[i] * bloom;
      if (f > nyq * 0.95 || e[i] <= 0) {
        this.gains[i].gain.setTargetAtTime(0, now, 0.02);
        continue;
      }
      this.oscs[i].frequency.setTargetAtTime(f, now, 0.03);
      // per-voice loudness ∝ modelled amplitude; scaled down for headroom
      const target = Math.min(0.5, e[i] * m.gains[i] * 0.5);
      this.gains[i].gain.setTargetAtTime(target, now, 0.02);
    }

    // strike flash decays
    this.strikeFlash *= Math.exp(-dt / 0.35);
    if (this.strikeFlash < 1e-3) this.strikeFlash = 0;
  }

  dispose() {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.05);
    } catch {
      /* context may already be closing */
    }
    for (const o of this.oscs) {
      try {
        o.stop();
      } catch {
        /* not started */
      }
      try {
        o.disconnect();
      } catch {
        /* already gone */
      }
    }
    for (const g of this.gains) {
      try {
        g.disconnect();
      } catch {
        /* already gone */
      }
    }
    try {
      this.bus.disconnect();
      this.lp.disconnect();
      this.shaper.disconnect();
      this.comp.disconnect();
      this.master.disconnect();
    } catch {
      /* already gone */
    }
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {
        /* ignore */
      });
    }
  }
}

// Deterministic PRNG — the ONLY source of randomness in this prototype.
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
