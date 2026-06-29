// evolve.ts — the deterministic, side-effect-free core of "Living Album".
//
// A population of melodic AGENTS drifts through a slowly-modulating diatonic
// harmonic space. Each agent carries a small GENOME (a few numbers). Agents are
// born, age, reproduce (children inherit a mutated blend of two parents'
// genomes), and die. Because reproduction mixes living genomes, the dominant
// motifs at minute 6 are descendants of what was alive at minute 1 — that is
// the audible "memory" / heredity.
//
// NOTHING here touches the DOM, Web Audio, or Canvas. It is pure data + math so
// it can be unit-tested headlessly (see evolve.test.ts). The page imports this
// module and turns the emitted note events into sound and the population state
// into visuals.

/* ──────────────────────────────────────────────────────────────────────────
   Deterministic RNG (mulberry32) — so the test and the demo are reproducible.
   ────────────────────────────────────────────────────────────────────────── */

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [lo, hi). */
function between(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/* ──────────────────────────────────────────────────────────────────────────
   Functional harmony.

   We work in a fixed key (C major scale degrees, expressed as semitone offsets
   from a tonic MIDI root). A small progression of diatonic triads slowly cycles
   and can be "transposed" by the climate. Each chord exposes its chord tones AND
   the full diatonic scale so agents can pick passing tones with real
   voice-leading — never an out-of-key note.
   ────────────────────────────────────────────────────────────────────────── */

// Major scale, semitone offsets from tonic.
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

export interface Chord {
  /** Human label, e.g. "I", "vi". */
  name: string;
  /** Scale-degree indices (0..6) of the triad root/third/fifth. */
  degrees: [number, number, number];
}

// A gentle, mostly-consonant diatonic loop in C: I – vi – IV – V – iii – IV.
// It is a PROGRESSION (functional), not a static drone, and it modulates its
// tonic over time via climate (see HarmonyState.tonic).
export const PROGRESSION: Chord[] = [
  { name: "I", degrees: [0, 2, 4] },
  { name: "vi", degrees: [5, 0, 2] },
  { name: "IV", degrees: [3, 5, 0] },
  { name: "V", degrees: [4, 6, 1] },
  { name: "iii", degrees: [2, 4, 6] },
  { name: "IV", degrees: [3, 5, 0] },
];

export interface HarmonyState {
  /** MIDI tonic of the current key (drifts with climate). */
  tonic: number;
  /** Index into PROGRESSION of the active chord. */
  chordIndex: number;
}

/** All diatonic MIDI pitches in [minMidi, maxMidi] for the current key. */
export function diatonicPitches(
  h: HarmonyState,
  minMidi: number,
  maxMidi: number,
): number[] {
  const out: number[] = [];
  for (let m = minMidi; m <= maxMidi; m++) {
    const rel = ((m - h.tonic) % 12 + 12) % 12;
    if ((MAJOR_SCALE as readonly number[]).includes(rel)) out.push(m);
  }
  return out;
}

/** The three chord-tone pitch classes (0..11) of the active chord. */
export function chordTonePitchClasses(h: HarmonyState): number[] {
  const chord = PROGRESSION[h.chordIndex % PROGRESSION.length];
  return chord.degrees.map((d) => MAJOR_SCALE[d] % 12);
}

/** True iff a MIDI pitch is in the current key (diatonic). */
export function isDiatonic(h: HarmonyState, midi: number): boolean {
  const rel = ((midi - h.tonic) % 12 + 12) % 12;
  return (MAJOR_SCALE as readonly number[]).includes(rel);
}

/** True iff a MIDI pitch is a chord tone of the active chord. */
export function isChordTone(h: HarmonyState, midi: number): boolean {
  const rel = ((midi - h.tonic) % 12 + 12) % 12;
  return chordTonePitchClasses(h).includes(rel);
}

/* ──────────────────────────────────────────────────────────────────────────
   Genome + Agent.
   ────────────────────────────────────────────────────────────────────────── */

export interface Genome {
  /** Preferred centre MIDI pitch (register). */
  register: number;
  /** Notes per "bar" tendency, 0..1 (rhythmic density). */
  density: number;
  /** Timbre brightness 0..1 (drives filter cutoff / waveform mix). */
  bright: number;
  /** A short interval motif in scale-steps, e.g. [+1, +2, -1]. Heredity carrier. */
  motif: number[];
  /** Total lifespan in ticks before natural death. */
  lifespan: number;
}

export interface Agent {
  id: number;
  genome: Genome;
  /** Age in ticks. */
  age: number;
  /** Position within its motif (which step it will play next). */
  motifPos: number;
  /** Last MIDI pitch it played (for voice-leading). */
  lastMidi: number;
  /** ticks until this agent next emits a note. */
  cooldown: number;
  /** ids of parents (for the lineage visual); empty for seeds/founders. */
  parents: number[];
  /** generation depth (founders = 0). */
  generation: number;
  /** A stable hue 0..1 inherited (with drift) for the lineage colour. */
  hue: number;
}

export const GENOME_BOUNDS = {
  register: [40, 84] as [number, number],
  density: [0.05, 1] as [number, number],
  bright: [0, 1] as [number, number],
  lifespan: [600, 4200] as [number, number],
  motifLen: [2, 5] as [number, number],
  motifStep: [-4, 4] as [number, number],
};

/* ──────────────────────────────────────────────────────────────────────────
   Genome operations: random founder, mutation, crossover.
   ────────────────────────────────────────────────────────────────────────── */

export function randomGenome(rng: Rng): Genome {
  const len =
    Math.floor(
      between(rng, GENOME_BOUNDS.motifLen[0], GENOME_BOUNDS.motifLen[1] + 1),
    ) | 0;
  const motif: number[] = [];
  for (let i = 0; i < len; i++) {
    motif.push(
      Math.round(
        between(rng, GENOME_BOUNDS.motifStep[0], GENOME_BOUNDS.motifStep[1]),
      ),
    );
  }
  return {
    register: Math.round(
      between(rng, GENOME_BOUNDS.register[0], GENOME_BOUNDS.register[1]),
    ),
    density: between(rng, GENOME_BOUNDS.density[0], GENOME_BOUNDS.density[1]),
    bright: between(rng, GENOME_BOUNDS.bright[0], GENOME_BOUNDS.bright[1]),
    lifespan: Math.round(
      between(rng, GENOME_BOUNDS.lifespan[0], GENOME_BOUNDS.lifespan[1]),
    ),
    motif,
  };
}

/** Mutation magnitude. Small, so heredity dominates over noise. */
export const MUTATION = {
  register: 3, // ± semitones
  density: 0.12,
  bright: 0.12,
  lifespan: 350,
  hue: 0.05,
  motifStep: 1, // ± scale-steps, rare
  motifFlipChance: 0.15,
};

function mutateGenome(g: Genome, rng: Rng): Genome {
  const motif = g.motif.map((s) =>
    rng() < MUTATION.motifFlipChance
      ? clamp(
          s + Math.round(between(rng, -MUTATION.motifStep, MUTATION.motifStep)),
          GENOME_BOUNDS.motifStep[0],
          GENOME_BOUNDS.motifStep[1],
        )
      : s,
  );
  return {
    register: Math.round(
      clamp(
        g.register + between(rng, -MUTATION.register, MUTATION.register),
        GENOME_BOUNDS.register[0],
        GENOME_BOUNDS.register[1],
      ),
    ),
    density: clamp(
      g.density + between(rng, -MUTATION.density, MUTATION.density),
      GENOME_BOUNDS.density[0],
      GENOME_BOUNDS.density[1],
    ),
    bright: clamp(
      g.bright + between(rng, -MUTATION.bright, MUTATION.bright),
      GENOME_BOUNDS.bright[0],
      GENOME_BOUNDS.bright[1],
    ),
    lifespan: Math.round(
      clamp(
        g.lifespan + between(rng, -MUTATION.lifespan, MUTATION.lifespan),
        GENOME_BOUNDS.lifespan[0],
        GENOME_BOUNDS.lifespan[1],
      ),
    ),
    motif,
  };
}

/** Blend two genomes (heredity) then apply a small mutation. */
export function crossover(a: Genome, b: Genome, rng: Rng): Genome {
  const t = rng(); // blend weight toward parent a
  const blendLen = Math.round(t * a.motif.length + (1 - t) * b.motif.length);
  const len = clamp(
    blendLen,
    GENOME_BOUNDS.motifLen[0],
    GENOME_BOUNDS.motifLen[1],
  );
  const motif: number[] = [];
  for (let i = 0; i < len; i++) {
    const sa = a.motif[i % a.motif.length];
    const sb = b.motif[i % b.motif.length];
    // each step picks from one parent (gene-level inheritance)
    motif.push(rng() < t ? sa : sb);
  }
  const blended: Genome = {
    register: Math.round(t * a.register + (1 - t) * b.register),
    density: t * a.density + (1 - t) * b.density,
    bright: t * a.bright + (1 - t) * b.bright,
    lifespan: Math.round(t * a.lifespan + (1 - t) * b.lifespan),
    motif,
  };
  return mutateGenome(blended, rng);
}

/* ──────────────────────────────────────────────────────────────────────────
   Climate — the human's slow perturbation. NOT a note trigger; a field the
   whole population adapts toward over the next minute.
   ────────────────────────────────────────────────────────────────────────── */

export interface Climate {
  /** Target centre register the population drifts toward, MIDI. */
  register: number;
  /** Target collective brightness 0..1. */
  bright: number;
  /** Target collective density 0..1. */
  density: number;
  /** Semitone offset applied to the key tonic (modulation), integer. */
  keyShift: number;
}

export function defaultClimate(): Climate {
  return { register: 60, bright: 0.5, density: 0.5, keyShift: 0 };
}

/* ──────────────────────────────────────────────────────────────────────────
   World state + step.
   ────────────────────────────────────────────────────────────────────────── */

export interface NoteEvent {
  agentId: number;
  midi: number;
  /** 0..1, derived from genome density (shorter for dense agents). */
  duration: number;
  /** 0..1 brightness for the synth. */
  bright: number;
  hue: number;
  generation: number;
}

export interface World {
  rng: Rng;
  harmony: HarmonyState;
  climate: Climate;
  agents: Agent[];
  tick: number;
  nextId: number;
  /** ticks since last chord change. */
  chordTimer: number;
  /** note events emitted on the most recent step (consumed by the page). */
  events: NoteEvent[];
}

export const CONFIG = {
  baseTonic: 48, // C3
  minMidi: 40,
  maxMidi: 88,
  minPop: 3,
  maxPop: 14,
  softCap: 9, // reproduction slows above this
  chordEvery: 220, // ticks per chord (slow harmonic rhythm)
  // how fast agents adapt their genome toward the climate, per tick:
  adaptRate: 0.0009,
  // tonic glides toward baseTonic + climate.keyShift:
  tonicGlide: 0.01,
  reproChanceBase: 0.012,
};

export function makeWorld(seed: number, founders = 5): World {
  const rng = makeRng(seed);
  const world: World = {
    rng,
    harmony: { tonic: CONFIG.baseTonic, chordIndex: 0 },
    climate: defaultClimate(),
    agents: [],
    tick: 0,
    nextId: 1,
    chordTimer: 0,
    events: [],
  };
  for (let i = 0; i < founders; i++) {
    world.agents.push(makeAgent(world, randomGenome(rng), [], 0, rng()));
  }
  return world;
}

function makeAgent(
  world: World,
  genome: Genome,
  parents: number[],
  generation: number,
  hue: number,
): Agent {
  return {
    id: world.nextId++,
    genome,
    age: 0,
    motifPos: 0,
    lastMidi: clamp(genome.register, CONFIG.minMidi, CONFIG.maxMidi),
    cooldown: Math.floor((1 - genome.density) * 40) + 4,
    parents,
    generation,
    hue: ((hue % 1) + 1) % 1,
  };
}

/**
 * Plant a SEED — the tap interaction. Injects one new agent whose genome is
 * biased by the planting (x,y in 0..1): x → register (low..high),
 * y → brightness. The seed then lives, ages, and breeds like any other, so a
 * single tap echoes forward through its descendants for minutes.
 */
export function plantSeed(world: World, x: number, y: number): Agent {
  const reg = Math.round(
    CONFIG.minMidi + clamp(x, 0, 1) * (CONFIG.maxMidi - 8 - CONFIG.minMidi),
  );
  const bright = clamp(1 - y, 0, 1);
  const len = 3;
  const motif: number[] = [];
  for (let i = 0; i < len; i++) {
    motif.push(Math.round(between(world.rng, -3, 3)));
  }
  const genome: Genome = {
    register: clamp(reg, GENOME_BOUNDS.register[0], GENOME_BOUNDS.register[1]),
    density: clamp(0.4 + world.rng() * 0.4, 0, 1),
    bright,
    lifespan: 2600,
    motif,
  };
  // seed hue tracks brightness so the lineage is visually identifiable
  const agent = makeAgent(world, genome, [], 0, 0.55 + bright * 0.3);
  world.agents.push(agent);
  // gently enforce cap by retiring the oldest if we overflow
  if (world.agents.length > CONFIG.maxPop) {
    world.agents.sort((a, b) => b.age - a.age);
    world.agents.length = CONFIG.maxPop;
  }
  return agent;
}

/** Nudge the whole climate (the other, non-injecting perturbation). */
export function nudgeClimate(world: World, patch: Partial<Climate>): void {
  const c = world.climate;
  if (patch.register !== undefined)
    c.register = clamp(patch.register, CONFIG.minMidi, CONFIG.maxMidi);
  if (patch.bright !== undefined) c.bright = clamp(patch.bright, 0, 1);
  if (patch.density !== undefined) c.density = clamp(patch.density, 0, 1);
  if (patch.keyShift !== undefined)
    c.keyShift = clamp(Math.round(patch.keyShift), -7, 7);
}

/* Pick the next pitch for an agent given the active chord. Real voice-leading:
   walk the agent's motif in scale-steps from its last pitch, snap into the key,
   and prefer chord tones on strong emissions. Always returns a DIATONIC pitch. */
export function pickPitch(world: World, agent: Agent): number {
  const h = world.harmony;
  const scale = diatonicPitches(h, CONFIG.minMidi, CONFIG.maxMidi);
  if (scale.length === 0) return agent.lastMidi;

  // find index of last pitch within the diatonic scale (or nearest)
  let nearest = 0;
  let bestDist = Infinity;
  for (let i = 0; i < scale.length; i++) {
    const d = Math.abs(scale[i] - agent.lastMidi);
    if (d < bestDist) {
      bestDist = d;
      nearest = i;
    }
  }

  const step = agent.genome.motif[agent.motifPos % agent.genome.motif.length];
  agent.motifPos = (agent.motifPos + 1) % agent.genome.motif.length;

  let idx = clamp(nearest + step, 0, scale.length - 1);
  let midi = scale[idx];

  // Pull toward register: if drifting too far from preferred centre, fold back.
  const centre = clamp(
    agent.genome.register,
    CONFIG.minMidi,
    CONFIG.maxMidi,
  );
  if (Math.abs(midi - centre) > 14) {
    // re-anchor near centre, still diatonic
    let cBest = 0;
    let cDist = Infinity;
    for (let i = 0; i < scale.length; i++) {
      const d = Math.abs(scale[i] - centre);
      if (d < cDist) {
        cDist = d;
        cBest = i;
      }
    }
    idx = clamp(cBest + (step > 0 ? 1 : -1), 0, scale.length - 1);
    midi = scale[idx];
  }

  // On strong beats (every other motif step), snap to the nearest chord tone for
  // functional clarity — still diatonic by construction.
  if (agent.motifPos % 2 === 0) {
    let ct = midi;
    let ctDist = Infinity;
    for (const p of scale) {
      if (isChordTone(h, p)) {
        const d = Math.abs(p - midi);
        if (d < ctDist) {
          ctDist = d;
          ct = p;
        }
      }
    }
    midi = ct;
  }

  agent.lastMidi = midi;
  return midi;
}

/** Advance the world by one tick. Mutates `world` and fills `world.events`. */
export function step(world: World): NoteEvent[] {
  const { rng } = world;
  world.tick++;
  world.events = [];

  // ── harmony: advance chord, glide tonic toward climate key ──
  world.chordTimer++;
  if (world.chordTimer >= CONFIG.chordEvery) {
    world.chordTimer = 0;
    world.harmony.chordIndex =
      (world.harmony.chordIndex + 1) % PROGRESSION.length;
  }
  const targetTonic = CONFIG.baseTonic + world.climate.keyShift;
  world.harmony.tonic +=
    (targetTonic - world.harmony.tonic) * CONFIG.tonicGlide;
  // keep tonic an integer-ish for clean diatonic math when near target
  if (Math.abs(world.harmony.tonic - targetTonic) < 0.01) {
    world.harmony.tonic = targetTonic;
  }
  const tonicInt = Math.round(world.harmony.tonic);
  const harmonyForPitch: HarmonyState = {
    tonic: tonicInt,
    chordIndex: world.harmony.chordIndex,
  };

  // ── per-agent: adapt toward climate, age, maybe emit ──
  const survivors: Agent[] = [];
  for (const agent of world.agents) {
    agent.age++;

    // adapt genome slowly toward climate (the perturbation felt over time)
    const c = world.climate;
    agent.genome.register +=
      (c.register - agent.genome.register) * CONFIG.adaptRate * 8;
    agent.genome.bright += (c.bright - agent.genome.bright) * CONFIG.adaptRate;
    agent.genome.density +=
      (c.density - agent.genome.density) * CONFIG.adaptRate;

    // death by old age
    if (agent.age >= agent.genome.lifespan) {
      // force a minimum population: only die if we have spares
      if (world.agents.length - (world.agents.length - survivors.length) > 0) {
        // (placeholder; actual min enforced after loop)
      }
      continue; // drop it; min-pop enforcement happens below
    }

    // emit a note when cooldown elapses
    agent.cooldown--;
    if (agent.cooldown <= 0) {
      const tmpWorld: World = { ...world, harmony: harmonyForPitch };
      const midi = pickPitch(tmpWorld, agent);
      const dur = 0.25 + (1 - agent.genome.density) * 1.2;
      world.events.push({
        agentId: agent.id,
        midi,
        duration: dur,
        bright: clamp(agent.genome.bright, 0, 1),
        hue: agent.hue,
        generation: agent.generation,
      });
      // next emission interval from density (dense → shorter gaps)
      const gap =
        Math.floor((1 - agent.genome.density) * 46) + 6 + Math.floor(rng() * 8);
      agent.cooldown = gap;
    }

    survivors.push(agent);
  }

  // ── enforce minimum population: if too many died, resurrect youngest-genome
  //    via fresh founders so the piece never goes silent ──
  world.agents = survivors;
  while (world.agents.length < CONFIG.minPop) {
    world.agents.push(makeAgent(world, randomGenome(rng), [], 0, rng()));
  }

  // ── reproduction: pairs of living agents occasionally breed ──
  if (world.agents.length >= 2 && world.agents.length < CONFIG.maxPop) {
    // reproduction pressure eases off above softCap to keep population bounded
    const crowd =
      world.agents.length >= CONFIG.softCap
        ? 0.25
        : 1 - world.agents.length / CONFIG.softCap;
    const pRepro = CONFIG.reproChanceBase * (0.4 + crowd);
    if (rng() < pRepro) {
      const i = Math.floor(rng() * world.agents.length);
      let j = Math.floor(rng() * world.agents.length);
      if (j === i) j = (j + 1) % world.agents.length;
      const pa = world.agents[i];
      const pb = world.agents[j];
      const childGenome = crossover(pa.genome, pb.genome, rng);
      const childHue = clamp(
        (pa.hue + pb.hue) / 2 + between(rng, -MUTATION.hue, MUTATION.hue),
        0,
        1,
      );
      const child = makeAgent(
        world,
        childGenome,
        [pa.id, pb.id],
        Math.max(pa.generation, pb.generation) + 1,
        childHue,
      );
      world.agents.push(child);
    }
  }

  // hard cap safety (should not trigger given logic above)
  if (world.agents.length > CONFIG.maxPop) {
    world.agents.sort((a, b) => b.age - a.age);
    world.agents.length = CONFIG.maxPop;
  }

  return world.events;
}

/** Convenience: run N ticks (for tests / fast-forward). */
export function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(world);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
