/* ── 3480-reverie · three-act cinematic arc ──────────────────────────────
 *
 *  An ALTERNATE Resonance journey engine. Where the default is a
 *  psychedelic six-phase arc and the sibling `3456-surge` is an EDM
 *  build-and-drop, this one is the canonical CINEMATIC THREE-ACT arc of
 *  trailer / score music:
 *
 *      ACT I  "Setup"        calm, low arousal, consonant, establishing
 *        │  ↳ TRANSITION  ·  rise      (a riser lifts us into the storm)
 *      ACT II "Confrontation"  rising tension, unstable harmony, dense
 *        │  ↳ TRANSITION  ·  collapse  (the climax — dark folds into light)
 *      ACT III "Resolution"    a bloom-climax, then denouement into stillness
 *        │  ↳ TRANSITION  ·  settle    (relative-minor fall back to the start)
 *      … loops back to ACT I.
 *
 *  The crafted centerpiece is the TRANSITION between acts (see director.ts /
 *  audio.ts): never a hard cut — a synthesized musical + visual BRIDGE that
 *  morphs one act's world continuously into the next.
 *
 *  The human relationship is WITNESS & PACE. The arc auto-advances (it plays
 *  itself as a cinematic journey). Holding Space lets the viewer DWELL: time
 *  dilates and the current moment deepens. Releasing resumes the advance.
 *  Nothing can be failed. Dwell is applied by the caller as a multiplier on
 *  `dt` before it reaches `stepArc`, so lingering literally slows the clock —
 *  you can even freeze inside a transition and watch the morph hang.
 */

export type Phase =
  | "act1"
  | "trans12"
  | "act2"
  | "trans23"
  | "act3"
  | "trans31";

export type TransStyle = "rise" | "collapse" | "settle" | null;

export interface ArcState {
  phase: Phase;
  /** seconds spent in the current phase (already dwell-dilated by caller) */
  phaseT: number;
  /** duration of the current phase in (dilated) seconds */
  segDur: number;
  /** monotonic dilated seconds since the arc started */
  totalT: number;
  /** 0..1 progress through the current phase */
  segProgress: number;
  /** which act we are in / departing from (0,1,2) */
  fromAct: number;
  /** which act we are in / heading toward (0,1,2) */
  toAct: number;
  /** transition style, or null when inside an act */
  transStyle: TransStyle;
  /** true while inside a transition bridge */
  inTransition: boolean;
  /** how many full loops have elapsed */
  loops: number;
}

// ── segment durations (seconds; ~2:52 base, longer with dwelling) ──────────
const ACT1_DUR = 40;
const T12_DUR = 10;
const ACT2_DUR = 48;
const T23_DUR = 10;
const ACT3_DUR = 54;
const T31_DUR = 10;

interface Seg {
  phase: Phase;
  dur: number;
  from: number;
  to: number;
  style: TransStyle;
}

// the fixed cinematic running order
const ORDER: Seg[] = [
  { phase: "act1", dur: ACT1_DUR, from: 0, to: 0, style: null },
  { phase: "trans12", dur: T12_DUR, from: 0, to: 1, style: "rise" },
  { phase: "act2", dur: ACT2_DUR, from: 1, to: 1, style: null },
  { phase: "trans23", dur: T23_DUR, from: 1, to: 2, style: "collapse" },
  { phase: "act3", dur: ACT3_DUR, from: 2, to: 2, style: null },
  { phase: "trans31", dur: T31_DUR, from: 2, to: 0, style: "settle" },
];

function applySeg(s: ArcState, idx: number): void {
  const seg = ORDER[idx];
  s.phase = seg.phase;
  s.segDur = seg.dur;
  s.fromAct = seg.from;
  s.toAct = seg.to;
  s.transStyle = seg.style;
  s.inTransition = seg.style !== null;
  s.phaseT = 0;
  s.segProgress = 0;
}

export function createArc(): ArcState {
  const s: ArcState = {
    phase: "act1",
    phaseT: 0,
    segDur: ACT1_DUR,
    totalT: 0,
    segProgress: 0,
    fromAct: 0,
    toAct: 0,
    transStyle: null,
    inTransition: false,
    loops: 0,
  };
  applySeg(s, 0);
  return s;
}

/** index of the current segment in ORDER */
function segIndex(phase: Phase): number {
  return ORDER.findIndex((o) => o.phase === phase);
}

/**
 * Advance the arc by `dt` dilated seconds. The caller is responsible for
 * having already scaled `dt` by the dwell factor (linger → smaller dt).
 */
export function stepArc(s: ArcState, dt: number): void {
  s.totalT += dt;
  s.phaseT += dt;
  if (s.phaseT >= s.segDur) {
    const idx = segIndex(s.phase);
    const next = (idx + 1) % ORDER.length;
    if (next === 0) s.loops += 1;
    // carry the overflow so timing never hitches
    const overflow = s.phaseT - s.segDur;
    applySeg(s, next);
    s.phaseT = Math.min(overflow, s.segDur);
  }
  s.segProgress = s.segDur > 0 ? s.phaseT / s.segDur : 0;
}

export const PHASE_LABEL: Record<Phase, string> = {
  act1: "act i · setup",
  trans12: "bridge · rise",
  act2: "act ii · confrontation",
  trans23: "bridge · collapse",
  act3: "act iii · resolution",
  trans31: "bridge · settle",
};

/** short act name for the HUD's act indicator */
export function actName(a: number): string {
  return a === 0 ? "I" : a === 1 ? "II" : "III";
}
