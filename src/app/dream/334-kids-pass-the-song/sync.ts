// sync.ts — the shared song + the serverless turn-passing protocol.
//
// Two children, two tabs, ONE song. A friendly creature lives on one screen at
// a time. The tab that "holds" the creature is the active turn; it adds one
// note-bead, then flings the creature across a BroadcastChannel to the other
// tab, which receives it and becomes the active turn. No server, no network —
// just same-origin tabs gossiping over `resonance-pass-the-song-334`.
//
// Lineage: the lab's 319-hub-score wrote its own BroadcastChannel roster/field
// protocol; this is a sibling pattern, simpler and turn-based instead of a
// continuous shared drone. (We do NOT import it — own protocol here.)

// ── The scale: a D-rooted major (Ionian) over an always-on D drone ───────────
// Deliberately NOT C-major-pentatonic. Seven warm scale degrees of D major:
//   D  E  F#  G#?  no — true D major is D E F# G A B C#. We use the bright
//   diatonic set so any sung/tapped note lands "in the song", never "wrong".
// Frequencies are D4-rooted (294 Hz) so it sits sweetly for small voices.
export const D_ROOT_HZ = 293.66; // D4

// Semitone offsets of D major from the D root: D E F# G A B C# (+octave D).
const D_MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12] as const;

/** Hz of each scale degree (index 0..7). */
export const SCALE_HZ: number[] = D_MAJOR_SEMITONES.map(
  (s) => D_ROOT_HZ * Math.pow(2, s / 12)
);

/** A bold, saturated hue per scale degree — colour is the language. */
export const DEGREE_HUE: number[] = [
  265, // D  violet
  210, // E  blue
  175, // F# teal
  140, // G  green
  55, //  A  yellow
  30, //  B  orange
  350, // C# rose-red
  300, // D' magenta
];

export const SCALE_LEN = SCALE_HZ.length;

/** Snap a detected frequency (Hz) to the nearest scale-degree index.
 *  Octave-folds so a child humming high or low still lands on a degree. */
export function snapToDegree(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return 0;
  let best = 0;
  let bestCents = Infinity;
  for (let i = 0; i < SCALE_LEN; i++) {
    // distance in cents, octave-folded onto the playable register
    const ratio = hz / SCALE_HZ[i];
    const semis = 12 * Math.log2(ratio);
    const folded = ((semis % 12) + 12) % 12; // 0..12
    const cents = Math.min(folded, 12 - folded) * 100;
    if (cents < bestCents) {
      bestCents = cents;
      best = i;
    }
  }
  return best;
}

// ── The shared song ──────────────────────────────────────────────────────────
/** One turn's contribution. `by` lets us colour beads by who added them. */
export interface Bead {
  degree: number; // index into SCALE_HZ
  by: "me" | "friend" | "robot";
}

/** Whole shared state passed between tabs. `rev` lets a late joiner reconcile. */
export interface SongState {
  beads: Bead[];
  holder: string; // id of the tab whose turn it is (or "" / a robot marker)
  fromEdge: "left" | "right" | null; // which edge the creature flew in from
  rev: number;
}

// ── Identity ─────────────────────────────────────────────────────────────────
export function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Messages over the channel ────────────────────────────────────────────────
export type Msg =
  | { t: "ping"; id: string } // "is anyone there?" presence
  | { t: "pong"; id: string } // "yes, I'm here"
  | { t: "pass"; id: string; to: string; state: SongState } // creature flies to `to`
  | { t: "bye"; id: string };

export const CHANNEL_NAME = "resonance-pass-the-song-334";

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
