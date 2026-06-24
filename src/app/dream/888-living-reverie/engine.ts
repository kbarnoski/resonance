/*
 * 888 · LIVING REVERIE — two-tier generative memory engine
 *
 * The musical brain. It answers the prototype's one question:
 *   "What if Karel's piano became a 10-minute LIVING reverie — genuinely
 *    different at minute 8 than at minute 1?"
 *
 * Anchored in RESEARCH §531 (2026-06-24) — "Fusing Memory and Attention"
 * (arXiv 2603.21282, March 2026): a SINGLE memory mechanism cannot hold both
 * local melodic continuity AND a global, irreversible arc. So we implement
 * TWO explicit tiers:
 *
 *   LOCAL tier  — a small bank of recent "pitch cells" (motifs of scale
 *                 degrees + rhythm). New phrases are made by transposing /
 *                 lightly varying / re-quantizing cells already in the bank, so
 *                 minute N sounds like minute N-1. The bank is refreshed from
 *                 Karel's live audio (chroma fold) or a built-in seed motif.
 *
 *   GLOBAL tier — one monotonic `age` in [0,1] walking across AGE_DURATION_SEC,
 *                 plus a four-section state machine (sparse / blooming / dense /
 *                 dissolving). Age is IRREVERSIBLE; it controls voice density,
 *                 note rate, register spread, reverb depth and brightness.
 *
 * Plus a MODAL JOURNEY: as age advances we walk ionian -> lydian -> mixolydian
 * -> dorian -> aeolian with a slowly creeping tonic. Every synthesized note is
 * pitch-quantized to the CURRENT mode over the CURRENT tonic.
 */

import {
  type MasterChain,
  playPianoNote,
  playPadNote,
  playShimmerGrain,
} from "./audio";

// ---------------------------------------------------------------------------
// Global tier constants
// ---------------------------------------------------------------------------
export const AGE_DURATION_SEC = 600; // 10-minute irreversible arc

export type Section = "sparse" | "blooming" | "dense" | "dissolving";

export function sectionForAge(age: number): Section {
  if (age < 0.2) return "sparse";
  if (age < 0.5) return "blooming";
  if (age < 0.8) return "dense";
  return "dissolving";
}

// ---------------------------------------------------------------------------
// Modal journey
// ---------------------------------------------------------------------------
export type ModeName =
  | "ionian"
  | "lydian"
  | "mixolydian"
  | "dorian"
  | "aeolian";

// scale-degree semitone offsets for each mode (7 degrees)
const MODE_INTERVALS: Record<ModeName, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

const MODE_ORDER: ModeName[] = [
  "ionian",
  "lydian",
  "mixolydian",
  "dorian",
  "aeolian",
];

export function modeForAge(age: number): ModeName {
  const idx = Math.min(
    MODE_ORDER.length - 1,
    Math.floor(age * MODE_ORDER.length),
  );
  return MODE_ORDER[idx];
}

// Tonic creeps slowly upward across the arc (in semitones above base C).
const BASE_TONIC_MIDI = 48; // C3
function tonicForAge(age: number): number {
  // creep up to +5 semitones over the whole piece, stepwise so it feels stable
  return BASE_TONIC_MIDI + Math.floor(age * 6);
}

/**
 * Quantize a (scale-degree, octave) cell note to an absolute MIDI pitch in the
 * current mode over the current tonic.
 */
