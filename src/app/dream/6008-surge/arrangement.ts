// arrangement.ts — the scalar ENERGY(t) automation engine.
//
// A through-composed EDM build-and-drop arc laid out on a 124 BPM,
// 16-bar phrase grid (cf. Mark J. Butler, *Unlocking the Groove*, 2006 —
// the 16-bar phrase as the fundamental unit of build-and-drop dramaturgy
// in electronic dance music). One scalar automation curve, ENERGY(t) in
// [0,1], both DRIVES the arrangement (layer gates, filter cutoff, note
// density) and IS the visual (the energy ridge). No randomness lives here
// — the arrangement is fully determined by time.

export const BPM = 124;
export const SPB = 60 / BPM; // seconds per beat
export const SIXTEENTH = SPB / 4; // seconds per 16th note
export const BEATS_PER_BAR = 4;
export const SEC_PER_BAR = SPB * BEATS_PER_BAR;

export type SectionName =
  | "Intro"
  | "Build"
  | "Breakdown"
  | "Drop"
  | "Build II"
  | "Drop II"
  | "Outro";

export interface Section {
  name: SectionName;
  bars: number;
  startBar: number;
  startTime: number; // seconds from arrangement origin
  endTime: number;
  isDrop: boolean;
  isBuild: boolean;
}

// 16-bar phrase multiples — the Butler grid. Builds/drops span a full
// 16-bar phrase; intros/breakdowns/outros are half-phrases (8 bars).
const RAW: { name: SectionName; bars: number }[] = [
  { name: "Intro", bars: 8 },
  { name: "Build", bars: 16 },
  { name: "Breakdown", bars: 8 },
  { name: "Drop", bars: 16 },
  { name: "Build II", bars: 8 },
  { name: "Drop II", bars: 16 },
  { name: "Outro", bars: 8 },
];

export const SECTIONS: Section[] = (() => {
  let bar = 0;
  return RAW.map((r) => {
    const startBar = bar;
    const startTime = startBar * SEC_PER_BAR;
    bar += r.bars;
    return {
      name: r.name,
      bars: r.bars,
      startBar,
      startTime,
      endTime: bar * SEC_PER_BAR,
      isDrop: r.name === "Drop" || r.name === "Drop II",
      isBuild: r.name === "Build" || r.name === "Build II",
    };
  });
})();

export const TOTAL_BARS = SECTIONS.reduce((a, s) => a + s.bars, 0);
export const TOTAL_TIME = TOTAL_BARS * SEC_PER_BAR;

export function wrap(t: number): number {
  return ((t % TOTAL_TIME) + TOTAL_TIME) % TOTAL_TIME;
}

export function sectionAt(t: number): Section {
  const w = wrap(t);
  for (let i = SECTIONS.length - 1; i >= 0; i--) {
    if (w >= SECTIONS[i].startTime) return SECTIONS[i];
  }
  return SECTIONS[0];
}

function progress(w: number, s: Section): number {
  return (w - s.startTime) / (s.endTime - s.startTime);
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

// ENERGY(t): the master automation. Distinctive silhouette — a first
// build, a breakdown that empties the floor then racks a riser to a peak,
// a sustained DROP plateau, a tighter second build + drop, then a decay.
export function energyAt(t: number): number {
  const w = wrap(t);
  const s = sectionAt(w);
  const p = progress(w, s);
  switch (s.name) {
    case "Intro":
      return 0.1 + 0.08 * p;
    case "Build":
      return 0.18 + 0.7 * Math.pow(p, 1.4);
    case "Breakdown": {
      // first half: the floor drops out (tension by absence);
      // second half: the snare-roll riser racks energy to the ceiling.
      if (p < 0.5) return 0.85 - 0.72 * smooth(p / 0.5);
      const q = (p - 0.5) / 0.5;
      return 0.13 + 0.87 * Math.pow(q, 2.0);
    }
    case "Drop":
      return 0.94 - 0.06 * smooth(p);
    case "Build II":
      return 0.4 + 0.52 * Math.pow(p, 1.3);
    case "Drop II":
      return 0.96 - 0.08 * smooth(p);
    case "Outro":
      return 0.88 * Math.pow(1 - p, 1.6) + 0.02;
    default:
      return 0;
  }
}

// How intense the snare-roll riser is (0..1). Subdivision speed in the
// synth scales off this — the roll subdivides faster as it approaches 1.
export function riserAt(t: number): number {
  const w = wrap(t);
  const s = sectionAt(w);
  const p = progress(w, s);
  if (s.name === "Build" || s.name === "Build II") return p;
  if (s.name === "Breakdown") return p < 0.5 ? 0 : (p - 0.5) / 0.5;
  return 0;
}

// Start time of the first DROP — the "jump to the drop" target.
export const DROP_TIME = SECTIONS.find((s) => s.isDrop)?.startTime ?? 0;
