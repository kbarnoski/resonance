// ─────────────────────────────────────────────────────────────────────────────
// arc.ts — the long-form EDM build-and-drop state machine with memory.
//
// The arc cycles the canonical dramaturgy:
//   intro → build → break → drop → sustain → decay → (loop back to build)
// After the first pass the intro is skipped, and on every loop the parameters
// (key, lead motif, groove density, bpm) are MUTATED via a seeded mulberry32
// PRNG — so section N sounds different from section 1. The piece is genuinely
// different at minute 5 than at minute 1.
//
// The single `biasedTarget` (0..1) is the tension the whole audio+visual system
// reads. It comes from the current section's tension curve, biased by the live
// ENERGY slider.
// ─────────────────────────────────────────────────────────────────────────────

import { midiToHz } from "./synth";

export type SectionName = "intro" | "build" | "break" | "drop" | "sustain" | "decay";

interface SectionDef {
  name: SectionName;
  bars: number;
}

const SECTIONS: SectionDef[] = [
  { name: "intro", bars: 4 },
  { name: "build", bars: 8 },
  { name: "break", bars: 2 },
  { name: "drop", bars: 8 },
  { name: "sustain", bars: 8 },
  { name: "decay", bars: 4 },
];

// natural minor scale degrees (semitone offsets)
const MINOR = [0, 2, 3, 5, 7, 8, 10];
// low roots (MIDI) for that heavy EDM low end
const ROOTS = [33, 35, 36, 38, 40, 31];

export interface ArcParams {
  rootMidi: number;
  motif: number[]; // indices into the scale
  grooveDensity: number; // 0..1 — clap-roll aggressiveness
  bpm: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function curveFor(section: SectionName, p: number): number {
  switch (section) {
    case "intro":
      return 0.1 + 0.06 * p;
    case "build":
      // accelerating rise — coils tighter toward the break
      return 0.18 + 0.74 * Math.pow(p, 1.8);
    case "break":
      // drain to a held, breath-holding low
      return 0.14 - 0.02 * Math.sin(p * Math.PI);
    case "drop":
      // spike, then settle into the groove
      return 1.0 - 0.12 * p;
    case "sustain":
      return 0.7 + 0.03 * Math.sin(p * Math.PI * 2);
    case "decay":
      return 0.7 - 0.48 * p;
  }
}

export class DropArc {
  // ── live state ────────────────────────────────────────────────────────────
  section: SectionName = "intro";
  progress = 0;
  biasedTarget = 0.1;
  pass = 0;
  energyBias = 0.5; // from the ENERGY slider (0..1), 0.5 = neutral
  params: ArcParams;

  /** Set true this tick if a new section just began. */
  entered: SectionName | null = null;

  onDrop?: () => void;
  onSection?: (name: SectionName) => void;

  private rng: () => number;
  private index = 0;
  private stepsInSection = SECTIONS[0].bars * 16;
  private sectionStartStep: number | null = null;
  private pendingForce = false;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
    // first key drawn from the PRNG so even pass 0 is seeded
    this.params = {
      rootMidi: ROOTS[Math.floor(this.rng() * ROOTS.length)],
      motif: this.drawMotif(),
      grooveDensity: 0.45 + this.rng() * 0.4,
      bpm: 124 + Math.floor(this.rng() * 5),
    };
  }

  get stepDur(): number {
    return 60 / this.params.bpm / 4; // one 16th note
  }

  /** Root frequency (low) for the current key. */
  get rootHz(): number {
    return midiToHz(this.params.rootMidi);
  }

  /** Convert a scale degree (with octave) to Hz for the current key. */
  degreeHz(degree: number, octave: number): number {
    const idx = ((degree % MINOR.length) + MINOR.length) % MINOR.length;
    const oct = Math.floor(degree / MINOR.length) + octave;
    return midiToHz(this.params.rootMidi + MINOR[idx] + 12 * oct);
  }

  /** Arm an early drop — only honored while building. */
  forceDrop(): void {
    if (this.section === "build") this.pendingForce = true;
  }

  private drawMotif(): number[] {
    const len = 4 + Math.floor(this.rng() * 4);
    const m: number[] = [];
    for (let i = 0; i < len; i++) m.push(Math.floor(this.rng() * 8) - 1);
    return m;
  }

  private mutate(): void {
    this.params = {
      rootMidi: ROOTS[Math.floor(this.rng() * ROOTS.length)],
      motif: this.drawMotif(),
      grooveDensity: 0.4 + this.rng() * 0.55,
      bpm: 124 + Math.floor(this.rng() * 6),
    };
  }

  private applySection(i: number, mutate: boolean): void {
    this.index = i;
    const s = SECTIONS[i];
    this.section = s.name;
    this.stepsInSection = s.bars * 16;
    if (mutate) this.mutate();
  }

  /** Advance the machine to the current 16th-note step. */
  tick(step: number): void {
    this.entered = null;
    if (this.sectionStartStep === null) {
      this.sectionStartStep = step;
      this.applySection(0, false);
    }

    // early drop: collapse the build so the while-loop advances to the break
    if (this.pendingForce && this.section === "build") {
      this.pendingForce = false;
      this.sectionStartStep = step - this.stepsInSection;
    }

    while (step - (this.sectionStartStep as number) >= this.stepsInSection) {
      this.sectionStartStep = (this.sectionStartStep as number) + this.stepsInSection;
      let next = this.index + 1;
      let mutate = false;
      if (next >= SECTIONS.length) {
        next = 1; // loop to build, skipping the intro
        mutate = true;
        this.pass++;
      }
      this.applySection(next, mutate);
      this.entered = this.section;
      this.onSection?.(this.section);
      if (this.section === "drop") this.onDrop?.();
    }

    const p = clamp01((step - (this.sectionStartStep as number)) / this.stepsInSection);
    this.progress = p;
    const raw = curveFor(this.section, p);
    this.biasedTarget = clamp01(raw * (0.6 + 0.8 * this.energyBias));
  }
}
