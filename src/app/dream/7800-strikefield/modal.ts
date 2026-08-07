// ─────────────────────────────────────────────────────────────────────────────
// 7800-strikefield · modal.ts
// Acoustic-transfer modal synthesis for a rectangular resonant plate.
//
// The plate is a 2D rectangle Lx × Ly with simply-supported edges. Its
// vibrational modes are indexed by (m,n), each a standing wave whose spatial
// shape is
//
//     φ_{m,n}(x,y) = sin(mπ x / Lx) · sin(nπ y / Ly)      (x,y normalized 0..1)
//
// and whose modal frequency follows the 2D mode grid
//
//     f(m,n) ∝ sqrt( (m/Lx)² + (n/Ly)² )
//
// (van den Doel & Pai, "The sounds of physical shapes", Presence 1998). A small
// stiffness term nudges the higher modes sharp so the timbre rings like a warm
// metal plate rather than a pure membrane.
//
// THE KEY MECHANIC — acoustic transfer. A strike at (sx, sy) excites each mode
// in proportion to that mode's shape amplitude at the contact point,
// φ_{m,n}(sx,sy). Strike an antinode of a mode → it rings loud; strike a node
// → it stays silent. So WHERE you hit changes WHICH modes sound: position → timbre.
// This is exactly the learned-acoustic-transfer coupling that NeuroSonic
// (Zhao et al., Computer Animation & Virtual Worlds, July 2026) approximates
// with a neural field; here we compute the analytic modal transfer directly.
// ─────────────────────────────────────────────────────────────────────────────

// Plate dimensions (arbitrary units; only the ratio matters). Deliberately
// non-square so modes are non-degenerate → a richer, slightly-beating spectrum.
export const LX = 1.0;
export const LY = 0.82;

// Mode grid extent. M×N = 20 modes — inside the brief's 12–20 window.
const M_MAX = 5;
const N_MAX = 4;

// Fundamental (1,1) frequency in Hz — a warm low plate voice.
const F0 = 96;
// Stiffness / inharmonicity. 0 = ideal membrane; small positive stretches highs.
const STIFF = 0.02;

export interface Mode {
  m: number;
  n: number;
  f: number; // Hz
  tau: number; // amplitude decay time constant (s)
  baseAmp: number; // intrinsic radiativity weight
}

/** Mode-shape amplitude φ_{m,n}(sx,sy), sx/sy in [0,1]. The acoustic transfer. */
export function transfer(mode: Mode, sx: number, sy: number): number {
  return Math.sin(mode.m * Math.PI * sx) * Math.sin(mode.n * Math.PI * sy);
}

/** Build the modal bank for the plate. */
export function buildModes(): Mode[] {
  const modes: Mode[] = [];
  const k = (m: number, n: number) =>
    Math.sqrt((m / LX) * (m / LX) + (n / LY) * (n / LY));
  const k11 = k(1, 1);
  for (let m = 1; m <= M_MAX; m++) {
    for (let n = 1; n <= N_MAX; n++) {
      const kk = k(m, n);
      const ratio = kk / k11;
      // membrane frequency × mild stiffness stretch
      const f = F0 * ratio * (1 + STIFF * (ratio * ratio - 1));
      // higher modes radiate less energy and decay faster
      const baseAmp = 1 / (1 + 0.9 * (ratio - 1));
      const tau = Math.max(0.28, 2.7 * Math.pow(F0 / f, 0.55));
      modes.push({ m, n, f, tau, baseAmp });
    }
  }
  return modes;
}

// ── deterministic PRNG (no Math.random — lab replay must be deterministic) ──
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

// ─────────────────────────────────────────────────────────────────────────────
// ModalEngine — a persistent bank of one OscillatorNode per mode behind a
// per-mode GainNode. A strike adds spatially-weighted energy to each mode's
// amplitude state; every frame the JS-integrated envelopes decay and drive the
// gains. Polyphony is therefore bounded (exactly M×N oscillators, forever) and
// can never run away no matter how fast the mallets fall.
// ─────────────────────────────────────────────────────────────────────────────
export class ModalEngine {
  readonly ctx: AudioContext;
  readonly modes: Mode[];
  readonly amps: Float32Array; // live modal amplitudes (also read by the visual)

  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private master: GainNode;
  private lp: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private noiseBuf: AudioBuffer;
  private rng: () => number;
  private started = false;
  private disposed = false;

  constructor() {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();
    this.modes = buildModes();
    this.amps = new Float32Array(this.modes.length);
    this.rng = mulberry32(0x7800);

    // master chain: bank → master → lowpass → compressor → out
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 7200;
    this.lp.Q.value = 0.4;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;

    this.master.connect(this.lp);
    this.lp.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    for (const mode of this.modes) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = mode.f;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.master);
      this.oscs.push(osc);
      this.gains.push(g);
    }

    // one short deterministic noise buffer, reused for every mallet contact click
    const len = Math.floor(this.ctx.sampleRate * 0.06);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rng() * 2 - 1;
  }

  get suspended(): boolean {
    return this.ctx.state === "suspended";
  }

  async start(): Promise<void> {
    if (this.disposed) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      const t = this.ctx.currentTime + 0.02;
      for (const osc of this.oscs) osc.start(t);
      this.started = true;
    }
  }

  /** Strike the plate at (sx,sy) in [0,1]² with the given force in ~[0,1]. */
  strike(sx: number, sy: number, force: number): void {
    if (this.disposed) return;
    const f = Math.max(0.05, Math.min(1.4, force));
    for (let i = 0; i < this.modes.length; i++) {
      const mode = this.modes[i];
      const w = transfer(mode, sx, sy); // ← acoustic transfer weight
      // add energy proportional to |shape amplitude at contact| × radiativity
      this.amps[i] += Math.abs(w) * mode.baseAmp * f * 0.9;
      if (this.amps[i] > 1.6) this.amps[i] = 1.6;
    }
    this.contactClick(sx, sy, f);
  }

  /** A brief filtered noise burst — the mallet's contact transient. */
  private contactClick(sx: number, sy: number, force: number): void {
    if (this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    // contact brightness tracks vertical strike position → audible position cue
    bp.frequency.value = 900 + sy * 4200;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * force, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.07);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  /** Integrate the modal envelopes forward by dt seconds and drive the gains. */
  integrate(dt: number): void {
    if (this.disposed || !this.started) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.modes.length; i++) {
      const a = this.amps[i] * Math.exp(-dt / this.modes[i].tau);
      this.amps[i] = a < 1e-4 ? 0 : a;
      // per-mode radiated level, smoothed to avoid zipper noise
      this.gains[i].gain.setTargetAtTime(this.amps[i] * 0.5, t, 0.012);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      for (const osc of this.oscs) {
        try {
          osc.stop();
        } catch {
          /* not started */
        }
        osc.disconnect();
      }
      for (const g of this.gains) g.disconnect();
      this.master.disconnect();
      this.lp.disconnect();
      this.comp.disconnect();
    } catch {
      /* already torn down */
    }
    void this.ctx.close();
  }
}
