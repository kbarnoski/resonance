// Tilt rigid-body marble physics for the cadence meadow.
// A damped point-mass rolls on a height field made of three Gaussian "wells".
// The marble accelerates downhill (the gradient of the field) plus along the
// tilt gravity vector. Each well is a harmonic attractor basin.

// --- Tunable constants (exposed for real-device tuning) ---
// Builder note from prior attempt: on real devices, tilt sensitivity ~ /35 and
// downhill accel ~ 1.9 felt right. Tune these two first on hardware.
export const TILT_SENSITIVITY = 35; // larger = needs more tilt to move (deg divisor)
export const DOWNHILL_ACCEL = 1.9; // how strongly the marble rolls toward a well
export const TILT_GRAVITY = 0.95; // strength of the tilt-driven gravity vector
export const DAMPING = 0.9; // velocity damping per step (0..1), keeps it calm
export const WELL_RADIUS = 0.17; // gaussian sigma of each basin (field units, 0..1)
export const WELL_DEPTH = 1.0; // depth of each basin
export const CAPTURE_DIST = 0.085; // distance to a well center counted as "in" it
export const MAX_SPEED = 0.022; // clamp so the marble never rockets away (kids-safe)

export type WellId = "tonic" | "subdominant" | "dominant";

export interface Well {
  id: WellId;
  x: number; // 0..1 in field space
  y: number; // 0..1 in field space
}

// Layout (field space, 0..1). Gold tonic center-ish low, green left, orange right.
export const WELLS: Well[] = [
  { id: "tonic", x: 0.5, y: 0.62 }, // Gold "Home" (I) — the resting place
  { id: "subdominant", x: 0.24, y: 0.34 }, // Green "Away" (IV)
  { id: "dominant", x: 0.76, y: 0.34 }, // Orange "Tense" (V7)
];

export interface Marble {
  x: number; // 0..1
  y: number; // 0..1
  vx: number;
  vy: number;
}

export function makeMarble(): Marble {
  // start gently inside the tonic well so audio has a home from frame 1
  return { x: WELLS[0].x, y: WELLS[0].y, vx: 0, vy: 0 };
}

// Gradient of the summed Gaussian wells at (x,y). Points uphill; we roll down it.
function fieldGradient(x: number, y: number): { gx: number; gy: number } {
  let gx = 0;
  let gy = 0;
  const s2 = WELL_RADIUS * WELL_RADIUS;
  for (const w of WELLS) {
    const dx = x - w.x;
    const dy = y - w.y;
    const r2 = dx * dx + dy * dy;
    // height contribution = -depth * exp(-r2 / (2 s2)) ; derivative wrt x:
    const g = (WELL_DEPTH * Math.exp(-r2 / (2 * s2))) / s2;
    gx += -g * dx; // points toward the well center (downhill)
    gy += -g * dy;
  }
  return { gx, gy };
}

// Height of the field at (x,y) — used for the visual surface shading.
export function fieldHeight(x: number, y: number): number {
  let h = 0;
  const s2 = WELL_RADIUS * WELL_RADIUS;
  for (const w of WELLS) {
    const dx = x - w.x;
    const dy = y - w.y;
    const r2 = dx * dx + dy * dy;
    h += -WELL_DEPTH * Math.exp(-r2 / (2 * s2));
  }
  return h; // negative inside basins
}

// Advance the marble one fixed step.
// gx,gy = normalized tilt gravity vector (each roughly -1..1).
export function stepMarble(m: Marble, gx: number, gy: number, dt: number): void {
  const grad = fieldGradient(m.x, m.y);
  // accelerate downhill (toward wells) + along tilt gravity
  m.vx += (grad.gx * DOWNHILL_ACCEL + gx * TILT_GRAVITY) * dt;
  m.vy += (grad.gy * DOWNHILL_ACCEL + gy * TILT_GRAVITY) * dt;
  // damping (frame-rate independent-ish)
  const d = Math.pow(DAMPING, dt * 60);
  m.vx *= d;
  m.vy *= d;
  // clamp speed (kids-safe — never rockets)
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > MAX_SPEED) {
    m.vx = (m.vx / sp) * MAX_SPEED;
    m.vy = (m.vy / sp) * MAX_SPEED;
  }
  m.x += m.vx;
  m.y += m.vy;
  // soft walls keep it on the meadow
  if (m.x < 0.04) {
    m.x = 0.04;
    m.vx = Math.abs(m.vx) * 0.4;
  }
  if (m.x > 0.96) {
    m.x = 0.96;
    m.vx = -Math.abs(m.vx) * 0.4;
  }
  if (m.y < 0.04) {
    m.y = 0.04;
    m.vy = Math.abs(m.vy) * 0.4;
  }
  if (m.y > 0.96) {
    m.y = 0.96;
    m.vy = -Math.abs(m.vy) * 0.4;
  }
}

// Which well the marble is currently sitting in, or null.
export function wellAt(m: Marble): WellId | null {
  for (const w of WELLS) {
    const d = Math.hypot(m.x - w.x, m.y - w.y);
    if (d < CAPTURE_DIST) return w.id;
  }
  return null;
}

export function wellById(id: WellId): Well {
  const w = WELLS.find((v) => v.id === id);
  // WELLS always contains all three ids; non-null assertion is safe here.
  return w as Well;
}
