// Abelian sandpile (Bak–Tang–Wiesenfeld) cellular automaton.
//
// Each cell holds 0..3 light grains. When any cell reaches ≥4 it TOPPLES:
// loses 4 grains and distributes 1 to each orthogonal neighbour (grains
// falling off the edge are simply lost). Toppling can push neighbours to 4,
// creating cascades. That's self-organized criticality: most taps cause tiny
// ripples; occasionally one pushes the grid past a critical threshold and
// triggers a screen-spanning bloom avalanche.
//
// Reference: Bak, Tang & Wiesenfeld, "Self-organized criticality"
//            Phys. Rev. Lett. 59, 381 (1987).
//
// Related sonification work: "Echoes of the Land" (arXiv:2507.14947, 2025) —
// audiovisual cascades from a spring-block SOC earthquake model.

export const GRID_W = 24;
export const GRID_H = 16;
const TOPPLE_THRESHOLD = 4;

// A topple event — position + grain count BEFORE topple (1..3) for brightness
export type ToppleEvent = {
  x: number;
  y: number;
  grainsBefore: number; // always 4 right when we fire the event
};

export type SandpileSim = {
  cells: Int32Array;           // GRID_W * GRID_H, grain counts 0..∞ transiently
  pendingTopples: Set<number>; // flat indices that need resolving
  // Texture data: one byte per cell, value 0..3 (clamped for render palette)
  tex: Uint8Array;
  // Add a grain to (x, y); returns the flat index.
  addGrain: (x: number, y: number) => number;
  // Step up to maxTopples topples; returns array of events fired this step.
  stepTopples: (maxTopples: number) => ToppleEvent[];
  hasWork: () => boolean;
  rebuildTex: () => void;
};

export function makeSandpileSim(): SandpileSim {
  const W = GRID_W;
  const H = GRID_H;
  const cells = new Int32Array(W * H);
  const pendingTopples = new Set<number>();
  const tex = new Uint8Array(W * H);

  const flat = (x: number, y: number) => y * W + x;

  function addGrain(x: number, y: number): number {
    const xi = Math.max(0, Math.min(W - 1, x));
    const yi = Math.max(0, Math.min(H - 1, y));
    const i = flat(xi, yi);
    cells[i]++;
    if (cells[i] >= TOPPLE_THRESHOLD) pendingTopples.add(i);
    tex[i] = Math.min(3, cells[i]);
    return i;
  }

  function stepTopples(maxTopples: number): ToppleEvent[] {
    const events: ToppleEvent[] = [];
    let count = 0;

    // Drain up to maxTopples cells from the pending set
    const toProcess: number[] = [];
    for (const i of pendingTopples) {
      if (count >= maxTopples) break;
      toProcess.push(i);
      count++;
    }

    for (const i of toProcess) {
      pendingTopples.delete(i);
      if (cells[i] < TOPPLE_THRESHOLD) continue; // may have changed

      const x = i % W;
      const y = (i / W) | 0;

      events.push({ x, y, grainsBefore: cells[i] });

      cells[i] -= 4;

      const neighbours: [number, number][] = [
        [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y],
      ];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue; // edge loss
        const ni = flat(nx, ny);
        cells[ni]++;
        if (cells[ni] >= TOPPLE_THRESHOLD) pendingTopples.add(ni);
      }

      // If this cell is still critical after toppling, re-queue it
      if (cells[i] >= TOPPLE_THRESHOLD) pendingTopples.add(i);
    }

    // Rebuild texture for all touched cells (fast: just all cells in the set
    // plus the ones we just processed)
    rebuildTex();
    return events;
  }

  function hasWork(): boolean {
    return pendingTopples.size > 0;
  }

  function rebuildTex(): void {
    for (let i = 0; i < cells.length; i++) {
      tex[i] = Math.min(3, Math.max(0, cells[i]));
    }
  }

  rebuildTex();
  return { cells, pendingTopples, tex, addGrain, stepTopples, hasWork, rebuildTex };
}
