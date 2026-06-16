// harmony.ts — the harmonic engine
//
// CORE TECHNIQUE: pedal/drone migration + functional recontextualization.
// The pads play FIXED pitches. Underneath, a slow drone migrates its tonal
// center through a heroic-modal cycle. Because the pads stay put while the
// root moves, each pad's RELATIONSHIP to the drone changes over time:
// a tap that was "home" becomes "tense", then "resolving".
//
// This is deliberately NOT a pentatonic / no-wrong-notes scale-snap. The
// same fixed note is heard against different roots so its harmonic FUNCTION
// shifts. There is no "wrong", only changing colour.

// ── Fixed pad pitches (Hz). A spread of an A natural-minor-ish field. ──
// A2  C3   E3    A3    C4     E4
// These never change. Their MEANING changes as the root migrates beneath.
export const PAD_HZ: number[] = [
  110.0, // A2
  130.81, // C3
  164.81, // E3
  220.0, // A3
  261.63, // C4
  329.63, // E4
];

export const PAD_COUNT = PAD_HZ.length;

// ── The drone migration cycle (heroic modal) ──────────────────────────
// Roots, expressed as semitone offsets from the home pedal A (110 Hz / A2).
// i (A)  →  bVI (F)  →  bVII (G)  →  i (A)
// This i–bVI–bVII–i is the classic "brave / mysterious / coming home" loop
// (think the Aeolian rock-anthem cadence). Each step lasts a long beat so a
// child hears the floor slide.
export interface DroneStep {
  name: string; // human label (never gating)
  feel: string; // "brave" | "mysterious" | "home"
  semis: number; // root offset from A in semitones
  // visual root hue (degrees) — deep field colour for this key
  hue: number;
  // 0..1 "warmth": only the home resolution drifts toward warm amber
  warmth: number;
}

export const DRONE_CYCLE: DroneStep[] = [
  // i — A minor pedal. The starting ground: adventurous, awake.
  { name: "home key", feel: "home", semis: 0, hue: 200, warmth: 0.85 },
  // bVI — F. Lifts to a bright/brave major-ish colour beneath fixed notes.
  { name: "brave", feel: "brave", semis: -4, hue: 255, warmth: 0.18 },
  // bVII — G. The mysterious step, leaning, unresolved, wants to fall home.
  { name: "mysterious", feel: "mysterious", semis: -2, hue: 165, warmth: 0.1 },
  // back to i — A. Resolution, the "home" glow returns warm.
  { name: "home key", feel: "home", semis: 0, hue: 200, warmth: 0.85 },
];

// Home pedal frequency (A2). Roots are derived from this by semitone offset.
export const HOME_ROOT_HZ = 110.0;

export const STEP_SECONDS = 18; // ~16–22s per migration step

export function semisToHz(baseHz: number, semis: number): number {
  return baseHz * Math.pow(2, semis / 12);
}

// Continuous position (0..DRONE_CYCLE.length) at a given elapsed time.
export function cyclePosition(elapsed: number): number {
  const total = DRONE_CYCLE.length * STEP_SECONDS;
  const t = ((elapsed % total) + total) % total;
  return t / STEP_SECONDS;
}

// Interpolated root frequency of the migrating drone (glides between steps).
export function rootHzAt(elapsed: number): number {
  const pos = cyclePosition(elapsed);
  const i0 = Math.floor(pos) % DRONE_CYCLE.length;
  const i1 = (i0 + 1) % DRONE_CYCLE.length;
  const frac = pos - Math.floor(pos);
  // smoothstep glide so the slide feels organic, not a sudden jump
  const s = frac * frac * (3 - 2 * frac);
  const a = DRONE_CYCLE[i0].semis;
  const b = DRONE_CYCLE[i1].semis;
  const semis = a + (b - a) * s;
  return semisToHz(HOME_ROOT_HZ, semis);
}

// Current (nearest) step — used for labels & target visuals.
export function nearestStep(elapsed: number): DroneStep {
  const pos = cyclePosition(elapsed);
  const i = Math.round(pos) % DRONE_CYCLE.length;
  return DRONE_CYCLE[i];
}

// Interpolated visual fields (hue + warmth) for the deep, gliding smoothly.
export interface DeepLook {
  hue: number;
  warmth: number;
  feel: string;
}

export function deepLookAt(elapsed: number): DeepLook {
  const pos = cyclePosition(elapsed);
  const i0 = Math.floor(pos) % DRONE_CYCLE.length;
  const i1 = (i0 + 1) % DRONE_CYCLE.length;
  const frac = pos - Math.floor(pos);
  const s = frac * frac * (3 - 2 * frac);
  const a = DRONE_CYCLE[i0];
  const b = DRONE_CYCLE[i1];
  // shortest-path hue interp
  let dh = b.hue - a.hue;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const hue = (a.hue + dh * s + 360) % 360;
  const warmth = a.warmth + (b.warmth - a.warmth) * s;
  const feel = frac < 0.5 ? a.feel : b.feel;
  return { hue, warmth, feel };
}

// ── Functional recontextualization readout ────────────────────────────
// For a fixed pad note against the *current* migrating root, classify the
// interval as home / lift / tension. Drives a gentle per-pad glow tint so
// a child SEES the same pad change meaning as the floor slides.
// 0 = stable/home, 0.5 = lift/colour, 1 = gentle tension (never harsh).
export function padTension(padHz: number, rootHz: number): number {
  const ratio = padHz / rootHz;
  // reduce to within an octave
  let r = ratio;
  while (r >= 2) r /= 2;
  while (r < 1) r *= 2;
  const semis = Math.round(12 * Math.log2(r)) % 12;
  // consonance map (relative to current root): unison/5th/4th/3rds = home/lift,
  // 2nd/tritone/7th = gentle tension.
  const table: Record<number, number> = {
    0: 0.0, // unison — home
    7: 0.05, // P5 — home
    5: 0.15, // P4 — near-home
    4: 0.3, // M3 — bright lift
    3: 0.3, // m3 — lift
    9: 0.4, // M6 — colour
    8: 0.45, // m6 — colour
    2: 0.7, // M2 — gentle tension
    10: 0.7, // m7 — gentle tension
    11: 0.85, // M7 — leaning tension
    1: 0.9, // m2 — most tension (still gentle in mix)
    6: 0.95, // tritone — mysterious tension
  };
  return table[semis] ?? 0.5;
}
