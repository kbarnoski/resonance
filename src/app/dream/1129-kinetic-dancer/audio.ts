// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — two rivalrous stereo drones over a shared pad (Web Audio only).
//
//   A BRIGHT voice panned RIGHT stands for the clockwise reading; a DARK / low
//   voice panned LEFT stands for counter-clockwise. They crossfade with the
//   figure's bias / perceived direction over a soft, centred pad. All pitches
//   are just-intonation ratios of a single root; everything passes through a
//   DynamicsCompressor acting as a limiter. The AudioContext is created and
//   resumed only from a user gesture (page.tsx "Begin").
//
//   In "audio-only bias" mode the visual tilt is forced to zero and this stereo
//   balance is the ONLY cue on offer — the queued deepening, testing whether
//   sound alone can tip which way you see the dancer turn.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = 130.81; // C3

interface Voice {
  gain: GainNode;
  oscs: OscillatorNode[];
}

export class DancerAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private padGain: GainNode;
  private bright: Voice;
  private dark: Voice;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private padOscs: OscillatorNode[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 24;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.0; // faded up in start()
    this.master.connect(this.limiter);

    // ── Shared centred pad: root + fifth, soft sines ─────────────────────────
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.5;
    const padPan = ctx.createStereoPanner();
    padPan.pan.value = 0;
    this.padGain.connect(padPan).connect(this.master);
    for (const ratio of [1, 3 / 2]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = ROOT * ratio;
      o.detune.value = ratio === 1 ? -4 : 5; // faint beating warmth
      const g = ctx.createGain();
      g.gain.value = ratio === 1 ? 0.5 : 0.32;
      o.connect(g).connect(this.padGain);
      o.start();
      this.padOscs.push(o);
    }

    // ── Dark voice → LEFT (counter-clockwise) ────────────────────────────────
    this.dark = this.buildVoice(
      [0.5, 0.75, 1], // sub-octave, low fifth, root
      "triangle",
      -0.85,
      420,
    );
    // ── Bright voice → RIGHT (clockwise) ─────────────────────────────────────
    this.bright = this.buildVoice(
      [2, 2 * (5 / 4), 3], // octave, major third above, twelfth
      "triangle",
      0.85,
      2200,
    );

    // Slow shimmer on the bright voice — audio-rate amplitude, well under 3 Hz.
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.16;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.06;
    this.lfo.connect(this.lfoGain).connect(this.bright.gain.gain);
    this.lfo.start();

    // Start balanced (rivalrous, ambiguous).
    this.setDirection(0);
  }

  private buildVoice(
    ratios: number[],
    type: OscillatorType,
    pan: number,
    cutoff: number,
  ): Voice {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    lp.Q.value = 0.4;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(lp).connect(panner).connect(this.master);

    const oscs: OscillatorNode[] = [];
    for (const r of ratios) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = ROOT * r;
      const og = ctx.createGain();
      og.gain.value = 0.34 / ratios.length;
      o.connect(og).connect(gain);
      o.start();
      oscs.push(o);
    }
    return { gain, oscs };
  }

  /** Fade the whole engine up. Call after ctx.resume() from a user gesture. */
  start() {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.2, now + 1.2);
  }

  /**
   * Crossfade the two voices toward direction `d` (−1 = CCW/dark/left,
   * +1 = CW/bright/right, 0 = balanced rivalry). The LFO shimmer rides on top
   * of the bright voice's base gain here.
   */
  setDirection(d: number) {
    const dir = Math.max(-1, Math.min(1, d));
    const now = this.ctx.currentTime;
    const brightBase = 0.24 + 0.6 * Math.max(0, dir);
    const darkBase = 0.24 + 0.6 * Math.max(0, -dir);
    this.bright.gain.gain.setTargetAtTime(brightBase, now, 0.35);
    this.dark.gain.gain.setTargetAtTime(darkBase, now, 0.35);
  }

  /** Ramp everything down; the page closes the context after the tail rings. */
  stop() {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.4);
  }
}
