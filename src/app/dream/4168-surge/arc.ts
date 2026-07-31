// ─────────────────────────────────────────────────────────────────────────
// 4168-surge · arc.ts — the long-form energy-arc STATE MACHINE.
//
//   Seven named sections whose durations sum to ~7.3 minutes. This is the
//   spine of the piece: it turns a single wall-clock time (performance.now)
//   into an ENERGY field, a RISER drive, and a per-section identity that the
//   synth engine (audio.ts) and the plasma shader (shaders.ts) both read.
//
//   The canonical EDM build-and-drop song form — tension (riser) → release
//   (drop) → recovery (breakdown) → a SECOND, bigger tension/release — is the
//   architecture we borrow. Energy is not flat inside a section: builds
//   ACCELERATE upward (ease-in) so the last bars feel steepest, drops SLAM to
//   a high plateau then bleed a little, breakdown sinks.
// ─────────────────────────────────────────────────────────────────────────

export type Phase =
  | "intro"
  | "build1"
  | "drop1"
  | "breakdown"
  | "build2"
  | "drop2"
  | "outro";

export const PHASE_LABEL: Record<Phase, string> = {
  intro: "Intro · the piano alone",
  build1: "Build 1 · riser climbing",
  drop1: "Drop 1 · motif returns",
  breakdown: "Breakdown · cooling",
  build2: "Build 2 · steeper riser",
  drop2: "Drop 2 · bigger, wider",
  outro: "Outro · dissolve",
};

interface SectionDef {
  phase: Phase;
  dur: number; // seconds
  e0: number; // energy at section start
  e1: number; // energy at section end
  shape: "in" | "out" | "hold" | "flat"; // easing of the e0→e1 sweep
}

// Durations sum to 440s = 7m20s. Drop 2 is longer AND higher-energy than
// Drop 1 — the piece escalates; minute 7 is a climax minute 1 only hints at.
const SECTIONS: SectionDef[] = [
  { phase: "intro", dur: 46, e0: 0.1, e1: 0.24, shape: "flat" },
  { phase: "build1", dur: 58, e0: 0.24, e1: 0.9, shape: "in" },
  { phase: "drop1", dur: 74, e0: 0.86, e1: 0.72, shape: "out" },
  { phase: "breakdown", dur: 56, e0: 0.5, e1: 0.34, shape: "out" },
  { phase: "build2", dur: 70, e0: 0.34, e1: 0.98, shape: "in" },
  { phase: "drop2", dur: 96, e0: 1.0, e1: 0.86, shape: "hold" },
  { phase: "outro", dur: 40, e0: 0.55, e1: 0.0, shape: "out" },
];

export const TOTAL_SECONDS = SECTIONS.reduce((a, s) => a + s.dur, 0);

export interface ArcFrame {
  phase: Phase;
  label: string;
  sectionIndex: number;
  /** 0..1 overall drive — the single most important number in the piece. */
  energy: number;
  /** 0..1 Shepard-riser drive; nonzero only while building. */
  riser: number;
  /** 0..1 progress within the current section. */
  sectionProgress: number;
  /** 0..1 progress through the whole set. */
  totalProgress: number;
  /** seconds elapsed inside the current section. */
  timeInPhase: number;
  /** 0..1 white-bloom impulse at each drop onset, decaying over ~1.4s. */
  dropFlash: number;
  /** true once the set has run past its final second. */
  ended: boolean;
}

function ease(shape: SectionDef["shape"], p: number): number {
  const x = Math.min(1, Math.max(0, p));
  switch (shape) {
    case "in":
      // accelerating — the build feels steepest right before the drop
      return x * x * (2.2 - 1.2 * x);
    case "out":
      return 1 - (1 - x) * (1 - x);
    case "hold":
      // rise fast, sit near the top (drop-2 plateau)
      return 1 - Math.pow(1 - x, 3);
    default:
      return x;
  }
}

/** Riser drive within a build: silent at first, endlessly-rising by the end. */
function makeRiser(phase: Phase, p: number): number {
  if (phase !== "build1" && phase !== "build2") return 0;
  // grows from ~0.15 to 1.0, steepening — the last quarter is a full riser.
  const g = Math.pow(Math.min(1, Math.max(0, p)), 1.6);
  const boost = phase === "build2" ? 1.0 : 0.85; // build 2 is the steeper one
  return Math.min(1, 0.12 + boost * g);
}

export function sampleArc(tSec: number): ArcFrame {
  const total = TOTAL_SECONDS;
  const ended = tSec >= total;
  const t = Math.min(tSec, total - 0.001);

  let acc = 0;
  let idx = 0;
  for (let i = 0; i < SECTIONS.length; i++) {
    if (t < acc + SECTIONS[i].dur) {
      idx = i;
      break;
    }
    acc += SECTIONS[i].dur;
    idx = i;
  }
  const sec = SECTIONS[idx];
  const timeInPhase = t - acc;
  const p = timeInPhase / sec.dur;
  const energy = sec.e0 + (sec.e1 - sec.e0) * ease(sec.shape, p);

  const isDrop = sec.phase === "drop1" || sec.phase === "drop2";
  // bigger bloom for drop 2
  const flashPeak = sec.phase === "drop2" ? 1.0 : 0.72;
  const dropFlash = isDrop ? flashPeak * Math.exp(-timeInPhase / 1.4) : 0;

  return {
    phase: sec.phase,
    label: PHASE_LABEL[sec.phase],
    sectionIndex: idx,
    energy: Math.min(1, Math.max(0, energy)),
    riser: makeRiser(sec.phase, p),
    sectionProgress: p,
    totalProgress: t / total,
    timeInPhase,
    dropFlash,
    ended,
  };
}
