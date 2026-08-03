// ─────────────────────────────────────────────────────────────────────────────
// 5816-astrolabe · the pitch-sphere
//
// Dozens of "stars" laid across the celestial sphere, each one a resonant
// pitch. The layout is deliberately legible as an instrument, the way an
// astrolabe's engraved plate is legible as a map of the sky:
//
//   ELEVATION (tilt up / down)  →  OCTAVE.  Higher on the sphere = higher ring.
//   AZIMUTH   (tilt left / right) →  SCALE DEGREE within that octave.
//
// The scale is a six-note JUST-INTONED set — pure whole-number frequency
// ratios, so any path the beam sweeps sounds consonant. Rings are stacked in
// perfect octaves and given a small golden-angle azimuth twist so the columns
// spiral rather than stack into a rigid grid.
// ─────────────────────────────────────────────────────────────────────────────

export interface Star {
  /** Unit direction on the celestial sphere (camera sits at the centre). */
  dir: [number, number, number];
  /** Pitch in Hz. */
  freq: number;
  /** 0 = lowest octave-ring … RINGS-1 = highest. */
  ring: number;
  /** 0 … DEGREES-1 scale degree within the ring. */
  degree: number;
  /** Ascending index across the whole sphere (drives melodic ordering). */
  order: number;
}

// Just-intonation ratios — a warm hexatonic set (no tense leading tone).
const JUST_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3];
const DEGREES = JUST_RATIOS.length; // 6
const RINGS = 5; // five stacked octaves
const BASE_FREQ = 130.81; // C3

const GOLDEN_ANGLE = 2.399963229728653; // rad — per-ring azimuth twist
const TWO_PI = Math.PI * 2;

const RING_SPAN: number = RINGS - 1;

/** Elevation (radians) of a ring, spread from low south to high north. */
function ringElevation(ring: number): number {
  const t = RING_SPAN === 0 ? 0.5 : ring / RING_SPAN; // 0..1
  const maxEl = 1.02; // ~58° — stays clear of the poles (no gimbal snap)
  return (t * 2 - 1) * maxEl;
}

/** Build the full set of pitch-stars. Deterministic — no RNG needed here. */
export function buildStars(): Star[] {
  const stars: Star[] = [];
  let order = 0;
  for (let ring = 0; ring < RINGS; ring++) {
    const el = ringElevation(ring);
    const cosEl = Math.cos(el);
    const sinEl = Math.sin(el);
    const twist = ring * GOLDEN_ANGLE;
    for (let d = 0; d < DEGREES; d++) {
      const az = (d / DEGREES) * TWO_PI + twist;
      const dir: [number, number, number] = [
        Math.sin(az) * cosEl,
        sinEl,
        Math.cos(az) * cosEl,
      ];
      const freq = BASE_FREQ * Math.pow(2, ring) * JUST_RATIOS[d];
      stars.push({ dir, freq, ring, degree: d, order: order++ });
    }
  }
  return stars;
}

export const STAR_COUNT = RINGS * DEGREES;
export { RINGS, DEGREES };
