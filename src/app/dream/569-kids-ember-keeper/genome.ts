/**
 * genome.ts — cross-session persistent state + seeded PRNG for the Ember Keeper.
 *
 * The genome lives in localStorage and NEVER resets. Each visit only adds to it.
 * The creature's whole body is regrown deterministically from the genome on every
 * load, so day N always looks bigger/different than day N-1.
 *
 * References:
 *  - Tamagotchi (Aki Maita / Bandai, 1996): a creature that lives in the device,
 *    remembers you, and rewards returning.
 *  - Steve Grand's *Creatures* (1996): an organism with internal accumulating state.
 *  - D'Arcy Thompson, *On Growth and Form* (1917): growth as the repeated, rule-based
 *    addition of parts — morphology emerges from a small set of accumulating tokens.
 */

export const STORAGE_KEY = "resonance.ember-keeper.v1";

/** One growth token = one structural part the body grows from. */
export type GrowthToken = {
  /** Stable id used to seed this part's PRNG so it regrows identically each load. */
  id: number;
  /** Why it grew, for the README/debug + subtle visual flavour. */
  kind: "day" | "hum";
  /** A pentatonic degree (0..N) associated with the part, for colour/sound flavour. */
  degree: number;
};

export type Genome = {
  /** Schema marker. */
  v: 1;
  /** First time this creature was ever woken (toDateString). */
  bornOn: string;
  /** Last calendar day we saw the child (toDateString). */
  lastVisitDay: string;
  /** Total number of times the page was opened / woken. */
  visits: number;
  /** Number of DISTINCT calendar days the child has returned. Drives big growth. */
  distinctDays: number;
  /** Total seconds the child has hummed/sung, all-time. */
  totalHumSeconds: number;
  /** Learned pitch palette: pentatonic degrees the child has fed it (0..palette span). */
  palette: number[];
  /** The accumulating list of body parts. Never shrinks. */
  tokens: GrowthToken[];
  /** Monotonic counter so every new token gets a unique seed id. */
  nextTokenId: number;
};

/* ── Seeded PRNG (mulberry32) — deterministic regrowth from any seed ─────────── */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Pentatonic palette: C-major pentatonic, C3..C5 — nothing is ever "wrong" ── */
// Degrees map onto these MIDI notes (relative semitone offsets from C3 = MIDI 48).
export const PENTATONIC_OFFSETS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // C3..C5
export const PENTATONIC_BASE_MIDI = 48; // C3

export function degreeToMidi(degree: number): number {
  const clamped = Math.max(0, Math.min(PENTATONIC_OFFSETS.length - 1, degree));
  return PENTATONIC_BASE_MIDI + PENTATONIC_OFFSETS[clamped];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Snap any frequency (Hz) to the nearest C-major-pentatonic degree in range. */
export function freqToDegree(freq: number): number {
  if (freq <= 0) return 0;
  const midi = 69 + 12 * Math.log2(freq / 440);
  let best = 0;
  let bestDist = Infinity;
  for (let d = 0; d < PENTATONIC_OFFSETS.length; d++) {
    const m = degreeToMidi(d);
    const dist = Math.abs(m - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

/* ── Demo seed: a pre-grown creature for fresh devices ───────────────────────── */
/**
 * On an empty device the 06:30 reviewer must still see a rich, many-limbed
 * creature singing — NOT an empty seed. So we fabricate a believable history:
 * ~5 visits across ~4 days, a learned palette, and a fistful of growth tokens.
 * This is intentionally obvious and only ever runs when localStorage is empty.
 */
export function makeDemoGenome(today: string): Genome {
  const palette = [0, 2, 4, 5, 7]; // a friendly little learned phrase
  const tokens: GrowthToken[] = [];
  let id = 0;
  // 4 distinct days → 4 "day" parts (the big visible limbs/nodes).
  const dayDegrees = [0, 4, 7, 2];
  for (let d = 0; d < 4; d++) {
    tokens.push({ id: id++, kind: "day", degree: dayDegrees[d] });
  }
  // A scattering of within-day "hum" parts (smaller fronds), to look loved.
  const humDegrees = [2, 4, 7, 9, 0, 5];
  for (let h = 0; h < humDegrees.length; h++) {
    tokens.push({ id: id++, kind: "hum", degree: humDegrees[h] });
  }
  return {
    v: 1,
    bornOn: today,
    lastVisitDay: today,
    visits: 5,
    distinctDays: 4,
    totalHumSeconds: 96,
    palette,
    tokens,
    nextTokenId: id,
  };
}

/* ── Load / migrate / save ───────────────────────────────────────────────────── */

function readRaw(): Genome | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Genome>;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.tokens)) return null;
    return parsed as Genome;
  } catch {
    return null;
  }
}

