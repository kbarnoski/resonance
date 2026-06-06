// tonal-map.ts — Chew Spiral Array tonal geometry, center-of-effect math,
// chord/key naming, and tonal-focus scalar.
//
// References:
//   Elaine Chew, "Towards a Mathematical Model of Tonality" (MIT, 2000)
//   Krumhansl & Kessler (1982) — key profiles
//   arXiv:2603.27035 (March 2026) — tonal coherence / gravitational centering

// ─── Pitch-class constants ────────────────────────────────────────────────────

/** Pitch-class names (chromatic, starting at C=0). */
export const PC_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const
export const PC_NAMES_FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"] as const

/**
 * Circle-of-fifths order for the 12 pitch classes (C=0 index, G=1, D=2, …).
 * pitchClassByFifthsIndex[i] gives the pitch-class number for the i-th position.
 */
export const FIFTHS_ORDER: number[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]
// C  G  D  A  E  B  F# Db Ab Eb Bb F

/** Inverse: for pitch class p, fifthsIndexOf[p] = its angular position index 0..11. */
export const FIFTHS_INDEX: number[] = new Array(12).fill(0)
FIFTHS_ORDER.forEach((pc, idx) => { FIFTHS_INDEX[pc] = idx })

// ─── 2-D map positions (top-down Spiral Array projection) ────────────────────

/** Radius of the circle on which key centres are placed (in world units). */
export const MAP_RADIUS = 4.2

/**
 * Returns the (x, y) map position for a given circle-of-fifths index (0-11).
 * Angle 0 is at top (12-o'clock = C), going clockwise.
 */
export function fifthsPos(fifthsIdx: number, r = MAP_RADIUS): [number, number] {
  const angle = (2 * Math.PI * fifthsIdx) / 12 - Math.PI / 2
  return [r * Math.cos(angle), r * Math.sin(angle)]
}

/** Returns (x, y) for a pitch class. */
export function pcPos(pc: number, r = MAP_RADIUS): [number, number] {
  return fifthsPos(FIFTHS_INDEX[pc], r)
}

// ─── Key territory layout ─────────────────────────────────────────────────────

export interface KeyTerritory {
  root: number           // pitch class 0..11
  mode: "major" | "minor"
  label: string          // "C", "G", "Am", etc.
  fifthsIdx: number      // angular position on the map
  center: [number, number]  // world (x, y) of territory centre
  /** The tonic, subdominant, dominant pitch classes for this key. */
  triads: number[][]     // [[tonic triad PCs], [subdom triad PCs], [dom triad PCs]]
}

/** Build the 12 major key territories around the circle of fifths. */
function buildMajorKey(fifthsIdx: number): KeyTerritory {
  const root = FIFTHS_ORDER[fifthsIdx]
  // Diatonic triad roots in major: I=root, IV=root-5semis, V=root+7semis
  const tonic    = [root, (root + 4) % 12, (root + 7) % 12]
  const subdom   = [(root + 5) % 12, (root + 9) % 12, (root + 0) % 12]  // IV
  const dominant = [(root + 7) % 12, (root + 11) % 12, (root + 2) % 12] // V
  const label = PC_NAMES_FLAT[root] === PC_NAMES[root]
    ? PC_NAMES[root]
    : (root === 1 ? "Db" : root === 3 ? "Eb" : root === 6 ? "Gb" : root === 8 ? "Ab" : root === 10 ? "Bb" : PC_NAMES[root])
  return {
    root,
    mode: "major",
    label,
    fifthsIdx,
    center: fifthsPos(fifthsIdx, MAP_RADIUS),
    triads: [tonic, subdom, dominant],
  }
}

export const MAJOR_KEYS: KeyTerritory[] = Array.from({ length: 12 }, (_, i) => buildMajorKey(i))

/** Find the best-matching key territory for a given key root + mode. */
export function findTerritory(root: number, mode: "major" | "minor"): KeyTerritory {
  void mode  // reserved for future minor-key territory rendering
  // For simplicity, map minor keys to their relative major territory visually
  // (the comet still labels as minor in the HUD)
  return MAJOR_KEYS[FIFTHS_INDEX[root]] ?? MAJOR_KEYS[0]
}

// ─── Center-of-effect math ────────────────────────────────────────────────────

/**
 * Weighted center of effect for a set of sounding pitch classes.
 * Each pitch class is placed at its circle-of-fifths position.
 * Returns (x, y) in world coordinates.
 *
 * From Chew (2000): the center of effect is the weighted centroid of
 * the active pitch-class points in the spiral array.
 */
