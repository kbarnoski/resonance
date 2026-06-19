// family.ts — the long-form state & the HARMONY brain.
//
// The phrase-memory store is the source of truth for both audio and visuals.
// A child's hummed phrases are remembered as scale-degree fragments. Companions
// HATCH (cap 4) and GROW as the family hears more. When the child is quiet, the
// family sings a remembered phrase back as a STACKED CHORD CHOIR: each companion
// takes a different consonant chord tone (root / 3rd / 5th / octave / 9th), so a
// single remembered line blooms into warm 3–4-part harmony — thin solo at minute
// one, full warm chord-family by minute five.

import { SCALE_HZ, snapToScaleIndex } from "./audio";

/** A remembered melodic fragment as scale-degree indices + per-note durations. */
export interface Fragment {
  degrees: number[];
  durs: number[];
  bornAt: number; // ms
}

/** One glowing companion. */
export interface Companion {
  id: number;
  /** notes this companion has personally heard — drives its own growth */
  heard: number;
  /** 0..1 maturity (size / brightness / warmth) */
  growth: number;
  /** which chord-tone role it prefers (offset within a triad/extension stack) */
  voiceRole: number;
  /** resting position in the field, -1..1 */
  x: number;
  y: number;
  /** smoothed singing energy for visuals, 0..1 */
  singEnergy: number;
  hue: number; // base hue, warms with growth
}

export interface FamilyState {
  fragments: Fragment[];
  companions: Companion[];
  notesHeard: number; // total across the whole family
}

const MAX_FRAGMENTS = 48;
export const MAX_COMPANIONS = 4;

export function makeFamily(): FamilyState {
  return { fragments: [], companions: [], notesHeard: 0 };
}

/** Soft saturating growth: ~0.5 at 18 notes, ~0.85 at 60. Always advancing. */
function growthFromNotes(n: number): number {
  return 1 - Math.exp(-n / 26);
}

let nextId = 1;

function makeCompanion(role: number): Companion {
  const angle = Math.random() * Math.PI * 2;
  const r = 0.25 + Math.random() * 0.45;
  return {
    id: nextId++,
    heard: 0,
    growth: 0,
    voiceRole: role,
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r * 0.7,
    singEnergy: 0,
    hue: 0.58 + Math.random() * 0.08, // cool violet/blue at birth
  };
}

/**
 * Commit a freshly-detected phrase (raw Hz + durs) into memory. The FIRST phrase
 * hatches the first companion; subsequent phrases hatch more (up to the cap) and
 * feed growth to existing ones. Returns true if a new companion hatched.
 */
export function rememberPhrase(
  fam: FamilyState,
  pitchesHz: number[],
  durs: number[],
): boolean {
  if (pitchesHz.length === 0) return false;
  const degrees = pitchesHz.map(snapToScaleIndex);
  fam.fragments.push({
    degrees,
    durs: durs.length === degrees.length ? durs : degrees.map(() => 0.32),
    bornAt: performance.now(),
  });
  if (fam.fragments.length > MAX_FRAGMENTS) fam.fragments.shift();
  fam.notesHeard += degrees.length;

  // Hatch logic: first phrase always hatches; then a new one roughly every
  // ~2 phrases of accumulated singing, up to the cap.
  let hatched = false;
  const want = Math.min(
    MAX_COMPANIONS,
    1 + Math.floor(fam.fragments.length / 2),
  );
  while (fam.companions.length < want) {
    // assign distinct chord-tone roles so harmony spreads across the stack
    fam.companions.push(makeCompanion(fam.companions.length));
    hatched = true;
  }

  // distribute the heard notes as growth — newest/closest get a bit more.
  for (const c of fam.companions) {
    c.heard += degrees.length / fam.companions.length;
    c.growth = growthFromNotes(c.heard);
    // hue warms toward gold as it matures
    c.hue = 0.58 - c.growth * 0.5; // 0.58 (violet) -> ~0.08 (warm amber)
  }
  return hatched;
}

/** Average family maturity, 0..1 (for drone level + global warmth). */
export function familyGrowth(fam: FamilyState): number {
  if (fam.companions.length === 0) return 0;
  let s = 0;
  for (const c of fam.companions) s += c.growth;
  return s / fam.companions.length;
}

// ─── Harmony scheduler ───────────────────────────────────────────────────────
//
// A consonant chord-tone stack in D-Dorian scale-degree offsets. Each companion
// is assigned a different tone of the stack so the same remembered LINE becomes
// a chord. The stack DEEPENS as the family matures: young = unison/octave (thin),
// mature = root + 3rd + 5th + 9th (full 4-part). Scale-degree offsets (Dorian is
// diatonic, so +2 = a third, +4 = a fifth, +7 = octave, +8 = ninth).

const STACK_THIN = [0, 7]; // unison + octave
const STACK_MID = [0, 4, 7]; // root + fifth + octave
const STACK_FULL = [0, 2, 4, 8]; // root + third + fifth + ninth

