// ─────────────────────────────────────────────────────────────────────────────
// Neo-Riemannian Tonnetz: the 24 major/minor triads and the P / L / R transforms.
//
// A triad is represented as { root: pitch-class 0..11, major: boolean }.
// Pitch classes use C = 0. Each triad therefore owns exactly three pitch classes.
//
//   Major triad on root r:  { r, r+4, r+7 }            (root, M3, P5)
//   Minor triad on root r:  { r, r+3, r+7 }            (root, m3, P5)
//
// The three parsimonious transforms move ONE voice by one or two semitones while
// holding the other two as common tones:
//   P (Parallel)        C ↔ c   — moves the third by a semitone
//   L (Leading-tone)    C ↔ e   — moves the root down a semitone (in major)
//   R (Relative)        C ↔ a   — moves the fifth up a tone (in major)
// ─────────────────────────────────────────────────────────────────────────────

export type Transform = "P" | "L" | "R";

export interface Triad {
  root: number; // pitch class 0..11, C = 0
  major: boolean;
}

export const PITCH_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

// The three pitch classes of a triad, ascending from the root.
export function triadPitches(t: Triad): [number, number, number] {
  const third = t.major ? 4 : 3;
  return [mod12(t.root), mod12(t.root + third), mod12(t.root + 7)];
}

// Convention: major triads are written uppercase ("C"), minor lowercase ("c").
export function triadName(t: Triad): string {
  const n = PITCH_NAMES[mod12(t.root)];
  return t.major ? n : n.toLowerCase();
}

// ── P / L / R transforms ─────────────────────────────────────────────────────
// Each returns the neighbouring triad. They are all involutions: applying the
// same transform twice returns the original triad.

export function applyP(t: Triad): Triad {
  // Major ↔ minor on the same root. Third moves by one semitone.
  return { root: t.root, major: !t.major };
}

export function applyL(t: Triad): Triad {
  if (t.major) {
    // C major → E minor: root moves down a semitone (B), set becomes E G B.
    return { root: mod12(t.root + 4), major: false };
  }
  // E minor → C major: inverse.
  return { root: mod12(t.root - 4), major: true };
}

export function applyR(t: Triad): Triad {
  if (t.major) {
    // C major → A minor: fifth moves up a tone (A), set becomes A C E.
    return { root: mod12(t.root - 3), major: false };
  }
  // A minor → C major: inverse.
  return { root: mod12(t.root + 3), major: true };
}

export function applyTransform(t: Triad, x: Transform): Triad {
  if (x === "P") return applyP(t);
  if (x === "L") return applyL(t);
  return applyR(t);
}

export function triadEquals(a: Triad, b: Triad): boolean {
  return mod12(a.root) === mod12(b.root) && a.major === b.major;
}

export function triadKey(t: Triad): string {
  return `${mod12(t.root)}-${t.major ? "M" : "m"}`;
}

// ── Voice leading ────────────────────────────────────────────────────────────
// Given an outgoing register (three absolute MIDI-ish semitone values whose
// pitch classes equal the previous triad) and a target triad, compute new
// absolute voices that hold the two common tones and move the one changed voice
// by the smallest interval. This is what makes the pad glide smoothly.

export function voiceLead(prevVoices: number[], next: Triad): number[] {
  const targetPCs = triadPitches(next);
  const used = new Array(targetPCs.length).fill(false);
  const result: number[] = [];

  // For each previous voice, find the nearest unused target pitch class and
  // realise it as the absolute pitch closest to the previous voice.
  for (const v of prevVoices) {
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestPitch = v;
    for (let i = 0; i < targetPCs.length; i++) {
      if (used[i]) continue;
      const pc = targetPCs[i];
      // nearest absolute pitch with this pitch class to v
      const base = Math.round((v - pc) / 12) * 12 + pc;
      for (const cand of [base - 12, base, base + 12]) {
        const d = Math.abs(cand - v);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
          bestPitch = cand;
        }
      }
    }
    used[bestIdx] = true;
    result.push(bestPitch);
  }
  return result;
}

// ── Lattice geometry ─────────────────────────────────────────────────────────
// Standard Tonnetz axes: one axis = perfect fifths, another = major thirds.
// We place pitch classes on an oblique grid:
//   +x (one column) = +7 semitones (perfect fifth)
//   +y (one row)    = +4 semitones (major third)
// Then every little triangle between three adjacent pitch-class points is a
// triad: upward-pointing triangles are major, downward-pointing are minor.

