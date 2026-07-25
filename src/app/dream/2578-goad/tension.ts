// ════════════════════════════════════════════════════════════════════════════
// Goad (2578) — the tension scalar
//
// Musical TENSION as a real, continuous number per melodic event, combining
// three well-known ingredients so the AI has a physical quantity to weaponise:
//
//   1. SENSORY DISSONANCE (roughness). Plomp & Levelt (1965) measured that two
//      pure tones sound maximally rough near a quarter of the critical band and
//      smooth at unison / wide spacing. Sethares (*Tuning Timbre Spectrum
//      Scale*, 1998) turned that into a closed-form partial-pair roughness we
//      sum over the harmonic spectra of the melody note AND a sounding drone
//      chord. Because the drone rings under everything, a tritone or a minor
//      second against it genuinely BEATS — the roughness is audible, not
//      notional.
//   2. VOICE-LEADING DISTANCE. Big melodic leaps are unstable; stepwise motion
//      relaxes. A saturating |Δpitch| term.
//   3. METRIC & HARMONIC EXPECTATION. Tendency tones (leading tone, the active
//      4th, the tritone) left hanging — especially on a strong beat or held
//      across the barline — are the classic "unresolved" tension. A per-pitch-
//      class instability weight, amplified on downbeats.
//
// The weighted sum is clamped to [0,1]; a phrase becomes a little curve; the
// residual at a phrase's final event is the "cliff" one player hands the next.
// ════════════════════════════════════════════════════════════════════════════

export type Owner = "human" | "ai";

/** A committed 4-bar phrase: SLOTS monophonic melody pitches (MIDI). */
export interface Phrase {
  owner: Owner;
  notes: number[]; // length === SLOTS
  tension: number[]; // per-event tension, length === SLOTS
  banked: number; // residual "cliff" handed to the next player
  intent: string; // short human-readable description of what it does
  nodes?: number; // AI only: candidate phrases the beam search scored
  humanResidual?: number; // AI only: best tension the human can resolve to
}

// ── Musical frame ─────────────────────────────────────────────────────────────
export const SLOTS = 8; // events per phrase (4 bars, 2 events/bar)
export const KEY_ROOT_PC = 0; // C
export const MELODY_LO = 60; // C4
export const MELODY_HI = 79; // G5

/** The sounding harmonic ground: a soft C-major triad drone, low register. */
export const DRONE_MIDIS = [48, 52, 55]; // C3 E3 G3

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Sethares partial-pair roughness ───────────────────────────────────────────
// d(f1,f2) = a1 a2 (exp(-b1 s x) - exp(-b2 s x)), x = |f2-f1|,
// s = X* / (s1 * min(f1,f2) + s2). Constants from Sethares 1998.
const B1 = 3.5;
const B2 = 5.75;
const XSTAR = 0.24;
const S1 = 0.0207;
const S2 = 18.96;

function pairRoughness(f1: number, a1: number, f2: number, a2: number): number {
  const fmin = Math.min(f1, f2);
  const s = XSTAR / (S1 * fmin + S2);
  const x = Math.abs(f2 - f1);
  return a1 * a2 * (Math.exp(-B1 * s * x) - Math.exp(-B2 * s * x));
}

interface Partial {
  f: number;
  a: number;
}

const N_PARTIALS = 6;
function spectrum(midi: number, weight = 1): Partial[] {
  const f0 = midiToFreq(midi);
  const out: Partial[] = [];
  for (let n = 1; n <= N_PARTIALS; n++) {
    out.push({ f: f0 * n, a: (weight / n) }); // 1/n rolloff (sawtooth-ish)
  }
  return out;
}

// Pre-build the drone spectrum once; each melody note is judged against it.
const DRONE_SPECTRUM: Partial[] = DRONE_MIDIS.flatMap((m) =>
  spectrum(m, 0.8),
);

function totalRoughness(parts: Partial[]): number {
  let r = 0;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      r += pairRoughness(parts[i].f, parts[i].a, parts[j].f, parts[j].a);
    }
  }
  return r;
}

// Roughness of a single melody note sounding over the drone, cached per MIDI.
const ROUGH_CACHE = new Map<number, number>();
// Normalisers computed lazily on first use across the melody range.
let ROUGH_MIN = Infinity;
let ROUGH_MAX = -Infinity;

function rawRoughness(midi: number): number {
  const cached = ROUGH_CACHE.get(midi);
  if (cached !== undefined) return cached;
  const combined = [...DRONE_SPECTRUM, ...spectrum(midi, 1)];
  const r = totalRoughness(combined);
  ROUGH_CACHE.set(midi, r);
  return r;
}

function ensureRoughnessRange(): void {
  if (ROUGH_MIN !== Infinity) return;
  for (let m = MELODY_LO; m <= MELODY_HI; m++) {
    const r = rawRoughness(m);
    if (r < ROUGH_MIN) ROUGH_MIN = r;
    if (r > ROUGH_MAX) ROUGH_MAX = r;
  }
}

/** Roughness of a melody note against the drone, normalised to ~[0,1]. */
export function roughness(midi: number): number {
  ensureRoughnessRange();
  const r = rawRoughness(midi);
  return (r - ROUGH_MIN) / (ROUGH_MAX - ROUGH_MIN || 1);
}

