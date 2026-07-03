/**
 * field.ts — pure geometry for the Enigma / peripheral-drift field.
 *
 * The illusion (Leviant, *Enigma*, 1981) is composed from two static layers:
 *
 *   1. A high-contrast RADIAL SPOKE GRATING — alternating black / paper
 *      angular sectors radiating from the centre. This fine, high-contrast
 *      structure is what the visual system's involuntary microsaccades act
 *      on (Troncoso, Macknik & Martinez-Conde, PNAS 2008).
 *
 *   2. Semi-transparent concentric COLOURED ANNULI laid over the grating.
 *      The colour lets you *localise* the streaming; the crossing spokes
 *      supply the contrast energy that makes the band appear to flow.
 *
 * Nothing here animates. All motion is perceptual. (A separate, sub-pixel
 * position drift is applied in the page for microsaccade-like seeding, kept
 * well under 3 Hz — see SAFETY in the README.)
 */

export const VIEW = 600;
export const CENTER = VIEW / 2;
export const MAX_R = 286;
export const MIN_R = 34;

/** Four saturated Op-art hues, cycled outward through the annuli. */
const HUES = [190, 320, 265, 40]; // cyan, magenta, violet, amber

export type Wedge = { d: string };
export type Ring = { r: number; color: string; width: number };

/**
 * Build the alternating black angular sectors of the radial grating.
 * `pairs` is the number of black/paper cycles around the circle; we emit
 * one filled black wedge per cycle (the paper shows between them).
 */
export function buildWedges(pairs: number): Wedge[] {
  const sectors = pairs * 2;
  const step = (Math.PI * 2) / sectors;
  const wedges: Wedge[] = [];
  for (let i = 0; i < sectors; i += 2) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    const x0 = CENTER + Math.cos(a0) * MAX_R;
    const y0 = CENTER + Math.sin(a0) * MAX_R;
    const x1 = CENTER + Math.cos(a1) * MAX_R;
    const y1 = CENTER + Math.sin(a1) * MAX_R;
    // Wedge from centre out to the rim; large-arc flag 0 (sectors are small).
    wedges.push({
      d: `M ${CENTER} ${CENTER} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${MAX_R} ${MAX_R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`,
    });
  }
  return wedges;
}

/**
 * Build the concentric coloured annuli.
 * @param count       number of rings
 * @param saturation  0..1 — drives colour alpha + chroma
 */
export function buildRings(count: number, saturation: number): Ring[] {
  const rings: Ring[] = [];
  const span = MAX_R - MIN_R;
  // Slightly narrower bands than the gaps read as crisper Op-art.
  const width = Math.max(6, (span / count) * 0.62);
  const alpha = 0.32 + saturation * 0.42; // 0.32 .. 0.74
  const light = 62 - saturation * 10; // more saturation -> a touch deeper
  const sat = 70 + saturation * 26; // 70% .. 96%
  for (let k = 0; k < count; k++) {
    const t = count === 1 ? 0.5 : k / (count - 1);
    const r = MIN_R + t * span;
    const hue = HUES[k % HUES.length];
    rings.push({
      r,
      width,
      color: `hsla(${hue}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, ${alpha.toFixed(3)})`,
    });
  }
  return rings;
}
