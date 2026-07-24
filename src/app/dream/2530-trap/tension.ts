// ════════════════════════════════════════════════════════════════════════════
// Trap (2530) — the tension model
//
// A single shared melodic line lives in a fully CHROMATIC (12-TET) pitch space.
// There is no "always-sounds-nice" pentatonic lattice to hide behind:
// dissonance is a real, reachable weapon.
//
// The crux: in free 12-TET there is almost always a pitch consonant to any two
// anchors, so tension measured against a single prior note (or a single tonal
// centre) can always be escaped — no real trap. So tension here is measured
// against a ROLLING WINDOW of recent pitches (an implied, monophonic sonority,
// after Bregman's implied polyphony): the last note weighs most, older ones
// linger with exponential decay. The adversary can then plant a cluster — say
// C, F♯, D♯ — that no single next note is consonant with all of, and you are
// genuinely cornered.
//
// A candidate note's tension has four ingredients:
//   1. context dissonance   — against that decaying window (immediate interval
//                             + the lingering rolling centre, in one term),
//   2. voice-leading strain  — leaps cost more than steps,
//   3. corner strain         — the minimum tension the best reply to this note
//                             can still reach (a one-ply escape scan): high =
//                             even the calmest answer stays tense = a trap.
//
// Everything here is pure and deterministic — no Math.random, no Date.now.
// ════════════════════════════════════════════════════════════════════════════

/** Chromatic candidate pitches, C4..C5 inclusive (13 semitones, 12-TET). */
export const LOW = 60;
export const HIGH = 72;
export const CANDIDATES: readonly number[] = Array.from(
  { length: HIGH - LOW + 1 },
  (_, i) => LOW + i,
);

/** How many recent pitches form the implied sonority the player must answer. */
export const ECHO = 5;
const DECAY = 0.85; // recency weighting within the window (older notes linger)
// The context term blends a decayed AVERAGE dissonance with the decayed
// WORST-CLASH against any single recent note. The max-clash half is what makes
// traps real: in free 12-TET an average is always escapable near a minor third,
// but a note that clashes hard (semitone/tritone) with ANY strongly-weighted
// recent note cannot resolve. BLEND weights the average vs. that worst clash.
const BLEND = 0.35;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** MIDI → scientific-pitch name, e.g. 60 → "C4". */
export function noteName(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// Roughness by interval class (0..6 semitones), roughly after Plomp–Levelt
// sensory-dissonance orderings: the semitone and the tritone bite hardest, the
// thirds sit calmest. Normalised to [0, 1].
const DISSONANCE = [0.0, 1.0, 0.55, 0.2, 0.15, 0.35, 0.9];

/** Sensory dissonance of the interval between two pitches, in [0, 1]. */
export function intervalDissonance(a: number, b: number): number {
  const m = (((a - b) % 12) + 12) % 12;
  const ic = Math.min(m, 12 - m);
  return DISSONANCE[ic];
}

/** Append a pitch to the rolling window, keeping only the last ECHO pitches. */
export function pushEcho(echo: readonly number[], pitch: number): number[] {
  return [...echo, pitch].slice(-ECHO);
}

/**
 * Dissonance of `pitch` against the rolling window (oldest → newest). The newest
 * pitch (the note just played) weighs most; older ones decay. This single term
 * carries both the immediate interval and the lingering rolling tonal centre.
 */
export function contextDissonance(
  pitch: number,
  echo: readonly number[],
): number {
  if (echo.length === 0) return 0;
  let acc = 0;
  let ws = 0;
  let worst = 0;
  for (let i = 0; i < echo.length; i++) {
    const age = echo.length - 1 - i; // 0 = newest
    const w = Math.pow(DECAY, age);
    const wd = w * intervalDissonance(pitch, echo[i]);
    acc += wd;
    ws += w;
    if (wd > worst) worst = wd;
  }
  return BLEND * (acc / ws) + (1 - BLEND) * worst;
}

/** Voice-leading strain: steps are free, leaps are costly. In [0, 1]. */
export function voiceStrain(pitch: number, echo: readonly number[]): number {
  if (echo.length === 0) return 0;
  const prev = echo[echo.length - 1];
  return Math.max(0, Math.min(1, (Math.abs(pitch - prev) - 2) / 9));
}

/**
 * How cornered the NEXT mover is after `pitch` is placed: the smallest context
 * dissonance their best single reply can reach. High = a trap — even the calmest
 * answer to the resulting sonority still sounds tense. A bounded one-ply scan.
 */
export function cornerStrain(pitch: number, echo: readonly number[]): number {
  const next = pushEcho(echo, pitch);
  let best = Infinity;
  for (const reply of CANDIDATES) {
    const t = contextDissonance(reply, next);
    if (t < best) best = t;
  }
  return best;
}

export interface Tension {
  total: number;
  context: number;
  voice: number;
  corner: number;
}

// Weights sum to 1, so `total` lands in [0, 1] and reads directly as a meter.
const W_CONTEXT = 0.65;
const W_VOICE = 0.1;
const W_CORNER = 0.25;

/** Full tension of placing `pitch` given the rolling window `echo`. */
export function noteTension(pitch: number, echo: readonly number[]): Tension {
  const context = contextDissonance(pitch, echo);
  const voice = voiceStrain(pitch, echo);
  const corner = cornerStrain(pitch, echo);
  const total = Math.max(
    0,
    Math.min(1, W_CONTEXT * context + W_VOICE * voice + W_CORNER * corner),
  );
  return { total, context, voice, corner };
}

export interface Reply {
  pitch: number;
  tension: number;
}

/** Every candidate reply given the window, with its tension, calm → tense. */
export function rankReplies(echo: readonly number[]): Reply[] {
  return CANDIDATES.map((pitch) => ({
    pitch,
    tension: noteTension(pitch, echo).total,
  })).sort((a, b) => a.tension - b.tension);
}

/** Tension thresholds for the tug-of-war. */
export const RESOLVE = 0.3; // at or below → the line snaps back to consonance
export const STRAND = 0.5; // at or above → the mover is stranded in dissonance

/** Deterministic PRNG (mulberry32) — the only sanctioned source of randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
