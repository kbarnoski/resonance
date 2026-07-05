// ════════════════════════════════════════════════════════════════════════════
// synth.ts — the geometry SINGS the topology, via 2-operator FM bells.
//
// A small bank of 2-op FM voices (carrier + modulator sine, modulator → carrier
// frequency). One voice is bound to each "lead" fibre. Mapping:
//   • base-sphere latitude → carrier pitch (a consonant minor-pentatonic set),
//   • projected radius / 4D motion → FM index (brightness) and strike vigour.
// Every few breaths a voice re-attacks its index+amplitude envelope — a slow
// shimmering FM bell (long attack, long release), NOT a machine-gun of notes and
// NOT a just-intonation drone/choir. A breath-paced amplitude LFO keeps the bed
// alive. Master chain: sum → DynamicsCompressor (limiter) → gain (ramped from 0).
//
// Lineage: the La Monte Young / Éliane Radigue sustained-drone register, but
// realised through FM timbre rather than JI intervals.
// ════════════════════════════════════════════════════════════════════════════

// Minor-pentatonic-ish carrier frequencies (low → high), consonant but neutral.
const PITCHES = [
  110.0, // A2
  130.81, // C3
  164.81, // E3
  196.0, // G3
  220.0, // A3
  261.63, // C4
  329.63, // E4
];

// Per-voice carrier:modulator ratios — a mix of integer and bell-ish ratios so
// the FM timbre reads as struck metal, not a pad.
const RATIOS = [2.0, 3.5, 2.0, 3.0, 1.5, 3.5, 2.0];

interface Voice {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modGain: GainNode; // FM index (Hz of frequency deviation)
  amp: GainNode; // per-voice amplitude envelope
  freq: number;
  ratio: number;
  nextStrike: number; // ctx time of next bell attack
  strikePeriod: number; // seconds between attacks
  index: number; // 0..1 target brightness, updated from geometry
  motion: number; // 0..1 recent motion, updated from geometry
}

export class FmVoices {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private voices: Voice[] = [];
  private disposed = false;
  private level: number;

  constructor(ctx: AudioContext, voiceCount: number, reduced: boolean) {
    this.ctx = ctx;
    this.level = reduced ? 0.42 : 0.55;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 24;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.006;
    this.limiter.release.value = 0.28;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // Breath-paced amplitude LFO (~0.09 Hz) gently shared across the bed.
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = reduced ? 0.05 : 0.09;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.18;
    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    const now = ctx.currentTime;
    const n = Math.max(1, Math.min(PITCHES.length, voiceCount));
    for (let i = 0; i < n; i++) {
      const freq = PITCHES[i % PITCHES.length];
      const ratio = RATIOS[i % RATIOS.length];

      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = freq;

      const modulator = ctx.createOscillator();
      modulator.type = "sine";
      modulator.frequency.value = freq * ratio;

      const modGain = ctx.createGain();
      modGain.gain.value = freq * 0.6; // resting index
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);

      const amp = ctx.createGain();
      amp.gain.value = 0.0;
      carrier.connect(amp);
      amp.connect(this.master);
      // breath LFO nudges the sustained bed
      this.lfoGain.connect(amp.gain);

      carrier.start();
      modulator.start();

      this.voices.push({
        carrier,
        modulator,
        modGain,
        amp,
        freq,
        ratio,
        nextStrike: now + 0.8 + i * (reduced ? 2.4 : 1.6),
        strikePeriod: (reduced ? 11 : 7) + i * 1.3,
        index: 0.4,
        motion: 0.2,
      });
    }
  }

  /** Fade the master gain up from silence (call once, post-gesture). */
  start(): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.level, now + 3.5);
  }

  /**
   * Update voice `i` from its lead fibre's geometry.
   * @param brightness 0..1 — projected radius (bigger ring → brighter bell)
   * @param motion 0..1 — recent per-frame motion of that fibre
   */
  setVoiceState(i: number, brightness: number, motion: number): void {
    const v = this.voices[i];
    if (!v) return;
    v.index = Math.max(0, Math.min(1, brightness));
    v.motion = Math.max(0, Math.min(1, motion));
  }

  /** Per-frame scheduler: trigger slow FM bells when a voice's timer elapses. */
  update(): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      // sustained resting index tracks brightness (smooth, no zipper)
      const rest = v.freq * (0.35 + v.index * 0.9);
      v.modGain.gain.setTargetAtTime(rest, now, 0.5);

      if (now >= v.nextStrike) {
        const peakIndex = v.freq * (1.4 + v.index * 3.2 + v.motion * 2.0);
        const attack = 0.5 + v.motion * 0.4;
        const release = 4.5 + v.index * 4.0;
        const peakAmp = 0.16 + v.index * 0.14;

        // FM index swell (bright attack → mellow tail)
        v.modGain.gain.cancelScheduledValues(now);
        v.modGain.gain.setValueAtTime(Math.max(rest, v.modGain.gain.value), now);
        v.modGain.gain.linearRampToValueAtTime(peakIndex, now + attack);
        v.modGain.gain.setTargetAtTime(rest, now + attack, release * 0.4);

        // amplitude bell envelope
        v.amp.gain.cancelScheduledValues(now);
        v.amp.gain.setValueAtTime(Math.max(0.001, v.amp.gain.value), now);
        v.amp.gain.linearRampToValueAtTime(peakAmp, now + attack);
        v.amp.gain.setTargetAtTime(0.02, now + attack, release * 0.5);

        // schedule next breath, gently randomised so voices don't lock in step
        v.nextStrike = now + v.strikePeriod * (0.8 + Math.random() * 0.5);
      }
    }
  }

  /** Instant silence for Pause (fast ramp, keeps nodes alive). */
  mute(): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.05);
  }

  /** Resume from Pause (fade back up). */
  unmute(): void {
    this.start();
  }

  get voiceCount(): number {
    return this.voices.length;
  }

  /** Full teardown: stop every node. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const stop = (o: OscillatorNode) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      try {
        o.disconnect();
      } catch {
        /* noop */
      }
    };
    for (const v of this.voices) {
      stop(v.carrier);
      stop(v.modulator);
      try {
        v.modGain.disconnect();
      } catch {
        /* noop */
      }
      try {
        v.amp.disconnect();
      } catch {
        /* noop */
      }
    }
    stop(this.lfo);
    try {
      this.lfoGain.disconnect();
    } catch {
      /* noop */
    }
    try {
      this.master.disconnect();
    } catch {
      /* noop */
    }
    try {
      this.limiter.disconnect();
    } catch {
      /* noop */
    }
    this.voices = [];
  }
}
