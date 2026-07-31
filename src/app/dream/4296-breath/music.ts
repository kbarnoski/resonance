// 4296 · BREATH — music.ts
//
// Pure, framework-free musical brain. No React, no THREE, no Web Audio here —
// just the symbolic note-stream model, the D-dorian keyboard mapping, the
// hand-rolled INVITATION SCORER, and the generative echo-transforms the
// companion uses to answer. Deterministic: any randomness comes from a seeded
// mulberry32 passed in by the caller. No Math.random / Date.now / new Date.

// ── Deterministic PRNG ──────────────────────────────────────────────────────
export function makeMulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Small math helpers ──────────────────────────────────────────────────────
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// ── The instrument: one octave of D dorian (the warm mode) ──────────────────
// White keys a s d f g h j k walk the mode D E F G A B C D; black keys w e t y u
// are the chromatic in-betweens (expressive passing tones OUTSIDE the mode).
// Tonic is D4 (MIDI 62). Player register is bright and high on purpose.
export const TONIC_MIDI = 62; // D4

export interface KeyDef {
  key: string; // lowercase keyboard key
  semitone: number; // 0..12 offset above the tonic
  label: string; // note name for the on-screen legend
  black: boolean; // chromatic in-between (accidental)
}

export const KEYS: KeyDef[] = [
  { key: "a", semitone: 0, label: "D", black: false },
  { key: "w", semitone: 1, label: "D♯", black: true },
  { key: "s", semitone: 2, label: "E", black: false },
  { key: "d", semitone: 3, label: "F", black: false },
  { key: "e", semitone: 4, label: "F♯", black: true },
  { key: "f", semitone: 5, label: "G", black: false },
  { key: "t", semitone: 6, label: "G♯", black: true },
  { key: "g", semitone: 7, label: "A", black: false },
  { key: "y", semitone: 8, label: "A♯", black: true },
  { key: "h", semitone: 9, label: "B", black: false },
  { key: "j", semitone: 10, label: "C", black: false },
  { key: "u", semitone: 11, label: "C♯", black: true },
  { key: "k", semitone: 12, label: "D", black: false },
];

export const KEY_BY_CHAR = new Map(KEYS.map((k) => [k.key, k] as const));

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// D dorian uses the natural pitch-classes {C D E F G A B} = {0,2,4,5,7,9,11}.
const DIATONIC_PC = [0, 2, 4, 5, 7, 9, 11];
const IS_DIATONIC = new Set(DIATONIC_PC);

// Snap any MIDI note to the nearest D-dorian (natural) pitch — keeps the
// companion's replies consonant even when you feed it chromatic passing tones.
export function snapToMode(midi: number): number {
  const r = Math.round(midi);
  for (let d = 0; d <= 6; d++) {
    if (IS_DIATONIC.has(((r + d) % 12 + 12) % 12)) return r + d;
    if (IS_DIATONIC.has(((r - d) % 12 + 12) % 12)) return r - d;
  }
  return r;
}

// Transpose a note by a number of DIATONIC steps (thirds, fifths…) staying in
// the mode — a consonant lift rather than a chromatic shift.
export function transposeDiatonic(midi: number, degrees: number): number {
  const snapped = snapToMode(midi);
  const pc = ((snapped % 12) + 12) % 12;
  let idx = DIATONIC_PC.indexOf(pc);
  if (idx < 0) idx = 0;
  const octaveBase = snapped - pc;
  let target = idx + degrees;
  const octShift = Math.floor(target / 7);
  target = ((target % 7) + 7) % 7;
  return octaveBase + DIATONIC_PC[target] + octShift * 12;
}

// ── The symbolic note stream ────────────────────────────────────────────────
export interface PlayedNote {
  semitone: number; // scale offset above tonic (for visuals / legend)
  midi: number;
  velocity: number; // 0..1
  startT: number; // performance.now() ms
  endT: number | null; // null while the key is still held
}

// A note the companion will SPEAK, as an offset schedule from "now".
export interface CompanionNote {
  midi: number;
  whenSec: number; // seconds after the answer begins
  durSec: number;
  velocity: number;
}

export type TransformName = "inversion" | "augmentation" | "transposition";

// ── The heart: the invitation scorer ────────────────────────────────────────
// Continuously reads the SHAPE of your playing and returns how strongly the
// moment invites an answer. Held/sustained notes, a rising unresolved contour,
// and a deliberate pause after a phrase all raise it; busy tumbling runs gate
// it back down. Nothing here decides to answer — it only measures invitation.

const PHRASE_GAP_MS = 900; // a silence longer than this ends the current phrase

export interface InvitationScore {
  invitation: number; // 0..1 overall
  sustain: number;
  rising: number;
  pause: number;
  busy: number;
  phraseLen: number;
}

// Gather the trailing run of notes that belong to the current gesture.
export function extractPhrase(notes: PlayedNote[], floorT: number): PlayedNote[] {
  const active = notes.filter((n) => n.startT > floorT);
  if (active.length === 0) return [];
  let startIdx = 0;
  for (let i = 1; i < active.length; i++) {
    if (active[i].startT - active[i - 1].startT > PHRASE_GAP_MS) startIdx = i;
  }
  return active.slice(startIdx);
}

// Pause after a phrase: silence is only "inviting" once you've clearly stopped
// (past ~0.3s), peaks around a deliberate ~1.1s held breath, then fades — an
// endless silence reads as "gave up", not "your turn".
function pauseShape(sinceMs: number): number {
  if (sinceMs < 300) return 0;
  if (sinceMs < 1100) return smoothstep(300, 1100, sinceMs);
  return 1 - smoothstep(1100, 5000, sinceMs);
}

