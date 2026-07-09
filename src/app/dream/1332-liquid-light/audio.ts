// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sound-body of Liquid Light.
//
// This is NOT a "strike it, hear a bell" instrument. It is a warm, swirling,
// evolving DRONE that lives in TIME: a stacked just-chord, lightly detuned for
// chorus, run through a lowpass whose cutoff OPENS with tilt magnitude (the
// "heat" that makes the oil bloom), a subtle pitch bend that rises as you pour,
// a slow ~0.3 Hz LFO throb you can FEEL, and a stereo pan that follows which way
// you tilt. Master gain is capped at 0.26 behind a DynamicsCompressor limiter,
// with a gentle fade-in and a full teardown.
//
// Hand-rolled Web Audio graph (no external drone bank) so the swirl, the throb,
// and the tilt-bend all live in one place and tear down cleanly.
// ─────────────────────────────────────────────────────────────────────────────

export interface LiquidAudioOptions {
  /** Slow the throb + shimmer for prefers-reduced-motion. */
  reduced?: boolean;
}

export interface LiquidAudio {
  /** heat = tilt magnitude 0..1 (blooms brighter/hotter); dirX = tilt L/R -1..1 (pans). */
  setTilt(heat: number, dirX: number): void;
  /** Fade out and stop every source. Caller closes the AudioContext afterwards. */
  stop(): void;
}

const MASTER_PEAK = 0.26; // hard ceiling per the brief
const CUTOFF_LOW = 300; // Hz, resting (cool, dark oil)
const CUTOFF_HIGH = 2100; // Hz, fully poured (hot bloom)

// A warm stacked just chord over a low root — the swirling bed.
const ROOT_HZ = 55; // A1
const RATIOS = [1, 3 / 2, 2, 5 / 2, 3, 15 / 4];

export function startLiquidLight(
  ctx: AudioContext,
  opts: LiquidAudioOptions = {},
): LiquidAudio {
  const reduced = opts.reduced ?? false;
  const now = ctx.currentTime;

  // ── master chain: bus → limiter → master(0.26) → speakers ──────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 3.0); // gentle fade-in
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(master);

  // ── the felt throb: a slow tremolo you can count ───────────────────────────
  const throb = ctx.createGain();
  throb.gain.value = 0.82;
  throb.connect(limiter);

  const throbLfo = ctx.createOscillator();
  throbLfo.type = "sine";
  throbLfo.frequency.value = reduced ? 0.16 : 0.3; // 0.2–0.5 Hz felt pulse
  const throbDepth = ctx.createGain();
  throbDepth.gain.value = reduced ? 0.09 : 0.16; // shallow → 0.66..0.98
  throbLfo.connect(throbDepth);
  throbDepth.connect(throb.gain);
  throbLfo.start();

  // ── stereo pan follows tilt direction ──────────────────────────────────────
  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;
  panner.connect(throb);

  // ── the swirling lowpass: cutoff opens with heat, shimmers slowly on top ────
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = CUTOFF_LOW;
  lp.Q.value = 0.8;
  lp.connect(panner);

  const shimmerLfo = ctx.createOscillator();
  shimmerLfo.type = "sine";
  shimmerLfo.frequency.value = reduced ? 0.04 : 0.08;
  const shimmerDepth = ctx.createGain();
  shimmerDepth.gain.value = reduced ? 90 : 220; // Hz of slow cutoff drift
  shimmerLfo.connect(shimmerDepth);
  shimmerDepth.connect(lp.frequency);
  shimmerLfo.start();

  // ── the chord: two detuned voices per partial for a wet chorus beat ─────────
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < RATIOS.length; i++) {
    const freq = ROOT_HZ * RATIOS[i];
    const partial = ctx.createGain();
    // higher partials quieter so the sub stays the foundation
    partial.gain.value = (0.5 / RATIOS[i]) * 0.42;
    partial.connect(lp);
    for (const cents of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      osc.connect(partial);
      osc.start();
      oscs.push(osc);
    }
  }

  let stopped = false;

  return {
    setTilt(heat: number, dirX: number) {
      if (stopped) return;
      const h = Math.min(1, Math.max(0, heat));
      const t = ctx.currentTime;
      // exponential cutoff opening — dark at rest, bright when poured
      const cutoff = CUTOFF_LOW * Math.pow(CUTOFF_HIGH / CUTOFF_LOW, h);
      lp.frequency.setTargetAtTime(cutoff, t, 0.18);
      lp.Q.setTargetAtTime(0.8 + h * 2.4, t, 0.25);
      // subtle pitch bend up as the oil heats — bend the whole stack together
      const bend = h * 22; // cents
      for (const osc of oscs) {
        osc.detune.setTargetAtTime(bend + (osc.detune.value >= 0 ? 5 : -5), t, 0.25);
      }
      // pan toward the tilt direction, but never hard-left/right
      const pan = Math.max(-1, Math.min(1, dirX)) * 0.55;
      panner.pan.setTargetAtTime(pan, t, 0.2);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      } catch {
        /* ctx already closing */
      }
      const killAt = t + 0.7;
      for (const osc of oscs) {
        try {
          osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      try {
        throbLfo.stop(killAt);
        shimmerLfo.stop(killAt);
      } catch {
        /* already stopped */
      }
    },
  };
}
