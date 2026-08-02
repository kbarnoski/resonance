// ════════════════════════════════════════════════════════════════════════════
// 5384 — Cartograph · demo.ts
//
// A deterministic, ~49 s piano-ish demo rendered offline with OfflineAudioContext.
// Its form is intentionally legible:
//
//     A   A'  B   A↑  C   B   A
//
// where the 4th section is section A transposed UP a perfect fourth (+5
// semitones). A naive same-key SSM would MISS that key-shifted return; our
// key-invariant (Optimal-Transposition-Index) matcher lights it up — which is
// the whole point of the piece.
//
// Everything is seeded by mulberry32(0x5384) so every headless review sees the
// identical map. No network, no npm deps.
// ════════════════════════════════════════════════════════════════════════════

const DEMO_SR = 22050; // rendered rate; analysis decimates further, playback resamples
const SECTION_DUR = 7; // seconds per section → 7 sections ≈ 49 s

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

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Chord progressions as MIDI triads. Each section has a distinct harmonic colour
// so the SSM shows crisp blocks and off-diagonal repeat stripes.
const A_CHORDS = [
  [60, 64, 67], // C
  [67, 71, 74], // G
  [69, 72, 76], // Am
  [65, 69, 72], // F
];
// A' — same harmony, ornamented melody on top (a near-repeat, same key).
const B_CHORDS = [
  [62, 65, 69], // Dm
  [70, 74, 77], // Bb
  [65, 69, 72], // F
  [67, 71, 74], // G
];
const C_CHORDS = [
  [64, 67, 71], // Em
  [69, 72, 76], // Am
  [62, 65, 69], // Dm
  [67, 71, 74], // G
];

interface Note {
  midi: number;
  t: number; // start (s)
  dur: number;
  amp: number;
}

// arpeggiate a 4-chord progression across one section
function arpeggiate(
  chords: number[][],
  offset: number,
  transpose: number,
  ornament: boolean,
  rand: () => number,
): Note[] {
  const notes: Note[] = [];
  const stepsPerChord = 4;
  const chordDur = SECTION_DUR / chords.length;
  const step = chordDur / stepsPerChord;
  for (let c = 0; c < chords.length; c++) {
    const chord = chords[c];
    // sustained bass root under each chord
    notes.push({
      midi: chord[0] - 12 + transpose,
      t: offset + c * chordDur,
      dur: chordDur * 0.98,
      amp: 0.5,
    });
    for (let s = 0; s < stepsPerChord; s++) {
      const idx = ornament
        ? [0, 2, 1, 2][s] // ornamented ordering for A'
        : [0, 1, 2, 1][s];
      const midi = chord[idx % chord.length] + transpose + (idx >= chord.length ? 12 : 0);
      notes.push({
        midi,
        t: offset + c * chordDur + s * step + rand() * 0.006,
        dur: step * 1.6,
        amp: 0.42,
      });
      if (ornament && s % 2 === 1) {
        // sprinkle a high melody note for the A' variation
        notes.push({
          midi: chord[2] + transpose + 12,
          t: offset + c * chordDur + s * step + step * 0.5,
          dur: step * 0.9,
          amp: 0.3,
        });
      }
    }
  }
  return notes;
}

// piano-ish additive voice: a few partials with a fast attack + exponential decay
function scheduleNote(
  ctx: OfflineAudioContext,
  master: AudioNode,
  note: Note,
): void {
  const f0 = midiToFreq(note.midi);
  const partials: Array<[number, number, OscillatorType]> = [
    [1, 1.0, "triangle"],
    [2, 0.32, "sine"],
    [3, 0.14, "sine"],
    [4, 0.07, "sine"],
  ];
  for (const [mult, pamp, type] of partials) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f0 * mult;
    const g = ctx.createGain();
    const peak = note.amp * pamp;
    const t0 = note.t;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + note.dur + 0.02);
  }
}

/** Render the deterministic demo piece to an AudioBuffer. */
export async function renderDemo(): Promise<AudioBuffer> {
  const total = SECTION_DUR * 7;
  const ctx = new OfflineAudioContext(1, Math.ceil(DEMO_SR * total), DEMO_SR);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  // gentle low-pass to keep the tone warm/piano-ish
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  master.connect(lp);
  lp.connect(ctx.destination);

  const rand = mulberry32(0x5384);
  // form:  A  A'  B  A↑(+5)  C  B  A
  const plan: Array<{ chords: number[][]; transpose: number; ornament: boolean }> = [
    { chords: A_CHORDS, transpose: 0, ornament: false }, // A
    { chords: A_CHORDS, transpose: 0, ornament: true }, // A'
    { chords: B_CHORDS, transpose: 0, ornament: false }, // B
    { chords: A_CHORDS, transpose: 5, ornament: false }, // A transposed up a 4th
    { chords: C_CHORDS, transpose: 0, ornament: false }, // C
    { chords: B_CHORDS, transpose: 0, ornament: false }, // B
    { chords: A_CHORDS, transpose: 0, ornament: false }, // A
  ];
  for (let s = 0; s < plan.length; s++) {
    const { chords, transpose, ornament } = plan[s];
    const notes = arpeggiate(chords, s * SECTION_DUR, transpose, ornament, rand);
    for (const note of notes) scheduleNote(ctx, master, note);
  }
  return ctx.startRendering();
}
