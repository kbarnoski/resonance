// 896-tonnetz-loom — Tonnetz lattice geometry + neo-Riemannian P/L/R logic.
//
// The Tonnetz (Euler 1739) is a triangular pitch-class lattice. We lay nodes on
// an axial (i, j) integer grid where:
//   • moving +1 in i  →  +7 semitones (a perfect FIFTH)
//   • moving +1 in j  →  +4 semitones (a major THIRD)
//   • the implied third edge (i+1, j-1 diagonal) →  +3 semitones (minor THIRD),
//     since a fifth minus a major third is a minor third (7 − 4 = 3).
//
// Every small triangle of three mutually-adjacent nodes is a consonant triad:
//   up-pointing   triangle  →  MAJOR triad
//   down-pointing triangle  →  MINOR triad

export const PC_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

export type Quality = "major" | "minor";

// A node placed on the axial grid.
export type Node = {
  i: number;
  j: number;
  pc: number; // pitch class 0..11
  x: number; // screen x
  y: number; // screen y
};

// A triad = an oriented triangle on the lattice. We identify it by its anchor
// node (i, j) and orientation. The three pitch classes are computed from the
// axes so the geometry and the harmony are literally the same object.
export type Triad = {
  i: number;
  j: number;
  quality: Quality;
  rootPc: number; // pitch class of the chord root
  pcs: [number, number, number]; // root, third, fifth (pitch classes)
  // screen-space centroid, for the highlight & path ribbon
  cx: number;
  cy: number;
  poly: [number, number][]; // the three vertices, screen space
};

const mod12 = (n: number) => ((n % 12) + 12) % 12;

// pitch class at axial coordinate, anchored so (0,0) = C.
export function pcAt(i: number, j: number, basePc = 0): number {
  return mod12(basePc + i * 7 + j * 4);
}

// ── Screen placement ────────────────────────────────────────────────────────
// We render the lattice as a sheared grid: the i-axis is horizontal, the j-axis
// goes up-and-to-the-right, producing equilateral-ish triangles.
export type Layout = {
  ox: number; // origin x
  oy: number; // origin y
  ux: number; // i-axis vector (x)
  uy: number; // i-axis vector (y)
  vx: number; // j-axis vector (x)
  vy: number; // j-axis vector (y)
};

export function nodeXY(i: number, j: number, L: Layout): [number, number] {
  return [L.ox + i * L.ux + j * L.vx, L.oy + i * L.uy + j * L.vy];
}

// Build the visible set of nodes for an i-range × j-range patch.
export function buildNodes(
  iMin: number,
  iMax: number,
  jMin: number,
  jMax: number,
  basePc: number,
  L: Layout,
): Node[] {
  const out: Node[] = [];
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const [x, y] = nodeXY(i, j, L);
      out.push({ i, j, pc: pcAt(i, j, basePc), x, y });
    }
  }
  return out;
}

// Build every triad triangle in the patch. An UP triangle (major) uses nodes
//   (i, j), (i+1, j), (i, j+1) ... but to make consonant triads we choose the
// triplets that form root/third/fifth. With our axes:
//   major triad on root R:  R, R+4 (maj third), R+7 (fifth)
//      = nodes (i,j)=R, (i,j+1)=R+4, (i+1,j)=R+7   → up triangle
//   minor triad on root R:  R, R+3 (min third), R+7 (fifth)
//      = nodes (i,j)=R, (i+1,j-1)?... we use the complementary down triangle:
//      (i+1,j), (i,j+1), (i+1,j+1) with root at (i+1,j+1)-... — see below.
//
// Simpler: enumerate the two triangles of each rhombus cell [(i,j),(i+1,j),
// (i,j+1),(i+1,j+1)]:
//   UP  = (i,j),(i+1,j),(i,j+1)        pcs {R, R+7, R+4} → MAJOR, root (i,j)
//   DOWN= (i+1,j),(i,j+1),(i+1,j+1)    pcs {R+7,R+4,R+11}→ MINOR, root (i,j+1)=R+4
export function buildTriads(
  iMin: number,
  iMax: number,
  jMin: number,
  jMax: number,
  basePc: number,
  L: Layout,
): Triad[] {
  const out: Triad[] = [];
  for (let j = jMin; j < jMax; j++) {
    for (let i = iMin; i < iMax; i++) {
      // UP triangle → major, root at (i,j)
      out.push(makeTriad(i, j, "major", basePc, L));
      // DOWN triangle → minor, root at (i, j+1)
      out.push(makeTriad(i, j, "minor", basePc, L));
    }
  }
  return out;
}

