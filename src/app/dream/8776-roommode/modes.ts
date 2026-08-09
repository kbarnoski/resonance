// modes.ts — analytic rectangular-room acoustic eigenmodes.
//
// For a rigid-walled box of dimensions Lx,Ly,Lz the standing-wave (normal)
// mode frequencies are
//
//   f(nx,ny,nz) = (c/2) * sqrt( (nx/Lx)^2 + (ny/Ly)^2 + (nz/Lz)^2 )
//
// with c = 343 m/s and integers nx,ny,nz >= 0 (not all zero). The pressure
// field of a mode is a product of cosines,
//
//   p(x,y,z) ∝ cos(nx·π·x/Lx)·cos(ny·π·y/Ly)·cos(nz·π·z/Lz)
//
// so its nodal surfaces (p = 0) are FLAT PLANES perpendicular to each axis,
// and its antinodes (|p| = 1) sit on the regular grid between them. That flat
// geometry is exactly what we draw in 3D. See Rayleigh, *Theory of Sound*.

export const SPEED_OF_SOUND = 343; // m/s, dry air ~20°C

export interface Mode {
  nx: number;
  ny: number;
  nz: number;
}

export interface Dims {
  lx: number;
  ly: number;
  lz: number;
}

/** Modal frequency in Hz for a given mode and room. */
export function modeFrequency(m: Mode, d: Dims): number {
  const ax = m.nx / d.lx;
  const ay = m.ny / d.ly;
  const az = m.nz / d.lz;
  return (SPEED_OF_SOUND / 2) * Math.sqrt(ax * ax + ay * ay + az * az);
}

/** 1 = axial, 2 = tangential, 3 = oblique (count of non-zero indices). */
export function modeOrder(m: Mode): 1 | 2 | 3 {
  return ((m.nx > 0 ? 1 : 0) +
    (m.ny > 0 ? 1 : 0) +
    (m.nz > 0 ? 1 : 0)) as 1 | 2 | 3;
}

export function modeTypeLabel(m: Mode): string {
  switch (modeOrder(m)) {
    case 1:
      return "axial";
    case 2:
      return "tangential";
    default:
      return "oblique";
  }
}

export function modeKey(m: Mode): string {
  return `${m.nx}-${m.ny}-${m.nz}`;
}

export function sameMode(a: Mode, b: Mode): boolean {
  return a.nx === b.nx && a.ny === b.ny && a.nz === b.nz;
}

/** All modes with each index in 0..maxIndex, excluding (0,0,0). */
export function enumerateModes(maxIndex: number): Mode[] {
  const out: Mode[] = [];
  for (let nx = 0; nx <= maxIndex; nx++) {
    for (let ny = 0; ny <= maxIndex; ny++) {
      for (let nz = 0; nz <= maxIndex; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        out.push({ nx, ny, nz });
      }
    }
  }
  return out;
}

/** Copy of `modes` sorted ascending by frequency for the current room. */
export function sortByFrequency(modes: Mode[], d: Dims): Mode[] {
  return [...modes].sort((a, b) => modeFrequency(a, d) - modeFrequency(b, d));
}

/**
 * Normalized pressure at (u,v,w) with each coordinate in [0,1]
 * (u = x/Lx …). Independent of room size — only the mode indices shape the
 * field; the dimensions set the frequency and the box aspect.
 */
export function pressureNorm(m: Mode, u: number, v: number, w: number): number {
  return (
    Math.cos(m.nx * Math.PI * u) *
    Math.cos(m.ny * Math.PI * v) *
    Math.cos(m.nz * Math.PI * w)
  );
}

/**
 * Normalized nodal-plane positions along one axis for index n:
 * the cosine cos(n·π·t) vanishes at t = (k + 0.5)/n, k = 0 … n-1.
 */
export function nodalPositions(n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push((k + 0.5) / n);
  return out;
}
