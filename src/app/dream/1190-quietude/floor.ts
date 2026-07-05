// floor.ts — adaptive noise-floor gating for 1190 · Quietude.
//
// The whole piece is an INVERSION: quiet OPENS the instrument, sound DUCKS it.
// To do that fairly in any room we can't use a fixed threshold — a library and
// a kitchen have wildly different baselines. So we track a self-calibrating
// noise floor (a running minimum that falls fast toward new lows and creeps up
// slowly) and measure how far above that floor the current RMS sits.

/** Smooth Hermite ramp between edge0 and edge1. Classic GLSL smoothstep. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Root-mean-square of a time-domain buffer (values in -1..1). */
export function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/**
 * Adaptive noise floor. Feed it RMS every frame; it returns the current floor.
 * - Falls FAST toward any lower reading (so it locks onto true quiet quickly).
 * - Rises SLOW (so a passing cough doesn't permanently raise the baseline, but
 *   a genuinely louder steady room — a fan that switches on — is re-learned).
 */
export class NoiseFloor {
  private floor = 0;
  private primed = false;

  reset(): void {
    this.floor = 0;
    this.primed = false;
  }

  update(rms: number): number {
    if (!this.primed) {
      this.floor = rms;
      this.primed = true;
      return this.floor;
    }
    if (rms < this.floor) {
      // Fall fast toward the new, quieter reading.
      this.floor += (rms - this.floor) * 0.2;
    } else {
      // Rise very slowly — steady louder rooms re-calibrate over ~tens of sec.
      this.floor += (rms - this.floor) * 0.0006;
    }
    return this.floor;
  }

  get value(): number {
    return this.floor;
  }
}

/**
 * Map RMS + floor to "openness": ~1 in true quiet, ~0 on any sound above the
 * floor. `margin` scales with the floor so noisy rooms need a proportionally
 * larger disturbance to duck the piece.
 */
export function opennessFrom(rms: number, floor: number): number {
  const margin = 0.006 + floor * 1.5;
  return 1 - smoothstep(floor, floor + margin, rms);
}

/**
 * Asymmetric gate smoother. Quiet should OPEN the choir gradually (slow attack)
 * while any noise DUCKS it instantly (fast release). Call each frame with the
 * raw openness target and the current smoothed value; returns the next value.
 */
export function gateStep(target: number, current: number): number {
  const rising = target > current;
  const coef = rising ? 0.012 : 0.35; // slow open, fast duck
  return current + (target - current) * coef;
}
