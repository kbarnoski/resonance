// audio.ts — the strange attractor as composer.
//
// THE SIGNATURE: a delayed-reader canon. Four voices read the SAME trajectory
// history buffer at staggered simulated-time delays (0 / 1.5 / 3.0 / 4.5 s), each
// transposed to a different just-intonation interval. Because the underlying line
// (Thomas' attractor) is deterministic but aperiodic, this is a strict canon over
// a melody that NEVER exactly repeats.
//
// Per voice, from its delayed read-head sample:
//   • x → JI pitch  (quantised to a small just scale over a root ~110–220 Hz)
//   • z → filter cutoff
//   • y → stereo pan
// A note is triggered on a ZERO-CROSSING of the voice's x coordinate (so notes
// are musically spaced, not one-per-frame). Each note is a short 2-op FM pluck
// with an exponential envelope; polyphony is capped with scheduled cleanup.
//
// The whole voice mix routes through the shared void reverb → compressor →
// destination. A quiet drone bank sits underneath as the void's continuous bed,
// driven by overall trajectory speed.

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import type { ThomasAttractor, TrajPoint } from "./attractor";

/** Just-intonation scale degrees (ratios within an octave). */
const JI_SCALE = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];

/** The four canon voices: staggered delays + JI transpositions of the root. */
export interface VoiceSpec {
  delay: number; // seconds behind the live head
  transpose: number; // ratio multiplied onto the root
  hue: number; // 0..1 for the visual read-head marker
}

export const VOICES: VoiceSpec[] = [
  { delay: 0.0, transpose: 1, hue: 0.55 }, // cyan — lead
  { delay: 1.5, transpose: 3 / 2, hue: 0.72 }, // violet — fifth
  { delay: 3.0, transpose: (5 / 4) * 2, hue: 0.9, }, // magenta — third + octave
  { delay: 4.5, transpose: (3 / 2) * 2, hue: 0.13 }, // gold — fifth + octave
];

const ROOT_HZ = 138.6; // ~C#3, sits in the 110–220 band

/** State the audio engine exposes to the renderer for read-head markers. */
export interface ReadHead {
  point: TrajPoint | null;
  hue: number;
}

function quantiseToJI(x: number, root: number, transpose: number): number {
  // Map x (roughly -6..6 for Thomas) → an octave index + scale degree.
  const norm = (x + 6) / 12; // 0..1-ish
  const clamped = Math.min(0.999, Math.max(0, norm));
  const span = 3; // octaves of range
  const total = clamped * span * JI_SCALE.length;
  const octave = Math.floor(total / JI_SCALE.length);
  const degree = Math.floor(total % JI_SCALE.length);
  const ratio = JI_SCALE[degree] * Math.pow(2, octave);
  return root * transpose * ratio;
}

export class CanonEngine {
  readonly ctx: AudioContext;
  private attractor: ThomasAttractor;
  private drone: DroneBank;
  private reverb: VoidReverb;
  private comp: DynamicsCompressorNode;
  private voiceBus: GainNode;

  // Per-voice state.
  private prevX: number[] = VOICES.map(() => 0);
  private lastNoteAt: number[] = VOICES.map(() => -1);
  private readHeads: ReadHead[] = VOICES.map((v) => ({ point: null, hue: v.hue }));

  // Active voice cleanup bookkeeping.
  private activeCount = 0;
  private readonly maxPoly = 8;

  // Simulation stepping.
  private stepInterval: number | null = null;
  private smoothedSpeed = 0;

