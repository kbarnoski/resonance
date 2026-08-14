// audio.ts — a drifting drone bed whose brightness rises with motion.
//
// A just-intonation drone (shared droneBank) sits calm at rest and opens its
// filter, saturation and level as motion ENERGY climbs, so the piece SOUNDS
// more intense the more you move. A pair of shimmer partials fade in on top for
// the jeweled top-end at breakthrough. EVERYTHING is routed through the shared
// safe master (limiter + brightness cap) — never ctx.destination.

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";

export class VeilbreakAudio {
  readonly context: AudioContext;
  private master: SafeMaster;
  private drone: DroneBank;
  private shimmer: OscillatorNode[] = [];
  private shimmerGain: GainNode;
  private stopped = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.context = new Ctor();
    const ctx = this.context;

    this.master = createSafeMaster(ctx, { gain: 0.8 });

    // Root a touch below A1 for a deep visionary bed; stacked just chord.
    this.drone = startDroneBank(ctx, this.master.input, {
      root: 48.5,
      ratios: [1, 3 / 2, 2, 9 / 4, 3],
      cutoffLow: 190,
      cutoffHigh: 2400,
      peakGain: 0.3,
    });

    // Shimmer: two detuned high partials, gated in by motion energy.
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0.0001;
    const shimLp = ctx.createBiquadFilter();
    shimLp.type = "lowpass";
    shimLp.frequency.value = 5000;
    this.shimmerGain.connect(shimLp);
    shimLp.connect(this.master.input);
    for (const [freq, cents] of [
      [48.5 * 6, -5],
      [48.5 * 8, 6],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(this.shimmerGain);
      osc.start();
      this.shimmer.push(osc);
    }
  }

  /** Drive the whole bed from motion energy (0..1), smoothed by the caller. */
  update(energy: number): void {
    if (this.stopped) return;
    const e = Math.min(1, Math.max(0, energy));
    this.drone.setDrive(e);
    // Shimmer stays silent at rest, blooms toward breakthrough.
    const target = 0.0001 + 0.16 * e * e;
    this.shimmerGain.gain.setTargetAtTime(target, this.context.currentTime, 0.12);
  }

  async resume(): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => {});
    }
  }

  /** Full teardown: fade the bed, stop oscillators, disconnect master, close. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.context.currentTime;
    try {
      this.shimmerGain.gain.cancelScheduledValues(now);
      this.shimmerGain.gain.setValueAtTime(
        Math.max(0.0001, this.shimmerGain.gain.value),
        now,
      );
      this.shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* closing */
    }
    for (const osc of this.shimmer) {
      try {
        osc.stop(now + 0.6);
      } catch {
        /* already stopped */
      }
    }
    this.drone.stop();
    window.setTimeout(() => {
      try {
        this.master.disconnect();
      } catch {
        /* closing */
      }
      if (this.context.state !== "closed") {
        this.context.close().catch(() => {});
      }
    }, 700);
  }
}
