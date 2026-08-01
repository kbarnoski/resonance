// ════════════════════════════════════════════════════════════════════════════
// 4728 — rubato · seeded "scripted human" auto-demo
//
// The review may happen on a SILENT phone with zero interaction, so on mount a
// deterministic scripted player feeds the attending oscillator a phrase WITH
// deliberate rubato — a few steady beats, a rush, a held/dragged note, then a
// settle — starting within ~1s. A cold viewer sees the ensemble visibly speed
// up and stretch to follow, hands-free. All timing is fixed; the only use of
// the PRNG is to keep everything reproducible per seed (no Math.random).
// ════════════════════════════════════════════════════════════════════════════

/** Deterministic PRNG — seeded so the demo is identical on every load. */
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

export interface DemoOnset {
  /** Seconds after the phrase start. */
  t: number;
  /** Index into the melody scale (degree). */
  degree: number;
}

// Inter-onset intervals telling the story: steady ≈120bpm → rush (compress) →
// a stretched drag → settle back. Deliberate expressive timing, not a click.
const IOIS = [
  0.52, 0.5, 0.5, 0.42, 0.34, 0.3, 0.3, 0.34, 0.6, 0.64, 0.5, 0.48, 0.5, 0.5,
];
// A singable contour over the C-major row (0..7) — hand-picked, deterministic.
const CONTOUR = [4, 2, 0, 4, 5, 4, 2, 1, 0, 2, 4, 3, 2, 4];

const LEAD_IN = 0.6; // first onset ~0.6s after mount
const GAP = 0.9; // rest before the phrase loops again

export interface Demo {
  onsets: DemoOnset[];
  phraseDur: number;
  index: number;
  /** performance.now() seconds at which the current phrase pass started. */
  startPerf: number;
}

export function makeDemo(seed: number): Demo {
  const rng = mulberry32(seed);
  const onsets: DemoOnset[] = [];
  let t = LEAD_IN;
  for (let i = 0; i < IOIS.length; i++) {
    // Micro-humanize each onset by ≤8ms (seeded) so it isn't machine-perfect.
    const jitter = (rng() - 0.5) * 0.016;
    onsets.push({ t: t + jitter, degree: CONTOUR[i % CONTOUR.length] });
    t += IOIS[i];
  }
  return { onsets, phraseDur: t + GAP, index: 0, startPerf: 0 };
}

/**
 * Advance the demo. Returns the onset that fired this step (with its absolute
 * scheduled perf-time), or null. Loops the phrase forever until the user takes
 * over. `nowPerf` is performance.now()/1000.
 */
export function stepDemo(
  demo: Demo,
  nowPerf: number
): { onset: DemoOnset; at: number } | null {
  if (demo.startPerf === 0) demo.startPerf = nowPerf;
  const rel = nowPerf - demo.startPerf;
  if (demo.index >= demo.onsets.length) {
    if (rel >= demo.phraseDur) {
      demo.index = 0;
      demo.startPerf = nowPerf;
    }
    return null;
  }
  const next = demo.onsets[demo.index];
  if (rel >= next.t) {
    demo.index += 1;
    return { onset: next, at: demo.startPerf + next.t };
  }
  return null;
}
