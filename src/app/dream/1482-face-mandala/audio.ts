// audio.ts — the affect-coupled synth voice of the mandala (Web Audio).
//
// Signal path:  drone bank + bells → masterGain → DynamicsCompressor → out.
// The master gain ramps 0 → 0.2 on start; a compressor keeps peaks safe.
//
//   jawOpen      → opens a lowpass on the drone AND swells its level.
//   smile        → warmer / brighter (raises the drone's upper partials).
//   browInnerUp  → adds an upper harmonic partial (a lift in the overtone).
//   browDown     → darkens (pulls everything down a touch).
//   blink        → a throttled bell strike.
//   pucker       → focuses the drone (narrows toward the fundamental).
//
// Voice safety: bells are pooled and capped; oldest is stolen past the cap.

const MAX_BELLS = 12; // < 14 total including the 6 drone oscillators

// Just-intoned overtone ratios for the drone bank.
const DRONE_RATIOS = [1, 1.5, 2, 3, 4, 5];
// A warm pentatonic (ratios over the root) for bell strikes.
const BELL_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 15 / 8 * 2];

interface Bell {
  osc: OscillatorNode;
  mod: OscillatorNode;
  gain: GainNode;
  startedAt: number;
}

export class FaceAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;

  // drone
  private droneFilter: BiquadFilterNode;
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private partialGains: GainNode[] = [];

  private bells: Bell[] = [];
  private disposed = false;
  private baseHz = 98; // G2

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.2, now + 2.2);
    this.master.connect(this.comp);

    // drone: overtone bank → lowpass → droneGain → master
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 300;
    this.droneFilter.Q.value = 0.9;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);

    DRONE_RATIOS.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sawtooth" : "triangle";
      osc.frequency.value = this.baseHz * ratio;
      osc.detune.value = (i - 2.5) * 4; // gentle chorus spread
      const g = ctx.createGain();
      // upper partials start quiet — brow/smile lift them
      g.gain.value = i < 2 ? 0.5 : 0.12;
      osc.connect(g);
      g.connect(this.droneFilter);
      osc.start(now);
      this.droneOscs.push(osc);
      this.partialGains.push(g);
    });
  }

  /** Feed the smoothed facial-affect drive each frame. */
  update(
    jaw: number,
    smile: number,
    brow: number,
    browDown: number,
    pucker: number,
    presence: number,
  ): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const t = 0.08; // smoothing time-constant

    // jawOpen opens the filter; browDown darkens; pucker narrows.
    const cutoff =
      260 +
      jaw * 3200 * (1 - browDown * 0.5) -
      pucker * 400 +
      smile * 900;
    this.droneFilter.frequency.setTargetAtTime(
      Math.max(140, cutoff),
      now,
      t,
    );
    this.droneFilter.Q.setTargetAtTime(0.7 + pucker * 3.5, now, t);

    // level swells with jaw + presence
    const lvl = (0.06 + jaw * 0.5 + presence * 0.12) * (0.5 + presence * 0.5);
    this.droneGain.gain.setTargetAtTime(lvl, now, t);

    // brow + smile raise the upper partials (index >= 2)
    this.partialGains.forEach((g, i) => {
      if (i < 2) return;
      const lift = i >= 4 ? brow : smile;
      g.gain.setTargetAtTime(0.06 + lift * 0.28, now, t);
    });
  }

  /** A soft bell strike (throttled by the caller). */
  strike(intensity: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    if (this.bells.length >= MAX_BELLS) {
      const oldest = this.bells.shift();
      if (oldest) this.stopBell(oldest, now);
    }
    const ratio = BELL_RATIOS[Math.floor(Math.random() * BELL_RATIOS.length)];
    const freq = this.baseHz * 4 * ratio; // an octave-ish above the drone

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    // a touch of FM for a bell-like partial
    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.76;
    const modGain = this.ctx.createGain();
    modGain.gain.value = freq * 1.4;
    mod.connect(modGain);
    modGain.connect(osc.frequency);

    const g = this.ctx.createGain();
    const peak = 0.06 + intensity * 0.1;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    mod.start(now);
    osc.stop(now + 1.7);
    mod.stop(now + 1.7);

    const bell: Bell = { osc, mod, gain: g, startedAt: now };
    osc.onended = () => {
      const idx = this.bells.indexOf(bell);
      if (idx >= 0) this.bells.splice(idx, 1);
      try {
        g.disconnect();
        modGain.disconnect();
      } catch {
        /* already gone */
      }
    };
    this.bells.push(bell);
  }

  private stopBell(b: Bell, now: number): void {
    try {
      b.gain.gain.cancelScheduledValues(now);
      b.gain.gain.setTargetAtTime(0.0001, now, 0.05);
      b.osc.stop(now + 0.2);
      b.mod.stop(now + 0.2);
    } catch {
      /* already stopped */
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.1);
    } catch {
      /* ignore */
    }
    this.droneOscs.forEach((o) => {
      try {
        o.stop(now + 0.3);
      } catch {
        /* ignore */
      }
    });
    this.bells.forEach((b) => this.stopBell(b, now));
    this.bells = [];
    // close the context shortly after the fade so tails don't click.
    window.setTimeout(() => {
      if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    }, 400);
  }
}

export async function makeAudio(ctx: AudioContext): Promise<FaceAudio> {
  if (ctx.state === "suspended") await ctx.resume();
  return new FaceAudio(ctx);
}
