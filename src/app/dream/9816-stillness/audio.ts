// ─────────────────────────────────────────────────────────────────────────────
// 9816 · Stillness — the anti-instrument's voice.
//
//   A just-intonation drone bed (root C2) whose partials fade IN as the
//   stillness meter `s` climbs. This is the inverse gate made audible: the
//   quieter you are, the richer the chord. Move, and every partial ducks back
//   toward silence.
//
//   Partials cross in one at a time as thresholds are passed:
//     s > 0.15  fundamental (1/1)
//     s > 0.40  the fifth   (3/2)
//     s > 0.52  the octave  (2/1)
//     s > 0.62  octave+third(5/2)
//     s > 0.74  twelfth     (3/1)
//     s > 0.85  maj7 stack  (15/4)
//     s > 0.90  double oct  (4/1)   ← full harmonic bloom / deep-listening reward
//
//   Pure integer ratios only — NEVER a pentatonic/tempered scale. Every voice
//   is a detuned pair for a slow chorus shimmer. A master lowpass also OPENS
//   with stillness so the timbre itself blooms.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = 65.406; // C2

interface Partial {
  ratio: number;
  thresh: number; // stillness at which this partial begins to bloom
  gain: number; // its peak contribution
  type: OscillatorType;
}

// Higher partials are quieter so the sub stays the foundation.
const PARTIALS: Partial[] = [
  { ratio: 1, thresh: 0.15, gain: 0.5, type: "sine" },
  { ratio: 3 / 2, thresh: 0.4, gain: 0.32, type: "sine" },
  { ratio: 2, thresh: 0.52, gain: 0.24, type: "sine" },
  { ratio: 5 / 2, thresh: 0.62, gain: 0.18, type: "triangle" },
  { ratio: 3, thresh: 0.74, gain: 0.13, type: "sine" },
  { ratio: 15 / 4, thresh: 0.85, gain: 0.09, type: "triangle" },
  { ratio: 4, thresh: 0.9, gain: 0.07, type: "sine" },
];

const BAND = 0.1; // how wide (in `s`) each partial fades across its threshold.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface StillnessDrone {
  /** Feed the stillness meter (0..1) each frame; partials & timbre follow. */
  setStillness(s: number): void;
  /** Stop every voice and release the graph. */
  stop(): void;
}

/**
 * Build the drone and connect it into `destination` (the safeMaster input).
 * Voices start immediately at zero gain; `setStillness` blooms them.
 */
export function startStillnessDrone(
  ctx: AudioContext,
  destination: AudioNode,
): StillnessDrone {
  const now = ctx.currentTime;

  // Master lowpass that opens as stillness grows — the timbre blooms too.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  lp.Q.value = 0.6;
  lp.connect(destination);

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  for (const p of PARTIALS) {
    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.0001;
    partialGain.connect(lp);
    gains.push(partialGain);

    // Two detuned voices per partial for a slow, living chorus beat.
    for (const cents of [-3.5, 3.5]) {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = ROOT * p.ratio;
      osc.detune.value = cents;
      const vg = ctx.createGain();
      vg.gain.value = 0.5;
      osc.connect(vg);
      vg.connect(partialGain);
      osc.start(now);
      oscs.push(osc);
    }
  }

  let stopped = false;

  return {
    setStillness(s: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const clamped = Math.min(1, Math.max(0, s));
      for (let i = 0; i < PARTIALS.length; i++) {
        const p = PARTIALS[i];
        const bloom = smoothstep(p.thresh, p.thresh + BAND, clamped);
        const target = Math.max(0.0001, p.gain * bloom);
        // Rising (blooming) is gentle; ducking on movement is a touch faster so
        // the "move = silence" gesture reads clearly.
        const tau = bloom > 0.02 ? 0.35 : 0.18;
        gains[i].gain.setTargetAtTime(target, t, tau);
      }
      // Timbre opens with stillness: 320 Hz at rest → ~3.2 kHz fully bloomed.
      const cutoff = 320 * Math.pow(3200 / 320, clamped);
      lp.frequency.setTargetAtTime(cutoff, t, 0.3);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      for (const g of gains) {
        try {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        } catch {
          /* ctx closing */
        }
      }
      const killAt = t + 0.6;
      for (const osc of oscs) {
        try {
          osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
