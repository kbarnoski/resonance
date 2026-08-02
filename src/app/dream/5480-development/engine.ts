// engine.ts — a self-developing long-form composer.
//
// A single germ motif is developed forward through a narrative arc
// (exposition → development → climax → recapitulation → coda) using the
// classical / dodecaphonic row operators (Prime, Inversion, Retrograde,
// Retrograde-Inversion) plus augmentation, diminution, fragmentation,
// sequence and modulation — Schoenberg's *developing variation*.
//
// Everything emitted is remembered, so late material is demonstrably a
// transformation of earlier material, never a verbatim loop.

// ---------------------------------------------------------------------------
// Core symbolic types
// ---------------------------------------------------------------------------

/** One symbolic note. `degree` is a scale-degree integer (0 = tonic; it may
 *  be negative or exceed the octave — octaves wrap). `duration` is in beats. */
export interface Note {
  degree: number;
  duration: number;
}

export type Phase =
  | "exposition"
  | "development"
  | "climax"
  | "recapitulation"
  | "coda";

/** A phrase emitted by the conductor, with full derivation memory. */
export interface Phrase {
  id: number;
  notes: Note[];
  /** Human-readable transformation label, e.g. "INVERSION of the head motif". */
  label: string;
  /** Short op tag for the derivation trace, e.g. "I", "aug", "seq↑". */
  tag: string;
  /** Chain of op tags from the seed to here: ["seed","I","aug"]. */
  lineage: string[];
  /** ids of the phrase(s) this one was derived from. */
  parents: number[];
  /** tonal centre (in semitones) in effect when this phrase was emitted. */
  center: number;
  phase: Phase;
  /** which movement of the piece produced it (0 = first). */
  movement: number;
}

// ---------------------------------------------------------------------------
// Scale / pitch mapping (Aeolian — a calm, architectural minor colour)
// ---------------------------------------------------------------------------

const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor, semitone offsets
const BASE_MIDI = 57; // A3

