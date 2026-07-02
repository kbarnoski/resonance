// ─────────────────────────────────────────────────────────────────────────────
// neural.ts — parameters + form-constant regime presets for the cortical field.
//
// The excitatory/inhibitory neural field is a Gray-Scott activator–inhibitor
// (an equivalent of the Wilson–Cowan / Amari lateral-inhibition system near its
// Turing instability). Its emergent pattern is set by the feed/kill balance:
//   - low feed  → sparse, well-separated spots  → HONEYCOMB lattice under warp
//   - mid band  → connected worms / labyrinth    → COBWEBS & SPIRALS under warp
//   - high feed → long stripes / broken cells    → TUNNELS & FUNNELS under warp
//
// A single scalar `balance` (0..1) walks a curated diagonal through (feed,kill)
// space between these Klüver form-constant regimes. A slow autonomous drift
// oscillates it so the piece evolves on its own; the slider / arrow keys nudge it.
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed diffusion rates (classic Gray-Scott values that give stable patterns). */
export const DU = 0.16;
export const DV = 0.08;
/** Reaction time-step per sub-iteration. */
export const DT = 1.0;

/** Cortical simulation grid (square, toroidal). Kept modest so the emergent
 *  pattern shows a bold, readable number of arms/rings under the log-polar warp. */
export const GRID = 160;

export interface Regime {
  feed: number;
  kill: number;
  /** 0..1 hue nudge handed to the render palette. */
  tint: number;
  /** Klüver form-constant label for the UI. */
  label: string;
}

/**
 * Map balance (0..1) → reaction parameters along the spots→worms→stripes path.
 * The band is chosen to stay inside the Turing-pattern region for all balances.
 */
export function regimeAt(balance: number): Regime {
  const b = Math.min(1, Math.max(0, balance));
  const feed = 0.03 + 0.014 * b; // 0.030 → 0.044
  const kill = 0.0575 + 0.006 * b; // 0.0575 → 0.0635
  let label: string;
  if (b < 0.25) label = "Honeycomb lattice";
  else if (b < 0.5) label = "Cobweb mesh";
  else if (b < 0.75) label = "Spirals & labyrinth";
  else label = "Tunnels & funnels";
  return { feed, kill, tint: b, label };
}

/**
 * Autonomous balance drift: a slow triangle-ish oscillation over ~PERIOD seconds
 * so the field morphs through the form constants without input. reduced-motion
 * lengthens the period (slower luminance change — a safety requirement).
 */
export function autonomousBalance(tSeconds: number, reducedMotion: boolean): number {
  const period = reducedMotion ? 64 : 34;
  const phase = (tSeconds / period) % 1;
  // smooth 0→1→0 triangle
  const tri = 1 - Math.abs(2 * phase - 1);
  return tri;
}

/** Seed the field: activator U=1 everywhere, a scatter of inhibitor V nuclei. */
export function makeSeed(grid: number): Float32Array<ArrayBuffer> {
  const cells = grid * grid;
  const data = new Float32Array(cells * 2);
  for (let i = 0; i < cells; i++) {
    data[i * 2] = 1.0; // U
    data[i * 2 + 1] = 0.0; // V
  }
  // a handful of gaussian V blobs to nucleate the reaction
  const blobs = 26;
  for (let k = 0; k < blobs; k++) {
    const cx = Math.random() * grid;
    const cy = Math.random() * grid;
    const rad = 3 + Math.random() * 5;
    const x0 = Math.max(0, Math.floor(cx - rad * 2));
    const x1 = Math.min(grid - 1, Math.ceil(cx + rad * 2));
    const y0 = Math.max(0, Math.floor(cy - rad * 2));
    const y1 = Math.min(grid - 1, Math.ceil(cy + rad * 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const g = Math.exp(-(dx * dx + dy * dy) / (rad * rad));
        const idx = (y * grid + x) * 2;
        data[idx + 1] = Math.min(1, data[idx + 1] + g);
        data[idx] = Math.max(0, data[idx] - g * 0.5);
      }
    }
  }
  // faint noise to break symmetry
  for (let i = 0; i < cells; i++) {
    data[i * 2 + 1] = Math.min(1, data[i * 2 + 1] + Math.random() * 0.02);
  }
  return data;
}
