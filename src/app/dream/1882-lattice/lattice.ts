// ════════════════════════════════════════════════════════════════════════════
// 1882-lattice — Just-intonation harmonic lattice (ratio math + node layout)
//
// Every node is an EXACT small-integer frequency ratio built from the 5-limit
// (optionally 7-limit) prime factors:
//
//     ratio = 3^a · 5^b · 7^c   →   reduced into the octave [1, 2)
//
// Moving one step along the "fifths" axis multiplies by 3/2 (a pure perfect
// fifth). Moving one step along the "thirds" axis multiplies by 5/4 (a pure
// major third). Because the coordinates ARE the prime exponents, geometric
// closeness on the lattice == harmonic consonance: neighbours are the most
// consonant intervals; distant nodes are complex, tense ratios.
//
// This is a real Euler–Fokker / Tonnetz lattice — NOT a pentatonic or 12-TET
// scale. Nothing here is quantised to a piano.
// ════════════════════════════════════════════════════════════════════════════

export interface LatticeNode {
  /** power of 3 — the perfect-fifth axis (horizontal). */
  a: number;
  /** power of 5 — the major-third axis (vertical). */
  b: number;
  /** power of 7 — optional septimal axis (0 for the 5-limit core). */
  c: number;
  /** exact ratio reduced into [1, 2). */
  ratio: number;
  /** exact integer numerator of the reduced ratio (e.g. 3 in 3/2). */
  num: number;
  /** exact integer denominator of the reduced ratio (e.g. 2 in 3/2). */
  den: number;
  /** pretty label, e.g. "3/2", "5/4", "9/8", "1/1". */
  label: string;
  /** computer-keyboard key that plays this node (lowercase), or "". */
  key: string;
  /** layout position in abstract lattice units (pre-pixel). */
  gx: number;
  gy: number;
}

// ── exact rational reduction ────────────────────────────────────────────────

function gcd(x: number, y: number): number {
  x = Math.abs(x);
  y = Math.abs(y);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * Build the exact reduced fraction for 3^a · 5^b · 7^c folded into one octave.
 * Uses integer numerator/denominator so the ratio is genuinely just — no
 * floating-point drift decides what "3/2" means.
 */
export function buildRatio(a: number, b: number, c: number) {
  let num = 1;
  let den = 1;
  const mul = (base: number, p: number) => {
    if (p > 0) num *= base ** p;
    else if (p < 0) den *= base ** -p;
  };
  mul(3, a);
  mul(5, b);
  mul(7, c);

  // Fold into [1, 2) by multiplying/dividing by 2 (octave equivalence).
  // Do it on the integer pair so num/den stays exact.
  let value = num / den;
  // guard against pathological loops
  let guard = 0;
  while (value >= 2 && guard < 64) {
    den *= 2;
    value = num / den;
    guard++;
  }
  while (value < 1 && guard < 128) {
    num *= 2;
    value = num / den;
    guard++;
  }
  const g = gcd(num, den) || 1;
  num /= g;
  den /= g;
  return { num, den, ratio: num / den };
}

// ── keyboard → lattice patch ────────────────────────────────────────────────
//
// The QWERTY block is a 2-D grid. Each physical ROW is a run along the FIFTHS
// axis (a increases left→right). Moving UP a physical row is +1 on the THIRDS
// axis (brighter). The tonic 1/1 sits under a home-row key so a played chord
// grows outward from a stable centre.
//
// physical row   thirds b   keys
//   number         +2       1 2 3 4 5 6 7 8 9 0
//   qwerty         +1       q w e r t y u i o p
//   home            0       a s d f g h j k l ;
//   zxcv           -1       z x c v b n m , . /

const KEY_ROWS: { b: number; keys: string }[] = [
  { b: 2, keys: "1234567890" },
  { b: 1, keys: "qwertyuiop" },
  { b: 0, keys: "asdfghjkl;" },
  { b: -1, keys: "zxcvbnm,./" },
];

// Column 4 is the tonic column (a = col - TONIC_COL), so the tonic 1/1 lands on
// the home-row "g" key: a comfortable centre of the patch.
const TONIC_COL = 4;

/** Horizontal slant per third-step, so the Tonnetz reads as a leaning lattice
 *  rather than a plain rectangle (echoes Wilson/Euler drawings). */
const SLANT = 0.34;

export function buildLattice(): LatticeNode[] {
  const nodes: LatticeNode[] = [];
  for (const row of KEY_ROWS) {
    const keys = row.keys.split("");
    for (let col = 0; col < keys.length; col++) {
      const a = col - TONIC_COL;
      const b = row.b;
      const { num, den, ratio } = buildRatio(a, b, 0);
      nodes.push({
        a,
        b,
        c: 0,
        ratio,
        num,
        den,
        label: `${num}/${den}`,
        key: keys[col],
        gx: a + b * SLANT,
        gy: -b, // physical up == higher on screen
      });
    }
  }
  return nodes;
}

/** Index the nodes by the key that plays them (lowercase). */
export function keyIndex(nodes: LatticeNode[]): Map<string, number> {
  const m = new Map<string, number>();
  nodes.forEach((n, i) => {
    if (n.key) m.set(n.key, i);
  });
  return m;
}

// ── Web MIDI → lattice ───────────────────────────────────────────────────────
//
// A real MIDI keyboard sends 12-TET note numbers. We route each incoming note
// to the nearest just node using a canonical 5-limit map of the 12 pitch
// classes (the classic syntonic-diatonic + chromatic just scale), then transpose
// by octave. This keeps a played MIDI chord genuinely just, not 12-TET.

// pitch-class (0..11 from C) → [a, b] lattice coordinate. A canonical 5-limit
// just mapping of the chromatic scale onto the fifths/thirds lattice.
const PC_MAP: [number, number][] = [
  [0, 0], //  0  C   1/1
  [-1, -1], // 1  Db  16/15
  [2, 0], //  2  D   9/8
  [1, -1], //  3  Eb  6/5
  [0, 1], //  4  E   5/4
  [-1, 0], // 5  F   4/3
  [2, 1], //  6  F#  45/32
  [1, 0], //  7  G   3/2
  [0, -1], // 8  Ab  8/5
  [-1, 1], // 9  A   5/3
  [2, -1], // 10 Bb  9/5
  [1, 1], //  11 B   15/8
];

/**
 * Map a MIDI note number to the lattice node index that best voices it justly.
 * Returns -1 if the resulting node isn't present in the current patch.
 */
export function midiToNodeIndex(
  note: number,
  nodes: LatticeNode[],
): number {
  const pc = ((note % 12) + 12) % 12;
  const [a, b] = PC_MAP[pc];
  // find an exact (a,b) node in the patch
  let best = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].a === a && nodes[i].b === b) {
      best = i;
      break;
    }
  }
  return best;
}
