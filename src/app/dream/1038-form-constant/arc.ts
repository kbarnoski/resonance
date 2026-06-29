// ════════════════════════════════════════════════════════════════════════════
// Journey arc / entropy controller.
//
// One global 0..1 `entropy` parameter following a ~5-minute arc inspired by the
// entropic-brain / REBUS framing (Carhart-Harris). Everything is smooth; phases
// blend rather than switch.
//   Onset       -> low entropy, faint breathing
//   Come-up     -> drift/trails emerge, warmth rises
//   Peak        -> entropy max: fold bloom, symmetry loosens, saturation peaks
//   Plateau     -> slower morph, held high
//   Return      -> symmetry re-forms, entropy decays to calm
// ════════════════════════════════════════════════════════════════════════════

export type ArcPhase = {
  label: string;
  entropy: number; // 0..1
  progress: number; // 0..1 of full arc
};

const ARC_SECONDS = 300; // ~5 minutes

const PHASES: { name: string; at: number; e: number }[] = [
  { name: "Onset", at: 0.0, e: 0.05 },
  { name: "Come-up", at: 0.18, e: 0.4 },
  { name: "Peak", at: 0.45, e: 1.0 },
  { name: "Plateau", at: 0.68, e: 0.82 },
  { name: "Return", at: 0.9, e: 0.12 },
  { name: "Calm", at: 1.0, e: 0.05 },
];

function smooth(t: number): number {
  return t * t * (3 - 2 * t); // smoothstep
}

// Compute the smoothly-interpolated entropy + label for elapsed seconds.
// The arc loops so an unattended demo keeps breathing forever.
export function computeArc(elapsedSeconds: number): ArcPhase {
  const progress = (elapsedSeconds % ARC_SECONDS) / ARC_SECONDS;

  let lo = PHASES[0];
  let hi = PHASES[PHASES.length - 1];
  for (let i = 0; i < PHASES.length - 1; i++) {
    if (progress >= PHASES[i].at && progress <= PHASES[i + 1].at) {
      lo = PHASES[i];
      hi = PHASES[i + 1];
      break;
    }
  }
  const span = Math.max(hi.at - lo.at, 1e-6);
  const local = smooth((progress - lo.at) / span);
  const entropy = lo.e + (hi.e - lo.e) * local;

  // label is the nearer named phase
  const label = local < 0.5 ? lo.name : hi.name;

  return { label, entropy, progress };
}
