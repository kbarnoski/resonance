// ─────────────────────────────────────────────────────────────────────────────
// 3080 · Mycelium — audio garden.
//
// A garden of continuous-pitch sympathetic voices — NEVER quantised to a scale.
// Pitch is always a smooth function of a strand's length or vertical position,
// so the web sings its own geometry. Three gestures, three sounds:
//
//   plantSpore(y01)   — a soft low voice is born (slow attack).
//   branch(x01, y01)  — a branching event adds a bright shimmer partial.
//   pluck(len01, y01) — touching a living strand rings it: fast attack / long
//                       decay, a sympathetic sine + a fifth-ish overtone.
//
// Under everything: the shared just-intonation drone bed, its drive fed by the
// web's total extent, through a convolution void. Everything sums into a master
// gain (<= 0.15) → tanh soft-clip → limiter → destination.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";

/** Odd-symmetric tanh-ish soft-clip so the master can never spit harsh peaks. */
function makeSoftClip(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6);
  }
  return curve;
}

export class MyceliumAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private clip: WaveShaperNode;
  private limiter: DynamicsCompressorNode;
  private voiceBus: GainNode; // dry voices
  private drone: DroneBank | null = null;
  private verb: VoidReverb | null = null;
  private active = 0; // live transient voices (polyphony guard)
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.14; // <= 0.15, house ceiling

    this.clip = ctx.createWaveShaper();
    this.clip.curve = makeSoftClip();
    this.clip.oversample = "2x";

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;

    // voiceBus → master ; master → clip → limiter → destination
    this.voiceBus.connect(this.master);
    this.master.connect(this.clip);
    this.clip.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  start(): void {
    // Ambient bed: a calm low just chord + a vast void tail.
    this.verb = createVoidReverb(this.ctx, { seconds: 5.5, decay: 2.6, wet: 0.42 });
    this.verb.output.connect(this.master);

    this.drone = startDroneBank(this.ctx, this.master, {
      root: 48.5,
      ratios: [1, 3 / 2, 2, 9 / 4, 3],
      peakGain: 0.06,
    });
    // Feed voices into the void as well, so plucks bloom into the room.
    this.voiceBus.connect(this.verb.input);
  }

  /** Web extent → drone drive (0..1). Called from the render loop, throttled. */
  setExtent(drive01: number): void {
    if (this.disposed) return;
    this.drone?.setDrive(Math.max(0, Math.min(1, drive01)));
  }

  private canVoice(): boolean {
    return !this.disposed && this.active < 24;
  }

  /** Continuous pitch: map a 0..1 value across ~2.4 octaves above a low root. */
  private freqFrom(v: number, root: number): number {
    return root * Math.pow(2, Math.max(0, Math.min(1, v)) * 2.4);
  }

  /** A spore is planted: a soft, slow low voice fades up and away. */
  plantSpore(y01: number): void {
    if (!this.canVoice()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Lower on screen → deeper. Continuous, never snapped.
    const f = this.freqFrom(1 - y01, 70);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;

    const sub = ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = f * 0.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

    const subG = ctx.createGain();
    subG.gain.value = 0.5;
    sub.connect(subG);
    subG.connect(g);
    osc.connect(g);
    g.connect(this.voiceBus);

    this.active++;
    osc.start(now);
    sub.start(now);
    osc.stop(now + 3.6);
    sub.stop(now + 3.6);
    const done = () => {
      this.active--;
      g.disconnect();
    };
    osc.onended = done;
  }

  /** A branch point forms: a brief bright shimmer partial, panned by x. */
  branch(x01: number, y01: number, gain: number): void {
    if (!this.canVoice()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const f = this.freqFrom(1 - y01, 320);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;

    const g = ctx.createGain();
    const amp = 0.02 * Math.max(0, Math.min(1, gain));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(amp + 0.0001, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, x01 * 2 - 1));

    osc.connect(g);
    g.connect(pan);
    pan.connect(this.voiceBus);

    this.active++;
    osc.start(now);
    osc.stop(now + 0.7);
    osc.onended = () => {
      this.active--;
      g.disconnect();
      pan.disconnect();
    };
  }

  /**
   * A living strand is plucked: fast attack, long sympathetic decay. Pitch is a
   * continuous function of the strand's length + height; a soft fifth-ish
   * overtone rings above it. This is how you PLAY the web you grew.
   */
  pluck(len01: number, y01: number, x01: number): void {
    if (!this.canVoice()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Longer + higher strands ring brighter. Continuous mapping.
    const f = this.freqFrom((1 - y01) * 0.6 + len01 * 0.4, 96);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;

    const over = ctx.createOscillator();
    over.type = "sine";
    // A non-integer overtone keeps it sympathetic, not a hard consonance.
    over.frequency.value = f * 2.94;

    const overG = ctx.createGain();
    overG.gain.value = 0.28;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.11, now + 0.006); // fast attack
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8); // slow decay

    // A gentle lowpass that closes as the pluck decays → a plucked-string feel.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), now);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), now + 2.2);
    lp.Q.value = 1.4;

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, x01 * 2 - 1));

    over.connect(overG);
    overG.connect(g);
    osc.connect(g);
    g.connect(lp);
    lp.connect(pan);
    pan.connect(this.voiceBus);

    this.active++;
    osc.start(now);
    over.start(now);
    osc.stop(now + 3.0);
    over.stop(now + 3.0);
    osc.onended = () => {
      this.active--;
      g.disconnect();
      lp.disconnect();
      pan.disconnect();
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.drone?.stop();
    } catch {
      /* ctx closing */
    }
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } catch {
      /* ignore */
    }
    // Give the fade a moment, then close.
    await new Promise((r) => setTimeout(r, 450));
    try {
      if (this.ctx.state !== "closed") await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