function makeTriad(
  i: number,
  j: number,
  quality: Quality,
  basePc: number,
  L: Layout,
): Triad {
  let verts: [number, number][];
  let pcs: [number, number, number];
  let rootI: number;
  let rootJ: number;

  if (quality === "major") {
    // (i,j)=R, (i,j+1)=R+4, (i+1,j)=R+7
    const a = nodeXY(i, j, L);
    const b = nodeXY(i, j + 1, L);
    const c = nodeXY(i + 1, j, L);
    verts = [a, b, c];
    const R = pcAt(i, j, basePc);
    pcs = [R, mod12(R + 4), mod12(R + 7)];
    rootI = i;
    rootJ = j;
  } else {
    // minor down triangle: (i+1,j)=R+7, (i,j+1)=R+4, (i+1,j+1)=R+11
    // root is the (i,j+1) node = R+4 played as a minor root.
    const a = nodeXY(i + 1, j, L);
    const b = nodeXY(i, j + 1, L);
    const c = nodeXY(i + 1, j + 1, L);
    verts = [a, b, c];
    const rootPc = pcAt(i, j + 1, basePc); // R+4
    // minor triad: root, +3 (min third), +7 (fifth)
    pcs = [rootPc, mod12(rootPc + 3), mod12(rootPc + 7)];
    rootI = i;
    rootJ = j + 1;
  }

  const cx = (verts[0][0] + verts[1][0] + verts[2][0]) / 3;
  const cy = (verts[0][1] + verts[1][1] + verts[2][1]) / 3;
  return {
    i: rootI,
    j: rootJ,
    quality,
    rootPc: pcs[0],
    pcs,
    cx,
    cy,
    poly: verts,
  };
}

// ── Neo-Riemannian P / L / R transforms ──────────────────────────────────────
// Each transform flips quality and moves exactly ONE voice by a small step,
// holding the other two (common tones). Defined on pitch-class content:
//
//   P (Parallel):        C major ↔ C minor.  Root & fifth FIXED; the THIRD
//                        moves by a semitone (E↔E♭). Common tones: root, fifth.
//   L (Leading-tone):    C major ↔ E minor.  Third & fifth FIXED; the ROOT
//                        moves down a semitone (C→B). Common tones: third, fifth.
//   R (Relative):        C major ↔ A minor.  Root & third FIXED; the FIFTH
//                        moves up a whole tone (G→A). Common tones: root, third.
//
// We express each as: take the current triad's (root, quality), produce the new
// (root, quality). Then we re-derive frequencies for smooth voice-leading.

export type Chord = { rootPc: number; quality: Quality };

export function applyTransform(c: Chord, t: "P" | "L" | "R"): Chord {
  const { rootPc, quality } = c;
  if (t === "P") {
    // same root, opposite quality
    return { rootPc, quality: quality === "major" ? "minor" : "major" };
  }
  if (t === "L") {
    if (quality === "major") {
      // C major → E minor: new root = old third (+4)
      return { rootPc: mod12(rootPc + 4), quality: "minor" };
    }
    // E minor → C major: new root = old root − 4 ... = old fifth's... :
    // inverse of above. E minor → C major, new root = rootPc − 4 ? E−4 = C. yes
    return { rootPc: mod12(rootPc - 4), quality: "major" };
  }
  // R
  if (quality === "major") {
    // C major → A minor: new root = old root − 3
    return { rootPc: mod12(rootPc - 3), quality: "minor" };
  }
  // A minor → C major: new root = old root + 3
  return { rootPc: mod12(rootPc + 3), quality: "major" };
}

// Pitch classes of a chord, ordered root / third / fifth.
export function chordPcs(c: Chord): [number, number, number] {
  if (c.quality === "major") {
    return [c.rootPc, mod12(c.rootPc + 4), mod12(c.rootPc + 7)];
  }
  return [c.rootPc, mod12(c.rootPc + 3), mod12(c.rootPc + 7)];
}

export function chordName(c: Chord): string {
  return `${PC_NAMES[c.rootPc]} ${c.quality === "major" ? "maj" : "min"}`;
}

// Find a Triad in the patch whose root pc + quality matches a Chord, preferring
// the one nearest a reference centroid so PLR walks stay spatially local.
export function findTriad(
  triads: Triad[],
  c: Chord,
  near?: { cx: number; cy: number },
): Triad | null {
  const matches = triads.filter(
    (t) => t.rootPc === c.rootPc && t.quality === c.quality,
  );
  if (matches.length === 0) return null;
  if (!near) return matches[0];
  let best = matches[0];
  let bestD = Infinity;
  for (const m of matches) {
    const d = (m.cx - near.cx) ** 2 + (m.cy - near.cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