function chordStackFor(family01: number): number[] {
  if (family01 < 0.3) return STACK_THIN;
  if (family01 < 0.6) return STACK_MID;
  return STACK_FULL;
}

function clampDeg(d: number): number {
  return Math.max(0, Math.min(SCALE_HZ.length - 1, d));
}

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

/** One scheduled sung note for one companion. `gap` = breath before it (rubato). */
export interface VoiceNote {
  companion: Companion;
  hz: number;
  degree: number;
  when: number; // seconds offset from reply start
  dur: number;
}

/**
 * Compose a harmonized reply: take a remembered phrase (recombined as the family
 * matures) and voice each note across the companions on different chord tones.
 * Returns events with relative `when` times and a total duration. Rubato/free
 * cadence — NOT a quantized grid.
 */
export function composeHarmony(fam: FamilyState): {
  notes: VoiceNote[];
  total: number;
} {
  const comps = fam.companions;
  if (comps.length === 0) return { notes: [], total: 0 };

  const fg = familyGrowth(fam);
  const stack = chordStackFor(fg);

  // Build a melodic line from memory (recombined; richer as it matures).
  const line = makeLine(fam, fg);
  if (line.length === 0) return { notes: [], total: 0 };

  // assign each companion a chord-tone offset from the stack (cycled).
  const roleOffset = comps.map(
    (c, i) => stack[(c.voiceRole + i) % stack.length],
  );

  const notes: VoiceNote[] = [];
  let cursor = 0; // seconds
  for (let i = 0; i < line.length; i++) {
    const step = line[i];
    // free, breathing cadence: each melodic step has its own length + a rubato
    // breath, longer & more spacious as the family matures.
    const dur = step.dur * (0.9 + fg * 0.6);
    const breath =
      0.04 + Math.random() * 0.1 + (Math.random() < 0.25 ? 0.2 + fg * 0.25 : 0);
    const when = cursor + breath;

    // each companion sings THIS melodic note on ITS chord tone, with tiny
    // staggered entrances so the chord blooms rather than stabs.
    for (let v = 0; v < comps.length; v++) {
      // mature families let upper voices enter a touch later (suspension feel)
      const stagger = (v / comps.length) * 0.04 * (0.5 + fg);
      const deg = clampDeg(step.degree + roleOffset[v]);
      notes.push({
        companion: comps[v],
        degree: deg,
        hz: SCALE_HZ[deg],
        when: when + stagger,
        dur,
      });
    }
    cursor = when + dur * (0.7 - fg * 0.15); // slight legato overlap as it grows
  }

  // a resolving landing chord for mature families — feels composed, never loops.
  if (fg > 0.4) {
    const landDeg = Math.random() < 0.5 ? 7 : 11; // D4 or A4
    const dur = 0.7 + fg * 0.9;
    const when = cursor + 0.2;
    for (let v = 0; v < comps.length; v++) {
      const deg = clampDeg(landDeg + roleOffset[v]);
      notes.push({
        companion: comps[v],
        degree: deg,
        hz: SCALE_HZ[deg],
        when: when + (v / comps.length) * 0.05,
        dur,
      });
    }
    cursor = when + dur;
  }

  return { notes, total: cursor + 0.4 };
}

/** A melodic step the family will harmonize. */
interface LineStep {
  degree: number;
  dur: number;
}

/** Recombine remembered fragments into a fresh melodic line (richer as mature). */
function makeLine(fam: FamilyState, fg: number): LineStep[] {
  if (fam.fragments.length === 0) {
    // innate coo so the family is never silent before it has memories
    return [
      { degree: 7, dur: 0.5 },
      { degree: 11, dur: 0.7 },
    ];
  }
  const recent = fam.fragments.slice(-Math.min(fam.fragments.length, 8));
  const weave = fg < 0.25 ? 1 : fg < 0.55 ? 2 : 3;
  const transposeChoices =
    fg < 0.3 ? [0, 1] : fg < 0.6 ? [-1, 0, 2] : [-2, 0, 2, 3];

  const out: LineStep[] = [];
  for (let w = 0; w < weave; w++) {
    const frag = pick(recent);
    const transpose = pick(transposeChoices);
    const reverse = fg > 0.45 && Math.random() < 0.3;
    let degs = [...frag.degrees];
    if (reverse) degs.reverse();
    degs = degs.map((d) => clampDeg(d + transpose));
    for (let i = 0; i < degs.length; i++) {
      const baseDur = frag.durs[i] ?? 0.3;
      const dur = Math.max(
        0.18,
        Math.min(1.1, baseDur * (0.85 + Math.random() * 0.4) + fg * 0.12),
      );
      out.push({ degree: degs[i], dur });
    }
  }
  if (out.length > 8) out.length = 8;
  return out;
}
