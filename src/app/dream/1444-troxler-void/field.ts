// ─────────────────────────────────────────────────────────────────────────────
// field.ts · the per-region adaptation buffer for 1444-troxler-void.
//
// This is the whole point of the piece. A coarse N×N grid tiles the viewport.
// Each cell carries an `adaptation` level in [0,1]: how long that region has gone
// WITHOUT change or attention. Stillness lets adaptation rise; the region's
// contrast/saturation then decays toward the uniform mean field colour — a
// software staging of Troxler fading inside a Ganzfeld. Pointer movement near a
// cell resets its adaptation (the region "re-forms"). Peripheral cells adapt
// faster than the fixated centre, matching the real percept: the periphery melts
// first while a fixated point persists.
//
// No React, no Math.random — a mulberry32 PRNG seeds tiny per-cell phase offsets
// so the idle drift is lively but fully deterministic.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — avoids Math.random for reproducible builds/runs. */
function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface AdaptField {
  /** Grid dimension (N cells per side). */
  readonly n: number;
  /** N*N adaptation levels, 0 (fresh, full contrast) → 1 (faded to void). */
  readonly adapt: Float32Array;
  /** N*N adaptation packed to bytes for WebGL texture upload. */
  readonly tex: Uint8Array;
  /** Per-cell phase offset for lively idle drift. */
  readonly phase: Float32Array;

  /** Pointer position, normalised top-left origin (0..1). */
  pointerX: number;
  pointerY: number;
  /** Recent pointer movement energy, 0 (still) → 1 (sweeping). Decays. */
  energy: number;
  /** Seconds since the pointer last moved. */
  sinceMove: number;
  /** Mean adaptation across the field — how "void" the whole screen is (0..1). */
  voidness: number;
  /** How re-formed / bloomed the field currently is (0..1). Drives audio+glow. */
  bloom: number;
  /** Internal clock (seconds). */
  time: number;

  /** Virtual idle gaze (a slow drifting attention point when nobody interacts). */
  gazeX: number;
  gazeY: number;
}

export function makeAdaptField(n = 40): AdaptField {
  const adapt = new Float32Array(n * n);
  const tex = new Uint8Array(n * n);
  const phase = new Float32Array(n * n);
  const rnd = makeMulberry32(0x14440fed);
  for (let i = 0; i < n * n; i++) phase[i] = rnd() * Math.PI * 2;
  return {
    n,
    adapt,
    tex,
    phase,
    pointerX: 0.5,
    pointerY: 0.5,
    energy: 0,
    sinceMove: 999,
    voidness: 0,
    bloom: 1,
    time: 0,
    gazeX: 0.5,
    gazeY: 0.5,
  };
}

/** Record a pointer move (normalised 0..1). Injects movement energy. */
export function applyPointerMove(
  f: AdaptField,
  x: number,
  y: number,
  speed: number,
): void {
  f.pointerX = x;
  f.pointerY = y;
  f.sinceMove = 0;
  // Speed is normalised screen-widths/sec; saturate so a flick maxes the reform.
  f.energy = Math.min(1, f.energy + Math.min(1, speed * 2.2));
}

const IDLE_DELAY = 2.6; // seconds of stillness before the self-demo takes over.

/** Advance the adaptation field by dt seconds. `reduced` slows all motion for
 *  prefers-reduced-motion visitors. */
export function stepField(f: AdaptField, dt: number, reduced: boolean): void {
  const timeScale = reduced ? 0.35 : 1;
  const sdt = dt * timeScale;
  f.time += sdt;
  f.sinceMove += dt;

  // Movement energy bleeds away — the reform fades back toward stillness.
  f.energy *= Math.exp(-dt / 0.5);

  const idle = f.sinceMove > IDLE_DELAY;
  const n = f.n;

  // ── the idle self-demo ────────────────────────────────────────────────────
  // With no visitor, a virtual gaze drifts on a slow Lissajous and a global
  // "breath" periodically re-forms the whole field, so a hands-off reviewer
  // still watches the void melt and bloom rather than a dead screen.
  let breath = 0;
  let gazeEnergy = 0;
  if (idle) {
    const t = f.time;
    // Ease in over ~2s so the takeover is gentle, not a jump.
    const ease = smoothstep(IDLE_DELAY, IDLE_DELAY + 2, f.sinceMove);
    f.gazeX = 0.5 + 0.26 * Math.sin(t * 0.17) * Math.cos(t * 0.061);
    f.gazeY = 0.5 + 0.24 * Math.sin(t * 0.13 + 1.7);
    // A slow reform pulse (~13s period), sharpened so most of the cycle is quiet
    // fade and the bloom arrives as an occasional soft breath.
    const s = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 13);
    breath = Math.pow(s, 5) * ease;
    gazeEnergy = (0.32 + 0.5 * breath) * ease;
  }

  // Active pointer (or idle gaze) reset radius — a soft Gaussian of influence.
  const px = idle ? f.gazeX : f.pointerX;
  const py = idle ? f.gazeY : f.pointerY;
  const activeEnergy = idle ? gazeEnergy : f.energy;
  const radius = 0.16;
  const invR2 = 1 / (radius * radius);

  let sum = 0;
  for (let j = 0; j < n; j++) {
    const cy = (j + 0.5) / n;
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) / n;
      const idx = j * n + i;

      // Radial position from centre → periphery adapts (fades) faster.
      const dcx = cx - 0.5;
      const dcy = cy - 0.5;
      const r = Math.sqrt(dcx * dcx + dcy * dcy) / 0.7071;
      const peripheral = smoothstep(0.12, 0.95, r);
      // Asymptotic rise toward 1: stillness fades the region into the void.
      const rise = 0.085 * (0.22 + 1.5 * peripheral);
      let a = f.adapt[idx];
      a += (1 - a) * rise * sdt;

      // Attention (real pointer, or the idle gaze) clears adaptation nearby.
      if (activeEnergy > 0.001) {
        const dx = cx - px;
        const dy = cy - py;
        const infl = Math.exp(-(dx * dx + dy * dy) * invR2) * activeEnergy;
        a *= 1 - Math.min(0.97, infl);
      }
      // Global idle breath re-forms the whole field a little.
      if (breath > 0.001) a *= 1 - 0.6 * breath;

      if (a < 0) a = 0;
      else if (a > 1) a = 1;
      f.adapt[idx] = a;
      f.tex[idx] = (a * 255) | 0;
      sum += a;
    }
  }

  f.voidness = sum / (n * n);
  // Bloom: how re-formed the field is right now. Combines live pointer energy,
  // the idle breath, and the inverse of mean voidness so audio+visual track it.
  const drive = Math.max(activeEnergy, breath * 0.8);
  const target = Math.max(1 - f.voidness, drive);
  // Smooth so audio doesn't chatter frame-to-frame.
  f.bloom += (target - f.bloom) * Math.min(1, dt * 3.5);
}
