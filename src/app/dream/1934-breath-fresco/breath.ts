/**
 * Breath source for 1934 · Breath Fresco.
 *
 * INPUT is a breath *envelope*, never pitch: we read the microphone's
 * time-domain signal, compute a smoothed RMS (loudness), and feed it through a
 * rise / hold / fall breath-stroke state machine. A completed exhale is the
 * event that deposits a stratum into the fresco and opens one drone partial.
 *
 * Two feeds share the EXACT same state machine:
 *   - "mic"    — live RMS from an AnalyserNode.
 *   - "demo"   — a deterministic seeded "ghost breath" generator (mulberry32 +
 *                performance.now) used when the mic is denied OR silent, so the
 *                fresco fills and the drone evolves on its own. The instant a
 *                real breath registers, the live feed takes back over.
 *
 * Determinism: no Math.random / Date.now — mulberry32 seeded with a literal.
 */

/** Small, fast, seedable PRNG. Seed with a literal constant for replayability. */
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

/** Just-intonation ratios over the low fundamental (Radigue-style drone bank). */
export const F0 = 60; // Hz — within the 55–66 Hz window.
export const RATIOS = [
  1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4, 5 / 2, 8 / 3, 3,
  15 / 4, 4, 9 / 2,
] as const;
export const N_PARTIALS = RATIOS.length;

export type BreathState = "idle" | "rise" | "hold" | "fall";
export type BreathFeed = "mic" | "demo" | "denied";

export interface BreathFrame {
  /** Smoothed loudness envelope 0..1 (post-gain, clamped). */
  rms: number;
  state: BreathState;
  feed: BreathFeed;
  /** Partial index to OPEN this frame (exhale just confirmed), else null. */
  openPartial: number | null;
  /** True on the frame a confirmed exhale completes. */
  completedExhale: boolean;
  /** The partial index of the currently-painting exhale, else null. */
  activePartial: number | null;
  /** Deposit descriptor while an exhale paints, else null. */
  deposit: { y: number; intensity: number } | null;
}

const ON = 0.11; // enter a breath
const OFF = 0.05; // leave a breath (hysteresis)
const CONFIRM = 0.17; // peak must exceed this to count as a real exhale
const MIC_GAIN = 6.5; // lift quiet mic breath into the working range
const LIVE_FLOOR = 0.09; // recent mic peak above this ⇒ trust the live feed
const RMS_SMOOTH = 0.8; // envelope EMA

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}
/** Map a breath peak (0..1) to a just-intonation partial index. */
function partialForPeak(peak: number): number {
  return Math.max(0, Math.min(N_PARTIALS - 1, Math.round(peak * (N_PARTIALS - 1))));
}
/** Louder breath ⇒ higher stratum (smaller y = top of the wall). */
function yForPartial(idx: number): number {
  return 0.12 + (1 - idx / (N_PARTIALS - 1)) * 0.76;
}

export class BreathSource {
  private ctx: AudioContext;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private td: Float32Array | null = null;
  private micEnabled = false;
  /** null until enableMic resolves; string ⇒ denied reason. */
  denialReason: string | null = null;

  // Envelope + recent-peak tracking (for silent-mic detection).
  private env = 0;
  private recentPeak = 0;

  // State machine.
  private active = false;
  private confirmed = false;
  private peak = 0;
  private state: BreathState = "idle";
  private curDepositY = 0.5;
  private curPartial = 0;
  private lastRms = 0;

  // Ghost generator.
  private rng = mulberry32(0x9e37_79b1);
  private ghostStart = -1;
  private ghostNext = -1;
  private ghostDur = 0;
  private ghostDepth = 0;
  private ghostPhase = 0;

  breathCount = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  async enableMic(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.stream = stream;
      const src = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      src.connect(analyser);
      // NOT connected to destination — no feedback.
      this.analyser = analyser;
      this.td = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.micEnabled = true;
      this.denialReason = null;
      return true;
    } catch (e) {
      this.denialReason =
        e instanceof Error && e.message
          ? e.message
          : "Microphone unavailable — running the ghost-breath demo.";
      this.micEnabled = false;
      return false;
    }
  }

  private readMicRms(): number {
    const a = this.analyser;
    const td = this.td;
    if (!a || !td) return 0;
    a.getFloatTimeDomainData(td as unknown as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < td.length; i++) sum += td[i] * td[i];
    return clamp01(Math.sqrt(sum / td.length) * MIC_GAIN);
  }

  private ghostRms(tMs: number): number {
    if (this.ghostNext < 0) {
      this.ghostNext = tMs + 700;
    }
    if (tMs >= this.ghostNext) {
      this.ghostStart = tMs;
      this.ghostDur = 2100 + this.rng() * 2600;
      this.ghostDepth = 0.42 + this.rng() * 0.5;
      this.ghostPhase = this.rng() * 6.283;
      const gap = 900 + this.rng() * 1700;
      this.ghostNext = tMs + this.ghostDur + gap;
    }
    let env = 0.015;
    if (this.ghostStart >= 0 && tMs < this.ghostStart + this.ghostDur) {
      const u = (tMs - this.ghostStart) / this.ghostDur;
      const rise = smoothstep(0, 0.28, u);
      const fall = 1 - smoothstep(0.55, 1, u);
      const shape = Math.min(rise, fall);
      const tremor = 0.03 * Math.sin(u * 34 + this.ghostPhase);
      env = 0.015 + this.ghostDepth * shape + tremor;
    }
    return clamp01(env);
  }

  /** Advance the state machine one frame; returns the current breath frame. */
  sample(tMs: number): BreathFrame {
    // Choose feed. Live mic wins when it has recently been loud enough.
    let raw: number;
    let feed: BreathFeed;
    if (this.micEnabled) {
      const mic = this.readMicRms();
      this.recentPeak = Math.max(mic, this.recentPeak * 0.985);
      if (this.recentPeak > LIVE_FLOOR) {
        raw = mic;
        feed = "mic";
      } else {
        raw = this.ghostRms(tMs);
        feed = "demo";
      }
    } else {
      raw = this.ghostRms(tMs);
      feed = "denied";
    }

    // Envelope smoothing.
    this.env = this.env * RMS_SMOOTH + raw * (1 - RMS_SMOOTH);
    const rms = this.env;

    let openPartial: number | null = null;
    let completedExhale = false;
    const rising = rms > this.lastRms + 0.002;
    const falling = rms < this.lastRms - 0.002;

    if (!this.active && rms > ON) {
      this.active = true;
      this.confirmed = false;
      this.peak = rms;
      this.state = "rise";
    } else if (this.active) {
      this.peak = Math.max(this.peak, rms);
      this.state = rising ? "rise" : falling ? "fall" : "hold";
      if (!this.confirmed && this.peak > CONFIRM) {
        this.confirmed = true;
        this.curPartial = partialForPeak(this.peak);
        this.curDepositY = yForPartial(this.curPartial);
        openPartial = this.curPartial;
      }
      if (rms < OFF) {
        if (this.confirmed) {
          this.breathCount += 1;
          completedExhale = true;
        }
        this.active = false;
        this.confirmed = false;
        this.state = "idle";
      }
    } else {
      this.state = "idle";
    }
    this.lastRms = rms;

    const painting = this.active && this.confirmed;
    return {
      rms,
      state: this.state,
      feed,
      openPartial,
      completedExhale,
      activePartial: painting ? this.curPartial : null,
      deposit: painting ? { y: this.curDepositY, intensity: rms } : null,
    };
  }

  dispose(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.td = null;
    this.micEnabled = false;
  }
}