export function scoreInvitation(
  notes: PlayedNote[],
  now: number,
  heldStartTimes: number[],
  floorT: number,
): InvitationScore {
  const phrase = extractPhrase(notes, floorT);
  const anyHeld = heldStartTimes.length > 0;
  const maxHold = anyHeld ? Math.max(...heldStartTimes.map((t) => now - t)) : 0;

  // 1) SUSTAIN — a long held note (or a long last note) is a held-open door.
  let sustain = 0;
  if (anyHeld) {
    sustain = smoothstep(250, 1500, maxHold);
  } else if (phrase.length > 0) {
    const last = phrase[phrase.length - 1];
    const dur = (last.endT ?? now) - last.startT;
    sustain = smoothstep(200, 1200, dur);
  }

  // 2) RISING, UNRESOLVED CONTOUR — a question that climbs and doesn't fall home.
  let rising = 0;
  if (phrase.length >= 2) {
    const p = phrase.map((n) => n.midi);
    const overall = p[p.length - 1] - p[0];
    let up = 0;
    let steps = 0;
    for (let i = 1; i < p.length; i++) {
      const d = p[i] - p[i - 1];
      if (d > 0) up++;
      if (d !== 0) steps++;
    }
    const mono = steps > 0 ? up / steps : 0.5;
    let r = clamp01((overall / 7) * 0.6 + mono * 0.4);
    const lastStep = p[p.length - 1] - p[p.length - 2];
    if (lastStep < 0) r *= 0.5; // a downward step = a small resolution
    const lastPc = ((p[p.length - 1] % 12) + 12) % 12;
    if (lastPc === 2 && overall <= 0) r *= 0.4; // landed home on the tonic → resolved
    rising = r;
  } else if (phrase.length === 1) {
    rising = 0.25; // a single note leans on sustain, not contour
  }

  // 3) PAUSE — the deliberate silence you offer after finishing a phrase.
  let pause = 0;
  if (!anyHeld && phrase.length > 0) {
    const lastEnd = phrase[phrase.length - 1].endT ?? now;
    pause = pauseShape(now - lastEnd);
  }

  // 4) BUSY — fast, dense onsets keep the companion politely quiet.
  const recentOnsets = notes.filter((n) => now - n.startT < 1200 && n.startT > floorT).length;
  const busy = clamp01((recentOnsets - 2) / 5);

  const base = 0.5 * sustain + 0.4 * rising + 0.4 * pause;
  const invitation = clamp01(base) * (1 - 0.7 * busy);

  return { invitation, sustain, rising, pause, busy, phraseLen: phrase.length };
}

// ── Generative reply: echo, then transform ──────────────────────────────────
// The companion re-voices your last gesture with ONE deliberate transformation
// and lands on a soft grounding tonic — a considered answer, not a copy.
export interface Answer {
  notes: CompanionNote[];
  transform: TransformName;
  totalDurSec: number;
}

export function buildAnswer(phrase: PlayedNote[], rand: () => number): Answer {
  const src = phrase.length > 0 ? phrase : [];
  const t0 = src.length > 0 ? src[0].startT : 0;
  const rel = src.map((n) => ({
    midi: n.midi,
    on: (n.startT - t0) / 1000,
    dur: Math.max(0.14, ((n.endT ?? n.startT + 200) - n.startT) / 1000),
    vel: n.velocity,
  }));

  // Choose a transform. Single-note gestures skip inversion (it is a no-op).
  const pool: TransformName[] =
    rel.length >= 2
      ? ["inversion", "augmentation", "transposition"]
      : ["augmentation", "transposition"];
  const transform = pool[Math.floor(rand() * pool.length) % pool.length];

  const lead = 0.18; // a breath before it speaks
  const notes: CompanionNote[] = [];

  if (transform === "inversion") {
    const pivot = rel[0].midi;
    for (const r of rel) {
      notes.push({
        midi: snapToMode(2 * pivot - r.midi),
        whenSec: lead + r.on,
        durSec: r.dur,
        velocity: r.vel * 0.85,
      });
    }
  } else if (transform === "augmentation") {
    const stretch = 1.7;
    for (const r of rel) {
      notes.push({
        midi: snapToMode(r.midi - 12), // slowed AND deepened an octave
        whenSec: lead + r.on * stretch,
        durSec: r.dur * stretch,
        velocity: r.vel * 0.85,
      });
    }
  } else {
    const degrees = rand() < 0.5 ? 2 : 4; // up a third or up a fifth (consonant)
    for (const r of rel) {
      notes.push({
        midi: transposeDiatonic(r.midi, degrees),
        whenSec: lead + r.on,
        durSec: r.dur,
        velocity: r.vel * 0.85,
      });
    }
  }

  // A soft, low grounding tonic to close the reply.
  const lastEnd = notes.length > 0 ? Math.max(...notes.map((n) => n.whenSec + n.durSec)) : lead;
  notes.push({
    midi: TONIC_MIDI - 12, // D3 — warm root beneath the player's register
    whenSec: lastEnd + 0.1,
    durSec: 1.4,
    velocity: 0.5,
  });

  const totalDurSec = Math.max(...notes.map((n) => n.whenSec + n.durSec));
  return { notes, transform, totalDurSec };
}
