/*
 * 877 · BIOSPHERE SCORE — structural mapping
 *
 * The HEART of the piece. We map taxonomic CLASS/KINGDOM to orchestra
 * SECTIONS, each occupying a distinct register band — motivated by Bernie
 * Krause's acoustic niche hypothesis (species partition the spectrum to
 * avoid masking). The DATA decides who plays when (each observation brings
 * its section's voice in); pitch is always quantized to a shared evolving
 * modal scale, so it is harmonic by construction — we never detune by a
 * data value.
 */

import type { Occurrence } from "./gbif";

export type SectionId =
  | "birds"
  | "mammals"
  | "insects"
  | "plants"
  | "fungi"
  | "amphibians"
  | "reptiles"
  | "fish"
  | "other";

export type Section = {
  id: SectionId;
  label: string;
  voice: "flute" | "cello" | "pizz" | "pad" | "sub" | "croak" | "bell";
  // Register band, expressed as scale-degree indices into the active scale.
  // Higher indices = higher octaves. Each section sits in its own band.
  bandLo: number;
  bandHi: number;
  // RGB for the visual dot / legend swatch.
  color: [number, number, number];
};

export const SECTIONS: Record<SectionId, Section> = {
  birds: { id: "birds", label: "Birds · Aves", voice: "flute", bandLo: 21, bandHi: 30, color: [120, 220, 255] },
  insects: { id: "insects", label: "Insects · Insecta", voice: "pizz", bandLo: 16, bandHi: 24, color: [255, 215, 120] },
  amphibians: { id: "amphibians", label: "Amphibians", voice: "croak", bandLo: 11, bandHi: 18, color: [140, 255, 170] },
  reptiles: { id: "reptiles", label: "Reptiles", voice: "croak", bandLo: 10, bandHi: 17, color: [190, 230, 120] },
  fish: { id: "fish", label: "Fish · Actinopterygii", voice: "bell", bandLo: 12, bandHi: 20, color: [120, 200, 230] },
  other: { id: "other", label: "Other", voice: "bell", bandLo: 12, bandHi: 19, color: [200, 200, 220] },
  mammals: { id: "mammals", label: "Mammals · Mammalia", voice: "cello", bandLo: 4, bandHi: 12, color: [255, 160, 110] },
  plants: { id: "plants", label: "Plants · Plantae", voice: "pad", bandLo: 0, bandHi: 14, color: [180, 150, 255] },
  fungi: { id: "fungi", label: "Fungi", voice: "sub", bandLo: -2, bandHi: 6, color: [255, 130, 200] },
};

export const SECTION_ORDER: SectionId[] = [
  "birds", "insects", "fish", "amphibians", "reptiles", "other", "mammals", "plants", "fungi",
];

/** Map a GBIF occurrence to an orchestra section via class, then kingdom. */
export function sectionFor(occ: Occurrence): SectionId {
  const c = (occ.className ?? "").toLowerCase();
  const k = (occ.kingdom ?? "").toLowerCase();
  if (c === "aves") return "birds";
  if (c === "mammalia") return "mammals";
  if (c === "insecta") return "insects";
  if (c === "amphibia") return "amphibians";
  if (c === "reptilia") return "reptiles";
  if (c === "actinopterygii" || c === "teleostei" || c === "chondrichthyes") return "fish";
  if (k === "plantae") return "plants";
  if (k === "fungi") return "fungi";
  return "other";
}

/*
 * Harmonic arc. A shared modal scale (intervals over a root) that slowly
 * transposes/modulates over the piece. We list a sequence of modes; the arc
 * advances through them, each ~30–60s, growing brighter as richness climbs.
 */

// Intervals (in semitones from root) for one octave of each mode.
const MODES: { name: string; steps: number[] }[] = [
  { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Aeolian", steps: [0, 2, 3, 5, 7, 8, 10] },
];

// Root pitch-class journey (semitone offsets) — a gentle modulation cycle.
const ROOT_CYCLE = [0, 5, 3, 7, 2];

export type Harmony = {
  modeName: string;
  rootMidi: number;
  steps: number[];
};

const BASE_ROOT_MIDI = 36; // C2 — low anchor; degrees climb from here.

/** Current harmony given how many modulations have elapsed. */
export function harmonyAt(modulationIndex: number): Harmony {
  const mode = MODES[modulationIndex % MODES.length];
  const root = BASE_ROOT_MIDI + ROOT_CYCLE[modulationIndex % ROOT_CYCLE.length];
  return { modeName: mode.name, rootMidi: root, steps: mode.steps };
}

/**
 * Quantize a scale-degree index to a MIDI note in the active harmony.
 * `degree` may be negative or large; it wraps across octaves. This is what
 * keeps every voice harmonic regardless of the data — pitch is chosen from
 * the shared scale, NOT computed from a measurement.
 */
export function degreeToMidi(harmony: Harmony, degree: number): number {
  const n = harmony.steps.length;
  const octave = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return harmony.rootMidi + octave * 12 + harmony.steps[idx];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Longitude (−180..180) → stereo pan (−1..1). */
export function lonToPan(lon: number): number {
  return Math.max(-1, Math.min(1, lon / 180));
}

/**
 * Pick a scale-degree within a section's band. We use the occurrence's
 * latitude only to choose a STABLE position inside the band (so the same
 * place tends to recur on the same degree) — but the result is still a scale
 * degree, quantized to the harmony, never a raw frequency.
 */
export function degreeInBand(section: Section, lat: number): number {
  const span = section.bandHi - section.bandLo;
  const t = (lat + 90) / 180; // 0..1
  return section.bandLo + Math.round(t * span);
}

/*
 * Running musical STATE / MEMORY. Tracks cumulative taxonomic richness
 * (distinct sections seen), per-section voice counts, and a clustering meter
 * that measures temporal density of recent events. These drive the long-form
 * arc: more sections → fuller ensemble; a flurry → busier rhythm.
 */
export type ScoreState = {
  seenSections: Set<SectionId>;
  voiceCounts: Record<SectionId, number>;
  totalEvents: number;
  recentTimes: number[]; // event timestamps (audio-clock seconds), windowed
  modulationIndex: number;
  lastModulationT: number;
};

export function createScoreState(): ScoreState {
  const voiceCounts = {} as Record<SectionId, number>;
  for (const id of SECTION_ORDER) voiceCounts[id] = 0;
  return {
    seenSections: new Set(),
    voiceCounts,
    totalEvents: 0,
    recentTimes: [],
    modulationIndex: 0,
    lastModulationT: 0,
  };
}

/** Register an event into the running state; returns updated clustering. */
export function recordEvent(state: ScoreState, section: SectionId, now: number): void {
  state.seenSections.add(section);
  state.voiceCounts[section] += 1;
  state.totalEvents += 1;
  state.recentTimes.push(now);
  // Keep a 6s window for the clustering / density meter.
  const cutoff = now - 6;
  while (state.recentTimes.length && state.recentTimes[0] < cutoff) {
    state.recentTimes.shift();
  }
}

/** Clustering density 0..1 — how busy the last few seconds have been. */
export function clusteringDensity(state: ScoreState, now: number): number {
  const cutoff = now - 6;
  let n = 0;
  for (let i = state.recentTimes.length - 1; i >= 0; i--) {
    if (state.recentTimes[i] >= cutoff) n++;
    else break;
  }
  // ~10 events in 6s reads as "dense".
  return Math.min(1, n / 10);
}

/** Cumulative richness 0..1 — fraction of all possible sections seen. */
export function richness(state: ScoreState): number {
  return state.seenSections.size / SECTION_ORDER.length;
}
