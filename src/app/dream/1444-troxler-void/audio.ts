// ─────────────────────────────────────────────────────────────────────────────
// audio.ts · the generative drone bed for 1444-troxler-void.
//
// A self-sufficient detuned-oscillator drone → gentle lowpass → a
// DynamicsCompressor limiter → master gain that ramps 0 → ~0.18 from silence.
// Output-only: no mic, so there is no feedback/howl path.
//
// The drone DISSOLVES WITH THE FIELD. As the visual void deepens (bloom → 0):
//   • upper partials drop out one by one (the chord thins to a bare fundamental),
//   • the lowpass closes (less body / brightness),
//   • the reverb send opens (the space "opens" — more tail, less presence).
// On movement (bloom → 1) the partials and brightness re-bloom. Audio and image
// fade and re-form together.
//
// Reverb tail comes from the shared code-generated void IR (no external file).
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface Partial {
  gain: GainNode;
  base: number;
  /** Bloom level above which this partial fades in (fundamental = -1: always). */
  threshold: number;
  oscs: OscillatorNode[];
}

export interface VoidAudio {
  /** Drive the drone from the field. bloom/voidness in 0..1. */
  update(bloom: number, voidness: number): void;
  stop(): void;
}

export function makeVoidAudio(ctx: AudioContext, peak = 0.18): VoidAudio {
  const now = ctx.currentTime;

  // master (pure intro envelope, 0 → peak) → destination
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(peak, now + 4.5);

  // limiter so nothing ever spikes
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-9, now);
  limiter.knee.setValueAtTime(6, now);
  limiter.ratio.setValueAtTime(12, now);
  limiter.attack.setValueAtTime(0.004, now);
  limiter.release.setValueAtTime(0.28, now);
  limiter.connect(master);
  master.connect(ctx.destination);

  // bloom-driven voice gain (separate from the intro envelope so they compose)
  const voice = ctx.createGain();
  voice.gain.setValueAtTime(1, now);
  voice.connect(limiter);

  // reverb send (opens as the void deepens)
  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 6,
    decay: 2.2,
    wet: 1,
  });
  verb.output.connect(limiter);

  // gentle lowpass body
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(480, now);
  lp.Q.setValueAtTime(0.6, now);
  lp.connect(voice);
  const send = ctx.createGain();
  send.gain.setValueAtTime(0.35, now);
  lp.connect(send);
  send.connect(verb.input);

  // detuned partial stack — a low just-intonation drone.
  const root = 49; // ~G1
  const spec: Array<{ ratio: number; base: number; threshold: number }> = [
    { ratio: 1, base: 0.5, threshold: -1 }, // fundamental, always present
    { ratio: 3 / 2, base: 0.24, threshold: 0.08 },
    { ratio: 2, base: 0.2, threshold: 0.22 },
    { ratio: 5 / 2, base: 0.12, threshold: 0.42 },
    { ratio: 3, base: 0.09, threshold: 0.58 },
    { ratio: 4, base: 0.06, threshold: 0.74 },
  ];

  const partials: Partial[] = spec.map((s, i) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.connect(lp);
    const oscs: OscillatorNode[] = [];
    for (const cents of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(root * s.ratio, now);
      osc.detune.setValueAtTime(cents, now);
      osc.connect(g);
      osc.start();
      oscs.push(osc);
    }
    return { gain: g, base: s.base, threshold: s.threshold, oscs };
  });

  let stopped = false;

  return {
    update(bloom, voidness) {
      if (stopped) return;
      const b = Math.min(1, Math.max(0, bloom));
      const v = Math.min(1, Math.max(0, voidness));
      const tt = ctx.currentTime;

      for (const p of partials) {
        // Each upper partial fades in over a 0.3-wide bloom window above its
        // threshold; the fundamental (threshold -1) stays a soft anchor.
        const w =
          p.threshold < 0 ? 1 : smoothstep(p.threshold, p.threshold + 0.3, b);
        const target = p.base * (0.12 + 0.88 * w);
        p.gain.gain.setTargetAtTime(Math.max(0.0001, target), tt, 0.35);
      }

      // Brightness opens with bloom; body thins as the void deepens.
      lp.frequency.setTargetAtTime(360 + 1500 * b, tt, 0.3);
      voice.gain.setTargetAtTime(0.45 + 0.55 * b, tt, 0.4);
      // Space opens as everything fades: more reverb tail in the void.
      send.gain.setTargetAtTime(0.25 + 0.6 * v, tt, 0.4);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const tt = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(tt);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), tt);
        master.gain.exponentialRampToValueAtTime(0.0001, tt + 0.7);
      } catch {
        /* ctx closing */
      }
      const killAt = tt + 0.8;
      for (const p of partials) {
        for (const osc of p.oscs) {
          try {
            osc.stop(killAt);
          } catch {
            /* already stopped */
          }
        }
      }
    },
  };
}
