// ─────────────────────────────────────────────────────────────────────────────
// 1257-lattice/audio.ts — the rising "ascent" audio bed.
//
//   A genuinely endless-rising Shepard-Risset glissando (dir +1) intensifies
//   across the phase arc, laid over a just-intonation drone bank whose lowpass
//   opens with drive — both routed through the code-generated "void" convolution
//   reverb, then a master gain (<=0.4) into a DynamicsCompressor limiter. The
//   AudioContext is created only on the Begin gesture; teardown is complete.
//
//   All three engines come from the shared _shared/psych toolkit — this file
//   only wires and drives them.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

export class AscentAudio {
  private ctx: AudioContext | null = null;
  private shepard: ShepardEngine | null = null;
  private drone: DroneBank | null = null;
  private reverb: VoidReverb | null = null;
  private stopped = false;

  get running(): boolean {
    return !!this.ctx && !this.stopped;
  }

  async start(): Promise<void> {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("AudioContext unavailable");
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();

    // Master chain: reverb bus -> master gain -> limiter -> destination.
    const master = ctx.createGain();
    master.gain.value = 0.4; // <= 0.45 hard cap

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;

    const reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.4 });

    master.connect(limiter);
    limiter.connect(ctx.destination);
    reverb.output.connect(master);

    const shepard = startShepard(ctx, reverb.input, { dir: 1, peakGain: 0.42 });
    const drone = startDroneBank(ctx, reverb.input, { root: 55, peakGain: 0.3 });

    this.ctx = ctx;
    this.reverb = reverb;
    this.shepard = shepard;
    this.drone = drone;
    this.stopped = false;
  }

  /** Advance the glissando and set the shared intensity. Call once per frame. */
  update(dtSec: number, drive: number): void {
    if (this.stopped) return;
    const d = Math.max(0, Math.min(1, drive));
    this.shepard?.step(dtSec);
    this.shepard?.setDrive(d);
    this.drone?.setDrive(d);
    // Void tail blooms as the realm coheres.
    this.reverb?.setWet(0.35 + 0.35 * d);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.shepard?.stop();
    this.drone?.stop();
    const ctx = this.ctx;
    this.shepard = null;
    this.drone = null;
    this.reverb = null;
    if (ctx) {
      window.setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => { /* closing */ });
      }, 900);
    }
    this.ctx = null;
  }
}
