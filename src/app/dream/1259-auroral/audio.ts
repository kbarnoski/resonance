// ════════════════════════════════════════════════════════════════════════════
// audio.ts — the generative cosmic-ambient BED for Auroral (1259)
//
// A boundless-void ambient bed assembled entirely from the shared psych toolkit:
//   • droneBank   — sustained just-intonation drone; drive opens its filter.
//   • shepard     — an endless-ascent shimmer (barber-pole), drive tracks Kp.
//   • voidReverb  — a vast code-generated cistern the whole bed sits inside.
//   • aurora chimes — OPTIONAL sparse bell-like sine "pings": the grid's
//     brightest cells quietly chiming (echoing tremor-core ringing quakes).
//
// Master chain: masterGain (~0.4, faded in) → DynamicsCompressor limiter →
// destination. Gesture-gated: only constructed after a "Begin" click. `drive`
// (0..1, from live aurora intensity) rises → drone brightens, ascent quickens.
// ════════════════════════════════════════════════════════════════════════════

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

// A just-intonation pentatonic over an aurora-cool register for the chimes.
const CHIME_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 15 / 4];
const CHIME_ROOT = 220; // A3

export class AuroraAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private drone: DroneBank;
  private shepard: ShepardEngine;
  private verb: VoidReverb;
  private chimeBus: GainNode;
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // master gain → limiter → destination
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 3.0);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // vast void the whole bed sits inside
    this.verb = createVoidReverb(ctx, { seconds: 6, decay: 2.6, wet: 0.65 });
    this.verb.output.connect(this.master);

    // the sustained drone bed, cool auroral register
    this.drone = startDroneBank(ctx, this.verb.input, {
      root: 55,
      ratios: [1, 3 / 2, 2, 5 / 2, 3],
      peakGain: 0.3,
    });

    // endless-ascent shimmer, cool and high
    this.shepard = startShepard(ctx, this.verb.input, {
      dir: 1,
      peakGain: 0.32,
    });

    // sparse chimes go partly wet, partly dry for presence
    this.chimeBus = ctx.createGain();
    this.chimeBus.gain.value = 0.9;
    this.chimeBus.connect(this.verb.input);
    this.chimeBus.connect(this.master);
  }

  /** 0..1 live aurora intensity → drone brightness + ascent rate. */
  setDrive(d: number): void {
    const drive = Math.min(1, Math.max(0, d));
    this.drone.setDrive(drive);
    this.shepard.setDrive(drive);
  }

  /** Advance the endless glissando; call once per animation frame. */
  step(dt: number): void {
    if (this.stopped) return;
    this.shepard.step(dt);
  }

  /**
   * Ring a soft bell-like sine ping for a bright aurora cell. `energy` 0..1
   * (cell brightness) sets pitch (brighter cell → higher) + level. Kept gentle.
   */
  ping(energy: number): void {
    if (this.stopped) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const e = Math.min(1, Math.max(0, energy));

    // brighter cell → higher note on the pentatonic grid
    const idx = Math.min(
      CHIME_RATIOS.length - 1,
      Math.floor(e * CHIME_RATIOS.length),
    );
    const freq = CHIME_ROOT * CHIME_RATIOS[idx];

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    // a faint shimmering octave partial
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.01;

    const g = ctx.createGain();
    const peak = 0.05 + 0.09 * e;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4 + e * 1.6);

    const g2 = ctx.createGain();
    g2.gain.value = 0.35;

    osc.connect(g);
    osc2.connect(g2);
    g2.connect(g);
    g.connect(this.chimeBus);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 4.2);
    osc2.stop(now + 4.2);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    } catch {
      /* ctx closing */
    }
    this.shepard.stop();
    this.drone.stop();
    // Close the context shortly after the fade so tails don't click.
    window.setTimeout(() => {
      this.ctx.close().catch(() => {});
    }, 800);
  }
}
