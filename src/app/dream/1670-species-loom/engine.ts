// Species-counterpoint constraint engine for `1670-species-loom`.
//
// Everything here is deterministic: the only source of "randomness" is a
// seeded mulberry32 PRNG threaded through the search — no global RNG, no clock.
//
// Model (mixed first/second species, Fux `Gradus ad Parnassum` 1725):
//   - Cantus firmus (CF)  = the played subject + a stepwise cadential tail.
//   - Bass (Counter II)   = second species below the CF (two events / bar in
//                           the body, whole notes at the cadence). Weak-beat
//                           dissonance is licensed ONLY as a passing tone.
//   - Upper (Counter I)   = first species above the CF (one event / bar),
//                           checked against BOTH the CF and the bass.
//
// The two added voices are grown note-by-note by a backtracking legal-set
// search: at each bar we enumerate the in-scale candidate pitches, keep only
// those that satisfy the rules, score them, and try them in order — backing
// up whenever a bar has no legal continuation. Candidates rejected for a
// parallel / hidden perfect are recorded so the UI can flash them as vetoed
// red ghost noteheads.
//
// After composing, `verify()` independently re-scans every vertical and
// asserts zero rule violations — a separate code path from the search, so the
// "violations: 0" readout is a real check, not a restatement.

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Scale (D dorian) + pitch helpers
// ---------------------------------------------------------------------------

// D dorian pitch classes: D E F G A B C. The leading tone C# (pc 1) is used
// ONLY in the fixed clausula-vera cadence, never drawn by the free search, so
// the modal body stays diatonic and free of augmented melodic intervals.
const SCALE_PCS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B  (dorian on D)

export const D_MINOR_TONIC = 62; // D4

export function inScale(midi: number): boolean {
  return SCALE_PCS.includes(((midi % 12) + 12) % 12);
}

/** Nearest scale pitch strictly above (dir=+1) or below (dir=-1) `midi`. */
function scaleStep(midi: number, dir: 1 | -1): number {
  let m = midi + dir;
  for (let i = 0; i < 12 && !inScale(m); i++) m += dir;
  return m;
}

/** Stepwise scale path from `a` toward `b`, excluding `a`, including `b`. */
function stepwisePath(a: number, b: number): number[] {
  const out: number[] = [];
  if (a === b) return out;
  const dir: 1 | -1 = b > a ? 1 : -1;
  let cur = a;
  for (let i = 0; i < 24; i++) {
    cur = scaleStep(cur, dir);
    out.push(cur);
    if (dir === 1 ? cur >= b : cur <= b) break;
  }
  // Snap the final element exactly onto b (b is guaranteed in-scale here).
  if (out.length) out[out.length - 1] = b;
  return out;
}

function scalePitchesInRange(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (inScale(m)) out.push(m);
  return out;
}

// ---------------------------------------------------------------------------
// Interval classification
// ---------------------------------------------------------------------------

const INTERVAL_NAMES = [
  "P1", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7",
];

export function intervalLabel(lower: number, upper: number): string {
  const d = upper - lower;
  if (d === 0) return "P1";
  if (d === 12) return "P8";
  return INTERVAL_NAMES[((d % 12) + 12) % 12];
}

function simpleInterval(a: number, b: number): number {
  return ((Math.abs(a - b) % 12) + 12) % 12;
}

function isPerfect(a: number, b: number): boolean {
  const s = simpleInterval(a, b);
  return s === 0 || s === 7; // unison/octave or fifth
}

/**
 * Consonance test for a two-note vertical. `againstBass` is true when the
 * lower note is the lowest sounding voice — then a perfect fourth is a
 * dissonance (4th against the bass); otherwise the 4th is consonant.
 */
function isConsonant(a: number, b: number, againstBass: boolean): boolean {
  const s = simpleInterval(a, b);
  if (s === 0 || s === 3 || s === 4 || s === 7 || s === 8 || s === 9) return true;
  if (s === 5) return !againstBass; // P4: consonant only when supported below
  return false; // 2nds, tritone, 7ths
}

// Melodic intervals allowed inside a single voice: steps, consonant leaps up
// to an octave. Forbidden: tritone (6), major sixth (9), sevenths, > octave.
const MELODIC_ALLOWED = new Set([1, 2, 3, 4, 5, 7, 8, 12]);

