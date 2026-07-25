// ════════════════════════════════════════════════════════════════════════════
//  AUDIO — one sustained voice per orbiting body. Web Audio API only.
//
//  Each body is a partial: its pitch is a DIRECT readout of its orbital
//  frequency (see engine.frequencies). Nothing is quantized to a scale — when
//  the orbits lock into a small-integer period ratio you hear a just interval;
//  when they drift you hear the pitches slide microtonally and beat. A per-body
//  gain swells with orbital speed (bright near perihelion) and a "lock shimmer"
//  rewards captured resonances.
// ════════════════════════════════════════════════════════════════════════════

interface Voice {
  osc: OscillatorNode;
  partial: OscillatorNode; // a soft octave partial for body
  gain: GainNode;
  pan: StereoPannerNode;
}

export class OrreryAudio {
  ctx: AudioContext | null = null;
  private voices: Voice[] = [];
  private master: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;

  /** Must be called from a user gesture (iOS unlock). */
  async start(count: number) {
    if (this.ctx) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.Q.value = 0.4;

    // a gentle stereo delay for air
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;

    master.connect(lp);
    lp.connect(ctx.destination);
    lp.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);

    this.master = master;
    this.lp = lp;

    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const partial = ctx.createOscillator();
      partial.type = "triangle";
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const pan = ctx.createStereoPanner();
      const pg = ctx.createGain();
      pg.gain.value = 0.18; // partial mixed under the fundamental
      osc.connect(gain);
      partial.connect(pg);
      pg.connect(gain);
      gain.connect(pan);
      pan.connect(master);
      osc.start();
      partial.start();
      this.voices.push({ osc, partial, gain, pan });
    }

    // fade in master
    master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
  }

  /**
   * Push live state to the voices.
   * @param freqs   fundamental Hz per body
   * @param speeds  normalized orbital speed 0..~1 per body (brightness)
   * @param pans    stereo pan -1..1 per body
   * @param lockGain per body: extra shimmer when part of a resonance lock 0..1
   * @param temperature 0 (locked/consonant) .. 1 (chaotic) — opens the filter
   */
  update(
    freqs: number[],
    speeds: number[],
    pans: number[],
    lockGain: number[],
    temperature: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.lp) return;
    const t = ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const f = Math.max(20, Math.min(6000, freqs[i] || 110));
      v.osc.frequency.setTargetAtTime(f, t, 0.03);
      v.partial.frequency.setTargetAtTime(f * 2.01, t, 0.03);
      // inner/high bodies quieter to avoid mud; louder near perihelion; lock adds glow
      const reg = 1 / (1 + i * 0.5);
      const amp =
        0.16 * reg * (0.5 + 0.5 * (speeds[i] || 0)) * (0.7 + 0.6 * (lockGain[i] || 0));
      v.gain.gain.setTargetAtTime(amp, t, 0.08);
      v.pan.pan.setTargetAtTime(pans[i] || 0, t, 0.1);
    }
    // chaos brightens the timbre; consonance is warm and dark
    const cutoff = 1400 + temperature * 3200;
    this.lp.frequency.setTargetAtTime(cutoff, t, 0.15);
  }

  stop() {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (this.master) this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      for (const v of this.voices) {
        try {
          v.osc.stop(ctx.currentTime + 0.4);
          v.partial.stop(ctx.currentTime + 0.4);
        } catch {
          /* already stopped */
        }
      }
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 500);
    } catch {
      /* noop */
    }
    this.voices = [];
    this.master = null;
    this.lp = null;
    this.ctx = null;
  }
}
