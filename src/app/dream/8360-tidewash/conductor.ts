// Seeded autonomous "conductor" — stirs the fluid so the piece is visibly and
// audibly alive within ~1s with zero input (and whenever no camera is granted).
// Fully deterministic via mulberry32; the first real hand motion hands control
// over to the player.

import type { MotionSample } from "./camera";
import { mulberry32 } from "./prng";

interface Hand {
  ax: number; ay: number; // Lissajous amplitudes
  fx: number; fy: number; // frequencies
  px: number; py: number; // phases
  cx: number; cy: number; // centre
  breath: number; // envelope frequency
  bphase: number;
}

export interface Conductor {
  sample(t: number, calm: boolean): MotionSample[];
}

export function makeConductor(seed: number): Conductor {
  const rnd = mulberry32(seed);
  const hands: Hand[] = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    hands.push({
      ax: 0.18 + rnd() * 0.16,
      ay: 0.16 + rnd() * 0.16,
      fx: 0.05 + rnd() * 0.12,
      fy: 0.05 + rnd() * 0.12,
      px: rnd() * Math.PI * 2,
      py: rnd() * Math.PI * 2,
      cx: 0.3 + rnd() * 0.4,
      cy: 0.3 + rnd() * 0.4,
      breath: 0.04 + rnd() * 0.08,
      bphase: rnd() * Math.PI * 2,
    });
  }

  return {
    sample(t: number, calm: boolean): MotionSample[] {
      const speedScale = calm ? 0.45 : 1;
      const out: MotionSample[] = [];
      for (const h of hands) {
        const wx = 2 * Math.PI * h.fx * speedScale;
        const wy = 2 * Math.PI * h.fy * speedScale;
        const x = h.cx + h.ax * Math.sin(wx * t + h.px);
        const y = h.cy + h.ay * Math.sin(wy * t + h.py);
        // analytic velocity (derivative of the path)
        const vx = h.ax * wx * Math.cos(wx * t + h.px);
        const vy = h.ay * wy * Math.cos(wy * t + h.py);
        // breathing envelope so calm pools and swells alternate
        const env =
          0.5 + 0.5 * Math.sin(2 * Math.PI * h.breath * t + h.bphase);
        const strength = 0.15 + 0.85 * env;
        out.push({
          x: Math.max(0.02, Math.min(0.98, x)),
          y: Math.max(0.02, Math.min(0.98, y)),
          vx: vx * 0.6,
          vy: vy * 0.6,
          strength,
        });
      }
      return out;
    },
  };
}
