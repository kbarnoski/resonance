// field.ts — the planetary energy-field abstraction shared by the GPU and CPU
// backends.
//
// One equirectangular world field carries THREE heterogeneous forcings at once:
//   • quake impulses  — sharp localized Gaussian drops at a (lon,lat) cell
//   • solar wind      — a slow global advecting undulation that raises the
//                       field's energy floor (a sustained pressure, not a hit)
//   • geomagnetic Kp  — a shimmering polar-band bloom near the poles
// All three integrate into the SAME discretised 2D wave equation so the planet
// and its star read as ONE accumulating instrument, not three overlays.

/** GPU grid — 2:1 equirectangular, fine enough for crisp interference. */
export const GRID_W = 512;
export const GRID_H = 256;

/** Continuous (per-frame) forcing state driven by the two sustained streams. */
export interface FieldForcing {
  /** solar-wind plasma speed, normalised 0..1 → advection rate + floor energy */
  windSpeed: number;
  /** solar-wind density, normalised 0..1 → wind forcing amplitude */
  windDensity: number;
  /** geomagnetic Kp, normalised 0..1 → polar aurora-band intensity */
  kp: number;
}

/** A running planetary field: inject impulses, drive forcings, advance+paint. */
export interface WaveField {
  backend: "GPU" | "CPU";
  gridW: number;
  gridH: number;
  /** queue an earthquake impulse at an integer cell (consumed next frame) */
  inject(cellX: number, cellY: number, amp: number): void;
  /** update the two sustained forcings (solar wind + geomagnetic Kp) */
  setForcing(f: FieldForcing): void;
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

// ── forcing → shader-parameter mapping (shared by both backends) ──────────────
// Kept in one place so the GPU and CPU fields respond identically.
export const POLE_BAND_FRAC = 0.16; // top/bottom 16% of the field are "polar"

/** Wind forcing amplitude (raises the energy floor with plasma density). */
export function windAmpFor(f: FieldForcing): number {
  return 0.003 + f.windDensity * 0.018;
}
/** How fast the global wind undulation advects each frame (tracks speed). */
export function windPhaseStep(f: FieldForcing): number {
  return 0.015 + f.windSpeed * 0.14;
}
/** Aurora polar-band amplitude (blooms with geomagnetic Kp). */
export function auroraAmpFor(f: FieldForcing): number {
  return f.kp * f.kp * 0.03; // squared so quiet skies stay quiet
}
/** How fast the aurora shimmer rotates each frame (tracks Kp). */
export function auroraPhaseStep(f: FieldForcing): number {
  return 0.03 + f.kp * 0.22;
}
