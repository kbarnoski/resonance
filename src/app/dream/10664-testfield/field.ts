// ─────────────────────────────────────────────────────────────────────────────
// 10664 · test•field — the generative 1-bit data source.
//
// A seeded grayscale field (barcode column-bands + data row-lines + a
// deterministic block-noise) is Floyd–Steinberg dithered down to a pure 1-bit
// matrix of 0s and 1s — the "datamatics" wall the scan-head reads. Bit-depth
// coarsens the source into square blocks (Ikeda's variable bit-depth) before the
// dither runs, so 1-bit reads chunky/barcode and 4-bit reads as fine grain.
//
// Everything here is deterministic: same (counter, depth) ⇒ same field. No
// Math.random, no Date. Base seed 0x10664.
// ─────────────────────────────────────────────────────────────────────────────

export interface BitField {
  cols: number;
  rows: number;
  /** length cols*rows, row-major, values 0 | 1 */
  bits: Uint8Array;
}

/** Deterministic PRNG — mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Small integer hash → 0..1, deterministic in (x, y, seed). */
function hashNoise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Generate the 1-bit field.
 * @param counter reseed counter (Regenerate); seed = 0x10664 XOR counter·golden.
 * @param depth   bit-depth 1 | 2 | 4 — larger = finer grain.
 */
export function generateField(
  counter: number,
  depth: number,
  cols: number,
  rows: number,
): BitField {
  const seed = (0x10664 ^ Math.imul(counter, 0x9e3779b1)) >>> 0;
  const rng = mulberry32(seed);
  const block = depth <= 1 ? 4 : depth === 2 ? 2 : 1;

  // Vertical barcode bands — variable-run stripes, the datamatics signature.
  const colBand = new Float32Array(cols);
  let x = 0;
  while (x < cols) {
    const run = 1 + Math.floor(rng() * 6);
    const lit = rng() < 0.5;
    const v = lit ? 0.62 + rng() * 0.38 : rng() * 0.34;
    for (let i = 0; i < run && x < cols; i++, x++) colBand[x] = v;
  }

  // Horizontal data lines — a few "hot" rows read as address/data bands.
  const rowW = new Float32Array(rows);
  for (let y = 0; y < rows; y++) {
    rowW[y] = rng() < 0.16 ? 0.78 + rng() * 0.2 : 0.18 + rng() * 0.26;
  }

  // Compose grayscale source at block resolution.
  const g = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const by = Math.floor(y / block) * block;
    for (let cx = 0; cx < cols; cx++) {
      const bx = Math.floor(cx / block) * block;
      const n = hashNoise(bx, by, seed);
      let val = colBand[bx] * 0.5 + rowW[by] * 0.24 + n * 0.4;
      val += 0.07 * Math.sin(bx * 0.5); // faint structural ripple
      g[y * cols + cx] = clamp01(val);
    }
  }

  // Floyd–Steinberg error diffusion → 1-bit.
  const buf = Float32Array.from(g);
  const bits = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = y * cols + cx;
      const old = buf[i];
      const nw = old < 0.5 ? 0 : 1;
      bits[i] = nw;
      const err = old - nw;
      if (cx + 1 < cols) buf[i + 1] += err * (7 / 16);
      if (y + 1 < rows) {
        if (cx > 0) buf[i + cols - 1] += err * (3 / 16);
        buf[i + cols] += err * (5 / 16);
        if (cx + 1 < cols) buf[i + cols + 1] += err * (1 / 16);
      }
    }
  }

  return { cols, rows, bits };
}