function melodicOk(prev: number, cur: number): boolean {
  const d = Math.abs(cur - prev);
  if (d === 0) return true; // rearticulation
  return MELODIC_ALLOWED.has(d);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Veto = { midi: number; label: string };

export type Voice = {
  /** Downbeat pitch per bar; null where the voice has not yet entered. */
  strong: (number | null)[];
  /** Weak-beat (second-species) pitch per bar, or null. */
  weak: (number | null)[];
  /** true where the weak-beat note is a licensed passing dissonance. */
  passing: boolean[];
  entry: number;
  name: string;
};

export type Composition = {
  bars: number;
  cf: number[];
  cfEntry: number;
  upper: Voice;
  bass: Voice;
  /** Vetoed candidates per bar for the upper voice (parallel / hidden). */
  vetoUpper: Veto[][];
  vetoBass: Veto[][];
  labelsUpperCf: (string | null)[];
  labelsCfBass: (string | null)[];
  sections: { bar: number; text: string }[];
  report: {
    verticalsChecked: number;
    violations: number;
    passingDissonances: number;
    detail: string[];
    relaxed: boolean;
  };
};

// Cadence (clausula vera → authentic): penultimate = A-major dominant frame,
// final = D octave stack. Fixed by construction so the ending is always lawful.
const UPPER_CAD = [73, 74]; // C#5 (leading tone) -> D5
const BASS_CAD = [57, 50]; //  A3 (dominant)     -> D3
const CF_CAD = [64, 62]; //   E4 (supertonic)    -> D4

// Register windows for the searched voices.
const UPPER_LO = 67; // G4
const UPPER_HI = 86; // D6
const BASS_LO = 48; // C3
const BASS_HI = 60; // C4

// ---------------------------------------------------------------------------
// Build the cantus firmus from a played subject.
// ---------------------------------------------------------------------------

export function buildCF(subject: number[]): number[] {
  const cf = subject.slice(0, 9); // cap length so the piece stays compact
  const last = cf[cf.length - 1];
  // Walk stepwise to E4 (supertonic), then land on D4 (tonic).
  for (const p of stepwisePath(last, CF_CAD[0])) cf.push(p);
  cf.push(CF_CAD[1]);
  return cf;
}

// ---------------------------------------------------------------------------
// Backtracking search — bass (second species below the CF).
// ---------------------------------------------------------------------------

type SearchOut = { strong: (number | null)[]; vetoes: Veto[][] } | null;

function searchBass(cf: number[], entry: number, prng: () => number): SearchOut {
  const n = cf.length;
  const res: (number | null)[] = new Array(n).fill(null);
  const vetoes: Veto[][] = Array.from({ length: n }, () => []);

  // Fix the cadence bars.
  res[n - 2] = BASS_CAD[0];
  res[n - 1] = BASS_CAD[1];

  const pool = scalePitchesInRange(BASS_LO, BASS_HI);

  function prevSounding(i: number): number | null {
    for (let k = i - 1; k >= entry; k--) if (res[k] !== null) return res[k];
    return null;
  }

  function legalAt(i: number, m: number): { ok: boolean; veto?: Veto } {
    if (m > cf[i] - 2) return { ok: false }; // keep the bass below the CF
    if (!isConsonant(m, cf[i], true)) return { ok: false };
    const prev = prevSounding(i);
    if (prev !== null) {
      if (!melodicOk(prev, m)) return { ok: false };
      // Parallel perfects between CF and bass (forbidden for every pair).
      const pi = i - 1;
      if (pi >= entry && res[pi] !== null) {
        const cfMoved = cf[i] - cf[pi];
        const bassMoved = m - res[pi]!;
        if (
          isPerfect(m, cf[i]) &&
          simpleInterval(m, cf[i]) === simpleInterval(res[pi]!, cf[pi]) &&
          Math.sign(cfMoved) === Math.sign(bassMoved) &&
          cfMoved !== 0
        ) {
          return {
            ok: false,
            veto: { midi: m, label: `∥${simpleInterval(m, cf[i]) === 7 ? "5" : "8"}` },
          };
        }
      }
    }
    return { ok: true };
  }

  function score(i: number, m: number): number {
    let s = 0;
    const prev = prevSounding(i);
    if (prev !== null) {
      const move = m - prev;
      const cfMove = i > 0 ? cf[i] - cf[i - 1] : 0;
      if (cfMove !== 0 && Math.sign(move) === -Math.sign(cfMove)) s += 3; // contrary
      const step = Math.abs(move);
      if (step <= 2) s += 2;
      else if (step >= 8) s -= 2;
      if (step === 3 || step === 4) s += 1; // thirds seed passing tones
    }
    const simp = simpleInterval(m, cf[i]);
    if (simp === 3 || simp === 4 || simp === 8 || simp === 9) s += 2; // imperfect
    return s;
  }

  function backtrack(i: number): boolean {
    if (i === n) return true;
    if (i < entry) {
      res[i] = null;
      return backtrack(i + 1);
    }
    if (i >= n - 2) {
      // Fixed cadence bar — validate its transition, then continue.
      const check = legalAtFixed(i);
      return check ? backtrack(i + 1) : false;
    }
    const cands = pool
      .map((m) => ({ m, r: legalAt(i, m) }))
      .filter((c) => {
        if (!c.r.ok && c.r.veto) vetoes[i].push(c.r.veto);
        return c.r.ok;
      })
      .map((c) => ({ m: c.m, k: score(i, c.m) + prng() * 0.75 }))
      .sort((x, y) => y.k - x.k);
    for (const c of cands) {
      res[i] = c.m;
      if (backtrack(i + 1)) return true;
    }
    res[i] = null;
    return false;
  }

  function legalAtFixed(i: number): boolean {
    const m = res[i]!;
    if (!isConsonant(m, cf[i], true)) return false;
    const prev = prevSounding(i);
    if (prev !== null && !melodicOk(prev, m)) return false;
    return true;
  }

  return backtrack(entry) ? { strong: res, vetoes } : null;
}

// ---------------------------------------------------------------------------
// Backtracking search — upper (first species above the CF, vs CF and bass).
// ---------------------------------------------------------------------------

function searchUpper(
  cf: number[],
  bass: (number | null)[],
  entry: number,
  bassEntry: number,
  relaxHidden: boolean,
  prng: () => number,
): SearchOut {
  const n = cf.length;
  const res: (number | null)[] = new Array(n).fill(null);
  const vetoes: Veto[][] = Array.from({ length: n }, () => []);

  res[n - 2] = UPPER_CAD[0];
  res[n - 1] = UPPER_CAD[1];

  const pool = scalePitchesInRange(UPPER_LO, UPPER_HI);

  function prevSounding(i: number): number | null {
    for (let k = i - 1; k >= entry; k--) if (res[k] !== null) return res[k];
    return null;
  }

  function legalAt(i: number, m: number): { ok: boolean; veto?: Veto } {
    if (m < cf[i] + 2) return { ok: false }; // keep the upper above the CF
    // Consonant with the CF (4th allowed — CF is not the bass here).
    if (!isConsonant(cf[i], m, false)) return { ok: false };
    const b = bass[i];
    if (b !== null && !isConsonant(b, m, true)) return { ok: false }; // vs bass
    const prev = prevSounding(i);
    if (prev !== null && !melodicOk(prev, m)) return { ok: false };

    const pi = i - 1;
    // Parallel / hidden perfects vs the BASS (the outer pair: strict).
    if (b !== null && pi >= Math.max(entry, bassEntry) && bass[pi] !== null && res[pi] !== null) {
      const bassMoved = b - bass[pi]!;
      const upMoved = m - res[pi]!;
      if (isPerfect(m, b) && Math.sign(bassMoved) === Math.sign(upMoved) && bassMoved !== 0) {
        const parallel = simpleInterval(m, b) === simpleInterval(res[pi]!, bass[pi]!);
        if (parallel || !relaxHidden) {
          const q = simpleInterval(m, b) === 7 ? "5" : "8";
          return { ok: false, veto: { midi: m, label: parallel ? `∥${q}` : `→${q}` } };
        }
      }
    }
    // Parallel perfects vs the CF (inner pair: parallels only).
    if (pi >= entry && res[pi] !== null) {
      const cfMoved = cf[i] - cf[pi];
      const upMoved = m - res[pi]!;
      if (
        isPerfect(m, cf[i]) &&
        simpleInterval(m, cf[i]) === simpleInterval(res[pi]!, cf[pi]) &&
        Math.sign(cfMoved) === Math.sign(upMoved) &&
        cfMoved !== 0
      ) {
        return { ok: false, veto: { midi: m, label: `∥${simpleInterval(m, cf[i]) === 7 ? "5" : "8"}` } };
      }
    }
    return { ok: true };
  }

  function score(i: number, m: number): number {
    let s = 0;
    const prev = prevSounding(i);
    if (prev !== null) {
      const move = m - prev;
      const cfMove = i > 0 ? cf[i] - cf[i - 1] : 0;
      if (cfMove !== 0 && Math.sign(move) === -Math.sign(cfMove)) s += 3; // contrary vs CF
      const step = Math.abs(move);
      if (step <= 2) s += 2;
      else if (step >= 8) s -= 3;
    }
    const simp = simpleInterval(m, cf[i]);
    if (simp === 3 || simp === 4 || simp === 8 || simp === 9) s += 2; // imperfect, fuller
    return s;
  }

  function legalAtFixed(i: number): boolean {
    const m = res[i]!;
    if (!isConsonant(cf[i], m, false)) return false;
    const b = bass[i];
    if (b !== null && !isConsonant(b, m, true)) return false;
    const prev = prevSounding(i);
    if (prev !== null && !melodicOk(prev, m)) return false;
    return true;
  }

  function backtrack(i: number): boolean {
    if (i === n) return true;
    if (i < entry) {
      res[i] = null;
      return backtrack(i + 1);
    }
    if (i >= n - 2) return legalAtFixed(i) ? backtrack(i + 1) : false;
    const cands = pool
      .map((m) => ({ m, r: legalAt(i, m) }))
      .filter((c) => {
        if (!c.r.ok && c.r.veto) vetoes[i].push(c.r.veto);
        return c.r.ok;
      })
      .map((c) => ({ m: c.m, k: score(i, c.m) + prng() * 0.75 }))
      .sort((x, y) => y.k - x.k);
    for (const c of cands) {
      res[i] = c.m;
      if (backtrack(i + 1)) return true;
    }
    res[i] = null;
    return false;
  }

  return backtrack(entry) ? { strong: res, vetoes } : null;
}

// ---------------------------------------------------------------------------
// Second-species weak beats for the bass.
// ---------------------------------------------------------------------------

function buildBassWeak(
  cf: number[],
  bassStrong: (number | null)[],
  upperStrong: (number | null)[],
  bassEntry: number,
): { weak: (number | null)[]; passing: boolean[] } {
  const n = cf.length;
  const weak: (number | null)[] = new Array(n).fill(null);
  const passing: boolean[] = new Array(n).fill(false);
  for (let i = bassEntry; i < n - 2; i++) {
    const a = bassStrong[i];
    const b = bassStrong[i + 1];
    if (a === null || b === null) continue;
    const gap = b - a;
    const abs = Math.abs(gap);
    if (abs === 3 || abs === 4) {
      // Diatonic third: insert the scale note in between → passing tone.
      const mid = scaleStep(a, gap > 0 ? 1 : -1);
      weak[i] = mid;
      const u = upperStrong[i];
      // Dissonant against a held voice ⇒ it sounds as a real passing dissonance.
      passing[i] =
        !isConsonant(mid, cf[i], true) || (u !== null && !isConsonant(mid, u, true));
    } else {
      // Otherwise rearticulate the downbeat (consonant, keeps the 2:1 pulse).
      weak[i] = a;
      passing[i] = false;
    }
  }
  return { weak, passing };
}

// ---------------------------------------------------------------------------
// Independent verifier — a separate scan asserting 0 violations.
// ---------------------------------------------------------------------------

function verify(
  cf: number[],
  cfEntry: number,
  upper: Voice,
  bass: Voice,
): { verticalsChecked: number; violations: number; passingDissonances: number; detail: string[] } {
  const n = cf.length;
  let checked = 0;
  let violations = 0;
  let passingDiss = 0;
  const detail: string[] = [];

  const sounds = (v: Voice | "cf", i: number): number | null => {
    if (v === "cf") return i >= cfEntry ? cf[i] : null;
    return i >= v.entry ? v.strong[i] : null;
  };

  // Downbeat verticals: consonance + parallel/hidden checks.
  for (let i = 0; i < n; i++) {
    const notes: { name: string; midi: number }[] = [];
    const u = sounds(upper, i);
    const c = sounds("cf", i);
    const b = sounds(bass, i);
    if (u !== null) notes.push({ name: "U", midi: u });
    if (c !== null) notes.push({ name: "C", midi: c });
    if (b !== null) notes.push({ name: "B", midi: b });
    if (notes.length < 2) continue;
    const lowest = Math.min(...notes.map((x) => x.midi));
    for (let p = 0; p < notes.length; p++) {
      for (let q = p + 1; q < notes.length; q++) {
        const lo = Math.min(notes[p].midi, notes[q].midi);
        const hi = Math.max(notes[p].midi, notes[q].midi);
        checked++;
        if (!isConsonant(lo, hi, lo === lowest)) {
          violations++;
          detail.push(`bar ${i}: dissonant downbeat ${intervalLabel(lo, hi)} (${notes[p].name}/${notes[q].name})`);
        }
      }
    }
  }

  // Parallel / hidden perfects between consecutive downbeats.
  const pairCheck = (
    aName: string,
    bName: string,
    getA: (i: number) => number | null,
    getB: (i: number) => number | null,
    outer: boolean,
  ) => {
    for (let i = 1; i < n; i++) {
      const a0 = getA(i - 1);
      const a1 = getA(i);
      const b0 = getB(i - 1);
      const b1 = getB(i);
      if (a0 === null || a1 === null || b0 === null || b1 === null) continue;
      if (!isPerfect(a1, b1)) continue;
      const am = a1 - a0;
      const bm = b1 - b0;
      if (Math.sign(am) === Math.sign(bm) && am !== 0) {
        const parallel = simpleInterval(a1, b1) === simpleInterval(a0, b0);
        if (parallel) {
          violations++;
          detail.push(`bar ${i - 1}->${i}: parallel ${intervalLabel(Math.min(a1, b1), Math.max(a1, b1))} (${aName}/${bName})`);
        } else if (outer) {
          violations++;
          detail.push(`bar ${i - 1}->${i}: hidden ${intervalLabel(Math.min(a1, b1), Math.max(a1, b1))} (${aName}/${bName})`);
        }
      }
    }
  };
  pairCheck("U", "B", (i) => sounds(upper, i), (i) => sounds(bass, i), true);
  pairCheck("U", "C", (i) => sounds(upper, i), (i) => sounds("cf", i), false);
  pairCheck("C", "B", (i) => sounds("cf", i), (i) => sounds(bass, i), false);

  // Weak-beat (second-species) verticals: dissonance only if a passing tone.
  for (let i = 0; i < n; i++) {
    const w = bass.weak[i];
    if (w === null || i < bass.entry) continue;
    const held: number[] = [];
    const c = sounds("cf", i);
    const u = sounds(upper, i);
    if (c !== null) held.push(c);
    if (u !== null) held.push(u);
    const lowest = Math.min(w, ...held);
    let dissonant = false;
    for (const h of held) {
      const lo = Math.min(w, h);
      const hi = Math.max(w, h);
      checked++;
      if (!isConsonant(lo, hi, lo === lowest)) dissonant = true;
    }
    if (dissonant) {
      // Must be an accented-away passing tone: stepwise in, stepwise out, same direction.
      const before = bass.strong[i];
      const after = bass.strong[i + 1] ?? bass.strong[i];
      const inStep = before !== null && Math.abs(w - before) <= 2;
      const outStep = after !== null && Math.abs(after - w) <= 2;
      const sameDir =
        before !== null && after !== null && Math.sign(w - before) === Math.sign(after - w);
      if (inStep && outStep && sameDir) {
        passingDiss++;
      } else {
        violations++;
        detail.push(`bar ${i}: unprepared weak-beat dissonance in bass`);
      }
    }
  }

  return { verticalsChecked: checked, violations, passingDissonances: passingDiss, detail };
}

// ---------------------------------------------------------------------------
// Top-level compose.
// ---------------------------------------------------------------------------

export function composeFugue(subject: number[], seed: number): Composition {
  const cf = buildCF(subject);
  const n = cf.length;
  const cfEntry = 0;
  const bassEntry = Math.min(1, n - 2);
  const upperEntry = Math.min(2, n - 2);

  let bassOut: SearchOut = null;
  let upperOut: SearchOut = null;
  let relaxed = false;

  // Retry with reseeded PRNGs; relax the (soft) hidden-perfect rule on the
  // outer pair only as a last resort so we always emit a playable piece.
  outer: for (let attempt = 0; attempt < 12; attempt++) {
    const relaxHidden = attempt >= 8;
    const prng = mulberry32(seed + attempt * 2654435761);
    bassOut = searchBass(cf, bassEntry, prng);
    if (!bassOut) continue;
    upperOut = searchUpper(cf, bassOut.strong, upperEntry, bassEntry, relaxHidden, prng);
    if (upperOut) {
      relaxed = relaxHidden;
      break outer;
    }
  }

  // Fallback (should not happen for in-scale subjects): a bare consonant frame.
  if (!bassOut) {
    const strong: (number | null)[] = cf.map((c, i) => (i < bassEntry ? null : scaleStep(c, -1) > c - 12 ? c - 12 : c - 12));
    strong[n - 2] = BASS_CAD[0];
    strong[n - 1] = BASS_CAD[1];
    bassOut = { strong, vetoes: Array.from({ length: n }, () => []) };
  }
  if (!upperOut) {
    const strong: (number | null)[] = cf.map((c, i) => (i < upperEntry ? null : c + 3));
    strong[n - 2] = UPPER_CAD[0];
    strong[n - 1] = UPPER_CAD[1];
    upperOut = { strong, vetoes: Array.from({ length: n }, () => []) };
  }

  const { weak, passing } = buildBassWeak(cf, bassOut.strong, upperOut.strong, bassEntry);

  const upper: Voice = {
    strong: upperOut.strong,
    weak: new Array(n).fill(null),
    passing: new Array(n).fill(false),
    entry: upperEntry,
    name: "Counter I · 1st species",
  };
  const bass: Voice = {
    strong: bassOut.strong,
    weak,
    passing,
    entry: bassEntry,
    name: "Counter II · 2nd species",
  };

  const report = verify(cf, cfEntry, upper, bass);

  // Interval labels for the manuscript (per downbeat, where both voices sound).
  const labelsUpperCf: (string | null)[] = [];
  const labelsCfBass: (string | null)[] = [];
  for (let i = 0; i < n; i++) {
    const u = i >= upperEntry ? upper.strong[i] : null;
    const b = i >= bassEntry ? bass.strong[i] : null;
    labelsUpperCf.push(u !== null ? intervalLabel(cf[i], u) : null);
    labelsCfBass.push(b !== null ? intervalLabel(b, cf[i]) : null);
  }

  const sections: { bar: number; text: string }[] = [
    { bar: 0, text: "Subject" },
    { bar: bassEntry, text: "Counter II enters" },
    { bar: upperEntry, text: "Counter I enters" },
    { bar: n - 2, text: "Clausula vera" },
  ].filter((s, idx, arr) => arr.findIndex((x) => x.bar === s.bar) === idx && s.bar < n);

  return {
    bars: n,
    cf,
    cfEntry,
    upper,
    bass,
    vetoUpper: upperOut.vetoes,
    vetoBass: bassOut.vetoes,
    labelsUpperCf,
    labelsCfBass,
    sections,
    report: { ...report, relaxed },
  };
}

// ---------------------------------------------------------------------------
// Keyboard → pitch map and default (ghost) subject.
// ---------------------------------------------------------------------------

// Home row = a diatonic D-dorian scale; the QWERTY row above adds accidentals.
export const KEY_MAP: Record<string, number> = {
  a: 62, // D4
  s: 64, // E4
  d: 65, // F4
  f: 67, // G4
  g: 69, // A4
  h: 71, // B4
  j: 72, // C5
  k: 74, // D5
  l: 76, // E5
  // accidentals (black keys)
  e: 66, // F#4
  t: 68, // G#4 / Ab
  u: 73, // C#5 (leading tone)
  o: 75, // D#5 / Eb
};

export const KEY_ORDER = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
export const ACC_KEYS = ["e", "t", "u", "o"];

// A gentle stepwise dorian subject for the ghost / first-time visitor.
export const DEFAULT_SUBJECT = [62, 65, 64, 67, 69, 67, 65, 64];

// Diatonic staff position (for notation): `step` counts letter-name positions
// so noteheads sit on lines/spaces; `acc` is +1 sharp / -1 flat / 0 natural.
const PC_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const PC_ACC = [0, 1, 0, -1, 0, 0, 1, 0, -1, 0, -1, 0];

export function staffInfo(midi: number): { step: number; acc: number } {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return { step: oct * 7 + PC_LETTER[pc], acc: PC_ACC[pc] };
}

export function midiName(midi: number): string {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${names[pc]}${oct}`;
}
