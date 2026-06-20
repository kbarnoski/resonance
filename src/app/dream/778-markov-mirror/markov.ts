// markov.ts — variable-order Markov chain for note transitions

export interface MarkovChain {
  // order-1: counts[from][to]
  order1: Record<string, Record<string, number>>;
  // order-2: counts[from1|from2][to]
  order2: Record<string, Record<string, number>>;
  totalTransitions: number;
}

export function createChain(): MarkovChain {
  return { order1: {}, order2: {}, totalTransitions: 0 };
}

export function recordTransition(
  chain: MarkovChain,
  prev2: string | null,
  prev1: string | null,
  current: string
): void {
  if (prev1 !== null) {
    if (!chain.order1[prev1]) chain.order1[prev1] = {};
    chain.order1[prev1][current] = (chain.order1[prev1][current] ?? 0) + 1;
    chain.totalTransitions++;
  }
  if (prev2 !== null && prev1 !== null) {
    const key = `${prev2}|${prev1}`;
    if (!chain.order2[key]) chain.order2[key] = {};
    chain.order2[key][current] = (chain.order2[key][current] ?? 0) + 1;
  }
}

export function sampleNext(
  chain: MarkovChain,
  prev2: string | null,
  prev1: string | null,
  fallbackNotes: string[]
): string {
  // Try order-2 first
  if (prev2 !== null && prev1 !== null) {
    const key = `${prev2}|${prev1}`;
    const o2 = chain.order2[key];
    if (o2) {
      const pick = weightedSample(o2);
      if (pick !== null) return pick;
    }
  }
  // Fall back to order-1
  if (prev1 !== null) {
    const o1 = chain.order1[prev1];
    if (o1) {
      const pick = weightedSample(o1);
      if (pick !== null) return pick;
    }
  }
  // No data at all — pick a random note from the known set or fallback
  const knownNotes = Object.keys(chain.order1);
  const pool = knownNotes.length > 0 ? knownNotes : fallbackNotes;
  return pool[Math.floor(Math.random() * pool.length)];
}

function weightedSample(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = Math.random() * total;
  for (const [key, v] of entries) {
    r -= v;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

export function cloneChain(chain: MarkovChain): MarkovChain {
  return {
    order1: JSON.parse(JSON.stringify(chain.order1)),
    order2: JSON.parse(JSON.stringify(chain.order2)),
    totalTransitions: chain.totalTransitions,
  };
}
