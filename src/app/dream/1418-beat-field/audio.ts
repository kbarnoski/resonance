// ─────────────────────────────────────────────────────────────────────────────
// 1418-beat-field — audio engine (FULLY independent of the render tier).
//
// A 24-oscillator pool = 4 voices × 6 partials. Each oscillator is tuned to a
// partial at  h*f ± h*bt/2  (from field.ts::buildPartials). The music is the
// REAL acoustic beating between the split partials — there is NO LFO faked on
// top; the tremolo/roughness EMERGES from the detune, exactly as it does in air.
// Partial amplitudes fall as ~1/h. A DynamicsCompressor limits the master, whose
// gain ramps 0 → ≤ 0.20 over ~2 s. An optional just-intonation drone bed + void
// reverb sit underneath for the cosmic-ambient lock. Sound works even if every
// GPU tier fails — this class touches no canvas.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { VOICES, PARTIALS, type Partial } from "./field";

const MASTER_PEAK = 0.2; // hard cap from the safety brief.
const OSC_COUNT = VOICES * PARTIALS; // 24

// Sum of 1/h amplitudes across the whole pool, for headroom normalization.
const AMP_SUM = (() => {
  let s = 0;
  for (let v = 0; v < VOICES; v++) for (let h = 1; h <= PARTIALS; h++) s += 1 / h;
  return s;
})();

export class BeatFieldAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private driveGain: GainNode; // scales the whole beating-osc bank by drive
  private oscs: OscillatorNode[] = [];
  private oscGains: GainNode[] = [];
  private drone: DroneBank;
  private reverb: VoidReverb;
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 2.0);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -16;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);

    // Cosmic-ambient bed under the beating bank (low drive; the oscs lead).
    this.reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.8, wet: 0.4 });
    this.reverb.output.connect(this.limiter);

    this.driveGain = ctx.createGain();
    this.driveGain.gain.value = 0.35;
    this.driveGain.connect(this.reverb.input);

    // The 24 beating oscillators. Tuned/leveled per frame by setState().
    for (let i = 0; i < OSC_COUNT; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 220;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(this.driveGain);
      osc.start();
      this.oscs.push(osc);
      this.oscGains.push(g);
    }

    this.drone = startDroneBank(ctx, this.reverb.input, {
      root: 55,
      peakGain: 0.08,
      cutoffLow: 160,
      cutoffHigh: 1800,
    });
  }

  /**
   * Retune + relevel the pool from the current partials and drive. Smooth glides
   * (setTargetAtTime) keep dragging bt from zippering. The beating is emergent.
   */
  setState(partials: Partial[], drive: number, intensity: number): void {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    const d = Math.min(1, Math.max(0, drive));
    const n = Math.min(OSC_COUNT, partials.length);
    for (let i = 0; i < n; i++) {
      const p = partials[i];
      this.oscs[i].frequency.setTargetAtTime(p.freq, now, 0.02);
      // Per-osc level ~ amp/headroom; a touch more drive lifts the whole bank.
      const level = (p.amp / AMP_SUM) * 0.85;
      this.oscGains[i].gain.setTargetAtTime(level, now, 0.03);
    }
    // Drive sets overall loudness; the drone/reverb open a little at the howl.
    this.driveGain.gain.setTargetAtTime(0.25 + d * 0.6, now, 0.08);
    this.drone.setDrive(0.15 + intensity * 0.5);
    this.reverb.setWet(0.4 + intensity * 0.25);
  }

  /** Fade + tear down every node. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    this.drone.stop();
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* ctx closing */
    }
    const killAt = now + 0.6;
    for (const osc of this.oscs) {
      try {
        osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  }
}
