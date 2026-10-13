/**
 * FIGURE MOTION — geometric figures are never static (Karel 2026-10-13,
 * Grasshopper: "be careful of the starburst particle shape just sitting there
 * … it sat there and it doesnt move … and was on screen a long time").
 *
 * Why the starburst sat still: the CALM FRAME (particle-lead-layer) zeroes the
 * per-mote drive and band pushes and runs every clock at rest tempo, so the
 * starburst's only motion left was a slow per-mote radial swell — each mote on
 * its own random phase, which averages out to an unchanging silhouette — with
 * no turn at all, and its directions are isotropic, so even the camera orbit
 * showed nothing. Today's motion features (currents, breath, two hands, light
 * gravity) deliberately leave figures alone (their freedom is ~0 and a figure's
 * spring is stiff, so a per-mote force barely deforms it), and the phrase
 * conductor can hold a form much longer than the old clock (a refigure of the
 * same soul reset the hold: 48 s → 94 s of starburst).
 *
 * Three laws, all MOTION (never luminance — WCAG 2.3.1):
 *  1. THE MOTION FLOOR: every figure soul turns about its own axis on a steady
 *     clock (real time, never the beat) and sways gently — a rigid FRAME the
 *     shader wraps around the soul's force law (shaders.ts figureFrame), so the
 *     figure stays crisp while it moves. Snowflake + Ghost get it too (a
 *     particle-engine fix), their scripted forms and timings untouched.
 *  2. FIGURES FEEL THE FIELD, A LITTLE, AS A BODY: the currents carry the whole
 *     figure on a slow bounded wander (tension adds a slow turn), the breath
 *     scales it by a few percent, the two hands tilt it, the light draws it a
 *     little toward itself — FEEL (0.2) of the effect, never per-mote smearing.
 *  3. MAX ON-SCREEN TIME: a figure soul is never held longer than
 *     MAX_HOLD_SEC (a refigure of the same soul is the same look and does not
 *     count as a change). Free souls (fireflies, motes, nebula, aurora …) may
 *     hold longer. Applied by phrase-conductor.ts figureHoldDue (prefers the
 *     conductor's own phrase events that land inside the cap). Never for the
 *     mastered journeys' scripted forms.
 */

import { SOUL_IDS, SOULS, type SoulId } from "./souls";
import { currentFreedom } from "./harmonic-currents";

export const FIGURE_LAWS = {
  /** a figure soul is on screen at most this long (s) */
  MAX_HOLD_SEC: 22,
  /** an overdue figure still waits this long after any change (one big change at a time) */
  OVERDUE_MIN_GAP_SEC: 3,
  /** an overdue figure still keeps clear of a timed image moment this far ahead (s; normal forms 15) */
  OVERDUE_LEAD_SEC: 8,
  /** a soul freer than this (currents) is a free soul, not a figure */
  FREE_FROM: 0.3,
  /** motion floor: the frame's own turn (rad/s, steady clock) */
  SPIN_FLOOR: 0.03,
  /** motion floor: the frame's sway amplitude (rad) */
  SWAY_FLOOR: 0.04,
  /** how much a figure feels the free field's features, as a rigid body */
  FEEL: 0.2,
  /** rigid response: glide (s) on top of the features' own eased timelines */
  GLIDE_SEC: 3,
  /** the currents' wander reach (× screen half-height, before FEEL) */
  CURRENT_REACH: 0.4,
  /** the currents' tension turn (rad/s, before FEEL) */
  TENSION_TURN: 0.15,
  /** breath scale per unit breath (before FEEL): ±4 % at FEEL 0.2 */
  BREATH_SCALE: 0.2,
  /** two hands tilt per unit hand difference (rad, before FEEL) */
  HANDS_TILT: 0.4,
  /** light gravity pull toward the light's centroid (× its NDC offset, before FEEL) */
  GRAVITY_PULL: 0.5,
  /** hard caps on the rigid response (motion stays slow and small) */
  MAX_OFFSET: 0.1,
  MAX_SCALE_DEV: 0.05,
  MAX_TILT: 0.08,
  MAX_TURN: 0.04,
} as const;

/** Souls whose force law draws a FIGURE (geometry held by stiff springs). The
 *  rise souls (flame, wisp, petal fall) stream and re-enter — never static;
 *  Ghost's spirit is built facing the camera and drifts on its own. */