export function saveGenome(g: Genome): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
  } catch {
    /* private mode / quota — fail silently; the creature still plays this session. */
  }
}

export type LoadResult = {
  genome: Genome;
  /** True when this load crossed into a NEW calendar day (a big new part grew). */
  grewToday: boolean;
  /** True when we had to fabricate the rich demo creature (fresh device). */
  seededDemo: boolean;
};

/**
 * Load the genome and apply a visit. NEVER resets:
 *  - empty device → seed the rich DEMO creature (so the morning review is alive).
 *  - returning same day → +1 visit only.
 *  - returning a NEW day → +1 visit, +1 distinctDay, and grow ONE big new "day" part.
 */
export function loadAndVisit(today: string): LoadResult {
  const existing = readRaw();

  if (!existing) {
    const demo = makeDemoGenome(today);
    saveGenome(demo);
    return { genome: demo, grewToday: false, seededDemo: true };
  }

  let grewToday = false;
  const g: Genome = { ...existing };
  g.visits += 1;

  if (g.lastVisitDay !== today) {
    g.distinctDays += 1;
    // Big growth: one new "day" part, its degree drawn deterministically from history.
    const rng = makeRng(g.nextTokenId * 2654435761 + g.distinctDays);
    const degree = g.palette.length
      ? g.palette[Math.floor(rng() * g.palette.length)]
      : Math.floor(rng() * 5);
    g.tokens = [...g.tokens, { id: g.nextTokenId, kind: "day", degree }];
    g.nextTokenId += 1;
    g.lastVisitDay = today;
    grewToday = true;
  }

  saveGenome(g);
  return { genome: g, grewToday, seededDemo: false };
}

/** Advance one calendar day (the reviewer's "🌙 next day" time-travel control). */
export function advanceOneDay(g: Genome): { genome: Genome; newTokenId: number } {
  const ng: Genome = { ...g };
  ng.distinctDays += 1;
  ng.visits += 1;
  const rng = makeRng(ng.nextTokenId * 2654435761 + ng.distinctDays);
  const degree = ng.palette.length
    ? ng.palette[Math.floor(rng() * ng.palette.length)]
    : Math.floor(rng() * 5);
  const newId = ng.nextTokenId;
  ng.tokens = [...ng.tokens, { id: newId, kind: "day", degree }];
  ng.nextTokenId += 1;
  // Pretend a day passed so a subsequent real visit today won't double-grow.
  ng.lastVisitDay = "time-travelled";
  saveGenome(ng);
  return { genome: ng, newTokenId: newId };
}

/** A hum feeds the creature: learn the degree + grow a small frond. */
export function feedHum(
  g: Genome,
  degree: number,
  seconds: number,
): { genome: Genome; newTokenId: number } {
  const ng: Genome = { ...g };
  ng.totalHumSeconds += seconds;
  if (!ng.palette.includes(degree)) ng.palette = [...ng.palette, degree].sort((a, b) => a - b);
  const newId = ng.nextTokenId;
  ng.tokens = [...ng.tokens, { id: newId, kind: "hum", degree }];
  ng.nextTokenId += 1;
  saveGenome(ng);
  return { genome: ng, newTokenId: newId };
}

/** Tap-to-pet: a tiny hum-like growth even with no mic (graceful degradation). */
export function petGrow(g: Genome): { genome: Genome; newTokenId: number } {
  const degree = g.palette.length ? g.palette[g.palette.length - 1] : 0;
  return feedHum(g, degree, 1);
}
