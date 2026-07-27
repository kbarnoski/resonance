// Web Audio pluck/marimba synth for 3144-latency. Oscillator + fast gain
// envelope + a lowpass sweep gives a woody, consonant tone; a beat-synced
// feedback delay adds "networked" space so echoes ring across the stereo
// field. Gated behind a user Start gesture (AudioContext created there).

export class PluckSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;

  constructor(ctx: AudioContext, beatMs: number) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Eighth-note feedback delay — a touch of canonic space.
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = beatMs / 1000 / 2;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.26;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    this.master.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(ctx.destination);
  }

  /** Schedule a pluck at absolute AudioContext time `when` (seconds). */
  pluck(freq: number, when: number, level: number, pan: number): void {
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime + 0.001);
    const dur = 0.5;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 2.01, t);

    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(level * 0.3, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0006, t + dur * 0.55);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(freq * 7, 9000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.6, 300), t + 0.35);

    osc.connect(g);
    osc2.connect(g2);
    g.connect(lp);
    g2.connect(lp);

    let tail: AudioNode = lp;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      lp.connect(p);
      tail = p;
    }
    tail.connect(this.master);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.05);
    osc2.stop(t + dur + 0.05);
  }

  close(): void {
    try {
      this.master.disconnect();
      this.delay.disconnect();
      this.feedback.disconnect();
    } catch {
      /* already torn down */
    }
  }
}
