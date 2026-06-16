// compose.ts — generative harmony walk + never-repeating weighted melody.
//
// Two cooperating generators:
//   1) A tension/resolution-weighted random walk over the diatonic chord
//      palette (theory.ts). Pulls home harder when a "stone" has been dropped.
//   2) A melody that never repeats the previous note, weighted toward current
//      chord tones plus Dorian passing tones, shaped by a per-phrase sine
//      register-arch (rise then fall over ~8 notes) with woven-in rests.

import {
  CHORDS,
  CHORD_BY_ID,
  TRANSITIONS,
  Chord,
  scaleMidiCandidates,
} from "./theory";

// ── Harmony walk ────────────────────────────────────────────────────────────

export interface HarmonyState {
  current: Chord;
}

export function initialHarmony(): HarmonyState {
  return { current: CHORD_BY_ID["i"] };
}

// Pick the next chord. `restPull` (0..1) biases toward high-rest chords (used
// when the listener "drops a stone" to pull harmony toward the tonic).
export function nextChord(state: HarmonyState, restPull: number): Chord {
  const fromId = state.current.id;
  const row = TRANSITIONS[fromId] ?? {};
  const entries = Object.entries(row);
  if (entries.length === 0) return CHORD_BY_ID["i"];

  let total = 0;
  const weighted = entries.map(([id, w]) => {
    const chord = CHORD_BY_ID[id];
    // restPull multiplies weight by how restful the destination is.
    const rest = chord ? chord.rest : 0.5;
    const weight = w * (1 + restPull * (rest * 2.5));
    total += weight;
    return { id, weight };
  });

  let r = Math.random() * total;
  for (const { id, weight } of weighted) {
    r -= weight;
    if (r <= 0) return CHORD_BY_ID[id] ?? CHORDS[0];
  }
  return CHORD_BY_ID[weighted[weighted.length - 1].id] ?? CHORDS[0];
}

// ── Melody generator ──────────────────────────────────────────────────────

export interface MelodyState {
  prevNote: number; // last MIDI note played (for never-repeat)
  phrasePos: number; // 0..phraseLen-1 index within the current arc
  phraseLen: number; // ~8 notes per phrase
  lo: number; // melody register window
  hi: number;
}

export function initialMelody(): MelodyState {
  return { prevNote: 74, phrasePos: 0, phraseLen: 8, lo: 67, hi: 88 };
}

export interface MelodyEvent {
  note: number | null; // MIDI note, or null for a rest
  velocity: number; // 0..1
}

// Produce the next melody event given the current chord. `bright` (0..1)
// shifts the register window and rest probability (pointer height).
export function nextMelody(
  m: MelodyState,
  chord: Chord,
  bright: number,
): MelodyEvent {
  // Per-phrase sine arch: rises then falls across the phrase.
  const t = m.phrasePos / Math.max(1, m.phraseLen - 1); // 0..1
  const arch = Math.sin(t * Math.PI); // 0 → 1 → 0
  // advance phrase; start a new phrase (and re-roll its length) at the end
  m.phrasePos += 1;
  if (m.phrasePos >= m.phraseLen) {
    m.phrasePos = 0;
    m.phraseLen = 7 + Math.floor(Math.random() * 4); // 7..10
  }

  // Silence is part of the music: rests are more likely near phrase edges and
  // when it's darker (lower pointer). ~18-32% rests.
  const restProb = 0.18 + (1 - arch) * 0.14 + (1 - bright) * 0.06;
  if (Math.random() < restProb) {
    return { note: null, velocity: 0 };
  }

  // Target register from the arch: low at edges, high at the crest.
  const span = m.hi - m.lo;
  const liftBase = m.lo + arch * span * (0.55 + bright * 0.35);
  const center = Math.round(liftBase);
  const winLo = Math.max(m.lo, center - 7);
  const winHi = Math.min(m.hi, center + 7);

  // Candidate pitches: chord tones (strong) + Dorian passing tones (weak),
  // with an occasional Lydian tint when bright is high.
  const tint = bright > 0.65 && Math.random() < 0.2;
  const scaleNotes = scaleMidiCandidates(winLo, winHi, tint);
  const chordSet = new Set(chord.pcs);

  type Cand = { note: number; weight: number };
  const cands: Cand[] = [];
  for (const note of scaleNotes) {
    if (note === m.prevNote) continue; // never repeat the previous note
    const pc = ((note % 12) + 12) % 12;
    const isChordTone = chordSet.has(pc);
    // Weight: chord tones favoured; proximity to arch center favoured;
    // small leaps favoured over large ones (singable line).
    const proximity = 1 / (1 + Math.abs(note - center) * 0.35);
    const leap = 1 / (1 + Math.abs(note - m.prevNote) * 0.22);
    const base = isChordTone ? 1.0 : 0.35;
    cands.push({ note, weight: base * proximity * leap + 0.001 });
  }

  if (cands.length === 0) {
    return { note: null, velocity: 0 };
  }

  let total = 0;
  for (const c of cands) total += c.weight;
  let r = Math.random() * total;
  let chosen = cands[0].note;
  for (const c of cands) {
    r -= c.weight;
    if (r <= 0) {
      chosen = c.note;
      break;
    }
  }

  m.prevNote = chosen;
  // Velocity tracks the arch: bell rings a touch louder at the crest.
  const velocity = 0.35 + arch * 0.45 + Math.random() * 0.1;
  return { note: chosen, velocity: Math.min(1, velocity) };
}
