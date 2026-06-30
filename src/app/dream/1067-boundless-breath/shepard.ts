// ─────────────────────────────────────────────────────────────────────────────
// shepard.ts — a real Shepard–Risset endless-glissando engine in Web Audio.
//
//   Roger Shepard (1964) built the auditory equivalent of a barber-pole: a stack
//   of sine partials spaced exactly one octave apart, each weighted by a fixed
//   spectral envelope (a Gaussian over log-frequency). As the whole stack glides
//   upward, partials fade IN at the bottom of the envelope and fade OUT at the
//   top — so there is never an audible edge, and the pitch seems to rise forever.
//   Jean-Claude Risset turned Shepard's discrete steps into a continuous glide.
//
//   This engine is CONTINUOUS (no quantised steps) and BREATH-COUPLED:
//     • a global transpose `phase` (in octaves) advances every frame;
//     • inhale (b high) advances it upward fast and opens brightness;
//     • exhale (b low) slows the ascent to a near-hover (never hard-reverses, so
//       the felt sense is "rising, then gathering, then rising again").
//   When phase crosses an octave each partial's base frequency wraps by an
//   octave, so the comb is identical and the rise is genuinely endless.
//
//   The spectral envelope is applied with per-partial GainNodes recomputed each
//   tick; oscillator frequencies are set continuously so the glide never clicks.
// ─────────────────────────────────────────────────────────────────────────────

export interface ShepardEngine {
  setBreath(b: number): void;
  /** Tick the glissando forward. Call once per animation frame with dt seconds. */
  step(dt: number): void;
  stop(): void;
  /** The node to route into the rest of the graph. */
  output: GainNode;
}

const N_PARTIALS = 9; // octaves stacked
const F_LOW = 27.5; // A0, bottom of the comb
const CENTER_OCT = 4.0; // envelope centre, in octaves above F_LOW (~mid spectrum)
const SIGMA_OCT = 1.6; // envelope width in octaves (~3-octave audible span)

/** Gaussian spectral weight for a partial sitting `oct` octaves above F_LOW. */
function envWeight(oct: number): number {
  const d = (oct - CENTER_OCT) / SIGMA_OCT;
  return Math.exp(-0.5 * d * d);
}

export function startShepard(
  ctx: AudioContext,
  destination: AudioNode,
): ShepardEngine {
  const output = ctx.createGain();
  output.gain.value = 0;
  // Smooth fade-in so starting the engine never pops.
  output.gain.setValueAtTime(0.0001, ctx.currentTime);
  output.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 2.0);
  output.connect(destination);

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (let i = 0; i < N_PARTIALS; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(output);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  let phase = 0; // current transpose, in octaves (fractional, wraps at 1)
  let breath = 0;
  let brightness = 0; // smoothed, opens with inhale

  const setBreath = (b: number) => {
    breath = Math.min(1, Math.max(0, b));
  };

  const step = (dt: number) => {
    const now = ctx.currentTime;
    const clampedDt = Math.min(0.1, Math.max(0, dt));

    // Breath → ascent rate (octaves/sec). A small floor keeps it always rising
    // a little (endless drift) and inhale accelerates it markedly.
    const rate = 0.018 + 0.16 * breath;
    phase += rate * clampedDt;
    phase -= Math.floor(phase); // wrap into [0,1); the comb is octave-periodic

    // Smooth brightness toward breath so timbre swells/settles, not jumps.
    const ba = 1 - Math.exp(-clampedDt / 0.5);
    brightness += (breath - brightness) * ba;

    // Overall level breathes a touch too, but stays present on the exhale.
    const level = 0.32 + 0.4 * brightness;

    for (let i = 0; i < N_PARTIALS; i++) {
      // Base octave of this partial, lifted by the global transpose phase.
      const oct = i + phase;
      const freq = F_LOW * Math.pow(2, oct);
      // Continuous glide — set target slightly ahead to avoid stair-stepping.
      oscs[i].frequency.setTargetAtTime(freq, now, 0.02);

      const w = envWeight(oct) * level;
      gains[i].gain.setTargetAtTime(
        Math.max(0, Math.min(1, w)),
        now,
        0.03,
      );
    }
  };

  let stopped = false;
  return {
    setBreath,
    step,
    output,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), now);
        output.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx may be closing */
      }
      const killAt = now + 0.7;
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
