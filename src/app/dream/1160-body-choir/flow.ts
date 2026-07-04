// ── Self-contained optical-flow / motion field ──────────────────────────────
// Frame-differencing block-motion energy. NO external libs, NO MediaPipe,
// NO CDN model. We downsample a video frame to a small grid, compute per-cell
// brightness (luma), diff it against the previous frame, and accumulate the
// per-cell motion energy, a total energy, and an energy-weighted centroid.
// The same MotionField shape is fed by the pointer / idle fallback drivers, so
// the audio + visual mapping never has to care where the motion came from.

export interface MotionField {
  gw: number;
  gh: number;
  cell: Float32Array; // smoothed per-cell energy, 0..1 (for the visual ribbons)
  energy: number; // total normalized motion energy 0..1
  cx: number; // energy-weighted centroid x, 0..1 (already in mirrored space)
  cy: number; // energy-weighted centroid y, 0..1 (0 = top of frame)
  speed: number; // how fast energy is rising, 0..1 (attack brightness)
}

export interface FlowState {
  field: MotionField;
  prevGray: Float32Array | null;
  smoothEnergy: number;
  lastEnergy: number;
  // low-pass on centroid so pitch focus glides instead of jumping
  scx: number;
  scy: number;
}

export function createFlow(gw: number, gh: number): FlowState {
  const n = gw * gh;
  return {
    field: {
      gw,
      gh,
      cell: new Float32Array(n),
      energy: 0,
      cx: 0.5,
      cy: 0.5,
      speed: 0,
    },
    prevGray: null,
    smoothEnergy: 0,
    lastEnergy: 0,
    scx: 0.5,
    scy: 0.5,
  };
}

// Fade the persisted per-cell energy every frame so ribbons trail and dissolve.
function decayCells(cell: Float32Array, k: number) {
  for (let i = 0; i < cell.length; i++) cell[i] *= k;
}

// Finalize shared bookkeeping: smooth totals, derive rising-edge speed, glide
// the centroid. `rawEnergy` is this frame's un-smoothed total (0..1-ish).
function finalize(
  s: FlowState,
  rawEnergy: number,
  cxAcc: number,
  cyAcc: number,
  wAcc: number,
  reduced: boolean,
) {
  const f = s.field;
  const eSmooth = reduced ? 0.12 : 0.2;
  s.smoothEnergy += (rawEnergy - s.smoothEnergy) * eSmooth;
  const e = Math.min(1, s.smoothEnergy);
  // rising edge only -> "attack" brightness; falling motion doesn't spike it
  const rise = Math.max(0, e - s.lastEnergy);
  s.lastEnergy = e;
  f.speed += (Math.min(1, rise * 6) - f.speed) * 0.35;

  if (wAcc > 1e-4) {
    const tx = cxAcc / wAcc;
    const ty = cyAcc / wAcc;
    const glide = reduced ? 0.05 : 0.09;
    s.scx += (tx - s.scx) * glide;
    s.scy += (ty - s.scy) * glide;
  }
  f.cx = s.scx;
  f.cy = s.scy;
  f.energy = e;
}

// ── Camera driver: real frame-differencing optical flow ─────────────────────
// `data` is RGBA from a gw×gh downsample of the (already mirrored) video.
export function updateFromCamera(
  s: FlowState,
  data: Uint8ClampedArray,
  reduced: boolean,
) {
  const { gw, gh, cell } = s.field;
  const n = gw * gh;
  if (!s.prevGray) s.prevGray = new Float32Array(n);
  const prev = s.prevGray;

  decayCells(cell, reduced ? 0.9 : 0.82);

  let total = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  let wAcc = 0;
  const THRESH = 0.045; // ignore sensor noise / tiny lighting drift

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const p = i * 4;
      // Rec.601 luma, 0..1
      const g =
        (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
      let d = Math.abs(g - prev[i]);
      prev[i] = g;
      if (d < THRESH) d = 0;
      if (d > 0) {
        // deposit into the persistent field (max so trails stay bright)
        const dep = Math.min(1, d * 3.2);
        if (dep > cell[i]) cell[i] = dep;
        total += d;
        const w = d;
        cxAcc += (x / (gw - 1)) * w;
        cyAcc += (y / (gh - 1)) * w;
        wAcc += w;
      }
    }
  }
  // normalize: `total` ~ sum of luma diffs; scale into a musical 0..1 range
  const rawEnergy = Math.min(1, total / (n * 0.09));
  finalize(s, rawEnergy, cxAcc, cyAcc, wAcc, reduced);
}

// ── Pointer driver: same field, fed by mouse velocity + position ────────────
export function depositPointer(
  s: FlowState,
  nx: number,
  ny: number,
  vel: number,
  reduced: boolean,
) {
  const { gw, gh, cell } = s.field;
  decayCells(cell, reduced ? 0.92 : 0.86);

  const cxCell = nx * (gw - 1);
  const cyCell = ny * (gh - 1);
  const radius = 3.2;
  const strength = Math.min(1, 0.25 + vel * 2.4);
  let total = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  let wAcc = 0;

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const dx = x - cxCell;
      const dy = y - cyCell;
      const dist2 = dx * dx + dy * dy;
      const fall = Math.exp(-dist2 / (radius * radius));
      const dep = fall * strength;
      const i = y * gw + x;
      if (dep > cell[i]) cell[i] = dep;
      if (dep > 0.02) {
        total += dep;
        cxAcc += (x / (gw - 1)) * dep;
        cyAcc += (y / (gh - 1)) * dep;
        wAcc += dep;
      }
    }
  }
  const rawEnergy = Math.min(1, (total / (gw * gh)) * 9 + vel * 0.5);
  finalize(s, rawEnergy, cxAcc, cyAcc, wAcc, reduced);
}

// ── Idle driver: a gentle procedural wander so the canvas is alive on mount ──
// Deterministic (trig only, no Math.random / Date seeding).
export function depositIdle(s: FlowState, t: number, reduced: boolean) {
  const { gw, gh } = s.field;
  const amp = reduced ? 0.16 : 0.28;
  // a slow lissajous drifting light source
  const nx = 0.5 + 0.34 * Math.sin(t * 0.23);
  const ny = 0.5 + 0.3 * Math.sin(t * 0.17 + 1.3);
  const vel = amp * (0.5 + 0.5 * Math.sin(t * 0.4));
  depositPointer(s, nx, ny, vel, reduced);
  // keep energy softly breathing even when the wander slows
  s.smoothEnergy = Math.max(s.smoothEnergy, (reduced ? 0.06 : 0.12) * (0.6 + 0.4 * Math.sin(t * 0.31)));
  s.field.energy = Math.min(1, s.smoothEnergy);
  void gw;
  void gh;
}