export interface PitchNode {
  pc: number;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface TriadNode {
  triad: Triad;
  x: number; // centroid
  y: number;
  up: boolean; // pointing up = major
  pts: Array<{ x: number; y: number }>; // triangle corners
}

const SPACING = 96;
const ROW_H = SPACING * 0.62;

// Pitch class at lattice coordinate.
function pcAt(col: number, row: number): number {
  return mod12(col * 7 + row * 4);
}

export interface Lattice {
  width: number;
  height: number;
  pitchNodes: PitchNode[];
  triadNodes: TriadNode[];
}

export function makeLattice(cols: number, rows: number): Lattice {
  const pitchNodes: PitchNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Oblique shift: each row up nudges right by half a cell.
      const x = col * SPACING + row * SPACING * 0.5;
      const y = (rows - 1 - row) * ROW_H;
      pitchNodes.push({ pc: pcAt(col, row), col, row, x, y });
    }
  }

  const nodeAt = (col: number, row: number): PitchNode | undefined =>
    pitchNodes.find((p) => p.col === col && p.row === row);

  const triadNodes: TriadNode[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      const a = nodeAt(col, row); // bottom-left
      const b = nodeAt(col + 1, row); // bottom-right
      const c = nodeAt(col, row + 1); // top-left
      const d = nodeAt(col - 1, row + 1); // top-left-left (for down triangles)

      // Upward triangle (major): a, b, c  →  root a, third c (+4), fifth b (+7)
      if (a && b && c) {
        const cx = (a.x + b.x + c.x) / 3;
        const cy = (a.y + b.y + c.y) / 3;
        triadNodes.push({
          triad: { root: a.pc, major: true },
          x: cx,
          y: cy,
          up: true,
          pts: [
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
            { x: c.x, y: c.y },
          ],
        });
      }
      // Downward triangle (minor): a, c, d  →  pitches a, c(+4 from a-1? ) ...
      // Triangle a(col,row), c(col,row+1), d(col-1,row+1) forms the minor triad
      // sharing edge with the major one. Root = c.pc minor.
      if (a && c && d) {
        const cx = (a.x + c.x + d.x) / 3;
        const cy = (a.y + c.y + d.y) / 3;
        // The three PCs a.pc, c.pc, d.pc form a minor triad. Its root is the PC
        // whose +3 and +7 are the other two.
        const set = [a.pc, c.pc, d.pc];
        let root = set[0];
        for (const r of set) {
          const want = [mod12(r), mod12(r + 3), mod12(r + 7)].sort().join();
          const have = [...set].map(mod12).sort().join();
          if (want === have) {
            root = r;
            break;
          }
        }
        triadNodes.push({
          triad: { root, major: false },
          x: cx,
          y: cy,
          up: false,
          pts: [
            { x: a.x, y: a.y },
            { x: c.x, y: c.y },
            { x: d.x, y: d.y },
          ],
        });
      }
    }
  }

  let maxX = 0;
  let maxY = 0;
  let minX = Infinity;
  for (const p of pitchNodes) {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.x < minX) minX = p.x;
  }
  return {
    width: maxX - minX,
    height: maxY,
    pitchNodes,
    triadNodes,
  };
}

// ── Pathfinding for "click to redirect" ──────────────────────────────────────
// BFS over the P/L/R transform graph to get the shortest sequence of transforms
// from one triad to another. The graph has 24 nodes, so this is instant.

export function findPath(from: Triad, to: Triad): Transform[] {
  if (triadEquals(from, to)) return [];
  const transforms: Transform[] = ["P", "L", "R"];
  const queue: Array<{ t: Triad; path: Transform[] }> = [{ t: from, path: [] }];
  const seen = new Set<string>([triadKey(from)]);
  while (queue.length) {
    const { t, path } = queue.shift()!;
    for (const x of transforms) {
      const nt = applyTransform(t, x);
      const key = triadKey(nt);
      if (seen.has(key)) continue;
      const np = [...path, x];
      if (triadEquals(nt, to)) return np;
      seen.add(key);
      queue.push({ t: nt, path: np });
    }
  }
  return [];
}

// Choose the next autonomous transform. Weighted, avoids immediate backtrack,
// and `homeBias` (0..1) pulls the walk back toward the origin triad over time.
export function chooseTransform(
  current: Triad,
  last: Transform | null,
  origin: Triad,
  homeBias: number,
  rand: () => number,
): Transform {
  const transforms: Transform[] = ["P", "L", "R"];
  // Base weights — R and L make wider lattice journeys, P is a tight pivot.
  const base: Record<Transform, number> = { P: 0.9, L: 1.1, R: 1.0 };

  const dHome = transformGraphDistance(current, origin);
  const weights = transforms.map((x) => {
    let w = base[x];
    // Avoid immediate backtracking (all transforms are involutions).
    if (last && x === last) w *= 0.18;
    // Home bias: prefer transforms that reduce distance to origin, scaled by
    // how far we've wandered. Far away + high bias => strong pull home.
    if (homeBias > 0 && dHome > 0) {
      const nt = applyTransform(current, x);
      const nd = transformGraphDistance(nt, origin);
      const pull = nd < dHome ? 1 : nd > dHome ? -1 : 0;
      w *= 1 + pull * homeBias * Math.min(1, dHome / 4);
    }
    return Math.max(0.02, w);
  });

  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < transforms.length; i++) {
    r -= weights[i];
    if (r <= 0) return transforms[i];
  }
  return transforms[transforms.length - 1];
}

// Cached BFS distance in the P/L/R graph.
const distCache = new Map<string, number>();
export function transformGraphDistance(a: Triad, b: Triad): number {
  const key = `${triadKey(a)}>${triadKey(b)}`;
  const cached = distCache.get(key);
  if (cached !== undefined) return cached;
  const d = findPath(a, b).length;
  distCache.set(key, d);
  return d;
}
