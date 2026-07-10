// ─────────────────────────────────────────────────────────────────────────────
// lattice.ts — the long-form, IRREVERSIBLE dissolution arc + grid geometry for
// "THE DISSOLVE". Pure math + data; no DOM, no React, no audio.
//
//   The whole point is accumulating state. A single monotonic `progress` clock
//   integrates upward and NEVER falls — you can lean in to momentarily recover
//   the *look* of a more-formed lattice, but the underlying clock keeps marching.
//   You resist the dissolve; you never reverse it.
//
//   forming (0–0.15) → loosening (0.15–0.5) → dissolving (0.5–0.85) → light (0.85–1)
// ─────────────────────────────────────────────────────────────────────────────

/** ~5 minutes at driftSpeed 1×. */
export const DISSOLVE_SECONDS = 300;

/** 7×7×7 centred grid. */
export const GRID = 7;
const HALF = (GRID - 1) / 2; // 3

/** How far leaning-in can visually "recover" toward a more-formed lattice. */
const RECOVER = 0.22;

export type Phase = "forming" | "loosening" | "dissolving" | "light";
export const PHASES: Phase[] = ["forming", "loosening", "dissolving", "light"];

export interface Cell {
  /** Grid coordinates, centred: each in [-3..3]. */
  gx: number;
  gy: number;
  gz: number;
  /** Radius from the central view-axis (XY plane), in grid units. */
  rxy: number;
  /** Radius from the grid centre in 3D, in grid units. */
  r3: number;
  /** Deterministic per-cell tumble character (no Math.random). */
  seedAx: number;
  seedAy: number;
  seedAz: number;
  seedSpin: number;
}

const MAX_RXY = Math.hypot(HALF, HALF); // ≈4.243

/** Deterministic hash → [0,1). Keeps tumble identical every run. */
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Build the 343-cell centred grid. Call once. */
export function buildGrid(): Cell[] {
  const cells: Cell[] = [];
  let i = 0;
  for (let z = 0; z < GRID; z++) {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const gx = x - HALF;
        const gy = y - HALF;
        const gz = z - HALF;
        cells.push({
          gx,
          gy,
          gz,
          rxy: Math.hypot(gx, gy),
          r3: Math.hypot(gx, gy, gz),
          seedAx: hash01(i * 3 + 1) - 0.5,
          seedAy: hash01(i * 3 + 2) - 0.5,
          seedAz: hash01(i * 3 + 3) - 0.5,
          seedSpin: 0.6 + hash01(i * 7 + 5),
        });
        i++;
      }
    }
  }
  return cells;
}

/** Integrate the irreversible clock. Only ever rises; holds at 1 (the light). */
export function updateProgress(
  progress: number,
  driftSpeed: number,
  dtSec: number,
): number {
  const next = progress + (driftSpeed / DISSOLVE_SECONDS) * dtSec;
  return next >= 1 ? 1 : next;
}

/** The *visual/audio* progress after a lean-in recovery. Never mutates the clock;
 *  merely offsets the look toward "more formed". Clamped to [0,1]. */
export function effectiveProgress(progress: number, lean: number): number {
  const l = lean < 0 ? 0 : lean > 1 ? 1 : lean;
  const eff = progress - l * RECOVER;
  return eff < 0 ? 0 : eff;
}

export function phaseOf(p: number): Phase {
  if (p < 0.15) return "forming";
  if (p < 0.5) return "loosening";
  if (p < 0.85) return "dissolving";
  return "light";
}

/** Phase label for the *recovered* look — leaning in can read as "more formed"
 *  even while the real clock has moved on. */
export function effectivePhase(progress: number, lean: number): Phase {
  return phaseOf(effectiveProgress(progress, lean));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  let t = (x - edge0) / (edge1 - edge0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Layout tuning (px).
const BASE_SPACING = 56;
const SPREAD = 1.7; // spacing multiplier growth across the arc
const PUSH_MAX = 150; // radial outward push (px) opening the tunnel

export interface CellVisual {
  transform: string;
  opacity: number;
  /** hsl() string, cool violet at rest → warm-white toward the light. */
  color: string;
}

/**
 * Full per-cell visual for a given clock + lean. `effLean` is the 0..1 lean
 * amount (tilt-in / finger-hold) that recovers the look toward "more formed".
 */
export function cellVisual(
  cell: Cell,
  progress: number,
  effLean: number,
): CellVisual {
  const p = effectiveProgress(progress, effLean);

  // Spacing widens as the lattice loosens.
  const spacing = BASE_SPACING * (1 + p * SPREAD);

  // Radial push outward from the central view-axis — opens the tunnel mouth.
  // Outer cells travel further so the centre clears first.
  const rxy = cell.rxy < 1e-4 ? 1e-4 : cell.rxy;
  const nx = cell.gx / rxy;
  const ny = cell.gy / rxy;
  const pushMag = p * PUSH_MAX * (0.4 + (rxy / MAX_RXY) * 0.8);

  const X = cell.gx * spacing + nx * pushMag;
  const Y = cell.gy * spacing + ny * pushMag;
  const Z = cell.gz * spacing;

  // Growing clear-radius: cells near the axis dissolve into the tunnel first.
  const clearGrid = p * 5.0; // grows past MAX_RXY so the centre fully opens
  const tunnelFade = smoothstep(clearGrid - 1.0, clearGrid + 0.3, cell.rxy);

  // Detaching cells tumble as they loosen (sub-Hz, gentle).
  const detach = smoothstep(0.18, 0.95, p);
  const spin = detach * cell.seedSpin * 200; // up to ~a couple turns over minutes
  const ax = cell.seedAx * spin;
  const ay = cell.seedAy * spin;
  const az = cell.seedAz * spin;

  // Global dimming toward the void; the light phase leaves only a faint shell.
  const globalDim = lerp(1, 0.12, smoothstep(0.55, 1.0, p));
  const opacity = tunnelFade * globalDim * 0.92;

  // Colour: cool violet at rest → warm-white toward the centre + late arc.
  const warm = smoothstep(0, 1, p * 0.6 + (1 - cell.rxy / MAX_RXY) * 0.55);
  const hue = lerp(258, 44, warm);
  const sat = lerp(72, 48, warm);
  const light = lerp(58, 92, warm);
  const color = `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;

  const transform =
    `translate3d(${X.toFixed(1)}px, ${Y.toFixed(1)}px, ${Z.toFixed(1)}px)` +
    ` rotateX(${ax.toFixed(1)}deg) rotateY(${ay.toFixed(1)}deg) rotateZ(${az.toFixed(1)}deg)`;

  return { transform, opacity, color };
}

/** 0..1 how open the tunnel/light is — drives the bloom overlay + far light. */
export function lightAmount(progress: number, effLean: number): number {
  return smoothstep(0.4, 1.0, effectiveProgress(progress, effLean));
}

/** Camera push toward the light (px of translateZ on the stage). */
export function cameraPush(progress: number, effLean: number): number {
  return smoothstep(0, 1, effectiveProgress(progress, effLean)) * 520;
}
