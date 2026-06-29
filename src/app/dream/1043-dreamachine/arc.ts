// ════════════════════════════════════════════════════════════════════════════
// arc.ts — the ~5-minute slow journey. State + memory, not a loop.
//
// One timeline drives everything so minute 5 ≠ minute 1. Soft transitions only.
//   onset    -> still, faint field, no pulse
//   come-up  -> drift begins, pulse depth fades in, drone warms
//   plateau  -> gentle alpha-paced pulse + drone swell (the deepest stretch)
//   return   -> pulse slows + fades, settles to a calm steady field
//
// All values are 0..1 weights the page maps onto field brightness, pulse depth,
// pulse rate (still ≤3 Hz), audio gain, and the form-constant hint opacity.
// ════════════════════════════════════════════════════════════════════════════

export type ArcState = {
  label: string;
  progress: number; // 0..1 of the whole arc (does not loop; clamps at end)
  fieldLift: number; // 0..1 baseline field brightness lift
  pulseDepth: number; // 0..1 -> scales flicker contrast (still capped in flicker.ts)
  pulseRate01: number; // 0..1 -> page maps onto MIN..user rate (≤3 Hz)
  drone: number; // 0..1 audio swell
  hint: number; // 0..1 form-constant scaffold opacity
};

export const ARC_SECONDS = 330; // ~5.5 minutes

type Key = {
  name: string;
  at: number; // 0..1 position
  field: number;
  depth: number;
  rate: number;
  drone: number;
  hint: number;
};

const KEYS: Key[] = [
  { name: "Onset", at: 0.0, field: 0.18, depth: 0.0, rate: 0.0, drone: 0.0, hint: 0.0 },
  { name: "Come-up", at: 0.16, field: 0.42, depth: 0.35, rate: 0.4, drone: 0.55, hint: 0.18 },
  { name: "Plateau", at: 0.42, field: 0.6, depth: 1.0, rate: 1.0, drone: 1.0, hint: 0.5 },
  { name: "Plateau", at: 0.7, field: 0.58, depth: 0.92, rate: 0.85, drone: 0.95, hint: 0.45 },
  { name: "Return", at: 0.9, field: 0.4, depth: 0.3, rate: 0.3, drone: 0.5, hint: 0.15 },
  { name: "Stillness", at: 1.0, field: 0.22, depth: 0.0, rate: 0.0, drone: 0.18, hint: 0.0 },
];

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Compute the arc state at elapsed seconds. Clamps at the end (no loop). */
export function computeArc(elapsedSeconds: number): ArcState {
  const progress = Math.min(1, Math.max(0, elapsedSeconds / ARC_SECONDS));

  let lo = KEYS[0];
  let hi = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (progress >= KEYS[i].at && progress <= KEYS[i + 1].at) {
      lo = KEYS[i];
      hi = KEYS[i + 1];
      break;
    }
  }
  const span = Math.max(hi.at - lo.at, 1e-6);
  const local = smooth((progress - lo.at) / span);
  const mix = (a: number, b: number) => a + (b - a) * local;

  return {
    label: local < 0.5 ? lo.name : hi.name,
    progress,
    fieldLift: mix(lo.field, hi.field),
    pulseDepth: mix(lo.depth, hi.depth),
    pulseRate01: mix(lo.rate, hi.rate),
    drone: mix(lo.drone, hi.drone),
    hint: mix(lo.hint, hi.hint),
  };
}
