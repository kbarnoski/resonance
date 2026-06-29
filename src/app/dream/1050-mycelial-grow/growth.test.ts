/**
 * Plain-assert sanity checks for the space colonization core.
 * NOT auto-run at import. Run manually with:  npx tsx growth.test.ts
 * (or reason through it — no test framework is available in this lab).
 */
import { Mycelium, makeRng, DEFAULT_PARAMS } from "./growth";

function runTests(): void {
  // makeRng is deterministic and bounded in [0,1).
  const r = makeRng(42);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    console.assert(v >= 0 && v < 1, "rng out of [0,1)");
  }
  const a = makeRng(7);
  const b = makeRng(7);
  console.assert(a() === b(), "same seed → same first value");

  // A network with roots + attractors must grow (gain nodes) and emit events.
  const m = new Mycelium({ width: 400, height: 400 }, 123);
  m.seedRoots(3);
  const startCount = m.nodes.length;
  console.assert(startCount === 3, "3 roots seeded");
  m.seedAttractors(300);

  let totalEvents = 0;
  let maxDepth = 0;
  for (let step = 0; step < 200; step++) {
    const ev = m.grow(1);
    totalEvents += ev.length;
    for (const e of ev) maxDepth = Math.max(maxDepth, e.depth);
  }
  console.assert(m.nodes.length > startCount, "network grew past its roots");
  console.assert(totalEvents > 0, "branch events were emitted");
  console.assert(maxDepth >= 2, "growth reached depth >= 2 (real branching)");

  // Attractors get consumed (kill radius) — live count should drop.
  console.assert(
    m.liveAttractorCount() < 300,
    "attractors were consumed by the kill radius"
  );

  // Node cap is respected under heavy reseeding.
  const capped = new Mycelium({ width: 600, height: 600, maxNodes: 500 }, 9);
  capped.seedRoots(4);
  for (let wave = 0; wave < 40; wave++) {
    capped.seedAttractors(120);
    for (let s = 0; s < 20; s++) capped.grow(1);
  }
  console.assert(
    capped.nodes.length <= 500,
    "node count never exceeds maxNodes"
  );

  // growthScale = 0-ish should grow far slower than full speed.
  const slow = new Mycelium({ width: 400, height: 400 }, 5);
  slow.seedRoots(2);
  slow.seedAttractors(400);
  let slowEvents = 0;
  for (let s = 0; s < 60; s++) slowEvents += slow.grow(0.05).length;

  const fast = new Mycelium({ width: 400, height: 400 }, 5);
  fast.seedRoots(2);
  fast.seedAttractors(400);
  let fastEvents = 0;
  for (let s = 0; s < 60; s++) fastEvents += fast.grow(1).length;

  console.assert(
    slowEvents < fastEvents,
    "low growthScale produces fewer branch events than full speed"
  );

  console.assert(DEFAULT_PARAMS.killRadius < DEFAULT_PARAMS.attractionRadius,
    "kill radius must be smaller than attraction radius");

  console.log("growth.test.ts: all assertions evaluated.");
}

// Only run when invoked directly (e.g. `npx tsx growth.test.ts`), never at
// import time — keeps it out of the build and any test-runner globbing.
if (typeof require !== "undefined" && typeof module !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (require.main === (module as any)) runTests();
} else {
  // Reference so bundlers/linters don't flag it as unused in ESM contexts.
  void runTests;
}
