// accompanist.ts
// The "social substrate" of an anticipatory accompanist, hand-rolled from
// music-theory heuristics. NO ML, NO server, NO external API.
//
// Named lineage (see README.md):
//   - arXiv:2511.17879 — an accompanist's characteristic failure is retreating
//     to a cautious *safe output*; we make commit-vs-withhold the legible core.
//   - ReaLchords (arXiv:2506.14723) — online melody->chord accompaniment that
//     learns anticipation and adaptation. We fake the learning with heuristics.

// ─── Deterministic PRNG (mulberry32). NEVER Math.random / Date.now. ───────────
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

// ─── Music theory constants ──────────────────────────────────────────────────
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // natural minor
// Krumhansl-Schmuckler style tonal weight profiles (major / minor).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export type Mode = "major" | "minor";
export interface Key {
  root: number; // pitch class 0..11
  mode: Mode;
  fit: number; // 0..1 confidence of this key estimate
}

export interface NoteEvent {
  midi: number;
  t: number; // performance.now() ms
}

export const TIER_NAMES = [
  "withholding",
  "offering a fifth",
  "full triad",
  "voiced",
  "comping",
] as const;
export type Tier = 0 | 1 | 2 | 3 | 4;

export interface AccompanistState {
  notes: NoteEvent[]; // recent melody, capped
  confidence: number; // 0..1, eased
  key: Key;
  chordRoot: number; // pitch class of current harmonizing chord root
  chord: number[]; // actual midi notes voiced right now
  bassMidi: number; // current bass note
  tier: Tier;
  bet: number | null; // predicted next chord root (pitch class)
  betPcs: number[]; // pitch classes the bet expects to be confirmed by
  betConfirmed: boolean; // did the last note confirm the standing bet?
  lastNoteT: number;
}

const MAX_NOTES = 8;

export function makeState(now: number): AccompanistState {
  return {
    notes: [],
    confidence: 0,
    key: { root: 0, mode: "major", fit: 0 },
    chordRoot: 0,
    chord: [48],
    bassMidi: 36,
    tier: 0,
    bet: null,
    betPcs: [],
    betConfirmed: false,
    lastNoteT: now,
  };
}

// ─── Key inference: best-correlating tonic/mode over the recent pitch-class set ─
function inferKey(notes: NoteEvent[]): Key {
  if (notes.length === 0) return { root: 0, mode: "major", fit: 0 };
  const hist = new Array(12).fill(0);
  // weight recent notes more heavily
  notes.forEach((n, i) => {
    const w = 0.5 + (0.5 * i) / Math.max(1, notes.length - 1);
    hist[((n.midi % 12) + 12) % 12] += w;
  });
  let best: Key = { root: 0, mode: "major", fit: 0 };
  let bestScore = -Infinity;
  for (let root = 0; root < 12; root++) {
    for (const mode of ["major", "minor"] as Mode[]) {
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      let score = 0;
      for (let pc = 0; pc < 12; pc++) {
        score += hist[pc] * profile[(pc - root + 12) % 12];
      }
      if (score > bestScore) {
        bestScore = score;
        best = { root, mode, fit: 0 };
      }
    }
  }
  // fit = fraction of recent notes diatonic to the winning key
  const scale = best.mode === "major" ? MAJOR : MINOR;
  const inScale = notes.filter((n) =>
    scale.includes((((n.midi % 12) - best.root + 12) % 12) as number),
  ).length;
  best.fit = inScale / notes.length;
  return best;
}

// coefficient-of-variation of inter-onset intervals -> rhythmic steadiness 0..1
function rhythmSteadiness(notes: NoteEvent[]): number {
  if (notes.length < 3) return 0.2;
  const iois: number[] = [];
  for (let i = 1; i < notes.length; i++) iois.push(notes[i].t - notes[i - 1].t);
  const mean = iois.reduce((a, b) => a + b, 0) / iois.length;
  if (mean <= 0) return 0;
  const varc = iois.reduce((a, b) => a + (b - mean) * (b - mean), 0) / iois.length;
  const cv = Math.sqrt(varc) / mean;
  // cv ~0 => steady => 1 ; cv >=0.9 => erratic => ~0
  return Math.max(0, Math.min(1, 1 - cv / 0.9));
}

// contour coherence: reward stepwise/small melodic motion, punish random leaps
function contourCoherence(notes: NoteEvent[]): number {
  if (notes.length < 3) return 0.2;
  let acc = 0;
  let count = 0;
  for (let i = 1; i < notes.length; i++) {
    const leap = Math.abs(notes[i].midi - notes[i - 1].midi);
    // 0 semitone (repeat) mild, 1-4 ideal, >7 penalised toward 0
    const q = leap === 0 ? 0.55 : leap <= 4 ? 1 : Math.max(0, 1 - (leap - 4) / 8);
    acc += q;
    count++;
  }
  return acc / count;
}

// ─── Anticipation: predict the next chord root from key + current chord ────────
// A tiny functional-harmony automaton (I -> {IV,V,vi}, V -> I, IV -> {V,I}, ...).
function predictNextChord(key: Key, currentDegree: number, rng: () => number): number {
  const table: Record<number, number[]> = {
    0: [3, 4, 5], // I -> IV, V, vi
    1: [4, 0], // ii -> V, I
    2: [3, 5], // iii -> IV, vi
    3: [4, 0], // IV -> V, I
    4: [0, 5], // V -> I, vi
    5: [3, 1], // vi -> IV, ii
    6: [0], // vii -> I
  };
  const opts = table[currentDegree] ?? [0, 4, 3];
  const pick = opts[Math.floor(rng() * opts.length)];
  const scale = key.mode === "major" ? MAJOR : MINOR;
  return (key.root + scale[pick]) % 12;
}

