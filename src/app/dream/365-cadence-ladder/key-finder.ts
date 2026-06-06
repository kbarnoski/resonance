// key-finder.ts — 365-cadence-ladder
// Krumhansl-Schmuckler key estimation + Roman-numeral functional labeling.
//
// The pitch-class profile (12-bin) is correlated via Pearson against all 24
// rotated key profiles (Krumhansl & Kessler 1982). Hysteresis ensures the
// current key only switches when a new key clearly wins for a sustained moment.
//
// Roman numeral + harmonic function follows Hugo Riemann's tripartite:
//   Tonic    → I, iii, vi
//   Subdominant → IV, ii
//   Dominant   → V, vii°

export type HarmonicFunction = "Tonic" | "Subdominant" | "Dominant" | "Unknown"
export type CadenceType = "authentic" | "plagal" | "deceptive" | null

export interface ChordEvent {
  symbol: string   // e.g. "Cmaj", "Amin", "Bdim"
  roman: string    // e.g. "I", "ii", "V", "vii°"
  fn: HarmonicFunction
  tension: number  // 0..1  (Dominant=high, Tonic=low)
  root: number     // pitch class 0-11
  quality: "maj" | "min" | "dim" | "dom7" | "maj7" | "unknown"
}

export interface KeyState {
  root: number        // 0-11
  mode: "major" | "minor"
  name: string        // e.g. "C major"
  confidence: number  // Pearson r of winning key
}

// Krumhansl-Kessler tonal hierarchy profiles
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

// Pearson correlation between two 12-element vectors
function pearson(a: number[], b: number[]): number {
  const n = 12
  let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i]
    sumA2 += a[i] * a[i]; sumB2 += b[i] * b[i]
    sumAB += a[i] * b[i]
  }
  const num = n * sumAB - sumA * sumB
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))
  return den < 1e-10 ? 0 : num / den
}

function rotateProfile(profile: number[], semitones: number): number[] {
  const n = profile.length
  return Array.from({ length: n }, (_, i) => profile[(i - semitones + n) % n])
}

// Chord quality templates: intervals from root (pitch classes relative to root)
const CHORD_TEMPLATES: Array<{ intervals: number[]; quality: ChordEvent["quality"]; suffix: string }> = [
  { intervals: [0, 4, 7],     quality: "maj",     suffix: "" },
  { intervals: [0, 3, 7],     quality: "min",     suffix: "m" },
  { intervals: [0, 3, 6],     quality: "dim",     suffix: "°" },
  { intervals: [0, 4, 7, 11], quality: "maj7",    suffix: "maj7" },
  { intervals: [0, 4, 7, 10], quality: "dom7",    suffix: "7" },
  { intervals: [0, 3, 7, 10], quality: "min",     suffix: "m7" },
]

// Given a set of active pitch classes, return best chord match
function matchChord(activePCs: Set<number>): { root: number; quality: ChordEvent["quality"]; suffix: string } | null {
  if (activePCs.size < 2) return null
  let bestScore = -1
  let bestRoot = 0
  let bestQuality: ChordEvent["quality"] = "maj"
  let bestSuffix = ""

  for (let root = 0; root < 12; root++) {
    for (const tmpl of CHORD_TEMPLATES) {
      const matched = tmpl.intervals.filter(iv => activePCs.has((root + iv) % 12)).length
      const score = matched / tmpl.intervals.length
      if (score > bestScore && matched >= 2) {
        bestScore = score
        bestRoot = root
        bestQuality = tmpl.quality
        bestSuffix = tmpl.suffix
      }
    }
  }
  return bestScore > 0.5 ? { root: bestRoot, quality: bestQuality, suffix: bestSuffix } : null
}

