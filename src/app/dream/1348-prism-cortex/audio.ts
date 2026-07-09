// ─────────────────────────────────────────────────────────────────────────────
// 1348-prism-cortex — audio engine.
//
// An additive pad-drone you PLAY. A sustained just-intonation drone bed (shared
// _shared/psych kit) sits underneath; every held note adds a detuned partial on
// top, and a slow Shepard shimmer rises through it all. Everything is summed
// into a void-reverb bus, then hard-limited by a DynamicsCompressor and scaled
// by a master gain ≤ 0.25 with an exponential fade-in — nothing peaks a phone
// speaker or a nervous system.
//
// The whole graph is created only after the user's "Begin" gesture (the caller
// resumes the AudioContext first), so autoplay policy is respected.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import {
  createVoidReverb,
  type VoidReverb,
} from "../_shared/psych/convolutionVoid";
import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";

const MASTER_PEAK = 0.22; // ≤ 0.25 hard cap from the safety brief.

/** midi note number → frequency in Hz (A4 = 69 = 440Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode;
  releasing: boolean;
}

export class PrismAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private bus: GainNode; // dry sum before reverb
  private reverb: VoidReverb;
  private drone: DroneBank;
  private shepard: ShepardEngine;
  private voices = new Map<number, Voice>();
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    // Master gain: exponential fade-in to the capped peak so the onset is a
    // swell, never a jolt.
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 2.5);

    // A brick-ish limiter guards the ears / speaker against summed peaks.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);

    // Everything flows into the reverb bus, then into the limiter.
    this.reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.45 });
    this.reverb.output.connect(this.limiter);

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.reverb.input);

    // Sustained drone bed + Shepard shimmer feed the same bus.
    this.drone = startDroneBank(ctx, this.bus, {
      root: 55,
      peakGain: 0.14,
      cutoffLow: 180,
      cutoffHigh: 2200,
    });
    this.shepard = startShepard(ctx, this.bus, {
      peakGain: 0.1,
      dir: 1,
    });
  }

  /** Add a held detuned partial for this note; velocity sets its level. */
  noteOn(midi: number, velocity: number): void {
    if (this.stopped) return;
    // Retrigger: release any existing voice on this note first.
    this.noteOff(midi);

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = midiToFreq(midi);
    const vel = Math.min(1, Math.max(0, velocity));
    const level = 0.05 + vel * 0.12; // per-voice, stays gentle when summed

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.06);
    gain.connect(this.bus);

    const oscs: OscillatorNode[] = [];
    // Three lightly detuned partials → a shimmering, chorused pad tone.
    const detunes = [-6, 5, 0];
    const types: OscillatorType[] = ["sine", "triangle", "sine"];
    const mults = [1, 1, 2]; // an octave partial for air
    for (let i = 0; i < detunes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = freq * mults[i];
      osc.detune.value = detunes[i];
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.35 : 0.6;
      osc.connect(g);
      g.connect(gain);
      osc.start();
      oscs.push(osc);
    }

    this.voices.set(midi, { oscs, gain, releasing: false });
  }

  /** Release this note's partial with a soft tail. */
  noteOff(midi: number): void {
    const v = this.voices.get(midi);
    if (!v || v.releasing) return;
    v.releasing = true;
    const now = this.ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* ctx closing */
    }
    const killAt = now + 0.6;
    for (const osc of v.oscs) {
      try {
        osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    this.voices.delete(midi);
  }

  /**
   * Drive the evolving parts from overall field/interaction activity (0..1):
   * the drone opens, the reverb blooms, the Shepard glide quickens.
   */
  setActivity(a: number): void {
    if (this.stopped) return;
    const x = Math.min(1, Math.max(0, a));
    this.drone.setDrive(x);
    this.shepard.setDrive(x);
    this.reverb.setWet(0.4 + x * 0.35);
  }

  /** Advance the Shepard glissando; call once per animation frame. */
  step(dt: number): void {
    if (this.stopped) return;
    this.shepard.step(dt);
  }

  /** Fade + tear down every node. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const midi of Array.from(this.voices.keys())) this.noteOff(midi);
    this.drone.stop();
    this.shepard.stop();
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
