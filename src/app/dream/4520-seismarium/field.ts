// field.ts — the wave-field abstraction shared by the GPU and CPU backends.
//
// Both backends simulate the same 2D elastic wave equation on an
// equirectangular world grid and paint it with the same violet ramp; the page
// picks whichever the browser supports and shows a GPU / CPU badge.

/** GPU grid — 2:1 equirectangular, fine enough for crisp interference. */
export const GRID_W = 512;
export const GRID_H = 256;

/** A running wave field: inject impulses, advance+paint one frame at a time. */
export interface WaveField {
  backend: "GPU" | "CPU";
  gridW: number;
  gridH: number;
  /** queue an earthquake impulse at an integer cell (consumed next frame) */
  inject(cellX: number, cellY: number, amp: number): void;
  /** advance the physics one step and repaint */
  frame(): void;
  /** canvas backing store changed size */
  resize(): void;
  destroy(): void;
}

/** Canonical violet ramp (matches _shared/palette.ts) → [r,g,b] 0–255. */
export function dreamPaletteRGB(t0: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, t0));
  const deep: [number, number, number] = [11, 7, 19];
  const indigo: [number, number, number] = [99, 102, 241];
  const violet: [number, number, number] = [139, 92, 246];
  const magenta: [number, number, number] = [176, 67, 224];
  const light: [number, number, number] = [196, 181, 253];
  const mix = (
    a: [number, number, number],
    b: [number, number, number],
    k: number,
  ): [number, number, number] => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
  if (t < 0.33) return mix(deep, indigo, t / 0.33);
  if (t < 0.66) return mix(indigo, violet, (t - 0.33) / 0.33);
  const inner = mix(magenta, light, (t - 0.66) / 0.34);
  return mix(violet, inner, 1.0);
}