// Map scale degree (0-11, relative to key root) + mode to Roman numeral + function
function getRomanAndFunction(
  chordRoot: number,
  chordQuality: ChordEvent["quality"],
  keyRoot: number,
  keyMode: "major" | "minor"
): { roman: string; fn: HarmonicFunction; tension: number } {
  const degree = (chordRoot - keyRoot + 12) % 12

  // Major key scale degrees (semitones): I=0, ii=2, iii=4, IV=5, V=7, vi=9, vii=11
  // Minor key: i=0, ii°=2, III=3, iv=5, V/v=7, VI=8, VII=10, vii°=11
  if (keyMode === "major") {
    const map: Record<number, { roman: string; fn: HarmonicFunction; tension: number }> = {
      0:  { roman: chordQuality === "min" ? "i"    : "I",    fn: "Tonic",       tension: 0.05 },
      2:  { roman: chordQuality === "maj" ? "II"   : "ii",   fn: "Subdominant", tension: 0.45 },
      4:  { roman: chordQuality === "min" ? "iii"  : "III",  fn: "Tonic",       tension: 0.20 },
      5:  { roman: chordQuality === "min" ? "iv"   : "IV",   fn: "Subdominant", tension: 0.35 },
      7:  { roman: chordQuality === "dom7" || chordQuality === "maj" ? "V" : "v", fn: "Dominant", tension: 0.85 },
      9:  { roman: chordQuality === "maj" ? "VI"   : "vi",   fn: "Tonic",       tension: 0.15 },
      11: { roman: "vii°", fn: "Dominant", tension: 0.95 },
    }
    const entry = map[degree]
    if (entry) return entry

    // Secondary dominant: a major chord a fifth above a diatonic chord
    // V/V = major chord on degree 2 (if major quality)
    if (degree === 2 && chordQuality === "maj") return { roman: "V/V", fn: "Dominant", tension: 0.75 }
    if (degree === 9 && chordQuality === "dom7") return { roman: "V/ii", fn: "Dominant", tension: 0.70 }
    return { roman: "?", fn: "Unknown", tension: 0.50 }
  } else {
    // Natural minor
    const map: Record<number, { roman: string; fn: HarmonicFunction; tension: number }> = {
      0:  { roman: chordQuality === "maj" ? "I"   : "i",    fn: "Tonic",       tension: 0.05 },
      2:  { roman: "ii°",   fn: "Subdominant", tension: 0.50 },
      3:  { roman: chordQuality === "min" ? "III" : "♭III", fn: "Tonic",       tension: 0.20 },
      5:  { roman: chordQuality === "maj" ? "IV"  : "iv",   fn: "Subdominant", tension: 0.35 },
      7:  { roman: chordQuality === "maj" ? "V"   : "v",    fn: "Dominant",    tension: 0.80 },
      8:  { roman: chordQuality === "min" ? "VI"  : "♭VI",  fn: "Tonic",       tension: 0.20 },
      10: { roman: "♭VII",  fn: "Subdominant", tension: 0.40 },
      11: { roman: "vii°",  fn: "Dominant",    tension: 0.95 },
    }
    const entry = map[degree]
    if (entry) return entry
    return { roman: "?", fn: "Unknown", tension: 0.50 }
  }
}

export class KeyFinder {
  // 12-bin pitch class profile, exponential decay
  private profile: number[] = new Array(12).fill(0)
  private readonly decay = 0.985  // per-frame decay (frame ≈ 16ms → ~1s half-life)

  // Key hysteresis
  private currentKey: KeyState = { root: 0, mode: "major", name: "C major", confidence: 0 }
  private pendingKey: KeyState | null = null
  private pendingFrames = 0
  private readonly HYSTERESIS_FRAMES = 30  // ~0.5s at 60fps
  private readonly SWITCH_THRESHOLD = 0.08  // must beat current by this margin

  // Cadence detection
  private lastFn: HarmonicFunction = "Unknown"
  private pendingCadence: CadenceType = null
  private cadenceHoldFrames = 0
  private readonly CADENCE_HOLD = 45  // ~0.75s display

  // Build all 24 reference profiles once
  private majorProfiles: number[][] = []
  private minorProfiles: number[][] = []

  constructor() {
    for (let r = 0; r < 12; r++) {
      this.majorProfiles.push(rotateProfile(KK_MAJOR, r))
      this.minorProfiles.push(rotateProfile(KK_MINOR, r))
    }
  }

