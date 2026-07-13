// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the organ half of the see = hear weld.
//
//   Six sustained sine "pipes", one per steerable wave source, tuned to a
//   just-intonation stack (JI_RATIOS). The loudness of pipe i is driven, every
//   frame, by the wave field's energy at source i — the SAME scalar that
//   brightens that source's glow on screen. So the ripple you SEE is literally
//   the amplitude envelope of the tone you HEAR.
//
//   Underneath sits a shared just-intonation drone bed (_shared/psych/droneBank)
//   whose low-pass cutoff OPENS with the plate's propagation speed c — and c is
//   steered by how far you tilt the phone. Tilt harder → faster waves → tighter
//   Chladni figures → brighter drone. Everything runs through a shared cavern
//   reverb (_shared/psych/convolutionVoid).
//
//   Signal path (per the brief's hard limits):
//     pipes + drone → reverb bus → master GainNode (≤0.18) → Compressor → out
//   The AudioContext is created only on the Start gesture; dispose() tears
//   everything down (ramp, stop oscillators, close ctx).
// ─────────────────────────────────────────────────────────────────────────────

import { JI_RATIOS, SOURCE_COUNT } from "./wave";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const ROOT_HZ = 110; // A2 — warm organ root

export class WavefieldOrganAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private reverb: VoidReverb;
  private drone: DroneBank;
  private pipes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private started = false;

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    // master ≤ 0.18 → compressor → destination
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;
    this.comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.comp);

    // shared cavern reverb bus feeding the master
    this.reverb = createVoidReverb(this.ctx, { seconds: 3.6, decay: 3, wet: 0.42 });
    this.reverb.output.connect(this.master);

    // shared JI drone bed, cutoff opened by tilt-driven c
    this.drone = startDroneBank(this.ctx, this.reverb.input, {
      root: 55,
      cutoffLow: 180,
      cutoffHigh: 2400,
      peakGain: 0.22,
    });

    // six sustained pipes, one per source / JI partial
    for (let i = 0; i < SOURCE_COUNT; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = ROOT_HZ * JI_RATIOS[i % JI_RATIOS.length];
      osc.detune.value = (i - SOURCE_COUNT / 2) * 2; // faint chorus spread
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(this.reverb.input);
      this.pipes.push({ osc, gain });
    }
  }

  /** Resume + fade in. Must be called from a user gesture. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      for (const p of this.pipes) p.osc.start();
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0.0001, now);
      this.master.gain.exponentialRampToValueAtTime(0.18, now + 1.4);
    }
  }

  get running(): boolean {
    return this.started && this.ctx.state === "running";
  }

  /** Drive pipe i's loudness from the wave energy at its source (the weld). */
  setPipe(i: number, energy: number): void {
    if (!this.started || i >= this.pipes.length) return;
    const g = this.pipes[i].gain.gain;
    const now = this.ctx.currentTime;
    // higher partials quieter so the root stays the foundation
    const roll = 0.9 / (1 + i * 0.55);
    const target = Math.max(0.0001, Math.min(0.16, energy * roll));
    g.setTargetAtTime(target, now, 0.05);
  }

  /** Tilt magnitude 0..1 → propagation speed → drone cutoff + reverb depth. */
  setSpeed(speedNorm: number): void {
    if (!this.started) return;
    const s = Math.max(0, Math.min(1, speedNorm));
    this.drone.setDrive(s);
    this.reverb.setWet(0.3 + 0.35 * s);
  }

  /** Full teardown: ramp out, stop oscillators, close context. */
  dispose(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    } catch {
      /* ctx closing */
    }
    try {
      this.drone.stop();
    } catch {
      /* ignore */
    }
    for (const p of this.pipes) {
      try {
        p.osc.stop(now + 0.35);
      } catch {
        /* not started */
      }
    }
    window.setTimeout(() => {
      this.ctx.close().catch(() => {
        /* already closed */
      });
    }, 420);
  }
}
