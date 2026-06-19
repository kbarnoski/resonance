// memory.ts — the heart. The sprout REMEMBERS hummed phrases and GROWS as it
// accumulates them, then RECOMBINES remembered fragments into fresh melodies
// (an answer in its own developing voice — never a literal echo).

import { SCALE_HZ, snapToScaleIndex } from "./audio";

/** A remembered melodic fragment: scale-degree indices into SCALE_HZ,
 *  plus per-note durations (seconds) and a rough loudness. */
export interface Fragment {
  degrees: number[]; // indices into SCALE_HZ
  durs: number[];    // seconds, parallel to degrees
  bornAt: number;    // ms timestamp
}

/** A note event the sprout will sing (absolute-ish, sequencer-free). */
export interface SungNote {
  hz: number;
  dur: number;
  gap: number; // gap before this note
  degree: number;
}

export interface MemoryState {
  fragments: Fragment[];
  /** total notes ever heard — drives growth */
  notesHeard: number;
  /** 0..1 maturity; saturates slowly so minute-5 differs from minute-1 */
  growth: number;
}

export function makeMemory(): MemoryState {
  return { fragments: [], notesHeard: 0, growth: 0 };
}

const MAX_FRAGMENTS = 40;

/** Commit a freshly-detected phrase (list of raw Hz + durs) into memory. */
export function rememberPhrase(
  mem: MemoryState,
  pitchesHz: number[],
  durs: number[]
) {
  if (pitchesHz.length === 0) return;
  const degrees = pitchesHz.map(snapToScaleIndex);
  // collapse immediate repeats slightly to keep fragments shapely
  const frag: Fragment = {
    degrees,
    durs: durs.length === degrees.length ? durs : degrees.map(() => 0.32),
    bornAt: performance.now(),
  };
  mem.fragments.push(frag);
  if (mem.fragments.length > MAX_FRAGMENTS) mem.fragments.shift();
  mem.notesHeard += degrees.length;
  recomputeGrowth(mem);
}

/** Growth curve: a soft saturating function of accumulated notes.
 *  ~ reaches 0.5 around 18 notes, ~0.85 around 60 notes. Always advancing
 *  so a 5-minute-old sprout is meaningfully more mature than a 1-minute one. */
export function recomputeGrowth(mem: MemoryState) {
  const n = mem.notesHeard;
  mem.growth = 1 - Math.exp(-n / 26);
}

// ── Recombination: build a NEW melody from remembered fragments ───────────
// Strategy (varies with growth):
//  - young: pick one recent fragment, sing it nearly straight but in the
//    sprout's voice, maybe transposed up a step (a shy echo).
//  - older: stitch 2–3 fragments, reorder, transpose, vary durations, and
//    occasionally invert the contour — a genuinely new little tune.

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clampDegree(d: number): number {
  return Math.max(0, Math.min(SCALE_HZ.length - 1, d));
}

export function composeReply(mem: MemoryState): SungNote[] {
  if (mem.fragments.length === 0) {
    // No memories yet — sing a gentle innate "hello" coo so the sprout is
    // never silent. Two soft scale tones.
    return innateCoo(mem.growth);
  }

  const g = mem.growth;
  const out: SungNote[] = [];

  // How many fragments to weave in grows with maturity.
  const weave = g < 0.25 ? 1 : g < 0.55 ? 2 : 3;
  const recent = mem.fragments.slice(-Math.min(mem.fragments.length, 8));

  // transposition: young = +0/+1 step, older may roam wider but stays in scale
  const transposeChoices = g < 0.3 ? [0, 1] : g < 0.6 ? [-1, 0, 2, 3] : [-2, 0, 2, 3, 5];

  for (let w = 0; w < weave; w++) {
    const frag = pick(recent);
    const transpose = pick(transposeChoices);
    const invert = g > 0.55 && Math.random() < 0.4;
    const reverse = g > 0.4 && Math.random() < 0.3;

    let degs = [...frag.degrees];
    if (reverse) degs.reverse();
    if (invert) {
      const anchor = degs[0];
      degs = degs.map((d) => clampDegree(anchor - (d - anchor)));
    }
    degs = degs.map((d) => clampDegree(d + transpose));

    for (let i = 0; i < degs.length; i++) {
      // duration: borrow the remembered rhythm, gently warped; matures longer
      const baseDur = frag.durs[i] ?? 0.3;
      const dur = Math.max(0.16, Math.min(1.1, baseDur * (0.85 + Math.random() * 0.5) + g * 0.12));
      const gap = (g > 0.5 && Math.random() < 0.25) ? 0.18 + Math.random() * 0.22 : 0.02 + Math.random() * 0.06;
      out.push({
        degree: degs[i],
        hz: SCALE_HZ[degs[i]],
        dur,
        gap,
      });
    }

    // breathe between woven fragments
    if (w < weave - 1 && out.length > 0) out[out.length - 1].gap += 0.3;
  }

  // older sprouts add a resolving tail tone (lands on D or A) -> feels composed
  if (g > 0.35) {
    const landing = Math.random() < 0.5 ? 7 : 11; // D4 or A4
    out.push({
      degree: landing,
      hz: SCALE_HZ[landing],
      dur: 0.5 + g * 0.7,
      gap: 0.22,
    });
  }

  // keep replies child-attention-sized
  if (out.length > 9) out.length = 9;
  return out;
}

function innateCoo(growth: number): SungNote[] {
  const a = 7; // D4
  const b = 11; // A4
  return [
    { degree: a, hz: SCALE_HZ[a], dur: 0.45 + growth * 0.4, gap: 0.05, },
    { degree: b, hz: SCALE_HZ[b], dur: 0.6 + growth * 0.5, gap: 0.18, },
  ];
}
