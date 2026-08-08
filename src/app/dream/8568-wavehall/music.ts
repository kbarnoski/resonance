// ─────────────────────────────────────────────────────────────────────────────
// music.ts — the pitch language + the antiphonal RESPONSE grammar.
//
// Six keys (A S D F G H) each cast one pitch of an EQUAL-TEMPERED hexatonic
// set (minor-pentatonic + octave over 12-TET). No just intonation, no drone.
// A partner ANSWERS a call by TRANSFORMING it — transpose / retrograde /
// invert / ornament — so the reply is a genuine response, never a verbatim
// echo. All randomness is a seeded mulberry32 (NO Math.random anywhere).
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — hand-written, seeded. Never Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Base pitch (A3) and the equal-tempered scale degrees mapped to A S D F G H. */
export const BASE_FREQ = 220;
export const SCALE_SEMIS = [0, 3, 5, 7, 10, 12] as const; // minor pentatonic + 8ve
export const KEY_ORDER = ["a", "s", "d", "f", "g", "h"] as const;

/** semitone → frequency in 12-TET. */
export function semiToFreq(semi: number): number {
  return BASE_FREQ * Math.pow(2, semi / 12);
}

/** Map a keyboard key to a scale semitone, or null if it is not a cast key. */
export function keyToSemi(key: string): number | null {
  const i = KEY_ORDER.indexOf(key.toLowerCase() as (typeof KEY_ORDER)[number]);
  return i === -1 ? null : SCALE_SEMIS[i];
}

const QUANTIZE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15]; // aeolian-ish net for ornaments

function nearestScale(semi: number): number {
  let best = QUANTIZE[0];
  let bestD = Infinity;
  for (const q of QUANTIZE) {
    const d = Math.abs(q - ((semi % 12) + 12) % 12);
    if (d < bestD) {
      bestD = d;
      best = q + Math.round((semi - q) / 12) * 12;
    }
  }
  return best;
}

export interface Answer {
  semis: number[];
  label: string;
}

/**
 * Transform a call (array of semitones) into a partner's ANSWER. Deterministic
 * given the rng stream. Always changes the material — a real reply, not a copy.
 */
export function answerOf(call: number[], rng: () => number): Answer {
  if (call.length === 0) return { semis: [3, 0], label: "reply" };
  const pick = Math.floor(rng() * 4);
  let out = call.slice();
  let label = "transpose";

  if (pick === 0) {
    const shift = [-5, -3, 3, 4, 7][Math.floor(rng() * 5)];
    out = out.map((n) => n + shift);
    label = shift > 0 ? "answer up" : "answer down";
  } else if (pick === 1) {
    out = out.slice().reverse();
    label = "retrograde";
  } else if (pick === 2) {
    const axis = out[0];
    out = out.map((n) => nearestScale(2 * axis - n));
    label = "inversion";
  } else {
    // ornament: sprinkle grace neighbours
    const orn: number[] = [];
    for (const n of out) {
      if (rng() < 0.45) orn.push(nearestScale(n + (rng() < 0.5 ? 2 : -2)));
      orn.push(n);
    }
    out = orn.slice(0, 8);
    label = "ornament";
  }
  // a partner answers a semitone lower in register sometimes — keeps it from unison
  if (rng() < 0.4) out = out.map((n) => n - 12);
  return { semis: out, label };
}

/** A seeded, musical call for the self-demo performer. */
export function seededCall(rng: () => number): number[] {
  const len = 2 + Math.floor(rng() * 4); // 2..5 notes
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    out.push(SCALE_SEMIS[Math.floor(rng() * SCALE_SEMIS.length)]);
  }
  return out;
}