// ── Harmonic expectation (tendency tones) ─────────────────────────────────────
// Per-pitch-class instability relative to the C-major ground. Chord tones rest;
// the leading tone (B), the active 4th (F) and the tritone (F#) are the loaded
// ones that "want" to move. Chromatic neighbours are edgier still.
const INSTABILITY: Record<number, number> = {
  0: 0.0, // C  tonic
  7: 0.06, // G  dominant
  4: 0.12, // E  mediant
  2: 0.34, // D
  9: 0.34, // A
  11: 0.62, // B  leading tone — wants +1 to C
  5: 0.56, // F  active 4th — wants -1 to E
  10: 0.46, // Bb
  3: 0.5, // Eb
  8: 0.56, // Ab
  1: 0.7, // Db
  6: 0.86, // F# tritone
};

export function instability(midi: number): number {
  const pc = (((midi - 60) % 12) + 12) % 12;
  return INSTABILITY[pc] ?? 0.5;
}

/** Nearest stable chord tone (C/E/G, any octave) to a pitch — the "resolution". */
export function nearestChordTone(midi: number): number {
  const chordPcs = [0, 4, 7];
  let best = midi;
  let bestD = Infinity;
  for (let cand = MELODY_LO; cand <= MELODY_HI; cand++) {
    const pc = (((cand - 60) % 12) + 12) % 12;
    if (!chordPcs.includes(pc)) continue;
    const d = Math.abs(cand - midi);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  return best;
}

// ── Weights ───────────────────────────────────────────────────────────────────
const W_ROUGH = 0.5;
const W_LEAP = 0.22;
const W_EXPECT = 0.52;
const STRONG_BEAT_AMP = 1.3;

function isStrongBeat(slot: number): boolean {
  return slot % 2 === 0; // downbeats
}

/**
 * Tension of one melodic event. `prev` is the previous sounding pitch (for the
 * voice-leading leap); pass the same pitch for the first event of the piece.
 */
export function eventTension(pitch: number, prev: number, slot: number): number {
  const rough = roughness(pitch);
  const leap = Math.min(1, Math.abs(pitch - prev) / 12);
  const expect =
    instability(pitch) * (isStrongBeat(slot) ? STRONG_BEAT_AMP : 1);
  const t = W_ROUGH * rough + W_LEAP * leap + W_EXPECT * expect;
  return Math.max(0, Math.min(1, t));
}

/** Tension curve over a full phrase, given the previous player's last pitch. */
export function phraseTension(notes: number[], prevLast: number): number[] {
  const out: number[] = [];
  let prev = prevLast;
  for (let i = 0; i < notes.length; i++) {
    out.push(eventTension(notes[i], prev, i));
    prev = notes[i];
  }
  return out;
}

/**
 * The "cliff" a phrase hands to the next player: the final-event tension, plus a
 * held-over bonus when the last note is a loaded tendency tone (it will grind
 * against the drone across the barline until resolved).
 */
export function bankedTension(notes: number[], tension: number[]): number {
  const last = notes[notes.length - 1];
  const end = tension[tension.length - 1];
  const heldOver = instability(last) > 0.5 ? 0.18 : 0;
  return Math.max(0, Math.min(1, end + heldOver));
}

/**
 * Estimate the LOWEST tension a resolver (the human's best defence) can reach
 * starting from a handed-over pitch — a greedy stepwise descent toward the
 * nearest chord tone over a few steps. The AI's planner wants this to stay HIGH
 * (an unresolvable cliff). This is the 1-exchange lookahead the beam search
 * scores against, so it plans past its own phrase into the human's reply.
 */
export function bestResolutionResidual(startPitch: number): number {
  let p = startPitch;
  let prev = startPitch;
  let best = eventTension(p, prev, 0);
  for (let step = 0; step < 4; step++) {
    let pick = p;
    let pickT = Infinity;
    // A human resolves by small motion — try neighbours within a third.
    for (let d = -3; d <= 3; d++) {
      const cand = p + d;
      if (cand < MELODY_LO || cand > MELODY_HI) continue;
      const t = eventTension(cand, p, (step + 1) % 2 === 0 ? 0 : 1);
      // bias toward chord tones so the descent actually aims to resolve
      const aim = Math.abs(cand - nearestChordTone(cand)) * 0.02;
      if (t + aim < pickT) {
        pickT = t + aim;
        pick = cand;
      }
    }
    prev = p;
    p = pick;
    const realT = eventTension(p, prev, step % 2 === 0 ? 0 : 1);
    if (realT < best) best = realT;
  }
  return best;
}

// ── Pitch naming ──────────────────────────────────────────────────────────────
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function noteName(midi: number): string {
  const pc = (((midi % 12) + 12) % 12);
  const oct = Math.floor(midi / 12) - 1;
  return `${NAMES[pc]}${oct}`;
}

/** Short label for the interval of a pitch against the drone root (C). */
export function intervalLabel(midi: number): string {
  const pc = (((midi - 60) % 12) + 12) % 12;
  const map: Record<number, string> = {
    0: "unison",
    1: "minor 2nd",
    2: "major 2nd",
    3: "minor 3rd",
    4: "major 3rd",
    5: "perfect 4th",
    6: "tritone",
    7: "perfect 5th",
    8: "minor 6th",
    9: "major 6th",
    10: "minor 7th",
    11: "leading tone",
  };
  return map[pc] ?? "interval";
}
