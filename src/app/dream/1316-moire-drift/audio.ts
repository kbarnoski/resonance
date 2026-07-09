// ─────────────────────────────────────────────────────────────────────────────
// 1316-moire-drift / audio.ts — the audible half of the moiré.
//
//   The star is a detuned oscillator PAIR: osc1 at baseFreq, osc2 at
//   baseFreq + beatHz. Their sum amplitude-beats at exactly beatHz — the SAME
//   number the visual moiré envelope drifts at. Tune the visual detune tighter
//   and you hear the acoustic beats slow toward alignment; loosen it and they
//   speed into roughness. A soft low pulse/transport (0.7–2 Hz, tightening
//   toward the entropy peak) gives rhythm, and a faint Shepard undertow
//   (shared kit) adds an endless downward drift.
//
//   Master gain ≤ 0.28, exponential fade-in ~1.2 s, routed through a
//   DynamicsCompressor limiter. Voice count is fixed and small.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";

const MASTER_PEAK = 0.28;
const BASE_FREQ = 138; // Hz — low, warm register where beats are clearest

export class MoireAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private beatGain: GainNode;
  private osc1: OscillatorNode;
  private osc2: OscillatorNode;
  private oscOct1: OscillatorNode;
  private oscOct2: OscillatorNode;
  private sub: OscillatorNode;
  private pulseGain: GainNode;
  private shepard: ShepardEngine;

  private beatHz = 0.3;
  private pulseHz = 0.85;
  private nextPulse = 0;
  private stopped = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // master -> limiter -> destination
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 1.2);
    this.master.connect(limiter);

    // ── the detuned beat pair (+ a quieter octave pair for body) ──
    const beatFilter = ctx.createBiquadFilter();
    beatFilter.type = "lowpass";
    beatFilter.frequency.value = 900;
    beatFilter.Q.value = 0.6;
    beatFilter.connect(this.master);

    this.beatGain = ctx.createGain();
    this.beatGain.gain.value = 0.5;
    this.beatGain.connect(beatFilter);

    this.osc1 = ctx.createOscillator();
    this.osc2 = ctx.createOscillator();
    this.osc1.type = "sine";
    this.osc2.type = "sine";
    this.osc1.frequency.value = BASE_FREQ;
    this.osc2.frequency.value = BASE_FREQ + this.beatHz;
    this.osc1.connect(this.beatGain);
    this.osc2.connect(this.beatGain);

    const octGain = ctx.createGain();
    octGain.gain.value = 0.16;
    octGain.connect(beatFilter);
    this.oscOct1 = ctx.createOscillator();
    this.oscOct2 = ctx.createOscillator();
    this.oscOct1.type = "triangle";
    this.oscOct2.type = "triangle";
    this.oscOct1.frequency.value = BASE_FREQ * 2;
    this.oscOct2.frequency.value = BASE_FREQ * 2 + this.beatHz * 2;
    this.oscOct1.connect(octGain);
    this.oscOct2.connect(octGain);

    // ── soft low pulse / transport ──
    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 0.0001;
    const pulseFilter = ctx.createBiquadFilter();
    pulseFilter.type = "lowpass";
    pulseFilter.frequency.value = 180;
    this.pulseGain.connect(pulseFilter);
    pulseFilter.connect(this.master);
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = 57;
    this.sub.connect(this.pulseGain);

    // ── faint Shepard undertow (endless downward drift) ──
    this.shepard = startShepard(ctx, this.master, {
      dir: -1,
      peakGain: 0.09,
      driveRate: 0.1,
    });

    for (const o of [
      this.osc1,
      this.osc2,
      this.oscOct1,
      this.oscOct2,
      this.sub,
    ]) {
      o.start();
    }
    this.nextPulse = now + 0.5;
  }

  /** Resume a suspended context (browsers gate audio behind a gesture). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  /** Set the beat frequency (Hz) — the same number as the visual moiré drift. */
  setBeatHz(hz: number): void {
    if (this.stopped) return;
    this.beatHz = Math.max(0.05, Math.min(8, hz));
    const now = this.ctx.currentTime;
    this.osc2.frequency.setTargetAtTime(BASE_FREQ + this.beatHz, now, 0.08);
    this.oscOct2.frequency.setTargetAtTime(
      BASE_FREQ * 2 + this.beatHz * 2,
      now,
      0.08,
    );
  }

  /** 0..1 entropy arc: opens brightness + Shepard drive. */
  setDrive(entropy: number): void {
    if (this.stopped) return;
    const e = Math.max(0, Math.min(1, entropy));
    this.shepard.setDrive(e);
    const now = this.ctx.currentTime;
    this.beatGain.gain.setTargetAtTime(0.42 + e * 0.14, now, 0.3);
  }

  /** Transport tempo (Hz), tightening toward the entropy peak. */
  setPulseHz(hz: number): void {
    this.pulseHz = Math.max(0.4, Math.min(2.4, hz));
  }

  /** Call once per animation frame. Schedules pulses + advances Shepard. */
  tick(dt: number): void {
    if (this.stopped) return;
    this.shepard.step(dt);
    const ctx = this.ctx;
    const lookahead = ctx.currentTime + 0.12;
    while (this.nextPulse < lookahead) {
      const t = Math.max(this.nextPulse, ctx.currentTime + 0.001);
      const g = this.pulseGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(0.5, t + 0.012);
      g.exponentialRampToValueAtTime(0.0001, t + 0.28);
      this.nextPulse += 1 / this.pulseHz;
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(
        Math.max(0.0001, this.master.gain.value),
        now,
      );
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* ctx may be closing */
    }
    try {
      this.shepard.stop();
    } catch {
      /* ignore */
    }
    const killAt = now + 0.6;
    for (const o of [
      this.osc1,
      this.osc2,
      this.oscOct1,
      this.oscOct2,
      this.sub,
    ]) {
      try {
        o.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    setTimeout(() => {
      try {
        void this.ctx.close();
      } catch {
        /* ignore */
      }
    }, 750);
  }
}
