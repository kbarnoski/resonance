// ════════════════════════════════════════════════════════════════════════════
// audio.ts — the generative bed for 1862-strobe-atlas.
//
// A soft detuned drone carrier (from _shared/psych/droneBank.ts) for the
// intense-geometric mood, plus an OPT-IN isochronic pulse whose rate is locked
// to the safe photic rate so, when the Photic-pulse mode is engaged, sound and
// the safe luminance flicker breathe together. Autonomous — no mic, no FFT.
//
// Signal chain:  drone + pulse  ->  master (<= 0.2)  ->  compressor  ->  dest
// ~1s master fade-in; ctx.close() on teardown.
// ════════════════════════════════════════════════════════════════════════════

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

const MASTER_GAIN = 0.18; // <= 0.2, per the safety/loudness ceiling

export class AtlasAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private drone: DroneBank | null = null;

  // isochronic pulse voice (silent until the opt-in Photic pulse is engaged)
  private pulseCarrier: OscillatorNode | null = null;
  private pulseGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoDepth: GainNode | null = null;

  private started = false;
  private disposed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(comp);
  }

  /** Unlock + start the bed. Call from a user gesture. */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.started = true;

    // detuned drone carrier -> master
    this.drone = startDroneBank(this.ctx, this.master, {
      root: 55,
      peakGain: 0.9,
      cutoffLow: 180,
      cutoffHigh: 1400,
    });
    this.drone.setDrive(0.32); // calm sub with a little air

    // isochronic pulse voice, wired but silent until setPulse(true, hz)
    const now = this.ctx.currentTime;

    this.pulseCarrier = this.ctx.createOscillator();
    this.pulseCarrier.type = "triangle";
    this.pulseCarrier.frequency.value = 220; // A3, a gentle bell-ish tone

    this.pulseGain = this.ctx.createGain();
    this.pulseGain.gain.value = 0; // fully off by default

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 1.5; // placeholder; locked to photic rate on enable

    this.lfoDepth = this.ctx.createGain();
    this.lfoDepth.gain.value = 0; // no modulation until enabled

    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.pulseGain.gain);
    this.pulseCarrier.connect(this.pulseGain);
    this.pulseGain.connect(this.master);

    this.pulseCarrier.start();
    this.lfo.start();

    // ~1s master fade-in
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(MASTER_GAIN, now + 1.0);
  }

  /** Engage/kill the isochronic pulse, locked to the safe photic rate (Hz). */
  setPulse(on: boolean, hz: number): void {
    if (!this.started || this.disposed) return;
    if (!this.pulseGain || !this.lfo || !this.lfoDepth) return;
    const now = this.ctx.currentTime;
    if (on) {
      this.lfo.frequency.setTargetAtTime(Math.max(0.1, hz), now, 0.1);
      // pulse amplitude oscillates 0 -> ~0.18 (offset + depth), gentle isochronic
      this.pulseGain.gain.setTargetAtTime(0.09, now, 0.2);
      this.lfoDepth.gain.setTargetAtTime(0.09, now, 0.2);
      this.drone?.setDrive(0.5);
    } else {
      this.pulseGain.gain.setTargetAtTime(0, now, 0.15);
      this.lfoDepth.gain.setTargetAtTime(0, now, 0.15);
      this.drone?.setDrive(0.32);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.drone?.stop();
      const stopAt = this.ctx.currentTime + 0.2;
      for (const n of [this.pulseCarrier, this.lfo]) {
        try {
          n?.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
    } catch {
      /* best-effort */
    }
    // close after the short fade so we don't cut with a click
    window.setTimeout(() => {
      void this.ctx.close().catch(() => {});
    }, 400);
  }
}
