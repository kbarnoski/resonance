// ─────────────────────────────────────────────────────────────────────────────
// 2928 · FREE HARMONY — seeded virtual improviser
// A deterministic wandering singer so the piece is fully alive with no mic.
// It emits a CONTINUOUS MIDI pitch (glides between notes, never snaps to a grid
// at the sample level) plus a confidence, feeding the exact same
// pitch → harmony → audio → viz path a live voice would.
// ─────────────────────────────────────────────────────────────────────────────

/** Classic mulberry32 PRNG — tiny, fast, fully deterministic from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

/** Snap a MIDI value to the nearest pitch of the given major key. */
function nearestScalePitch(midi: number, root: number): number {
  const target = Math.round(midi);
  let best = target;
  let bestDist = Infinity;
  for (let d = -2; d <= 2; d++) {
    const cand = target + d;
    const pc = ((cand - root) % 12 + 12) % 12;
    if (MAJOR_STEPS.includes(pc)) {
      const dist = Math.abs(cand - midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  return best;
}

export interface ImproviserVoice {
  midi: number;
  confidence: number;
}

/**
 * A slowly wandering, occasionally-modulating melodic line. It bounded-random-
 * walks through a major scale, sometimes leaps, and every so often modulates by
 * a fifth/fourth/step so the Krumhansl–Schmuckler engine has to re-find the key.
 */
export class VirtualImproviser {
  private rng: () => number;
  private midi = 62; // continuous, glides toward target
  private target = 62;
  private timer = 0;
  private keyRoot = 2; // D major to start
  private restTimer = 0;
  private resting = false;

  constructor(seed = 0x2928) {
    this.rng = mulberry32(seed);
    this.target = nearestScalePitch(62, this.keyRoot);
    this.midi = this.target;
  }

  step(dt: number): ImproviserVoice {
    // Glide toward the current target — this is what keeps pitch CONTINUOUS.
    const glide = Math.min(1, dt * 6);
    this.midi += (this.target - this.midi) * glide;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.3 + this.rng() * 0.55; // note duration

      // Occasional short rest so phrases breathe (drops voicing confidence).
      this.resting = this.rng() < 0.14;
      this.restTimer = this.resting ? 0.18 + this.rng() * 0.25 : 0;

      // Occasionally modulate the underlying key by a musical interval.
      if (this.rng() < 0.05) {
        const moves = [7, 5, -5, 2, -2, 9];
        const mv = moves[Math.floor(this.rng() * moves.length)];
        this.keyRoot = ((this.keyRoot + mv) % 12 + 12) % 12;
      }

      // Random walk with occasional leaps, within a comfortable vocal range.
      const r = this.rng();
      let delta: number;
      if (r < 0.62) delta = this.rng() < 0.5 ? 1 : -1;
      else if (r < 0.85) delta = this.rng() < 0.5 ? 2 : -2;
      else delta = (this.rng() < 0.5 ? 3 : -3) + (this.rng() < 0.5 ? 1 : 0);

      let nextMidi = this.target + delta;
      if (nextMidi < 55) nextMidi += 7;
      if (nextMidi > 76) nextMidi -= 7;
      this.target = nearestScalePitch(nextMidi, this.keyRoot);
    }

    if (this.resting && this.restTimer > 0) {
      this.restTimer -= dt;
      return { midi: this.midi, confidence: 0.05 };
    }
    return { midi: this.midi, confidence: 0.95 };
  }
}
