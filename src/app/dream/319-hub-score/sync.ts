// sync.ts — serverless shared state for the Hub score.
//
// Two ideas live here:
//   1. The wall clock IS the conductor's baton. `globalPhase()` is a pure
//      function of Date.now() that returns a 0..1 phase over a slow cycle.
//      Every same-origin tab evaluating it at the same instant gets the same
//      value, so all voices breathe on one synchronized swell with no
//      clock-sync handshake at all.
//   2. A BroadcastChannel ("resonance-hub-score-319") carries presence
//      (roster), each tab's chosen voice, the shared harmony field, and the
//      conductor (baton) claim. No server, no network writes.

// ── The just-intonation harmony field ───────────────────────────────────────
// JI ratios over a D root. ABSOLUTELY not C-major-pentatonic — these are the
// pure-ratio degrees of a D-rooted set (unison, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5,
// octave). D-Dorian colour realized as just intonation.
export const D_ROOT_HZ = 146.832; // D3

export const JI_RATIOS = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5, 2] as const;
export const JI_LABELS = ["1/1", "9/8", "6/5", "4/3", "3/2", "8/5", "9/5", "2/1"] as const;

// A "chord" in the field = which degrees of JI_RATIOS are currently active.
// The conductor steps the field through a slow modal progression of these.
export const CHORD_PROGRESSION: number[][] = [
  [0, 2, 4], //  D  F  A    — i  (D-minor triad, JI)
  [1, 3, 5], //  E  G  C... — supertonic colour
  [0, 3, 6], //  D  G  C    — sus / quartal lean
  [2, 4, 7], //  F  A  D'   — relative-major brightness
  [0, 2, 5], //  D  F  Bb-ish (8/5) — Dorian 6 glow
];

export interface HarmonyField {
  chordIndex: number; // index into CHORD_PROGRESSION
  octave: number; // -1, 0, or +1 — global register shift
  brightness: number; // 0..1 → per-voice lowpass cutoff
  density: number; // 0..1 → partial count / overall presence
  rev: number; // revision counter so late joiners can reconcile
}

export const DEFAULT_FIELD: HarmonyField = {
  chordIndex: 0,
  octave: 0,
  brightness: 0.45,
  density: 0.5,
  rev: 0,
};

// ── Wall-clock global phase (the baton) ──────────────────────────────────────
export const BREATH_CYCLE_MS = 30_000; // one slow breath ≈ 30 s

/** 0..1 phase of the shared breath, derived purely from the wall clock. */
export function globalPhase(now = Date.now()): number {
  return (now % BREATH_CYCLE_MS) / BREATH_CYCLE_MS;
}

/** Slow breathing gain envelope (raised cosine) for a voice, given a per-voice
 *  phase offset so the ensemble swells in a staggered, overlapping wash. */
export function breathGain(phase: number, offset: number): number {
  const p = (phase + offset) % 1;
  // raised cosine: 0 at the troughs, 1 at the crest — gentle, never silent floor.
  return 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(p * Math.PI * 2));
}

// ── Identity + colour ────────────────────────────────────────────────────────
export function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Stable hue from an id string (golden-angle scatter for spread). */
export function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return (h * 137.508) % 360;
}

// ── Roster + messages ────────────────────────────────────────────────────────
export interface Voice {
  id: string;
  degree: number; // index into JI_RATIOS (which chord-tone this tab sings)
  hue: number;
  lastSeen: number;
  isGhost?: boolean;
}

export type Msg =
  | { t: "hello"; id: string }
  | { t: "welcome"; id: string; degree: number; hue: number; field: HarmonyField }
  | { t: "voice"; id: string; degree: number; hue: number }
  | { t: "field"; id: string; field: HarmonyField }
  | { t: "conductor"; id: string; at: number }
  | { t: "heartbeat"; id: string; degree: number; hue: number }
  | { t: "leave"; id: string };

export const CHANNEL_NAME = "resonance-hub-score-319";
export const HEARTBEAT_MS = 2_000;
export const PRUNE_MS = 5_000;

/** Returns a BroadcastChannel, or null if the browser lacks it. */
export function openChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}
