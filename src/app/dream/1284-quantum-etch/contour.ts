// 1284-quantum-etch — contour.ts
//
// MARCHING SQUARES (hand-written, zero dependency). Given a scalar field on an
// N×N grid and an iso level, it walks every cell, classifies its four corners
// against the level, linearly interpolates the crossing points on the cell
// edges, and emits line SEGMENTS. Stroking those segments turns the probability
// landscape into a topographic / bathymetric etching — nested iso-contour rings
// that ripple and split as the packet moves and interferes.
//
// Running the same routine at level 0 on Re(ψ) extracts the NODAL SET: the
// moving zero-crossing curves that ARE the interference pattern made legible.
//
// Segments are written into a caller-owned Float32Array as [x0,y0,x1,y1,…] in
// grid coordinates; the function returns the segment count so no per-frame
// allocation happens.

/**
 * March one iso `level` over `field` (row-major N·N). Writes segment endpoints
 * into `seg` (grid units). Returns the number of segments written (capped by
 * seg.length / 4).
 */
export function marchSquares(
  field: Float32Array,
  N: number,
  level: number,
  seg: Float32Array,
): number {
  let s = 0;
  const maxSeg = seg.length >> 2;

  for (let j = 0; j < N - 1; j++) {
    const row0 = j * N;
    const row1 = row0 + N;
    for (let i = 0; i < N - 1; i++) {
      const tl = field[row0 + i];
      const tr = field[row0 + i + 1];
      const br = field[row1 + i + 1];
      const bl = field[row1 + i];

      let c = 0;
      if (tl > level) c |= 1;
      if (tr > level) c |= 2;
      if (br > level) c |= 4;
      if (bl > level) c |= 8;
      if (c === 0 || c === 15) continue;

      // Edge crossing points (interpolated). T=top, R=right, B=bottom, L=left.
      // Computed lazily only for the edges a case needs.
      let ax = 0, ay = 0, bx = 0, by = 0;
      let ok = false;

      switch (c) {
        case 1:
        case 14: {
          // top ↔ left
          ax = i + (level - tl) / (tr - tl);
          ay = j;
          bx = i;
          by = j + (level - tl) / (bl - tl);
          ok = true;
          break;
        }
        case 2:
        case 13: {
          // top ↔ right
          ax = i + (level - tl) / (tr - tl);
          ay = j;
          bx = i + 1;
          by = j + (level - tr) / (br - tr);
          ok = true;
          break;
        }
        case 3:
        case 12: {
          // left ↔ right
          ax = i;
          ay = j + (level - tl) / (bl - tl);
          bx = i + 1;
          by = j + (level - tr) / (br - tr);
          ok = true;
          break;
        }
        case 4:
        case 11: {
          // right ↔ bottom
          ax = i + 1;
          ay = j + (level - tr) / (br - tr);
          bx = i + (level - bl) / (br - bl);
          by = j + 1;
          ok = true;
          break;
        }
        case 6:
        case 9: {
          // top ↔ bottom
          ax = i + (level - tl) / (tr - tl);
          ay = j;
          bx = i + (level - bl) / (br - bl);
          by = j + 1;
          ok = true;
          break;
        }
        case 7:
        case 8: {
          // left ↔ bottom
          ax = i;
          ay = j + (level - tl) / (bl - tl);
          bx = i + (level - bl) / (br - bl);
          by = j + 1;
          ok = true;
          break;
        }
        case 5: {
          // saddle (tl & br above): top↔left and right↔bottom
          if (s < maxSeg) {
            const o = s << 2;
            seg[o] = i + (level - tl) / (tr - tl);
            seg[o + 1] = j;
            seg[o + 2] = i;
            seg[o + 3] = j + (level - tl) / (bl - tl);
            s++;
          }
          if (s < maxSeg) {
            const o = s << 2;
            seg[o] = i + 1;
            seg[o + 1] = j + (level - tr) / (br - tr);
            seg[o + 2] = i + (level - bl) / (br - bl);
            seg[o + 3] = j + 1;
            s++;
          }
          break;
        }
        case 10: {
          // saddle (tr & bl above): top↔right and left↔bottom
          if (s < maxSeg) {
            const o = s << 2;
            seg[o] = i + (level - tl) / (tr - tl);
            seg[o + 1] = j;
            seg[o + 2] = i + 1;
            seg[o + 3] = j + (level - tr) / (br - tr);
            s++;
          }
          if (s < maxSeg) {
            const o = s << 2;
            seg[o] = i;
            seg[o + 1] = j + (level - tl) / (bl - tl);
            seg[o + 2] = i + (level - bl) / (br - bl);
            seg[o + 3] = j + 1;
            s++;
          }
          break;
        }
      }

      if (ok && s < maxSeg) {
        const o = s << 2;
        seg[o] = ax;
        seg[o + 1] = ay;
        seg[o + 2] = bx;
        seg[o + 3] = by;
        s++;
      }
      if (s >= maxSeg) return s;
    }
  }
  return s;
}

/**
 * Log-spaced iso levels between a faint floor and near the crest, so both the
 * bright core and the faint tail of |ψ|² show as nested rings. Writes into
 * `out` and returns the count actually used.
 */
export function computeLevels(maxProb: number, out: Float32Array): number {
  const n = out.length;
  if (maxProb <= 1e-9) return 0;
  const hi = maxProb * 0.85;
  const lo = maxProb * 0.015;
  const logLo = Math.log(lo);
  const logHi = Math.log(hi);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out[i] = Math.exp(logLo + (logHi - logLo) * t);
  }
  return n;
}
