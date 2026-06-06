// key-finder.ts — decaying pitch-class histogram + Krumhansl-Schmuckler key estimation
// with hysteresis-guarded modulation detection.
//
// Reference: Krumhansl & Kessler (1982) tonal hierarchies.

// ─── Krumhansl–Kessler profiles (correlation-based key estimation) ─────────────

// Major profile (C relative)
const KK_MAJOR: number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
]
// Minor profile (C relative, natural minor)
const KK_MINOR: number[] = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
]

function pearsonCorr(a: number[], b: number[]): number {
  const n = a.length
  let ma = 0, mb = 0
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i] }
  ma /= n; mb /= n
  let num = 0, da2 = 0, db2 = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    num += da * db
    da2 += da * da
    db2 += db * db
  }
  const denom = Math.sqrt(da2 * db2)
  return denom < 1e-9 ? 0 : num / denom
}

// ─── KeyState ─────────────────────────────────────────────────────────────────

export interface KeyState {
  root: number
  mode: "major" | "minor"
  name: string          // e.g. "C major", "A minor"
  confidence: number    // Pearson correlation of best match [0..1]
}

function keyName(root: number, mode: "major" | "minor"): string {
  const rootNames: string[] = ["C","Db","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
  return `${rootNames[root]} ${mode}`
}

// ─── KeyFinder ────────────────────────────────────────────────────────────────

/** Decay rate per second for the pitch-class histogram. */
const DECAY_RATE = 0.6   // 60% per second → ~1.5 s half-life
const MIN_CONFIDENCE_SHIFT = 0.12   // hysteresis: new key must beat current by this much

export class KeyFinder {
  /** Decaying pitch-class histogram [0..11] → accumulated weight. */
  readonly histogram: number[] = new Array(12).fill(0)

  /** Separate "recent" histogram with faster decay for tonal-focus calc. */
  readonly recentHistogram: number[] = new Array(12).fill(0)

  private lastKey: KeyState = { root: 0, mode: "major", name: "C major", confidence: 0 }
  private _isModulating = false
  private modulatingFrames = 0
  private lastUpdateMs = 0

  addNotes(activePCs: Set<number>, velocities: Map<number, number>, dtSec = 0.016): void {
    // Decay existing histogram
    const decayFactor = Math.exp(-DECAY_RATE * dtSec)
    const fastDecayFactor = Math.exp(-DECAY_RATE * 2 * dtSec)
    for (let i = 0; i < 12; i++) {
      this.histogram[i] *= decayFactor
      this.recentHistogram[i] *= fastDecayFactor
    }
    // Accumulate active pitch classes
    activePCs.forEach(pc => {
      const v = (velocities.get(pc) ?? 80) / 127
      this.histogram[pc] += v * dtSec * 4   // scale so a held note accumulates meaningfully
      this.recentHistogram[pc] += v * dtSec * 4
    })
  }

  estimateKey(): KeyState {
    const h = this.histogram
    const total = h.reduce((a, b) => a + b, 0)

    // Find best-correlating major/minor key
    let bestCorr = -Infinity
    let bestRoot = 0
    let bestMode: "major" | "minor" = "major"

    for (let root = 0; root < 12; root++) {
      // Rotate profiles to this root
      const majP = KK_MAJOR.map((_, i) => KK_MAJOR[(i - root + 12) % 12])
      const minP = KK_MINOR.map((_, i) => KK_MINOR[(i - root + 12) % 12])
      const cMaj = pearsonCorr(h, majP)
      const cMin = pearsonCorr(h, minP)
      if (cMaj > bestCorr) { bestCorr = cMaj; bestRoot = root; bestMode = "major" }
      if (cMin > bestCorr) { bestCorr = cMin; bestRoot = root; bestMode = "minor" }
    }

    const candidate: KeyState = {
      root: bestRoot,
      mode: bestMode,
      name: keyName(bestRoot, bestMode),
      confidence: Math.max(0, Math.min(1, (bestCorr + 1) / 2)),
    }

    if (total < 0.01) {
      // No notes heard yet — keep last key
      return this.lastKey
    }

    // Hysteresis: only switch if clearly better
    if (
      candidate.root !== this.lastKey.root ||
      candidate.mode !== this.lastKey.mode
    ) {
      const currentBestCorr = this.correlationForKey(this.lastKey.root, this.lastKey.mode)
      if (bestCorr - currentBestCorr > MIN_CONFIDENCE_SHIFT) {
        const wasKey = this.lastKey
        this.lastKey = candidate
        // Trigger modulation state
        if (wasKey.root !== candidate.root || wasKey.mode !== candidate.mode) {
          this._isModulating = true
          this.modulatingFrames = 90  // ~1.5 s at 60fps
        }
      }
    } else {
      this.lastKey = candidate
    }

    if (this._isModulating) {
      this.modulatingFrames--
      if (this.modulatingFrames <= 0) this._isModulating = false
    }

    return this.lastKey
  }

  private correlationForKey(root: number, mode: "major" | "minor"): number {
    const profile = mode === "major" ? KK_MAJOR : KK_MINOR
    const rotated = profile.map((_, i) => profile[(i - root + 12) % 12])
    return pearsonCorr(this.histogram, rotated)
  }

  isModulating(): boolean { return this._isModulating }

  /** Recent pitch-class weights (for tonal-focus calculation). */
  recentPCWeights(): Map<number, number> {
    const map = new Map<number, number>()
    this.recentHistogram.forEach((w, pc) => { if (w > 1e-4) map.set(pc, w) })
    return map
  }
}
