// evolve.test.ts — headless assertions for the deterministic core.
// Run: npx tsx src/app/dream/1035-living-album/evolve.test.ts
// Exits 1 on any failure; prints PASS lines otherwise.

import {
  CONFIG,
  crossover,
  diatonicPitches,
  isChordTone,
  isDiatonic,
  GENOME_BOUNDS,
  makeRng,
  makeWorld,
  pickPitch,
  plantSeed,
  randomGenome,
  run,
  step,
  type Genome,
} from "./evolve";

let failures = 0;
let count = 0;

function ok(label: string, cond: boolean, detail = ""): void {
  count++;
  if (cond) {
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.error(`FAIL: ${label}${detail ? " — " + detail : ""}`);
  }
}

/* ── 1. Heredity: a child's scalar genes lie between (±mutation) parents ── */
{
  const rng = makeRng(12345);
  let inBoundsCount = 0;
  const trials = 400;
  // mutation slack allowed beyond the parent interval
  const slack = { register: 4, density: 0.14, bright: 0.14, lifespan: 400 };
  for (let i = 0; i < trials; i++) {
    const a = randomGenome(rng);
    const b = randomGenome(rng);
    const c = crossover(a, b, rng);
    const lo = (x: number, y: number) => Math.min(x, y);
    const hi = (x: number, y: number) => Math.max(x, y);
    const within =
      c.register >= lo(a.register, b.register) - slack.register &&
      c.register <= hi(a.register, b.register) + slack.register &&
      c.density >= lo(a.density, b.density) - slack.density &&
      c.density <= hi(a.density, b.density) + slack.density &&
      c.bright >= lo(a.bright, b.bright) - slack.bright &&
      c.bright <= hi(a.bright, b.bright) + slack.bright &&
      c.lifespan >= lo(a.lifespan, b.lifespan) - slack.lifespan &&
      c.lifespan <= hi(a.lifespan, b.lifespan) + slack.lifespan;
    if (within) inBoundsCount++;
  }
  ok(
    "heredity: children's genes are blends of parents (±mutation)",
    inBoundsCount === trials,
    `${inBoundsCount}/${trials} in bounds`,
  );
}

/* ── 2. Heredity: child motif steps all come from a parent or are ±1 of one ── */
{
  const rng = makeRng(999);
  let good = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    const a = randomGenome(rng);
    const b = randomGenome(rng);
    const c = crossover(a, b, rng);
    const parentSteps = new Set([...a.motif, ...b.motif]);
    const allInherited = c.motif.every((s) => {
      for (const p of parentSteps) if (Math.abs(s - p) <= 1) return true;
      return false;
    });
    if (allInherited) good++;
  }
  ok(
    "heredity: child motif steps derive from parent motifs (±1 mutation)",
    good === trials,
    `${good}/${trials}`,
  );
}

/* ── 3. Mutation is bounded: genes stay inside GENOME_BOUNDS forever ── */
{
  const rng = makeRng(7);
  let g: Genome = randomGenome(rng);
  let bounded = true;
  for (let i = 0; i < 5000; i++) {
    g = crossover(g, randomGenome(rng), rng);
    if (
      g.register < GENOME_BOUNDS.register[0] ||
      g.register > GENOME_BOUNDS.register[1] ||
      g.density < GENOME_BOUNDS.density[0] - 1e-9 ||
      g.density > GENOME_BOUNDS.density[1] + 1e-9 ||
      g.bright < -1e-9 ||
      g.bright > 1 + 1e-9 ||
      g.lifespan < GENOME_BOUNDS.lifespan[0] ||
      g.lifespan > GENOME_BOUNDS.lifespan[1] ||
      g.motif.length < GENOME_BOUNDS.motifLen[0] ||
      g.motif.length > GENOME_BOUNDS.motifLen[1] ||
      g.motif.some(
        (s) =>
          s < GENOME_BOUNDS.motifStep[0] || s > GENOME_BOUNDS.motifStep[1],
      )
    ) {
      bounded = false;
      break;
    }
  }
  ok("mutation: genome stays within bounds over 5000 generations", bounded);
}

/* ── 4. Population stays bounded over thousands of ticks (no explosion) ── */
{
  const world = makeWorld(42);
  let maxPop = 0;
  let minPop = Infinity;
  for (let i = 0; i < 8000; i++) {
    step(world);
    maxPop = Math.max(maxPop, world.agents.length);
    minPop = Math.min(minPop, world.agents.length);
  }
  ok(
    "population: never exceeds maxPop over 8000 ticks",
    maxPop <= CONFIG.maxPop,
    `max=${maxPop}`,
  );
  ok(
    "population: never goes extinct (>= minPop) over 8000 ticks",
    minPop >= CONFIG.minPop,
    `min=${minPop}`,
  );
}

