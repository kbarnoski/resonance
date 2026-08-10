// ─────────────────────────────────────────────────────────────────────────────
// 9304-passage · timeline.ts — the single source of truth for the archetypal
// PASSAGE arc. One pure function maps journey-seconds → a bundle of 0..1 fields
// that BOTH the visual bloom and the binaural audio engine read, so the two
// streams stay locked to the same phase clock.
//
// The arc (total ≈ 4:45) has MEMORY — minute 4 does not sound or look like
// minute 1:
//   threshold  (0–42s)    dark, sparse, distant — a held breath at the edge.
//   tunnel     (42–150s)  voices stream past, the approach accelerates.
//   light      (150–214s) a warm centre bloom grows widest and brightest.
//   clarity    (214–238s) the lucid snap — everything impossibly clear/consonant.
//   return     (238–285s) warm, settled, resolving toward rest.
//
// No randomness lives here (timing only); the engine owns the seeded RNG.
// ─────────────────────────────────────────────────────────────────────────────

export const PASSAGE_SECONDS = 285;

export type PassagePhase =
  | "threshold"
  | "tunnel"
  | "light"
  | "clarity"
  | "return";

export interface PassageField {
  phase: PassagePhase;
  /** Human label for the faint on-screen tag, e.g. "the tunnel". */
  phaseLabel: string;
  /** Overall arc position 0..1 for the thin progress line. */
  progress: number;
  /** Centre-bloom intensity 0..1 (visual glow + audio additive partials). */
  bloom: number;
  /** Crispness 0..1 — low = blurred/dim, high = the clarity-snap sharpness. */
  bloomSharp: number;
  /** Forward motion / voice density 0..1. */
  speed: number;
  /** Colour temperature 0..1 (cool threshold → warm peak). */
  warmth: number;
  /** The lucid snap bump 0..1 — a smooth gaussian, never a flash. */
  clarity: number;
  /** True once the journey has fully returned. */
  done: boolean;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Hermite smoothstep from a→b. */
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** A smooth gaussian bump centred at `c` with half-width `w`. */
function bump(c: number, w: number, x: number): number {
  const d = (x - c) / w;
  return Math.exp(-d * d);
}

const CLARITY_CENTER = 226;

const LABELS: Record<PassagePhase, string> = {
  threshold: "the threshold",
  tunnel: "the tunnel",
  light: "the light",
  clarity: "clarity",
  return: "the return",
};

function phaseAt(t: number): PassagePhase {
  if (t < 42) return "threshold";
  if (t < 150) return "tunnel";
  if (t < 214) return "light";
  if (t < 238) return "clarity";
  return "return";
}

/** Evaluate the whole arc at journey-time `t` (seconds). Pure + deterministic. */
export function evalPassage(t: number): PassageField {
  const phase = phaseAt(t);

  const clarity = clamp01(bump(CLARITY_CENTER, 9, t));
  const ret = smoothstep(240, PASSAGE_SECONDS, t);

  // Bloom: builds through the tunnel, peaks in the light, spikes at the snap,
  // then resolves (does not stay pinned) through the return.
  let bloom =
    smoothstep(38, 150, t) * 0.5 + smoothstep(150, 208, t) * 0.38;
  bloom += clarity * 0.15;
  bloom *= 1 - ret * 0.62;
  bloom = clamp01(bloom);

  // Speed: accelerates through the tunnel, suspends at the snap, gentle return.
  let speed = 0.12 + smoothstep(42, 150, t) * 0.78;
  speed *= 1 - bump(CLARITY_CENTER, 12, t) * 0.7;
  speed *= 1 - ret * 0.55;
  speed = clamp01(speed);

  const warmth = clamp01(
    0.18 + smoothstep(60, 210, t) * 0.72 - smoothstep(250, PASSAGE_SECONDS, t) * 0.15,
  );

  const bloomSharp = clamp01(
    0.15 +
      smoothstep(150, 205, t) * 0.4 +
      clarity * 0.5 -
      smoothstep(252, PASSAGE_SECONDS, t) * 0.2,
  );

  return {
    phase,
    phaseLabel: LABELS[phase],
    progress: clamp01(t / PASSAGE_SECONDS),
    bloom,
    bloomSharp,
    speed,
    warmth,
    clarity,
    done: t >= PASSAGE_SECONDS,
  };
}

/** A gentle resting field for the muted auto-run (alive on load, no arc). */
export function ambientField(ts: number): PassageField {
  const b =
    0.22 + 0.1 * Math.sin(ts * 0.35) + 0.04 * Math.sin(ts * 0.11 + 1.3);
  return {
    phase: "threshold",
    phaseLabel: "the threshold · resting",
    progress: 0,
    bloom: clamp01(b),
    bloomSharp: 0.32,
    speed: 0.2,
    warmth: 0.34 + 0.05 * Math.sin(ts * 0.2),
    clarity: 0,
    done: false,
  };
}