// diatonic degree (0..6) of a pitch class in a key, or -1 if chromatic
function degreeOf(pc: number, key: Key): number {
  const scale = key.mode === "major" ? MAJOR : MINOR;
  return scale.indexOf(((pc - key.root + 12) % 12) as number);
}

// build the triad pitch classes for a chord whose root is scale-degree `deg`
function triadPcs(key: Key, deg: number): number[] {
  const scale = key.mode === "major" ? MAJOR : MINOR;
  return [scale[deg % 7], scale[(deg + 2) % 7], scale[(deg + 4) % 7], scale[(deg + 6) % 7]].map(
    (s) => (key.root + s) % 12,
  );
}

// choose the diatonic chord that best harmonises the melody pitch class
function chooseChordDegree(key: Key, melodyPc: number): number {
  // prefer I, IV, V, vi that contain the melody note; fall back to I
  const preference = [0, 4, 3, 5, 1, 2, 6];
  for (const deg of preference) {
    const pcs = triadPcs(key, deg).slice(0, 3);
    if (pcs.includes(((melodyPc % 12) + 12) % 12)) return deg;
  }
  return 0;
}

function tierFromConfidence(c: number): Tier {
  if (c < 0.2) return 0;
  if (c < 0.42) return 1;
  if (c < 0.62) return 2;
  if (c < 0.8) return 3;
  return 4;
}

// voice a chord as real midi notes in a warm register, sized by tier
function voiceChord(key: Key, deg: number, tier: Tier): { chord: number[]; bass: number } {
  const scale = key.mode === "major" ? MAJOR : MINOR;
  const rootPc = (key.root + scale[deg % 7]) % 12;
  const bass = 36 + rootPc; // low root
  const base = 48 + rootPc; // chord register around C3-B3
  const third = base + (scale[(deg + 2) % 7] - scale[deg % 7] + 12) % 12;
  const fifth = base + (scale[(deg + 4) % 7] - scale[deg % 7] + 12) % 12;
  const seventh = base + ((scale[(deg + 6) % 7] - scale[deg % 7] + 12) % 12);
  let chord: number[];
  switch (tier) {
    case 0:
      chord = [base]; // root only — the cautious "safe output"
      break;
    case 1:
      chord = [base, fifth];
      break;
    case 2:
      chord = [base, third, fifth];
      break;
    case 3:
      chord = [base, third, fifth, seventh + 0]; // add the 7th
      break;
    default:
      chord = [base, third, fifth, seventh, base + 12]; // voiced + octave sparkle
  }
  return { chord, bass };
}

// ─── Main step: ingest one melody note, update the whole relationship ──────────
export function stepMelodyNote(
  state: AccompanistState,
  midi: number,
  now: number,
  rng: () => number,
): AccompanistState {
  const pc = ((midi % 12) + 12) % 12;

  // 1. Did the standing bet just get confirmed?
  let betBump = 0;
  if (state.bet !== null && state.betPcs.length > 0) {
    if (state.betPcs.includes(pc)) {
      state.betConfirmed = true;
      betBump = 0.12; // it read you right -> trust jumps
    } else {
      state.betConfirmed = false;
      betBump = -0.05; // you defied it -> small dip, it will re-key below
    }
  }

  // 2. Append note (capped window)
  const notes = [...state.notes, { midi, t: now }].slice(-MAX_NOTES);

  // 3. Re-infer key & measure coherence
  const key = inferKey(notes);
  const rhythm = rhythmSteadiness(notes);
  const contour = contourCoherence(notes);
  const diatonic = key.fit;
  const target = 0.4 * diatonic + 0.35 * rhythm + 0.25 * contour;

  // 4. Ease confidence toward target, apply bet bump, clamp
  let confidence = state.confidence + (target - state.confidence) * 0.4 + betBump;
  confidence = Math.max(0, Math.min(1, confidence));

  // 5. Harmonise current note; pick tier; voice chord
  const deg = chooseChordDegree(key, pc);
  const tier = tierFromConfidence(confidence);
  const { chord, bass } = voiceChord(key, deg, tier);
  const scale = key.mode === "major" ? MAJOR : MINOR;
  const chordRoot = (key.root + scale[deg % 7]) % 12;

  // 6. Form the next anticipation bet (pre-voice the likely next chord)
  const nextRoot = predictNextChord(key, deg, rng);
  const nextDeg = Math.max(0, degreeOf(nextRoot, key));
  const betPcs = triadPcs(key, nextDeg).slice(0, 3);

  return {
    notes,
    confidence,
    key,
    chordRoot,
    chord,
    bassMidi: bass,
    tier,
    bet: nextRoot,
    betPcs,
    betConfirmed: state.betConfirmed,
    lastNoteT: now,
  };
}

// ─── Decay: silence and wandering erode the covenant over time ────────────────
export function stepDecay(state: AccompanistState, now: number): AccompanistState {
  const gap = now - state.lastNoteT;
  if (gap < 420) return state; // still within a phrase
  // decays faster the longer you stay silent
  const rate = 0.00035 * (1 + Math.min(2, gap / 2000));
  const confidence = Math.max(0, state.confidence - rate * 16); // ~per-frame
  const tier = tierFromConfidence(confidence);
  if (tier === state.tier && confidence === state.confidence) return state;
  const { chord, bass } = voiceChord(state.key, Math.max(0, degreeOf(state.chordRoot, state.key)), tier);
  return { ...state, confidence, tier, chord, bassMidi: bass };
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function keyName(key: Key): string {
  return `${PC_NAMES[key.root]} ${key.mode}`;
}