export const FIGURE_SOULS: ReadonlySet<SoulId> = new Set(
  SOULS.filter((s) => currentFreedom(s.id) < FIGURE_LAWS.FREE_FROM && s.respawn !== "rise" && s.id !== "spirit").map((s) => s.id),
);
export const isFigureSoul = (id: string): boolean => FIGURE_SOULS.has(id as SoulId);

export interface FigureMotion {
  /** rad/s about the figure's own (vertical) axis, steady clock; sign = direction */
  spin: number;
  /** rad: a slow rocking about the figure's horizontal axis */
  sway: number;
  /** s: one full sway */
  period: number;
}

const FLAT_TOP_DOWN: readonly SoulId[] = ["bloom", "cymatics", "kaleido", "rose", "spirograph", "mandala", "blossom", "caustic", "girih", "medallion"];
/** Per-soul overrides; everything else in FIGURE_SOULS gets the floor. */
const OVERRIDES: Partial<Record<SoulId, Partial<FigureMotion>>> = {
  // the starburst had no turn at all — its shells also counter-turn inside the soul
  starburst: { spin: 0.045, sway: 0.08, period: 37 },
  // rings are round: the turn shows as the tilted stack PRECESSING, the sway as a rock
  rings: { spin: 0.035, sway: 0.09, period: 43 },
  // the galaxy already turns on its own clock
  vortex: { spin: 0.03, sway: 0.05, period: 47 },
  // 3-D solids read every turn
  harmonics: { spin: 0.035, sway: 0.07, period: 39 },
  torus: { spin: 0.03, sway: 0.07, period: 41 },
};

/** The motion of every soul's frame (0 / 0 for free souls = untouched). */
export const FIGURE_MOTION: Readonly<Record<SoulId, FigureMotion>> = Object.fromEntries(
  SOUL_IDS.map((id, i) => {
    if (!FIGURE_SOULS.has(id)) return [id, { spin: 0, sway: 0, period: 40 }];
    const flat = FLAT_TOP_DOWN.includes(id);
    const base: FigureMotion = {
      // alternate direction across the library so successive figures differ
      spin: (i % 2 === 0 ? 1 : -1) * 0.035,
      // seen from above, a flat figure only rocks a little (it stays a rosette)
      sway: flat ? FIGURE_LAWS.SWAY_FLOOR : 0.06,
      period: 35 + (i % 5) * 3,
    };
    const o = OVERRIDES[id];
    const m = { ...base, ...o };
    if (o?.spin !== undefined) m.spin = (i % 2 === 0 ? 1 : -1) * Math.abs(o.spin);
    return [id, m];
  }),
) as Record<SoulId, FigureMotion>;

/** Visible motion of a figure frame at unit radius (rad/s): turn + peak sway rate. */
export function figureMotionFloor(id: SoulId): number {
  const m = FIGURE_MOTION[id];
  return Math.abs(m.spin) + (m.sway * 2 * Math.PI) / m.period;
}

const glf = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
/** GLSL constants (indexed by soul) for the sim's figureFrame(). */
export function figureMotionGlsl(): string {
  const n = SOUL_IDS.length;
  const arr = (k: keyof FigureMotion) => `const float FIG_${k.toUpperCase()}[${n}] = float[${n}](${SOUL_IDS.map((id) => glf(FIGURE_MOTION[id][k])).join(", ")});`;
  return [arr("spin"), arr("sway"), arr("period")].join("\n");
}

// ── 2. the rigid response to the free field's features ──────────────────────
export interface FigureRigidInput {
  /** harmonic currents (eased): amount 0..1 (before soul freedom), tension 0..1, steady clock (s) */
  curAmount: number;
  curTension: number;
  curClock: number;
  /** breath (eased): amount 0..1 (before soul freedom), breath −1..1 */
  brAmount: number;
  breath: number;
  /** two hands (eased, before soul freedom) */
  handsLow: number;
  handsHigh: number;
  /** light gravity: gain 0..1 and the weighted centroid of the lights (screen NDC) */
  gravGain: number;
  gravX: number;
  gravY: number;
}

