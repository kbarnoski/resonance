// ─────────────────────────────────────────────────────────────────────────────
// 3056 · clearlight — audio.ts
//
// The sound of the clear light: a low just-intonation drone bed routed through
// a long convolution "void" tail, with a barely-there Shepard/Risset shimmer
// underneath for boundlessness. All three come from the shared psych kit; this
// module only wires them and maps the single breath scalar onto their drives so
// the drone swells on the inhale and softens through the reverb on the exhale.
//
// It also owns the microphone analyser (when granted) and exposes readLevel(),
// so the page can feed one RMS number per frame into the breath follower.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import {
  createVoidReverb,
  type VoidReverb,
} from "../_shared/visionary/convolutionVoid";
import { startShepard, type ShepardEngine } from "../_shared/visionary/shepard";

export class BreathAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private drone: DroneBank;
  private verb: VoidReverb;
  private shepard: ShepardEngine;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.72, ctx.currentTime + 3);
    this.master.connect(ctx.destination);

    // A vast, slow void so every swell blooms and hangs.
    this.verb = createVoidReverb(ctx, { seconds: 7, decay: 2.2, wet: 0.7 });
    this.verb.output.connect(this.master);

    // A low, pure-ratio bed — weightless at rest, warming as it opens.
    this.drone = startDroneBank(ctx, this.verb.input, {
      root: 48.5,
      ratios: [1, 3 / 2, 2, 9 / 4, 3],
      cutoffLow: 150,
      cutoffHigh: 1500,
      peakGain: 0.26,
    });

    // Endless-ascent shimmer at very low gain → "boundlessness", through the void.
    this.shepard = startShepard(ctx, this.verb.input, {
      peakGain: 0.11,
      baseRate: 0.012,
      driveRate: 0.05,
    });
  }

  /** Attach a granted mic stream for the breath envelope (no monitoring path). */
  attachMic(stream: MediaStream): void {
    const src = this.ctx.createMediaStreamSource(stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.6;
    src.connect(an); // deliberately NOT connected onward — no feedback / monitoring
    this.analyser = an;
    this.buf = new Float32Array(an.fftSize);
  }

  /** True once a mic analyser is attached. */
  get hasMic(): boolean {
    return this.analyser !== null;
  }

  /** Current RMS amplitude from the mic, or 0 if no mic. */
  readLevel(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = this.buf[i];
      sum += v * v;
    }
    return Math.sqrt(sum / this.buf.length);
  }

  /** Map the single breath scalar onto every voice. */
  setBreath(breath: number): void {
    const b = Math.min(1, Math.max(0, breath));
    this.drone.setDrive(0.15 + b * 0.85); // swells on inhale
    this.shepard.setDrive(b);
    this.verb.setWet(0.6 + b * 0.16); // deeper breath → more bloom
  }

  /** Advance the endless-ascent shimmer. Call once per frame. */
  step(dt: number): void {
    this.shepard.step(dt);
  }

  /** Full teardown — fades everything and stops all oscillators. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.drone.stop();
    } catch {
      /* ctx closing */
    }
    try {
      this.shepard.stop();
    } catch {
      /* ctx closing */
    }
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* ctx closing */
    }
  }
}