/** Convert a scale degree (+ a semitone centre) to a MIDI note number. */
export function degreeToMidi(degree: number, center = 0): number {
  const idx = ((degree % 7) + 7) % 7;
  const oct = Math.floor(degree / 7);
  return BASE_MIDI + SCALE[idx] + 12 * oct + center;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — makes "New seed" reproducible-ish.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The operators — pure functions over Note[].
// ---------------------------------------------------------------------------

export function transpose(notes: Note[], steps: number): Note[] {
  return notes.map((n) => ({ ...n, degree: n.degree + steps }));
}

/** Invert: mirror each degree around an axis (interval inversion). */
export function invert(notes: Note[], axis: number): Note[] {
  return notes.map((n) => ({ ...n, degree: 2 * axis - n.degree }));
}

/** Retrograde: reverse the order of the notes. */
export function retrograde(notes: Note[]): Note[] {
  return [...notes].reverse();
}

/** Retrograde-inversion: invert, then reverse. */
export function retrogradeInvert(notes: Note[], axis: number): Note[] {
  return retrograde(invert(notes, axis));
}

/** Augment / diminish: scale every duration by a factor. */
export function scaleDurations(notes: Note[], factor: number): Note[] {
  return notes.map((n) => ({ ...n, duration: n.duration * factor }));
}

/** Fragment: take a contiguous sub-slice (a "cell" of the motif). */
export function fragment(notes: Note[], start: number, len: number): Note[] {
  const s = Math.max(0, Math.min(start, notes.length - 1));
  const e = Math.max(s + 1, Math.min(s + len, notes.length));
  return notes.slice(s, e).map((n) => ({ ...n }));
}

/** Sequence: repeat the cell `times`, each copy shifted by `step` degrees. */
export function sequence(notes: Note[], times: number, step: number): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < times; i++) {
    for (const n of notes) out.push({ ...n, degree: n.degree + step * i });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seed motifs
// ---------------------------------------------------------------------------

/** The built-in germ — a memorable rising-then-turning head motif. */
export const DEFAULT_SEED: Note[] = [
  { degree: 0, duration: 1 },
  { degree: 2, duration: 0.5 },
  { degree: 1, duration: 0.5 },
  { degree: 4, duration: 1 },
  { degree: 3, duration: 1 },
];

/** Generate a fresh germ from a numeric seed (reproducible). */
export function buildSeedMotif(seed: number): Note[] {
  const rng = mulberry32(seed);
  const len = 4 + Math.floor(rng() * 3); // 4–6 notes
  const durs = [0.5, 0.5, 1, 1, 1.5];
  const notes: Note[] = [];
  let deg = 0;
  for (let i = 0; i < len; i++) {
    notes.push({ degree: deg, duration: durs[Math.floor(rng() * durs.length)] });
    // small stepwise/leap contour, kept inside a comfortable range
    const move = [-2, -1, 1, 1, 2, 3][Math.floor(rng() * 6)];
    deg = Math.max(-2, Math.min(6, deg + move));
  }
  return notes;
}

// ---------------------------------------------------------------------------
// The conductor — a narrative-arc state machine with memory.
// ---------------------------------------------------------------------------

const PHASE_ORDER: Phase[] = [
  "exposition",
  "development",
  "climax",
  "recapitulation",
  "coda",
];

// cumulative fraction of a movement at which each phase ENDS
const PHASE_END: Record<Phase, number> = {
  exposition: 0.18,
  development: 0.55,
  climax: 0.72,
  recapitulation: 0.9,
  coda: 1.0,
};

const MOVEMENT_BEATS = 300; // ~2.3 min per movement at 108bpm; the piece loops movements forever, each in a new key

/** Slightly different energy per phase — the scheduler reads this. */
export const PHASE_TEMPO: Record<Phase, number> = {
  exposition: 1.0,
  development: 1.0,
  climax: 1.18,
  recapitulation: 1.0,
  coda: 0.72,
};

export class Conductor {
  private memory: Phrase[] = [];
  private seed: Phrase;
  private rng: () => number;
  private nextId = 0;
  private beats = 0; // beats elapsed in the current movement
  private movement = 0;
  private center = 0; // semitone centre offset
  private phase: Phase = "exposition";
  private stated = false; // has the seed been stated verbatim yet?

  constructor(seedNotes: Note[] = DEFAULT_SEED, rngSeed = 0x5eed) {
    this.rng = mulberry32(rngSeed);
    this.seed = {
      id: this.nextId++,
      notes: seedNotes.map((n) => ({ ...n })),
      label: "SEED — the germ motif",
      tag: "seed",
      lineage: ["seed"],
      parents: [],
      center: 0,
      phase: "exposition",
      movement: 0,
    };
  }

  getPhase(): Phase {
    return this.phase;
  }
  getCenter(): number {
    return this.center;
  }
  getMovement(): number {
    return this.movement;
  }
  getMemory(): readonly Phrase[] {
    return this.memory;
  }
  getSeed(): Phrase {
    return this.seed;
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  private beatsOf(notes: Note[]): number {
    return notes.reduce((s, n) => s + n.duration, 0);
  }

  private phaseForFraction(f: number): Phase {
    for (const p of PHASE_ORDER) if (f <= PHASE_END[p]) return p;
    return "coda";
  }

  private recent(): Phrase {
    // favour the most recent emitted material
    if (this.memory.length === 0) return this.seed;
    const window = this.memory.slice(-4);
    return this.pick(window);
  }

  private commit(
    notes: Note[],
    label: string,
    tag: string,
    parent: Phrase,
    extraParents: number[] = [],
  ): Phrase {
    const phrase: Phrase = {
      id: this.nextId++,
      notes,
      label,
      tag,
      lineage: [...parent.lineage, tag],
      parents: [parent.id, ...extraParents],
      center: this.center,
      phase: this.phase,
      movement: this.movement,
    };
    this.memory.push(phrase);
    this.beats += this.beatsOf(notes);
    return phrase;
  }

  /** Emit the next phrase, advancing the arc. */
  next(): Phrase {
    // roll movements over so the piece never actually stops
    if (this.beats >= MOVEMENT_BEATS) {
      this.movement++;
      this.beats = 0;
      this.stated = false;
      this.center = (this.center + 5) % 12; // new key each movement (up a 4th)
      this.phase = "exposition";
    }

    const frac = this.beats / MOVEMENT_BEATS;
    this.phase = this.phaseForFraction(frac);

    switch (this.phase) {
      case "exposition":
        return this.doExposition();
      case "development":
        return this.doDevelopment();
      case "climax":
        return this.doClimax();
      case "recapitulation":
        return this.doRecapitulation();
      case "coda":
        return this.doCoda();
    }
  }

  // -- phase behaviours -----------------------------------------------------

  private doExposition(): Phrase {
    if (!this.stated) {
      this.stated = true;
      // the germ, stated plainly
      return this.commit(
        this.seed.notes.map((n) => ({ ...n })),
        "STATEMENT of the germ motif",
        "P",
        this.seed,
      );
    }
    const roll = this.rng();
    if (roll < 0.5) {
      const step = this.pick([2, 3, -2]);
      return this.commit(
        transpose(this.seed.notes, step),
        `TRANSPOSITION of the germ (${step > 0 ? "+" : ""}${step})`,
        `T${step > 0 ? "+" : ""}${step}`,
        this.seed,
      );
    }
    // rising sequence of the head cell — establishes the answering gesture
    const head = fragment(this.seed.notes, 0, 3);
    return this.commit(
      sequence(head, 3, 1),
      "SEQUENCE of the head cell, rising",
      "seq↑",
      this.seed,
    );
  }

  private doDevelopment(): Phrase {
    const src = this.recent();
    const axis = 2; // mirror around the third degree
    const roll = this.rng();

    if (roll < 0.18) {
      return this.commit(
        invert(src.notes, axis),
        `INVERSION of phrase ${src.id}`,
        "I",
        src,
      );
    }
    if (roll < 0.34) {
      return this.commit(
        retrograde(src.notes),
        `RETROGRADE of phrase ${src.id}`,
        "R",
        src,
      );
    }
    if (roll < 0.46) {
      return this.commit(
        retrogradeInvert(src.notes, axis),
        `RETROGRADE-INVERSION of phrase ${src.id}`,
        "RI",
        src,
      );
    }
    if (roll < 0.6) {
      return this.commit(
        scaleDurations(src.notes, 2),
        `AUGMENTATION of phrase ${src.id} (slower)`,
        "aug",
        src,
      );
    }
    if (roll < 0.72) {
      const cell = fragment(src.notes, 0, 2);
      return this.commit(
        cell,
        `FRAGMENTATION of phrase ${src.id} (head cell)`,
        "frag",
        src,
      );
    }
    if (roll < 0.86) {
      const cell = fragment(src.notes, 0, 3);
      const dir = this.rng() < 0.5 ? 1 : -1;
      return this.commit(
        sequence(cell, 3, dir),
        `SEQUENCE of a fragment, ${dir > 0 ? "rising" : "falling"}`,
        dir > 0 ? "seq↑" : "seq↓",
        src,
      );
    }
    // MODULATION — the tonal centre visibly shifts
    this.center = (this.center + this.pick([5, 7, -2])) % 12;
    return this.commit(
      transpose(src.notes, 1),
      "MODULATION — the key centre shifts",
      "mod",
      src,
    );
  }

  private doClimax(): Phrase {
    const src = this.rng() < 0.5 ? this.seed : this.recent();
    const roll = this.rng();
    if (roll < 0.5) {
      // terse, high, fast stabs: fragment + diminution + up an octave
      const cell = scaleDurations(fragment(src.notes, 0, 2), 0.5);
      return this.commit(
        transpose(cell, 7),
        "CLIMAX — fragmented stabs, diminished, an octave up",
        "frag·dim",
        src,
      );
    }
    // driving rising sequence, diminished
    const cell = scaleDurations(fragment(src.notes, 0, 3), 0.5);
    return this.commit(
      transpose(sequence(cell, 4, 1), 4),
      "CLIMAX — rising sequence, diminished, driving",
      "seq↑·dim",
      src,
    );
  }

  private doRecapitulation(): Phrase {
    const roll = this.rng();
    if (roll < 0.5) {
      // the head returns, transformed — a clear reference to the germ
      const op = this.rng() < 0.5;
      const notes = op ? invert(this.seed.notes, 2) : scaleDurations(this.seed.notes, 1.5);
      return this.commit(
        notes,
        op
          ? "RECAPITULATION — the germ returns, inverted"
          : "RECAPITULATION — the germ returns, broadened",
        op ? "I" : "aug",
        this.seed,
      );
    }
    // quote an earlier memorable phrase and transform it
    const early = this.memory.length > 2 ? this.memory[Math.floor(this.rng() * Math.min(4, this.memory.length))] : this.seed;
    return this.commit(
      retrograde(early.notes),
      `RECAP — earlier phrase ${early.id} returns in retrograde`,
      "R",
      early,
    );
  }

  private doCoda(): Phrase {
    // settle the centre back toward home, broaden, then a final tag
    if (this.center !== 0) this.center = 0;
    const roll = this.rng();
    if (roll < 0.6) {
      return this.commit(
        scaleDurations(this.seed.notes, 2),
        "CODA — the germ, augmented, coming to rest",
        "aug",
        this.seed,
      );
    }
    // a two-note tag resolving to the tonic
    const tag = fragment(this.seed.notes, 0, 2);
    tag.push({ degree: 0, duration: 4 });
    return this.commit(tag, "CODA — final cadence to the tonic", "cad", this.seed);
  }
}
