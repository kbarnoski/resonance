// Shared contracts for the three visual-fluid tiers and the aurora palette.

/** A splat of force + luminous dye pushed into a fluid field.
 *  Coordinates are normalized [0,1] with origin at the top-left of the
 *  canvas (y grows downward), matching DOM/pointer conventions. */
export interface Splat {
  x: number;
  y: number;
  /** velocity injected into the flow (normalized units / second-ish) */
  vx: number;
  vy: number;
  /** dye colour (HDR — values may exceed 1 to bloom) */
  r: number;
  g: number;
  b: number;
  /** splat radius in normalized units */
  radius: number;
}

/** Uniform interface implemented by the WebGPU, WebGL2 and CPU tiers. */
export interface VisualFluid {
  readonly kind: "webgpu" | "webgl2" | "cpu";
  /** Push one splat into the field. */
  splat(s: Splat): void;
  /** Advance the simulation by dt seconds and draw to the canvas. */
  frame(dt: number): void;
  /** Release all GPU/GL/canvas resources. */
  destroy(): void;
}

/**
 * Aurora colour ramp: slow flow reads as deep indigo, medium as violet, fast
 * as warm rose/gold. Returned as HDR RGB so bright grains bloom in the
 * tone-mapped display pass. `speed` is a normalized 0..~1 flow magnitude.
 */
export function flowColor(speed: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, speed));
  // three-stop ramp: indigo -> violet -> warm rose
  const indigo: [number, number, number] = [0.12, 0.16, 0.55];
  const violet: [number, number, number] = [0.55, 0.22, 0.85];
  const rose: [number, number, number] = [1.05, 0.5, 0.62];
  let c: [number, number, number];
  if (t < 0.5) {
    const s = t / 0.5;
    c = [
      indigo[0] + s * (violet[0] - indigo[0]),
      indigo[1] + s * (violet[1] - indigo[1]),
      indigo[2] + s * (violet[2] - indigo[2]),
    ];
  } else {
    const s = (t - 0.5) / 0.5;
    c = [
      violet[0] + s * (rose[0] - violet[0]),
      violet[1] + s * (rose[1] - violet[1]),
      violet[2] + s * (rose[2] - violet[2]),
    ];
  }
  // brighten with speed so vigorous stirring glows
  const gain = 0.5 + t * 1.4;
  return [c[0] * gain, c[1] * gain, c[2] * gain];
}
