// ════════════════════════════════════════════════════════════════════════════
// Journey arc for 1047-tracer-drift.
//
// One global timeline (~4 min, then loops) modelled on an LSD come-up. Unlike a
// peak-centred trip arc, the *plateau* is the long weightless middle — so we
// dwell there. Everything blends; nothing switches.
//
//   Onset    -> clear, faint snow, short trails
//   Come-up  -> trails lengthen, breathing warp grows, colour drifts apart
//   Plateau  -> long luminous tracers, slow moire, the weightless middle (LONG)
//   Return   -> trails shorten, snow fades, colour re-converges
//
// `intensity` 0..1 is the master come-up parameter (REBUS / entropic-brain:
// relaxed priors -> drifting reorganisation, Carhart-Harris). Visual modules
// read it for trail length, warp amplitude, colour spread and snow.
// ════════════════════════════════════════════════════════════════════════════

export type ArcState = {
  label: string;
  intensity: number; // 0..1 master come-up
  progress: number; // 0..1 of the full loop
};

const ARC_SECONDS = 240; // ~4 minutes, then loops

// Keyframes: `at` is fraction of the loop, `v` is intensity there.
// The plateau (0.40 -> 0.78) is deliberately wide and held high.
const KEYS: { name: string; at: number; v: number }[] = [
  { name: "Onset", at: 0.0, v: 0.06 },
  { name: "Come-up", at: 0.22, v: 0.55 },
  { name: "Plateau", at: 0.4, v: 0.92 },
  { name: "Plateau", at: 0.78, v: 0.86 },
  { name: "Return", at: 0.94, v: 0.12 },
  { name: "Onset", at: 1.0, v: 0.06 },
];

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function computeArc(elapsedSeconds: number): ArcState {
  const progress = (elapsedSeconds % ARC_SECONDS) / ARC_SECONDS;

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
  const local = smoothstep((progress - lo.at) / span);
  const intensity = lo.v + (hi.v - lo.v) * local;
  const label = local < 0.5 ? lo.name : hi.name;

  return { label, intensity, progress };
}
