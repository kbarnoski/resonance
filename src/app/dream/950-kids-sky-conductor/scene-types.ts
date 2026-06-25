// scene-types.ts — the render state shared by the WebGPU and WebGL2 renderers.
// Both renderers paint the SAME scene from this state, so the experience is
// identical whichever GPU path is available.

export type Bloom = {
  x: number // 0..1 screen x
  y: number // 0..1 screen y (top = 0)
  age: number // 1 = fresh .. 0 = gone (remaining life)
  bright: number // brightness (self taps brighter than friend's)
}

export type SkyState = {
  time: number // seconds
  hue: [number, number, number] // current chord color (linear-ish rgb 0..1)
  pulse: number // 0..1 tempo intensity (drives shimmer strength)
  beatPhase: number // 0..1 position within the current beat (sweeps the band)
  blooms: Bloom[] // active player note-blooms (most recent first, capped)
}

// Common renderer interface so the page can hold either path uniformly.
export interface SkyRenderer {
  readonly kind: 'webgpu' | 'webgl2'
  render(state: SkyState): void
  resize(): void
  dispose(): void
}

// Map a chord hue (0..1) to a warm, candy RGB the sky washes with.
// Mirrors the palette feel of the lab's other kids prototypes.
export function chordHueToRgb(hue: number): [number, number, number] {
  // four warm anchors matching the I–IV–V–vi progression colors
  // gold -> rose -> cyan -> violet, blended smoothly around the wheel.
  const stops: Array<[number, [number, number, number]]> = [
    [0.08, [1.0, 0.78, 0.42]], // gold
    [0.55, [0.5, 0.86, 0.96]], // cyan
    [0.72, [0.72, 0.6, 1.0]], // violet
    [0.95, [1.0, 0.5, 0.62]], // rose
  ]
  // find nearest two stops by hue distance on a circle and lerp
  let bestA = stops[0]
  let bestB = stops[1]
  let bestDA = 2
  let bestDB = 2
  for (const s of stops) {
    let d = Math.abs(s[0] - hue)
    d = Math.min(d, 1 - d)
    if (d < bestDA) {
      bestDB = bestDA
      bestB = bestA
      bestDA = d
      bestA = s
    } else if (d < bestDB) {
      bestDB = d
      bestB = s
    }
  }
  const total = bestDA + bestDB || 1
  const w = bestDA / total // closer stop gets more weight
  const lerp = (a: number, b: number) => a * (1 - w) + b * w
  return [
    lerp(bestA[1][0], bestB[1][0]),
    lerp(bestA[1][1], bestB[1][1]),
    lerp(bestA[1][2], bestB[1][2]),
  ]
}