  // Called each frame: add active note pitch classes with given velocity
  addNotes(activePCs: Set<number>, velocities?: Map<number, number>): void {
    // Decay existing profile
    for (let i = 0; i < 12; i++) this.profile[i] *= this.decay

    // Accumulate active notes
    for (const pc of activePCs) {
      const vel = velocities?.get(pc) ?? 80
      this.profile[pc] += (vel / 127) * 0.15
      // Cap to prevent runaway
      if (this.profile[pc] > 8) this.profile[pc] = 8
    }
  }

  estimateKey(): KeyState {
    let bestR = -Infinity
    let bestRoot = 0
    let bestMode: "major" | "minor" = "major"

    for (let r = 0; r < 12; r++) {
      const majR = pearson(this.profile, this.majorProfiles[r])
      const minR = pearson(this.profile, this.minorProfiles[r])
      if (majR > bestR) { bestR = majR; bestRoot = r; bestMode = "major" }
      if (minR > bestR) { bestR = minR; bestRoot = r; bestMode = "minor" }
    }

    const candidate: KeyState = {
      root: bestRoot,
      mode: bestMode,
      name: `${NOTE_NAMES[bestRoot]} ${bestMode}`,
      confidence: Math.max(0, bestR),
    }

    // Hysteresis: only switch if new key beats current for HYSTERESIS_FRAMES
    const currentR = pearson(this.profile,
      this.currentKey.mode === "major"
        ? this.majorProfiles[this.currentKey.root]
        : this.minorProfiles[this.currentKey.root]
    )
    const margin = bestR - currentR

    if (bestRoot === this.currentKey.root && bestMode === this.currentKey.mode) {
      this.pendingKey = null
      this.pendingFrames = 0
      this.currentKey.confidence = candidate.confidence
    } else if (margin > this.SWITCH_THRESHOLD) {
      if (this.pendingKey?.root === bestRoot && this.pendingKey?.mode === bestMode) {
        this.pendingFrames++
        if (this.pendingFrames >= this.HYSTERESIS_FRAMES) {
          this.currentKey = { ...candidate }
          this.pendingKey = null
          this.pendingFrames = 0
        }
      } else {
        this.pendingKey = candidate
        this.pendingFrames = 1
      }
    } else {
      this.pendingKey = null
      this.pendingFrames = 0
    }

    return { ...this.currentKey }
  }

  analyzeChord(activePCs: Set<number>, key: KeyState): ChordEvent | null {
    if (activePCs.size < 2) return null
    const match = matchChord(activePCs)
    if (!match) return null

    const { roman, fn, tension } = getRomanAndFunction(match.root, match.quality, key.root, key.mode)
    const symbol = `${NOTE_NAMES[match.root]}${match.suffix}`

    return {
      symbol,
      roman,
      fn,
      tension,
      root: match.root,
      quality: match.quality,
    }
  }

  // Detect cadence from function transition
  detectCadence(currentFn: HarmonicFunction): CadenceType {
    let cadence: CadenceType = null
    if (currentFn === "Tonic" && this.lastFn === "Dominant") {
      cadence = "authentic"
    } else if (currentFn === "Tonic" && this.lastFn === "Subdominant") {
      cadence = "plagal"
    }
    // Deceptive: Dominant -> something that is NOT Tonic but is vi-like
    // We detect this in the scene layer with chord symbols
    if (this.lastFn !== currentFn) {
      this.lastFn = currentFn
    }
    return cadence
  }

  detectDeceptive(chord: ChordEvent): boolean {
    // Deceptive = previous chord was Dominant, current is "vi" (relative minor)
    return this.lastFn === "Dominant" && chord.fn === "Tonic" &&
      (chord.roman === "vi" || chord.roman === "VI")
  }

  updateLastFn(fn: HarmonicFunction): void {
    this.lastFn = fn
  }

  getLastFn(): HarmonicFunction { return this.lastFn }

  getProfile(): number[] { return [...this.profile] }

  isModulating(): boolean {
    return this.pendingKey !== null && this.pendingFrames > 5
  }

  reset(): void {
    this.profile = new Array(12).fill(0)
    this.pendingKey = null
    this.pendingFrames = 0
  }
}
