/**
 * audio.ts — the "Enigma drone": a shimmering additive high-partial cluster
 * whose slow amplitude beating sonically mirrors the *perceived* streaming of
 * the visual field.
 *
 * Each "partial" is a pair of detuned sine oscillators sharing a high centre
 * frequency. Two near-frequencies interfere to produce physical amplitude
 * beating at their difference frequency — no LFO fakery, real interference.
 * Turning up the visual "density / intensity" control:
 *   - widens the detune  -> the beating quickens (0.6 Hz .. ~5 Hz)
 *   - activates more partials -> the cluster thickens
 * which is exactly what happens perceptually as the field intensifies.
 *
 * Everything is soft: low master gain, gentle onsets, and a
 * DynamicsCompressor as a limiter so nothing ever clicks or spikes.
 */

// High, mildly inharmonic cluster (G5 -> ~G7), ordered low to high.
const CENTERS = [784, 988, 1175, 1397, 1568, 1760, 2093, 2637, 3136];
const MIN_ACTIVE = 4;

type Partial = {
  center: number;
  a: OscillatorNode;
  b: OscillatorNode;
  gain: GainNode;
  peak: number; // target gain when fully active
};

export class EnigmaDrone {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  readonly analyser: AnalyserNode;
  private partials: Partial[] = [];
  private started = false;
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    // Gentle brickwall-ish limiter.
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // ramped up on start

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;

    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.comp.connect(ctx.destination);

    // Higher partials are progressively quieter -> a soft, airy shimmer.
    CENTERS.forEach((center, i) => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);

      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = "sine";
      b.type = "sine";
      a.frequency.value = center;
      b.frequency.value = center;
      a.connect(gain);
      b.connect(gain);

      const peak = 0.9 / (1 + i * 0.55);
      this.partials.push({ center, a, b, gain, peak });
    });
  }

  /** Begin sounding. `density` is 0..1 (the visual intensity control). */
  start(density: number) {
    if (this.started || this.stopped) return;
    this.started = true;
    const t = this.ctx.currentTime;
    for (const p of this.partials) {
      p.a.start(t);
      p.b.start(t);
    }
    // Soft ~1.6s onset.
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(0.15, t + 1.6);
    this.setDensity(density);
  }

  /** Retune the cluster to a new intensity without any clicks. */
  setDensity(density: number) {
    if (this.stopped) return;
    const d = Math.min(1, Math.max(0, density));
    const t = this.ctx.currentTime;
    const active = Math.round(MIN_ACTIVE + d * (CENTERS.length - MIN_ACTIVE));
    const beat = 0.6 + d * 4.4; // Hz difference between the pair

    this.partials.forEach((p, i) => {
      const on = i < active;
      const target = on ? p.peak : 0;
      p.gain.gain.setTargetAtTime(target, t, 0.35);
      // Split the beat frequency across the pair so the centre is stable.
      p.a.frequency.setTargetAtTime(p.center - beat / 2, t, 0.3);
      p.b.frequency.setTargetAtTime(p.center + beat / 2, t, 0.3);
    });
  }

  /** Fade out and fully tear down. Safe to call multiple times. */
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.5);
    } catch {
      /* node may already be gone */
    }
    const stopAt = t + 0.55;
    for (const p of this.partials) {
      try {
        p.a.stop(stopAt);
        p.b.stop(stopAt);
      } catch {
        /* not started */
      }
    }
    // Give the fade time before closing the context.
    await new Promise((r) => setTimeout(r, 620));
    try {
      for (const p of this.partials) {
        p.a.disconnect();
        p.b.disconnect();
        p.gain.disconnect();
      }
      this.master.disconnect();
      this.comp.disconnect();
      this.analyser.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* ignore */
      }
    }
  }
}