export interface FigureRigid {
  /** offset in the screen plane (× half-height) and along the view axis */
  right: number;
  up: number;
  depth: number;
  /** uniform scale (1 = rest) */
  scale: number;
  /** tilt about the screen's horizontal axis (rad) */
  tilt: number;
  /** extra turn rate about the figure's own axis (rad/s, integrated by the engine) */
  turnRate: number;
}

export const REST_RIGID: Readonly<FigureRigid> = Object.freeze({ right: 0, up: 0, depth: 0, scale: 1, tilt: 0, turnRate: 0 });

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : 0));

/** Where the features would carry a figure, as ONE body (pure, bounded). All
 *  inputs at rest (or the features off: Snowflake, Ghost) → REST_RIGID. */
export function figureRigidTarget(i: FigureRigidInput): FigureRigid {
  const L = FIGURE_LAWS, F = L.FEEL;
  const ca = clamp(i.curAmount, 0, 1), T = Number.isFinite(i.curClock) ? i.curClock : 0;
  // the currents: a slow bounded wander on their own steady clock (never the beat)
  const wr = F * ca * L.CURRENT_REACH;
  let right = wr * Math.sin(T * 0.031 + 0.7);
  let up = wr * 0.6 * Math.sin(T * 0.023 + 1.9);
  const depth = clamp(wr * 0.5 * Math.sin(T * 0.017 + 0.4), -L.MAX_OFFSET, L.MAX_OFFSET);
  // light gravity: drawn a little toward where the light is
  const gg = clamp(i.gravGain, 0, 1);
  right += F * gg * L.GRAVITY_PULL * clamp(i.gravX, -1.5, 1.5);
  up += F * gg * L.GRAVITY_PULL * clamp(i.gravY, -1.5, 1.5);
  const off = Math.hypot(right, up);
  if (off > L.MAX_OFFSET) { right *= L.MAX_OFFSET / off; up *= L.MAX_OFFSET / off; }
  const scale = 1 + clamp(F * clamp(i.brAmount, 0, 1) * L.BREATH_SCALE * clamp(i.breath, -1, 1), -L.MAX_SCALE_DEV, L.MAX_SCALE_DEV);
  const tilt = clamp(F * L.HANDS_TILT * (clamp(i.handsLow, 0, 2) - clamp(i.handsHigh, 0, 2)), -L.MAX_TILT, L.MAX_TILT);
  const turnRate = clamp(F * ca * clamp(i.curTension, 0, 1) * L.TENSION_TURN, 0, L.MAX_TURN);
  // (+ 0: never a negative zero)
  return { right: right + 0, up: up + 0, depth: depth + 0, scale, tilt: tilt + 0, turnRate: turnRate + 0 };
}

/** One glide step of the rigid response toward its target (dt in s). */
export function glideRigid(s: FigureRigid, t: FigureRigid, dt: number): FigureRigid {
  const k = 1 - Math.exp(-Math.max(0, dt) / FIGURE_LAWS.GLIDE_SEC);
  return {
    right: s.right + (t.right - s.right) * k,
    up: s.up + (t.up - s.up) * k,
    depth: s.depth + (t.depth - s.depth) * k,
    scale: s.scale + (t.scale - s.scale) * k,
    tilt: s.tilt + (t.tilt - s.tilt) * k,
    turnRate: s.turnRate + (t.turnRate - s.turnRate) * k,
  };
}

/** Column-major 3×3: rotation by `tilt` about the unit axis `ax` (screen right),
 *  then by `turn` about world up — the figure frame's rigid part. */
export function rigidMatrix(ax: readonly number[], tilt: number, turn: number, out: Float32Array = new Float32Array(9)): Float32Array {
  const [x, y, z] = ax;
  const c = Math.cos(tilt), s = Math.sin(tilt), C = 1 - c;
  // R_tilt (Rodrigues), row-major entries
  const A = [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C,
  ];
  // R_turn about +y (matches the shader's rotY: x' = c x + s z, z' = -s x + c z)
  const ct = Math.cos(turn), st = Math.sin(turn);
  const B = [ct, 0, st, 0, 1, 0, -st, 0, ct];
  // M = A·B, written column-major (out[col * 3 + row])
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
    let m = 0;
    for (let k = 0; k < 3; k++) m += A[r * 3 + k] * B[k * 3 + q];
    out[q * 3 + r] = m;
  }
  return out;
}
