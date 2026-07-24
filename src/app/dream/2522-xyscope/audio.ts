// ════════════════════════════════════════════════════════════════════════════
// XY-Scope (2522) — audio engine.
//
// A deliberately UN-tempered dual-oscillator engine. There is NO pitch lattice,
// no just-intonation snapping: base frequency and the ratio between the two
// voices are fully continuous, so the player can walk a clean consonant loop
// straight into a beating, screeching, dissonant clash. The two voices are hard-
// panned — voice A owns the LEFT channel (the scope's X axis), voice B owns the
// RIGHT channel (Y). What you hear is literally what you see: the stereo signal
// (L(t), R(t)) is the Lissajous curve. See README for the oscilloscope-music
// lineage (Jerobeam Fenderson).
//
// Danger axis = "drive": one knob that simultaneously (a) waveshapes each voice
// through a tanh saturator (sine → square-ish → spiky harmonics) and (b) opens
// an FM index so the right voice is frequency-modulated into inharmonic buzz.
// Both the timbre and the vector figure sharpen in lockstep.
// ════════════════════════════════════════════════════════════════════════════

export interface ScopeParams {
  /** Base frequency of voice A, in Hz (continuous, ~40–800). */
  base: number;
  /** Frequency ratio B/A (continuous, ~0.5–8.0 — NOT quantized). */
  ratio: number;
  /** Phase offset of voice B, in radians (0–2π). Rotates / opens the figure. */
  phase: number;
  /** Drive / danger, 0..1. Waveshaping + FM index. */
  drive: number;
}

// Shared waveshaper: a tanh saturator crossfaded against the clean input so
// drive=0 is a pure sine and drive=1 is a hard, spiky, harmonic-rich tone. The
// SAME function shapes the silent auto-demo math so figure and sound agree.
export function shapeSample(x: number, drive: number): number {
  if (drive <= 0) return x;
  const k = 1 + drive * 13;
  const shaped = Math.tanh(k * x) / Math.tanh(k);
  return x * (1 - drive) + shaped * drive;
}

// Build a WaveShaperNode transfer curve from shapeSample.
function makeDriveCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = shapeSample(x, drive);
  }
  return curve;
}

type Win = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

