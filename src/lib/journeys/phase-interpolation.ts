import type { JourneyPhase, JourneyPhaseId } from "./types";

/** Ease-in-out cubic for smooth transitions */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Cross-fade overlap zone as a fraction of phase duration (10%) */
const CROSSFADE_FRACTION = 0.1;

/**
 * Get the current phase index and cross-fade blend factor.
 * During the overlap zone at phase boundaries, returns both current and next phase
 * with a blend factor (0 = fully current, 1 = fully next).
 */
export function getPhaseBlend(
  progress: number,
  phases: JourneyPhase[]
): { phaseIndex: number; nextPhaseIndex: number | null; blend: number } {
  const clamped = clamp(progress, 0, 1);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (clamped >= phase.start && clamped < phase.end) {
      const phaseDuration = phase.end - phase.start;
      const crossfadeWidth = phaseDuration * CROSSFADE_FRACTION;

      // Check if we're in the crossfade zone at the end of this phase
      if (i < phases.length - 1 && clamped > phase.end - crossfadeWidth) {
        const fadeProgress = (clamped - (phase.end - crossfadeWidth)) / crossfadeWidth;
        return {
          phaseIndex: i,
          nextPhaseIndex: i + 1,
          blend: easeInOutCubic(clamp(fadeProgress, 0, 1)),
        };
      }

      return { phaseIndex: i, nextPhaseIndex: null, blend: 0 };
    }
  }

  // Past the end — return last phase
  return { phaseIndex: phases.length - 1, nextPhaseIndex: null, blend: 0 };
}

/**
 * Interpolate a numeric property between two phases.
 */
export function interpolateValue(
  phases: JourneyPhase[],
  phaseIndex: number,
  nextPhaseIndex: number | null,
  blend: number,
  getter: (phase: JourneyPhase) => number
): number {
  const current = getter(phases[phaseIndex]);
  if (nextPhaseIndex === null || blend === 0) return current;
  const next = getter(phases[nextPhaseIndex]);
  return lerp(current, next, blend);
}

/**
 * Get the progress within the current phase (0-1).
 */
export function getPhaseProgress(progress: number, phase: JourneyPhase): number {
  const phaseDuration = phase.end - phase.start;
  if (phaseDuration <= 0) return 0;
  return clamp((progress - phase.start) / phaseDuration, 0, 1);
}

/**
 * Map an audio feature (0-1) to a denoising strength within a phase's range.
 */
export function mapAudioToDenoising(
  bassValue: number,
  denoisingRange: [number, number]
): number {
  const [min, max] = denoisingRange;
  return lerp(min, max, clamp(bassValue, 0, 1));
}

/**
 * Interpolate between two color palettes.
 */
export function interpolatePalette(
  paletteA: { primary: string; secondary: string; accent: string; glow: string },
  paletteB: { primary: string; secondary: string; accent: string; glow: string },
  t: number
): { primary: string; secondary: string; accent: string; glow: string } {
  if (t === 0) return paletteA;
  if (t === 1) return paletteB;

  return {
    primary: lerpColor(paletteA.primary, paletteB.primary, t),
    secondary: lerpColor(paletteA.secondary, paletteB.secondary, t),
    accent: lerpColor(paletteA.accent, paletteB.accent, t),
    glow: lerpColor(paletteA.glow, paletteB.glow, t),
  };
}

/** Linearly interpolate between two hex colors */
function lerpColor(colorA: string, colorB: string, t: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  if (!a || !b) return colorA;

  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const bl = Math.round(lerp(a.b, b.b, t));

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

/** Phase IDs in order for display */
export const PHASE_ORDER: JourneyPhaseId[] = [
  "threshold",
  "expansion",
  "transcendence",
  "illumination",
  "return",
  "integration",
];