  private constructor(ctx: AudioContext, attractor: ThomasAttractor) {
    this.ctx = ctx;
    this.attractor = attractor;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;

    this.reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.4, wet: 0.42 });
    this.reverb.output.connect(this.comp);
    this.comp.connect(ctx.destination);

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 0.9;
    this.voiceBus.connect(this.reverb.input);

    // Quiet continuous drone bed under everything.
    this.drone = startDroneBank(ctx, this.reverb.input, {
      root: ROOT_HZ / 2,
      ratios: [1, 3 / 2, 2, 5 / 2],
      cutoffLow: 180,
      cutoffHigh: 1400,
      peakGain: 0.14,
    });
    this.drone.setDrive(0.2);
  }

  static async create(attractor: ThomasAttractor): Promise<CanonEngine> {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();
    return new CanonEngine(ctx, attractor);
  }

  /** Begin the deterministic simulation clock (drives audio + history growth). */
  start(): void {
    if (this.stepInterval !== null) return;
    // Advance the attractor on a steady timer (independent of rAF) so the score
    // keeps composing even if the tab throttles rendering.
    const stepsPerTick = 3;
    this.stepInterval = window.setInterval(() => {
      for (let i = 0; i < stepsPerTick; i++) this.attractor.step();
      this.tick();
    }, 16);
  }

  /** Called each sim tick: read the canon, trigger zero-crossing notes. */
  private tick(): void {
    const now = this.ctx.currentTime;
    const headTime = this.attractor.timeNow;

    // Overall speed drives the drone + reverb wet (autonomous swell).
    const latest = this.attractor.latest();
    const spd = Math.min(
      1,
      (Math.abs(Math.sin(latest.y) - this.attractor.getB() * latest.x) +
        Math.abs(Math.sin(latest.z) - this.attractor.getB() * latest.y) +
        Math.abs(Math.sin(latest.x) - this.attractor.getB() * latest.z)) /
        3,
    );
    this.smoothedSpeed += (spd - this.smoothedSpeed) * 0.05;
    this.drone.setDrive(0.15 + 0.5 * this.smoothedSpeed);
    this.reverb.setWet(0.36 + 0.22 * (1 - this.smoothedSpeed));

    for (let vi = 0; vi < VOICES.length; vi++) {
      const spec = VOICES[vi];
      const readTime = headTime - spec.delay;
      const p = this.attractor.sampleAtTime(readTime);
      this.readHeads[vi].point = p;
      if (!p) continue;

      const prev = this.prevX[vi];
      const cur = p.x;
      this.prevX[vi] = cur;

      // Zero-crossing of x (rising) → note-on, with a min spacing guard.
      const crossed = prev <= 0 && cur > 0;
      const sinceLast = now - this.lastNoteAt[vi];
      if (crossed && sinceLast > 0.14 && this.activeCount < this.maxPoly) {
        this.triggerNote(vi, p);
        this.lastNoteAt[vi] = now;
      }
    }
  }

  private triggerNote(vi: number, p: TrajPoint): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const spec = VOICES[vi];

    const freq = quantiseToJI(p.x, ROOT_HZ, spec.transpose);
    // z → cutoff (map roughly -6..6 → 400..5200 Hz).
    const cutoff = 400 + Math.min(1, Math.max(0, (p.z + 6) / 12)) * 4800;
    // y → pan (-1..1).
    const pan = Math.max(-1, Math.min(1, (Math.sin(p.y) )));

    // 2-op FM pluck.
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = freq * 2.0; // 2:1 ratio → clangy pluck
    const modGain = ctx.createGain();
    const modDepth = freq * 1.6;
    modGain.gain.value = modDepth;
    modGain.gain.setTargetAtTime(modDepth * 0.15, now, 0.12); // FM index decays
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 2;

    const env = ctx.createGain();
    const peak = 0.18 + 0.12 * (vi === 0 ? 1 : 0.7);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    const dur = 0.9 + 0.6 * (vi / VOICES.length);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    carrier.connect(filter);
    filter.connect(env);
    env.connect(panner);
    panner.connect(this.voiceBus);

    carrier.start(now);
    modulator.start(now);
    const stopAt = now + dur + 0.05;
    carrier.stop(stopAt);
    modulator.stop(stopAt);

    this.activeCount++;
    const cleanup = () => {
      this.activeCount = Math.max(0, this.activeCount - 1);
      try {
        carrier.disconnect();
        modulator.disconnect();
        modGain.disconnect();
        filter.disconnect();
        env.disconnect();
        panner.disconnect();
      } catch {
        /* already gone */
      }
    };
    carrier.onended = cleanup;
  }

  /** Read-head markers for the renderer. */
  heads(): ReadHead[] {
    return this.readHeads;
  }

  activeVoices(): number {
    return this.activeCount;
  }

  async dispose(): Promise<void> {
    if (this.stepInterval !== null) {
      clearInterval(this.stepInterval);
      this.stepInterval = null;
    }
    try {
      this.drone.stop();
    } catch {
      /* closing */
    }
    // Give tails a moment, then close.
    await new Promise((r) => setTimeout(r, 120));
    try {
      this.voiceBus.disconnect();
      this.reverb.output.disconnect();
      this.comp.disconnect();
    } catch {
      /* closing */
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