export function centerOfEffect(
  activePCs: Map<number, number>,  // pc → weight (velocity / duration)
  r = MAP_RADIUS,
): [number, number] {
  let wx = 0, wy = 0, totalW = 0
  activePCs.forEach((w, pc) => {
    const [x, y] = pcPos(pc, r)
    wx += w * x
    wy += w * y
    totalW += w
  })
  if (totalW === 0) return [0, 0]
  return [wx / totalW, wy / totalW]
}

/**
 * Tonal-focus scalar [0..1].
 *
 * Computed per arXiv:2603.27035: how concentrated is recent pitch content
 * around the current center of effect?
 * HIGH (→1) when all recent notes cluster in one key; LOW (→0) when spread
 * across many unrelated pitch classes (i.e. during a modulation).
 *
 * Implementation: compute weighted RMS distance of recent pitch-class points
 * from the center-of-effect, normalize by the max possible (= MAP_RADIUS),
 * then invert.
 */
export function computeTonalFocus(
  recentPCs: Map<number, number>,  // pc → accumulated weight
  coe: [number, number],
  r = MAP_RADIUS,
): number {
  let sumW = 0, sumWd2 = 0
  recentPCs.forEach((w, pc) => {
    const [px, py] = pcPos(pc, r)
    const dx = px - coe[0]
    const dy = py - coe[1]
    sumWd2 += w * (dx * dx + dy * dy)
    sumW += w
  })
  if (sumW === 0) return 0.5
  const rmsD = Math.sqrt(sumWd2 / sumW)
  // Normalise: max possible spread ≈ MAP_RADIUS (antipodal points)
  const norm = Math.min(rmsD / r, 1)
  return 1 - norm
}

// ─── Chord identification + Roman numeral ────────────────────────────────────

export interface ChordInfo {
  pcs: Set<number>
  root: number | null
  quality: "maj" | "min" | "dim" | "aug" | "sus" | "unknown"
  symbol: string
  roman: string
  keyRoot: number
  keyMode: "major" | "minor"
  /** Active pitch-class → weight map used for CoE */
  weights: Map<number, number>
}

/** Identify root & quality from a set of pitch classes (brute-force triads). */
export function identifyChord(pcs: Set<number>): { root: number | null; quality: ChordInfo["quality"] } {
  const arr = Array.from(pcs)
  if (arr.length === 0) return { root: null, quality: "unknown" }
  if (arr.length === 1) return { root: arr[0], quality: "unknown" }

  // Try all pitch classes as candidate root, pick the best match
  for (const root of arr) {
    const ints = arr.map(p => (p - root + 12) % 12).sort((a, b) => a - b)
    if (ints.includes(4) && ints.includes(7)) return { root, quality: "maj" }
    if (ints.includes(3) && ints.includes(7)) return { root, quality: "min" }
    if (ints.includes(3) && ints.includes(6)) return { root, quality: "dim" }
    if (ints.includes(4) && ints.includes(8)) return { root, quality: "aug" }
  }
  return { root: arr[0], quality: "unknown" }
}

/** Roman numeral for a chord root within a key. */
export function toRoman(chordRoot: number, keyRoot: number, keyMode: "major" | "minor", quality: ChordInfo["quality"]): string {
  const diatonicMajor = [0, 2, 4, 5, 7, 9, 11]  // intervals of major scale
  const diatonicMinor = [0, 2, 3, 5, 7, 8, 10]  // natural minor
  const scale = keyMode === "major" ? diatonicMajor : diatonicMinor
  const romanNumerals = ["I","II","III","IV","V","VI","VII"]

  const interval = (chordRoot - keyRoot + 12) % 12
  const degIdx = scale.indexOf(interval)
  if (degIdx < 0) return "?"
  const base = romanNumerals[degIdx]
  if (quality === "min" || quality === "dim") return base.toLowerCase() + (quality === "dim" ? "°" : "")
  if (quality === "aug") return base + "+"
  return base
}

/** Build a full ChordInfo given active notes + current key. */
export function buildChordInfo(
  activePCs: Map<number, number>,
  keyRoot: number,
  keyMode: "major" | "minor",
): ChordInfo | null {
  const pcs = new Set(activePCs.keys())
  if (pcs.size === 0) return null

  const { root, quality } = identifyChord(pcs)
  const rootName = root !== null
    ? (root === 1 ? "Db" : root === 3 ? "Eb" : root === 6 ? "F#" : root === 8 ? "Ab" : root === 10 ? "Bb" : PC_NAMES[root])
    : "?"
  const suffix = quality === "min" ? "m" : quality === "dim" ? "°" : quality === "aug" ? "+" : quality === "sus" ? "sus" : ""
  const symbol = rootName + suffix

  const roman = root !== null
    ? toRoman(root, keyRoot, keyMode, quality)
    : "?"

  return { pcs, root, quality, symbol, roman, keyRoot, keyMode, weights: new Map(activePCs) }
}