function degreeToMidi(
  degree: number,
  octave: number,
  mode: ModeName,
  tonicMidi: number,
): number {
  const intervals = MODE_INTERVALS[mode];
  const len = intervals.length;
  const wrapped = ((degree % len) + len) % len;
  const octShift = Math.floor(degree / len) + octave;
  return tonicMidi + intervals[wrapped] + 12 * octShift;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// LOCAL tier — the pitch-cell bank
// ---------------------------------------------------------------------------
export interface CellNote {
  degree: number; // scale degree (can be <0 or >6, wrapped on quantize)
  dur: number; // beats
  vel: number; // 0..1
}

export interface PitchCell {
  notes: CellNote[];
}

const BANK_MAX = 14; // ~8-16 recent cells

// Built-in seed motif (used in fallback or until live chroma refreshes it).
// A gentle, "Welcome Home"-flavoured rising-then-settling figure.
const SEED_CELLS: PitchCell[] = [
  {
    notes: [
      { degree: 0, dur: 1.0, vel: 0.7 },
      { degree: 2, dur: 0.5, vel: 0.5 },
      { degree: 4, dur: 1.5, vel: 0.8 },
    ],
  },
  {
    notes: [
      { degree: 4, dur: 0.75, vel: 0.6 },
      { degree: 2, dur: 0.75, vel: 0.5 },
      { degree: 0, dur: 1.0, vel: 0.7 },
    ],
  },
  {
    notes: [
      { degree: 7, dur: 1.0, vel: 0.6 },
      { degree: 4, dur: 1.0, vel: 0.5 },
      { degree: 5, dur: 2.0, vel: 0.7 },
    ],
  },
];

export class MemoryEngine {
  // GLOBAL tier
  age = 0;
  private elapsed = 0;

  // LOCAL tier
  private bank: PitchCell[] = [];

  // scheduling
  private noteTimer = 0; // seconds until next phrase
  private padTimer = 0;
  private chain: MasterChain;

  // latest smoothed audio level (set from outside each frame)
  audioLevel = 0;

  constructor(chain: MasterChain) {
    this.chain = chain;
    // seed the bank with the built-in motif (clone)
    for (const c of SEED_CELLS) this.bank.push(cloneCell(c));
  }

  get section(): Section {
    return sectionForAge(this.age);
  }
  get mode(): ModeName {
    return modeForAge(this.age);
  }

  /**
   * Refresh the LOCAL bank from a chroma vector (12 pitch-class weights).
   * We pick the loudest pitch classes, fold them to scale degrees of the
   * current mode, and add a short new cell built from those degrees. This is
   * how Karel's live recording keeps re-seeding the melodic material.
   */
  seedFromChroma(chroma: number[]) {
    // rank pitch classes by weight
    const ranked = chroma
      .map((w, pc) => ({ pc, w }))
      .filter((x) => x.w > 0.35)
      .sort((a, b) => b.w - a.w)
      .slice(0, 4);
    if (ranked.length < 2) return;

    const intervals = MODE_INTERVALS[this.mode];
    const tonicPc = ((tonicForAge(this.age) % 12) + 12) % 12;

    // map each chosen pitch class to nearest scale degree of current mode
    const notes: CellNote[] = ranked.map((r, i) => {
      const rel = ((r.pc - tonicPc + 12) % 12);
      let bestDeg = 0;
      let bestDist = 99;
      for (let d = 0; d < intervals.length; d++) {
        const dist = Math.abs(intervals[d] - rel);
        if (dist < bestDist) {
          bestDist = dist;
          bestDeg = d;
        }
      }
      return {
        degree: bestDeg,
        dur: i === ranked.length - 1 ? 1.5 : 0.5 + Math.random() * 0.5,
        vel: 0.45 + r.w * 0.4,
      };
    });

    this.pushCell({ notes });
  }

  private pushCell(cell: PitchCell) {
    this.bank.push(cell);
    while (this.bank.length > BANK_MAX) this.bank.shift();
  }

  /**
   * Derive a fresh phrase from the bank by picking a recent cell and lightly
   * varying it (transpose, octave shift, tempo nudge). Sometimes the variation
   * is stored back into the bank so the material drifts over time — local
   * memory with gentle mutation.
   */
  private deriverPhrase(): PitchCell {
    const src = this.bank[Math.floor(Math.random() * this.bank.length)];
    const transpose = pick([-2, -1, 0, 0, 1, 2]);
    const notes: CellNote[] = src.notes.map((n) => ({
      degree: n.degree + transpose,
      dur: clamp(n.dur * (0.85 + Math.random() * 0.3), 0.25, 3),
      vel: clamp(n.vel * (0.85 + Math.random() * 0.3), 0.15, 1),
    }));
    const phrase: PitchCell = { notes };
    // occasionally fold the variation back into local memory (continuity drift)
    if (Math.random() < 0.25) this.pushCell(cloneCell(phrase));
    return phrase;
  }

  /**
   * Advance the engine by dt seconds: walk global age, schedule phrases at a
   * rate / density determined by the current section, fire pad + shimmer.
   */
  update(dt: number) {
    // GLOBAL tier — irreversible age
    this.elapsed = Math.min(AGE_DURATION_SEC, this.elapsed + dt);
    this.age = this.elapsed / AGE_DURATION_SEC;

    const a = this.age;
    const section = this.section;
    const mode = this.mode;
    const tonic = tonicForAge(a);

    // section-driven density / brightness / register spread / reverb depth
    const params = sectionParams(a, section, this.audioLevel);

    // grow reverb wet with age (deeper/wider late)
    this.chain.wetGain.gain.value = 0.18 + a * 0.55;

    // --- melodic phrases ---
    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      this.noteTimer = params.phraseGap;
      this.firePhrase(mode, tonic, params);
    }

    // --- sustained pad harmony ---
    this.padTimer -= dt;
    if (this.padTimer <= 0 && params.padLevel > 0.01) {
      this.padTimer = params.padGap;
      this.firePad(mode, tonic, params);
    }
  }

  private firePhrase(
    mode: ModeName,
    tonic: number,
    params: SectionParams,
  ) {
    const phrase = this.deriverPhrase();
    let beat = 0;
    const secPerBeat = params.secPerBeat;
    for (const n of phrase.notes) {
      const octave = pickOctave(params.registerSpread);
      const midi = degreeToMidi(n.degree, octave, mode, tonic);
      const freq = midiToFreq(midi);
      // stagger notes within the phrase by spawning each at its beat offset;
      // each voice reads ctx.currentTime at spawn time.
      const delayMs = beat * secPerBeat * 1000;
      const vel = n.vel * params.velScale;
      window.setTimeout(() => {
        playPianoNote(this.chain, freq, vel, params.brightness);
        if (params.shimmer > 0 && Math.random() < params.shimmer) {
          playShimmerGrain(
            this.chain,
            midiToFreq(midi + 12),
            params.shimmer * 0.8,
          );
        }
      }, delayMs);
      beat += n.dur;
    }
  }

  private firePad(mode: ModeName, tonic: number, params: SectionParams) {
    // build a simple chord from the mode (root, third, fifth) low in register
    const degrees = [0, 2, 4];
    for (const d of degrees) {
      const midi = degreeToMidi(d, -1, mode, tonic);
      playPadNote(this.chain, midiToFreq(midi), params.padLevel, params.padGap);
    }
  }
}

