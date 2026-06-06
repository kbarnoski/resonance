// Falling-sand granular cellular automaton.
//
// In the lineage of the classic "powder game", Noita, and Max Bittker's
// Sandspiel: a grid of cells where each grain tries to fall under gravity and
// slides off piles via diagonal moves, producing natural dunes.
//
// Gravity is a 2D vector (from device tilt) quantized to a dominant axis +
// diagonal bias, so tipping the tablet makes the dunes flow and reshape.

export const GRID_W = 180;
export const GRID_H = 120;

// Warm grain palette (RGB 0..255): amber / ochre / rose / coral / gold.
export const PALETTE: [number, number, number][] = [
  [245, 188, 90], // amber
  [214, 148, 64], // ochre
  [232, 122, 110], // coral
  [226, 102, 138], // rose
  [240, 210, 120], // pale gold
];
export const EMPTY = 0;
// Cell value: 0 = empty, otherwise (paletteIndex + 1).

export type SandSim = {
  w: number;
  h: number;
  cells: Uint8Array; // length w*h, color index+1 or EMPTY
  // RGBA texture data for upload (w*h*4)
  tex: Uint8Array;
  step: (gx: number, gy: number) => SettleEvent[];
  pour: (col: number, colorIdx: number, amount: number) => void;
};

// Emitted when a grain comes to rest crossing a string row.
export type SettleEvent = {
  x: number; // grid col where it settled
  row: number; // string row index in grid space
};

export function makeSim(stringRows: number[]): SandSim {
  const w = GRID_W;
  const h = GRID_H;
  const cells = new Uint8Array(w * h);
  const tex = new Uint8Array(w * h * 4);

  // quick lookup: is this grid-y a string row, and which string index.
  const rowToString = new Int16Array(h).fill(-1);
  stringRows.forEach((gy, idx) => {
    if (gy >= 0 && gy < h) rowToString[gy] = idx;
  });

  const idx = (x: number, y: number) => y * w + x;

  function inBounds(x: number, y: number): boolean {
    return x >= 0 && x < w && y >= 0 && y < h;
  }

  // Try to move grain at (x,y) by (dx,dy). Returns destination index or -1.
  function tryMove(x: number, y: number, dx: number, dy: number): number {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) return -1;
    if (cells[idx(nx, ny)] !== EMPTY) return -1;
    return idx(nx, ny);
  }

  // moved[] marks cells already moved this frame so a grain only moves once.
  const moved = new Uint8Array(w * h);

  function step(gx: number, gy: number): SettleEvent[] {
    moved.fill(0);
    const events: SettleEvent[] = [];

    // Quantize gravity to a dominant fall direction (down/up/left/right) and a
    // diagonal bias. We scan in the order opposite the fall direction so grains
    // don't teleport multiple cells per frame.
    const ax = Math.abs(gx);
    const ay = Math.abs(gy);
    // primary fall step
    let fdx = 0;
    let fdy = 0;
    if (ay >= ax) {
      fdy = gy >= 0 ? 1 : -1; // down (positive y = down in grid)
    } else {
      fdx = gx >= 0 ? 1 : -1;
    }

    // diagonal "slip" components — perpendicular spread so piles slope.
    // For vertical gravity the slips are the two horizontal diagonals; for
    // horizontal gravity, the two vertical diagonals.
    let s1dx: number, s1dy: number, s2dx: number, s2dy: number;
    if (fdy !== 0) {
      // bias diagonal toward sideways tilt
      const bias = gx >= 0 ? 1 : -1;
      s1dx = bias;
      s1dy = fdy;
      s2dx = -bias;
      s2dy = fdy;
    } else {
      const bias = gy >= 0 ? 1 : -1;
      s1dx = fdx;
      s1dy = bias;
      s2dx = fdx;
      s2dy = -bias;
    }

    // Scan order: iterate so that cells "downstream" in gravity are processed
    // first (we read them as empty before the upstream grain fills them).
    const yStart = fdy > 0 ? h - 1 : 0;
    const yEnd = fdy > 0 ? -1 : h;
    const yInc = fdy > 0 ? -1 : 1;
    const xStart = fdx > 0 ? w - 1 : 0;
    const xEnd = fdx > 0 ? -1 : w;
    const xInc = fdx > 0 ? -1 : 1;

    for (let y = yStart; y !== yEnd; y += yInc) {
      for (let x = xStart; x !== xEnd; x += xInc) {
        const i = idx(x, y);
        const c = cells[i];
        if (c === EMPTY || moved[i]) continue;

        // 1) straight fall
        let dest = tryMove(x, y, fdx, fdy);
        // 2) diagonal slips in randomized order
        if (dest < 0) {
          const flip = Math.random() < 0.5;
          const aDx = flip ? s1dx : s2dx;
          const aDy = flip ? s1dy : s2dy;
          const bDx = flip ? s2dx : s1dx;
          const bDy = flip ? s2dy : s1dy;
          dest = tryMove(x, y, aDx, aDy);
          if (dest < 0) dest = tryMove(x, y, bDx, bDy);
        }

        if (dest >= 0) {
          cells[dest] = c;
          cells[i] = EMPTY;
          moved[dest] = 1;
          const dCol = dest % w;
          const dRow = (dest / w) | 0;
          // A grain that moves INTO a string row plucks that string.
          if (rowToString[dRow] >= 0 && dRow !== y) {
            events.push({ x: dCol, row: rowToString[dRow] });
          } else {
            // It moved but did not enter a string row; if the cell directly
            // below its new home is a string row and is now blocked, it has
            // just come to REST on that string — pluck it once.
            const belowRow = dRow + 1;
            if (
              belowRow < h &&
              rowToString[belowRow] >= 0 &&
              cells[idx(dCol, belowRow)] !== EMPTY
            ) {
              events.push({ x: dCol, row: rowToString[belowRow] });
            }
          }
        }
        // Grains that did not move this frame are already at rest and were
        // already counted when they first landed — they do not re-pluck.
      }
    }

    rebuildTex();
    return events;
  }

  function rebuildTex(): void {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const o = i * 4;
      if (c === EMPTY) {
        tex[o] = 0;
        tex[o + 1] = 0;
        tex[o + 2] = 0;
        tex[o + 3] = 0;
      } else {
        const col = PALETTE[(c - 1) % PALETTE.length];
        tex[o] = col[0];
        tex[o + 1] = col[1];
        tex[o + 2] = col[2];
        tex[o + 3] = 255;
      }
    }
  }

  function pour(col: number, colorIdx: number, amount: number): void {
    // Drip grains in near the top-center spout, jittered.
    for (let k = 0; k < amount; k++) {
      const x = Math.max(0, Math.min(w - 1, col + ((Math.random() * 7) | 0) - 3));
      const y = 1 + ((Math.random() * 2) | 0);
      const i = idx(x, y);
      if (cells[i] === EMPTY) {
        cells[i] = (colorIdx % PALETTE.length) + 1;
      }
    }
  }

  rebuildTex();
  return { w, h, cells, tex, step, pour };
}