/* ── 5. Every emitted note is diatonic to the active key ── */
{
  const world = makeWorld(2024);
  let total = 0;
  let nonDiatonic = 0;
  for (let i = 0; i < 6000; i++) {
    const events = step(world);
    const tonicInt = Math.round(world.harmony.tonic);
    for (const e of events) {
      total++;
      if (!isDiatonic({ tonic: tonicInt, chordIndex: 0 }, e.midi))
        nonDiatonic++;
    }
  }
  ok(
    "harmony: all emitted notes are diatonic to the current key",
    nonDiatonic === 0 && total > 100,
    `${nonDiatonic} non-diatonic of ${total}`,
  );
}

/* ── 6. pickPitch always returns a diatonic pitch directly ── */
{
  const world = makeWorld(5);
  let bad = 0;
  let n = 0;
  for (let t = 0; t < 50; t++) {
    step(world);
    const tonicInt = Math.round(world.harmony.tonic);
    const h = { tonic: tonicInt, chordIndex: world.harmony.chordIndex };
    for (const a of world.agents) {
      const m = pickPitch({ ...world, harmony: h }, a);
      n++;
      if (!isDiatonic(h, m)) bad++;
      if (m < CONFIG.minMidi || m > CONFIG.maxMidi) bad++;
    }
  }
  ok("pickPitch: returns in-range diatonic pitches", bad === 0, `${bad}/${n}`);
}

/* ── 7. Chord tones are a non-empty subset of diatonic pitches ── */
{
  const h = { tonic: 48, chordIndex: 0 };
  const scale = diatonicPitches(h, 40, 88);
  const cts = scale.filter((m) => isChordTone(h, m));
  ok(
    "harmony: chord tones exist and are diatonic",
    cts.length > 0 && cts.every((m) => isDiatonic(h, m)),
    `${cts.length} chord tones`,
  );
}

/* ── 8. Heredity over time (the "memory"): seed founders, fast-forward,
       and confirm the late population descends from early founders ── */
{
  const world = makeWorld(314);
  const founderIds = new Set(world.agents.map((a) => a.id));
  // run ~6 simulated minutes at ~30 ticks/sec ≈ 10800 ticks
  run(world, 10800);
  // every living agent is either a founder or has parents → lineage chain.
  // Confirm at least some living agents are descendants (gen > 0), proving the
  // genome material flows forward rather than being replaced wholesale.
  const descendants = world.agents.filter((a) => a.generation > 0).length;
  const everHadFounders = founderIds.size > 0;
  ok(
    "memory: late population contains inherited descendants (gen>0)",
    descendants > 0 && everHadFounders,
    `${descendants}/${world.agents.length} descendants`,
  );
}

/* ── 9. plantSeed biases register by x and brightness by (1-y), and the seed
       persists as a living agent (it will breed forward) ── */
{
  const world = makeWorld(77);
  const before = world.agents.length;
  const low = plantSeed(world, 0.05, 0.5); // far left → low register
  const high = plantSeed(world, 0.95, 0.5); // far right → high register
  ok(
    "seed: x maps to register (low < high)",
    low.genome.register < high.genome.register,
    `${low.genome.register} vs ${high.genome.register}`,
  );
  const dark = plantSeed(world, 0.5, 0.95); // bottom → dark
  const brightSeed = plantSeed(world, 0.5, 0.05); // top → bright
  ok(
    "seed: y maps to brightness (top brighter than bottom)",
    brightSeed.genome.bright > dark.genome.bright,
    `${brightSeed.genome.bright.toFixed(2)} vs ${dark.genome.bright.toFixed(2)}`,
  );
  ok("seed: seeds are added to the population", world.agents.length > before);
}

/* ── 10. Determinism: same seed → identical trajectory ── */
{
  const w1 = makeWorld(2025);
  const w2 = makeWorld(2025);
  run(w1, 2000);
  run(w2, 2000);
  const same =
    w1.agents.length === w2.agents.length &&
    w1.agents.every(
      (a, i) =>
        a.id === w2.agents[i].id &&
        a.genome.register === w2.agents[i].genome.register,
    );
  ok("determinism: identical seed yields identical world", same);
}

/* ── summary ── */
console.log(`\n${count - failures}/${count} checks passed.`);
if (failures > 0) {
  console.error(`${failures} FAILURE(S).`);
  process.exit(1);
} else {
  console.log("ALL PASS");
}