// ---------------------------------------------------------------------------
// Section parameter mapping — the heart of "different at minute 8"
// ---------------------------------------------------------------------------
export interface SectionParams {
  phraseGap: number; // seconds between phrases (lower = denser)
  padGap: number;
  secPerBeat: number;
  brightness: number; // 0..1 FM brightness
  velScale: number;
  padLevel: number;
  shimmer: number; // probability/level of shimmer grains
  registerSpread: number; // 0..1 how wide the octave spread
}

function sectionParams(
  age: number,
  section: Section,
  audioLevel: number,
): SectionParams {
  const lvl = clamp(audioLevel * 4, 0, 1);
  switch (section) {
    case "sparse":
      return {
        phraseGap: 5.5 - lvl * 1.5,
        padGap: 9,
        secPerBeat: 0.9,
        brightness: 0.2 + lvl * 0.1,
        velScale: 0.6,
        padLevel: 0.4,
        shimmer: 0.05,
        registerSpread: 0.2,
      };
    case "blooming":
      return {
        phraseGap: 3.0 - lvl * 1.0,
        padGap: 7,
        secPerBeat: 0.7,
        brightness: 0.45 + lvl * 0.2,
        velScale: 0.8,
        padLevel: 0.7,
        shimmer: 0.25,
        registerSpread: 0.5,
      };
    case "dense":
      return {
        phraseGap: 1.4 - lvl * 0.6,
        padGap: 5,
        secPerBeat: 0.5,
        brightness: 0.7 + lvl * 0.3,
        velScale: 1.0,
        padLevel: 1.0,
        shimmer: 0.55,
        registerSpread: 0.9,
      };
    case "dissolving": {
      // collapse back toward stillness; sparser & dimmer as age -> 1
      const t = (age - 0.8) / 0.2; // 0..1 within dissolving
      return {
        phraseGap: 3.5 + t * 6,
        padGap: 8 + t * 6,
        secPerBeat: 0.9 + t * 0.6,
        brightness: 0.5 - t * 0.35,
        velScale: 0.7 - t * 0.4,
        padLevel: 0.6 - t * 0.5,
        shimmer: 0.3 - t * 0.25,
        registerSpread: 0.6 - t * 0.4,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function cloneCell(c: PitchCell): PitchCell {
  return { notes: c.notes.map((n) => ({ ...n })) };
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickOctave(spread: number): number {
  // wider spread allows occasional jumps up/down an octave
  const r = Math.random();
  if (r < spread * 0.3) return 1;
  if (r > 1 - spread * 0.3) return -1;
  return 0;
}
