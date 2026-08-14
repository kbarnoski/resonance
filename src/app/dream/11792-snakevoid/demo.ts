// ─────────────────────────────────────────────────────────────────────────────
// 11792-snakevoid · demo.ts — the self-driving "breath" generator.
//
//   The muted-06:30-phone contract: with NO audio and NO mic, the illusion must
//   already be breathing within ~1s. So a deterministic, seeded driver produces a
//   slow swell `env(t) ∈ [0,1]` from a small bank of low-frequency sines. That
//   swell modulates ring CONTRAST and the sub-threshold real DRIFT rate, so the
//   static field appears to speed / slow / reverse its illusory rotation with no
//   audio at all. Once sound plays, the same slot is fed by the real spectral
//   swell instead (see audio.ts / page.tsx) — but the shape is identical here so
//   the transition is seamless and every visit is the same.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, clamp } from "./prng";

interface Lfo {
  freq: number; // Hz — all well under 0.2 Hz (a slow tide, never a flicker)
  phase: number; // radians
  amp: number;
}

export class BreathDriver {
  private readonly lfos: Lfo[] = [];
  private norm = 1;

  constructor(seed: number) {
    const rnd = mulberry32(seed);
    // Four incommensurate slow tides so the swell never obviously loops.
    let ampSum = 0;
    for (let i = 0; i < 4; i++) {
      const freq = 0.02 + rnd() * 0.11; // 0.02 .. 0.13 Hz  (period ~8–50 s)
      const phase = rnd() * Math.PI * 2;
      const amp = 0.5 + rnd() * 0.9;
      this.lfos.push({ freq, phase, amp });
      ampSum += amp;
    }
    this.norm = ampSum > 0 ? 1 / ampSum : 1;
  }

  /** Self-driving swell in [0,1] at elapsed seconds `t`. Smooth, non-repeating. */
  env(t: number): number {
    let s = 0;
    for (const l of this.lfos) {
      s += l.amp * Math.sin(6.28318530718 * l.freq * t + l.phase);
    }
    // s is in [-1/norm, 1/norm]; map to [0,1] with a soft centre bias.
    return clamp(0.5 + 0.5 * s * this.norm, 0, 1);
  }
}
