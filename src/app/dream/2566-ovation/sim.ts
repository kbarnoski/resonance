// sim.ts — a conductible Kuramoto crowd.
//
// N phase oscillators, each a clapper with its own natural clapping rate.
// Mean-field coupling nudges every phase toward the crowd's average phase
// (Kuramoto). When the "conduct level" L rises to a standing ovation the
// natural-rate spread narrows and the coupling K climbs, so the crowd tips
// from an incoherent hiss of claps into periodic UNISON — the effect Néda et
// al. measured in real applause (Nature 403, 2000). An agent "claps" when its
// phase wraps past 2π; a small position-based phase lead paints the unison
// clap as a wavefront sweeping the arena.
//
// Deterministic: seeded mulberry32 only, no Math.random / Date.

export const SEED = 0x2566;
export const MAX_AGENTS = 4000;
export const CROWD_SIZES = [1, 8, 60, 400, 1400, 4000] as const;
const TWO_PI = Math.PI * 2;

/** Seeded PRNG — mulberry32. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Frame {
  r: number; // Kuramoto order parameter, 0 (chaos) → 1 (unison)
  activeN: number; // how many are currently clapping
  crowd: number; // total seats filled
  baseHz: number; // current mean clapping rate
  pulse: number; // fraction of the crowd that clapped THIS frame (0..1)
  level: number; // overall loudness proxy (0..1)
  psi: number; // mean phase
}

export interface Crowd {
  posX: Float32Array; // arena position, clip-ish space [-1,1]
  posY: Float32Array;
  flash: Float32Array; // 0..1 brightness, spikes to 1 on a clap
  n: number; // active crowd size (seats filled)
  step(dtSec: number, level01: number): Frame;
  setCrowd(n: number): void;
}

// Conduct-level → physics mappings. Tuned so the arc reads in ~5 seconds:
// lone awkward clapper → enthusiastic roar → rhythmic locked ovation.
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How many of the seated crowd are actually clapping at level L. */
function activeFraction(L: number, crowd: number): number {
  // At L≈0 a single lone clapper; fills in as enthusiasm rises.
  const frac = smoothstep(0.02, 0.55, L);
  const floorOne = 1 / Math.max(1, crowd);
  return Math.max(floorOne, frac);
}

/** Mean clapping rate (Hz): fast & giddy in the middle, SLOWING as the
 *  ovation locks into a rhythmic stadium clap — the real synchronizing move. */
function baseHzAt(L: number): number {
  return 4.9 - 2.7 * smoothstep(0.45, 1.0, L);
}

/** Natural-rate spread: wide (everyone off-tempo) → narrow (converged). */
function spreadAt(L: number): number {
  return 0.42 - 0.32 * smoothstep(0.4, 1.0, L);
}

/** Coupling strength K: near zero until the crowd commits, then strong. */
function couplingAt(L: number): number {
  return 15.5 * smoothstep(0.5, 1.0, L);
}

export function createCrowd(seed = SEED): Crowd {
  const rng = makeRng(seed);
  const posX = new Float32Array(MAX_AGENTS);
  const posY = new Float32Array(MAX_AGENTS);
  const flash = new Float32Array(MAX_AGENTS);
  const acc = new Float32Array(MAX_AGENTS); // monotonic phase accumulator
  const gauss = new Float32Array(MAX_AGENTS); // per-agent unit rate offset
  const phi = new Float32Array(MAX_AGENTS); // position-based phase lead (wavefront)
  const wrapCount = new Int32Array(MAX_AGENTS); // last integer clap index seen

  // Wavefront direction for the traveling-wave look.
  const wdx = 3.1;
  const wdy = 1.4;

  for (let i = 0; i < MAX_AGENTS; i++) {
    // Elliptical stadium bowl — uniform-ish disc with gentle perspective.
    const ang = rng() * TWO_PI;
    const rad = Math.sqrt(rng());
    const x = Math.cos(ang) * rad * 0.94;
    const y = Math.sin(ang) * rad * 0.6 - 0.04;
    posX[i] = x + (rng() - 0.5) * 0.02;
    posY[i] = y + (rng() - 0.5) * 0.02;
    // Approx-gaussian rate offset (sum of uniforms).
    gauss[i] = rng() + rng() + rng() - 1.5;
    phi[i] = (posX[i] * wdx + posY[i] * wdy) * 0.11;
    acc[i] = rng() * TWO_PI;
    wrapCount[i] = Math.floor((acc[i] + phi[i]) / TWO_PI);
  }

  let n = 400;

  function step(dtSec: number, L: number): Frame {
    const dt = Math.min(dtSec, 0.05); // clamp long stalls
    const baseHz = baseHzAt(L);
    const spread = spreadAt(L);
    const K = couplingAt(L);
    const activeN = Math.max(
      1,
      Math.min(n, Math.round(n * activeFraction(L, n))),
    );

    // Order parameter over the active clappers.
    let sumC = 0;
    let sumS = 0;
    for (let i = 0; i < activeN; i++) {
      const th = acc[i] % TWO_PI;
      sumC += Math.cos(th);
      sumS += Math.sin(th);
    }
    const psi = Math.atan2(sumS, sumC);
    const r = Math.hypot(sumC, sumS) / activeN;

    let claps = 0;
    const decay = 0.86;
    for (let i = 0; i < n; i++) {
      flash[i] *= decay;
      if (i < activeN) {
        const hz = baseHz * (1 + spread * gauss[i]);
        const omega = TWO_PI * hz;
        const th = acc[i] % TWO_PI;
        acc[i] += (omega + K * r * Math.sin(psi - th)) * dt;
        const w = Math.floor((acc[i] + phi[i]) / TWO_PI);
        if (w > wrapCount[i]) {
          wrapCount[i] = w;
          claps++;
          flash[i] = 1;
        }
      }
    }

    const pulse = claps / activeN;
    // Loudness proxy: crowd size presence + this-frame clap energy.
    const presence = smoothstep(0, 0.9, L) * Math.min(1, activeN / 300 + 0.15);
    const level = Math.min(1, presence * 0.55 + Math.min(1, pulse * 3) * 0.7);

    return { r, activeN, crowd: n, baseHz, pulse, level, psi };
  }

  function setCrowd(next: number) {
    n = Math.max(1, Math.min(MAX_AGENTS, Math.floor(next)));
  }

  return { posX, posY, flash, get n() { return n; }, step, setCrowd } as Crowd;
}
