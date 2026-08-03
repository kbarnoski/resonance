// ─────────────────────────────────────────────────────────────────────────────
// Seeded self-playing demo: a ii–V–I in C major (Dm7 · G7 · Cmaj7) under a
// walking melody, so a silent or headless visitor sees notes lighting the
// helix, chords snapping into triangles, and the center of effect gliding home
// to C. All "randomness" comes from a fixed-seed mulberry32(0x5720) PRNG, so the
// loop is byte-for-byte identical every run.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG. Seed fixed at 0x5720 for this prototype. */
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

export interface DemoNote {
  /** Onset time in seconds from the loop start. */
  t: number;
  midi: number;
  velocity: number;
  /** Sustain in seconds (drives note-off for chord detection). */
  dur: number;
}

export interface DemoSequence {
  notes: DemoNote[];
  loopLength: number;
}

const BEAT = 0.5; // 120 BPM
const BAR = BEAT * 4;

// ii–V–I–I. Each chord is a stack of MIDI notes voiced in a tight register.
const PROGRESSION: number[][] = [
  [50, 53, 57, 60], // Dm7  — a spread four-note shape
  [55, 59, 62, 65], // G7   — dominant tension, still spread
  [48, 52, 55], //     C    — resolves to a compact major triangle
  [48, 52, 55], //     C    — held
];

// C major scale across two octaves for the walking melody.
const SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];

/** Build the deterministic demo. Generated once; loops seamlessly. */
export function buildDemo(): DemoSequence {
  const rng = mulberry32(0x5720);
  const notes: DemoNote[] = [];
  const loopLength = BAR * PROGRESSION.length;

  // Block chords, one per bar, sustained almost the full bar.
  PROGRESSION.forEach((chord, bar) => {
    const t = bar * BAR;
    chord.forEach((midi) => {
      notes.push({ t, midi, velocity: 0.55, dur: BAR * 0.92 });
    });
  });

  // Walking melody: a stepwise random walk over the scale, one note per beat.
  let idx = 4; // start on G5
  const totalBeats = PROGRESSION.length * 4;
  for (let b = 0; b < totalBeats; b++) {
    const t = b * BEAT;
    // Weighted step: mostly ±1, occasionally ±2 or a rest-then-leap.
    const r = rng();
    const step = r < 0.45 ? 1 : r < 0.8 ? -1 : r < 0.9 ? 2 : -2;
    idx = Math.max(0, Math.min(SCALE.length - 1, idx + step));
    // Skip a beat now and then for a little phrasing.
    if (rng() < 0.15) continue;
    notes.push({ t, midi: SCALE[idx], velocity: 0.7, dur: BEAT * 0.85 });
  }

  notes.sort((a, b) => a.t - b.t);
  return { notes, loopLength };
}