/** Returns a usable AudioContext constructor, or null if unavailable (SSR / old). */
export function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Win;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class ScopeEngine {
  private ctx: AudioContext | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private modOsc: OscillatorNode | null = null;
  private modGain: GainNode | null = null;
  private shaperA: WaveShaperNode | null = null;
  private shaperB: WaveShaperNode | null = null;
  private delayB: DelayNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private master: GainNode | null = null;
  private params: ScopeParams;
  private _running = false;
  private lastCurveDrive = -1;

  readonly sampleCount = 2048;

  constructor(initial: ScopeParams) {
    this.params = { ...initial };
  }

  get running(): boolean {
    return this._running;
  }

  /** Build + start the graph. Must be called from a user gesture. */
  async start(): Promise<boolean> {
    if (this._running) return true;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return false;

    const ctx = new Ctor();
    const p = this.params;

    // Two voices, hard-panned via a channel merger: A -> L (X), B -> R (Y).
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sine";
    oscB.type = "sine";

    const shaperA = ctx.createWaveShaper();
    const shaperB = ctx.createWaveShaper();
    shaperA.curve = makeDriveCurve(p.drive);
    shaperB.curve = makeDriveCurve(p.drive);

    // FM: a modulator drives voice B's frequency for inharmonic buzz at drive.
    const modOsc = ctx.createOscillator();
    modOsc.type = "sine";
    const modGain = ctx.createGain();

    const analyserL = ctx.createAnalyser();
    const analyserR = ctx.createAnalyser();
    analyserL.fftSize = this.sampleCount;
    analyserR.fftSize = this.sampleCount;
    analyserL.smoothingTimeConstant = 0;
    analyserR.smoothingTimeConstant = 0;

    const merger = ctx.createChannelMerger(2);
    const master = ctx.createGain();
    master.gain.value = 0.0001;

    // A chain -> left (merger input 0)
    oscA.connect(shaperA);
    shaperA.connect(analyserL);
    analyserL.connect(merger, 0, 0);
    // B chain -> right (merger input 1). A DelayNode realises a genuine phase
    // offset of voice B relative to A, so rotating `phase` visibly turns the
    // figure even on a clean (drive=0) tone.
    const delayB = ctx.createDelay(0.1);
    oscB.connect(shaperB);
    shaperB.connect(delayB);
    delayB.connect(analyserR);
    analyserR.connect(merger, 0, 1);
    // FM into B
    modOsc.connect(modGain);
    modGain.connect(oscB.frequency);

    merger.connect(master);
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.oscA = oscA;
    this.oscB = oscB;
    this.modOsc = modOsc;
    this.modGain = modGain;
    this.shaperA = shaperA;
    this.shaperB = shaperB;
    this.delayB = delayB;
    this.analyserL = analyserL;
    this.analyserR = analyserR;
    this.master = master;

    this.applyParams(p, ctx.currentTime, 0);

    oscA.start();
    oscB.start();
    modOsc.start();

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    // Gentle fade-in to avoid a click.
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.08);

    this._running = true;
    return true;
  }

  private applyParams(p: ScopeParams, now: number, ramp: number): void {
    const { oscA, oscB, modOsc, modGain, shaperA, shaperB, delayB } = this;
    if (!oscA || !oscB || !modOsc || !modGain || !shaperA || !shaperB || !delayB)
      return;

    const fA = Math.max(20, p.base);
    const fB = Math.max(20, p.base * p.ratio);

    oscA.frequency.setTargetAtTime(fA, now, ramp);
    oscB.frequency.setTargetAtTime(fB, now, ramp);

    // Real phase offset: delay voice B by the fraction of its period given by
    // `phase`. Rotates / opens the Lissajous figure at any drive.
    const delay = Math.min(0.099, p.phase / (Math.PI * 2 * fB));
    delayB.delayTime.setTargetAtTime(delay, now, ramp);

    // FM: modulate voice B at voice A's frequency. Because the ratio is free,
    // the sidebands (fB ± n·fA) land inharmonically → buzzing, dissonant grit
    // that scales with drive.
    modOsc.frequency.setTargetAtTime(fA, now, ramp);
    modGain.gain.setTargetAtTime(p.drive * fB * 4, now, ramp);

    // Rebuilding a 1024-sample curve every frame is wasteful; only do it when
    // drive actually moves.
    if (Math.abs(p.drive - this.lastCurveDrive) > 0.004) {
      const curve = makeDriveCurve(p.drive);
      shaperA.curve = curve;
      shaperB.curve = curve;
      this.lastCurveDrive = p.drive;
    }
  }

  setParams(next: Partial<ScopeParams>): void {
    this.params = { ...this.params, ...next };
    if (this.ctx) this.applyParams(this.params, this.ctx.currentTime, 0.02);
  }

  getParams(): ScopeParams {
    return { ...this.params };
  }

  /** Pull the raw time-domain samples: X = left channel, Y = right channel. */
  readScope(xOut: Float32Array<ArrayBuffer>, yOut: Float32Array<ArrayBuffer>): boolean {
    if (!this.analyserL || !this.analyserR) return false;
    this.analyserL.getFloatTimeDomainData(xOut);
    this.analyserR.getFloatTimeDomainData(yOut);
    return true;
  }

  async dispose(): Promise<void> {
    this._running = false;
    const { master, ctx } = this;
    try {
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      }
    } catch {
      /* ignore */
    }
    for (const n of [this.oscA, this.oscB, this.modOsc]) {
      try {
        n?.stop();
      } catch {
        /* ignore */
      }
    }
    for (const n of [
      this.oscA,
      this.oscB,
      this.modOsc,
      this.modGain,
      this.shaperA,
      this.shaperB,
      this.delayB,
      this.analyserL,
      this.analyserR,
      this.master,
    ]) {
      try {
        n?.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      if (ctx && ctx.state !== "closed") await ctx.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.oscA = this.oscB = this.modOsc = null;
    this.modGain = this.master = null;
    this.shaperA = this.shaperB = null;
    this.delayB = null;
    this.analyserL = this.analyserR = null;
  }
}
