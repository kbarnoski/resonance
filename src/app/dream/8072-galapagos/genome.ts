// ─────────────────────────────────────────────────────────────────────────────
// 8072-galapagos · genome.ts
//
// The GENOME is the single source of truth: the same ~10 genes are read by
// biomorph.ts to draw the SVG creature AND by audio.ts to voice its tone. A
// genome is a flat array of normalised genes in [0,1]; all mapping to real
// ranges (angles, depths, Hz) happens at read-time so crossover + mutation can
// stay uniform and range-agnostic.
//
// Determinism: every random draw here comes from a caller-supplied mulberry32
// PRNG. No Math.random / Date.now anywhere in this module.
// ─────────────────────────────────────────────────────────────────────────────

/** Standard 32-bit mulberry32 PRNG. Returns a () => [0,1) generator. */
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

// Gene indices — a genome is `number[]` of length GENE_COUNT, each in [0,1].
export const GENE = {
  ANGLE: 0, //   branch angle between siblings
  DEPTH: 1, //   recursion depth (3..6)
  FALLOFF: 2, //  length shrink per level
  BRANCHES: 3, // children per node (2 or 3)
  CURL: 4, //     per-level angular drift (asymmetry)
  THICK: 5, //    trunk stroke width
  SHADE: 6, //    index into the violet ramp
  PITCH: 7, //    fundamental — index into a JI scale
  SPREAD: 8, //   overall scale / trunk length
  RHYTHM: 9, //   ostinato tempo + duty
} as const;

export const GENE_COUNT = 10;

export type Genome = number[];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A fresh random genome from the given PRNG. */
export function makeGenome(rng: () => number): Genome {
  const g: Genome = new Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) g[i] = rng();
  return g;
}

/** Nine random genomes — the founding population. */
export function makeFounders(rng: () => number): Genome[] {
  const pop: Genome[] = [];
  for (let i = 0; i < 9; i++) pop.push(makeGenome(rng));
  return pop;
}

// Approx-gaussian in ~[-1.5,1.5], mean 0, from three uniform draws.
function gauss(rng: () => number): number {
  return rng() + rng() + rng() - 1.5;
}

/**
 * Sexual crossover: gene-by-gene, each gene is inherited from parent A or B.
 * A single-parent "clone" is just crossover(a, a).
 */
export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const child: Genome = new Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) child[i] = rng() < 0.5 ? a[i] : b[i];
  return child;
}

/** Small gaussian jitter per gene, clamped to [0,1]. sigma ~ mutation rate. */
export function mutate(g: Genome, rng: () => number, sigma = 0.09): Genome {
  const out: Genome = new Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) out[i] = clamp01(g[i] + gauss(rng) * sigma);
  return out;
}

/**
 * Breed a new generation of 9 offspring from the chosen parents.
 * - 2 parents → sexual crossover + mutation.
 * - 1 parent  → asexual clone + mutation.
 * The first child is an (almost) faithful low-mutation heir so lineage stays
 * legible across generations; the rest explore more widely.
 */
export function breed(parents: Genome[], rng: () => number): Genome[] {
  const next: Genome[] = [];
  const a = parents[0];
  const b = parents[1] ?? parents[0];
  for (let i = 0; i < 9; i++) {
    const base = crossover(a, b, rng);
    const sigma = i === 0 ? 0.03 : 0.06 + rng() * 0.12;
    next.push(mutate(base, rng, sigma));
  }
  return next;
}

// ── Derived, human-meaningful readings of a genome ──────────────────────────

export interface GenomeTraits {
  angleDeg: number; // half-angle between sibling branches
  depth: number; // recursion levels (3..6, integer)
  falloff: number; // length multiplier per level (0.55..0.82)
  branches: number; // children per node (2 or 3)
  curl: number; // signed angular drift per level (deg)
  thick: number; // trunk stroke width (px)
  shade: number; // 0..1 position on the violet ramp
  trunk: number; // trunk length (px)
}

export function readTraits(g: Genome): GenomeTraits {
  return {
    angleDeg: 12 + g[GENE.ANGLE] * 44, // 12..56°
    depth: 3 + Math.floor(g[GENE.DEPTH] * 3.999), // 3..6
    falloff: 0.55 + g[GENE.FALLOFF] * 0.27, // 0.55..0.82
    branches: g[GENE.BRANCHES] < 0.5 ? 2 : 3,
    curl: (g[GENE.CURL] - 0.5) * 34, // -17..+17°
    thick: 1.1 + g[GENE.THICK] * 3.2, // 1.1..4.3
    shade: g[GENE.SHADE],
    trunk: 22 + g[GENE.SPREAD] * 30, // 22..52
  };
}

// Just-intonation scale over ~two octaves for the fundamental gene.
const JI_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const JI_SCALE: number[] = [];
for (const oct of [0, 1]) {
  for (const r of JI_RATIOS) JI_SCALE.push(r * Math.pow(2, oct));
}

export interface GenomeVoice {
  freq: number; // carrier fundamental (Hz)
  modRatio: number; // modulator : carrier frequency ratio
  modIndex: number; // FM depth (brightness)
  rhythmHz: number; // ostinato pulse rate
  duty: number; // fraction of the cycle the voice is "on"
  timbre: OscillatorType; // carrier waveform
}

/** Genome → an FM voice. Same genes, different projection. */
export function readVoice(g: Genome, root: number): GenomeVoice {
  const idx = Math.min(JI_SCALE.length - 1, Math.floor(g[GENE.PITCH] * JI_SCALE.length));
  const depth = 3 + Math.floor(g[GENE.DEPTH] * 3.999);
  const branches = g[GENE.BRANCHES] < 0.5 ? 2 : 3;
  return {
    freq: root * JI_SCALE[idx],
    modRatio: branches, // 2 or 3 → harmonic, consonant FM
    modIndex: 40 + (depth - 3) * 130 + g[GENE.CURL] * 90, // brightness ← depth+curl
    rhythmHz: 0.4 + g[GENE.RHYTHM] * 2.6, // ostinato tempo
    duty: 0.18 + g[GENE.THICK] * 0.4, // thicker ⇒ longer notes
    timbre: g[GENE.THICK] < 0.5 ? "sine" : "triangle",
  };
}

/** A stable short signature string for a genome (for lineage labels). */
export function genomeSig(g: Genome): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < g.length; i++) {
    h ^= Math.round(g[i] * 255) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).slice(0, 4).toUpperCase();
}
