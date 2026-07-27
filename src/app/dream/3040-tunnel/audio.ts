// ─────────────────────────────────────────────────────────────────────────────
// 3040 · tunnel — audio.ts
//
// The sound of the passage. Three shared psych-kit voices wired into one master
// limiter, driven by the two piloting scalars the page computes each frame:
//
//   approach  (0..1) — how far you have committed toward the being-of-light.
//   timeScale (0..1) — the NDE time-dilation: 1 = flying, ~0.1 = near-stillness.
//
// The signature is that image AND sound dilate together. The page calls step()
// with the ALREADY-time-dilated dt (real dt × timeScale), so the Shepard–Risset
// descent glissando slows exactly as the visual clock slows. A master lowpass
// muffles the whole bed as time dilates, so stillness sounds like sinking into
// syrup, and any input blooms it back to clarity.
//
//   approach  → Shepard descent rate + brightness, drone lowpass opens (brighter
//               toward the light), void reverb dries out (less cavern near light).
//   timeScale → master lowpass cutoff (muffle when still) + the glide's own rate.
//
// No microphone, no network. AudioContext is created only from the Start gesture.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import {
  createVoidReverb,
  type VoidReverb,
} from "../_shared/psych/convolutionVoid";
import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";

export class TunnelAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private dilationLP: BiquadFilterNode;
  private limiter: DynamicsCompressorNode;
  private drone: DroneBank;
  private verb: VoidReverb;
  private shepard: ShepardEngine;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    // Master bus: gain (kept low) → dilation lowpass → limiter → speakers.
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.14, now + 3);

    // The time-dilation muffle: closes toward a dark, syrupy filter as time
    // slows, opens to clarity as you move. Independent of the light axis.
    this.dilationLP = ctx.createBiquadFilter();
    this.dilationLP.type = "lowpass";
    this.dilationLP.frequency.value = 5200;
    this.dilationLP.Q.value = 0.6;

    // A gentle brickwall so the swells never clip.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master.connect(this.dilationLP);
    this.dilationLP.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // A vast, slow cavern so the descent hangs and blooms.
    this.verb = createVoidReverb(ctx, { seconds: 7, decay: 2.3, wet: 0.7 });
    this.verb.output.connect(this.master);

    // A low, pure-ratio sub-floor drone. Its lowpass OPENS toward the light.
    this.drone = startDroneBank(ctx, this.verb.input, {
      root: 46,
      ratios: [1, 3 / 2, 2, 5 / 2, 3],
      cutoffLow: 140,
      cutoffHigh: 2200,
      peakGain: 0.28,
    });

    // The endless-descent carrier — the plunge down the tunnel (dir: -1).
    this.shepard = startShepard(ctx, this.verb.input, {
      dir: -1,
      peakGain: 0.16,
      baseRate: 0.01,
      driveRate: 0.14,
    });
  }

  /** Map the two piloting scalars onto every voice. */
  setState(approach: number, timeScale: number): void {
    const a = Math.min(1, Math.max(0, approach));
    const ts = Math.min(1, Math.max(0, timeScale));
    const now = this.ctx.currentTime;

    this.shepard.setDrive(a);
    this.drone.setDrive(0.12 + a * 0.88); // opens (brighter) toward the light
    this.verb.setWet(0.74 - a * 0.44); // wettest in the void, dries near the light

    // Time-dilation muffle: still → ~380 Hz (submerged), flying → ~6.5 kHz.
    const cutoff = 380 + ts * ts * 6100;
    this.dilationLP.frequency.setTargetAtTime(cutoff, now, 0.12);
  }

  /** Advance the descent glissando with the ALREADY-time-dilated dt. */
  step(dilatedDt: number): void {
    this.shepard.step(dilatedDt);
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
      this.master.gain.setValueAtTime(
        Math.max(0.0001, this.master.gain.value),
        now,
      );
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* ctx closing */
    }
  }
}
