// viz.ts — pure layout helpers for the SVG score-timeline visualization.
//
// The page renders the SVG declaratively in React; this module only computes
// geometry and small derived values so the JSX stays legible. SVG was chosen on
// purpose (the jury banned raw WebGL2 / three.js this cycle) and is ideal here:
// crisp text labels, easy cursors, trivially legible on a phone.
//
// Layout: a horizontal score timeline. Each reference note is a tick along X.
// Two cursors ride the timeline — the DTW estimate and the HMM estimate — drawn
// distinctly. A confidence band underneath visibly dips during fumbles, and the
// currently-trusted follower glows. Fumble markers pop above the timeline.

import type { ScoreNote } from "./score"

export interface VizLayout {
  width: number
  height: number
  padX: number
  trackY: number       // Y of the main timeline
  bandY: number        // Y (top) of the confidence band
  bandH: number        // height of the confidence band
}

export const VIEW: VizLayout = {
  width: 1000,
  height: 420,
  padX: 48,
  trackY: 150,
  bandY: 250,
  bandH: 110,
}

// X position (in viewBox units) of reference note index `i` (supports fractional
// indices so a cursor can sit between ticks for smooth motion).
export function noteX(i: number, count: number, v: VizLayout = VIEW): number {
  if (count <= 1) return v.padX
  const usable = v.width - 2 * v.padX
  const t = Math.max(0, Math.min(count - 1, i)) / (count - 1)
  return v.padX + t * usable
}

// Map a MIDI pitch to a Y offset above the track so ticks form a tiny contour of
// the melody (purely decorative legibility — higher notes sit higher).
export function pitchY(midi: number, ref: ScoreNote[], v: VizLayout = VIEW): number {
  let lo = Infinity
  let hi = -Infinity
  for (const n of ref) {
    if (n.midi < lo) lo = n.midi
    if (n.midi > hi) hi = n.midi
  }
  const span = Math.max(1, hi - lo)
  const t = (midi - lo) / span
  // Higher pitch → higher on screen (smaller Y). Keep a modest 56px contour.
  return v.trackY - 36 - t * 56
}

// Confidence (0..1) → a color from rose (low / lost) through amber to emerald.
export function confidenceColor(c: number): string {
  if (c < 0.42) return "#fb7185" // rose-400 — DTW has lost the plot
  if (c < 0.7) return "#fbbf24"  // amber-400 — shaky / recovering
  return "#34d399"               // emerald-400 — locked
}

// Build the polyline points string for a confidence history series.
export function confidencePolyline(history: number[], v: VizLayout = VIEW): string {
  if (history.length === 0) return ""
  const n = history.length
  const usable = v.width - 2 * v.padX
  return history
    .map((c, i) => {
      const x = v.padX + (n === 1 ? 0 : (i / (n - 1)) * usable)
      const y = v.bandY + v.bandH - Math.max(2, Math.min(1, c) * v.bandH)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

export interface FumbleMarker {
  index: number        // reference index where it was detected
  kind: "wrong" | "skip" | "hesitation"
  label: string
  ageMs: number        // for fade-out
}

// Human color per fumble kind (rose for wrong, amber for skip, violet for hesitation).
export function fumbleColor(kind: FumbleMarker["kind"]): string {
  if (kind === "wrong") return "#fb7185"     // rose
  if (kind === "skip") return "#fbbf24"      // amber
  return "#c4b5fd"                            // violet (hesitation)
}
