// selfplay.ts — the drum plays itself before anyone touches it.
//
// A seeded scheduler (mulberry32, never Math.random) drops soft strikes around
// the head on a slow, evolving pulse so the piece demonstrates itself — musical
// and rippling — the moment it loads. The 06:30 review is an untouched phone;
// this is what it hears and sees. When the visitor strikes the head, their
// input rides on top; self-play stays gentle underneath.

import { mulberry32, range, int, type Rng } from "./prng";

export interface AutoStrike {
  nx: number; // -1..1 disc coords
  ny: number;
  strength: number; // 0..1
}

const SEED = 0x6216d5c1;

export class SelfPlay {
  private rng: Rng;
  private nextAt = 0;
  private started = false;
  private phrasePos = 0;
  private phraseLen = 8;
  private calm: boolean;

  constructor(calm = false) {
    this.rng = mulberry32(SEED);
    this.calm = calm;
  }

  /** Returns strikes that fell due since the last poll. `t` in seconds. */
  poll(t: number): AutoStrike[] {
    if (!this.started) {
      this.started = true;
      this.nextAt = t + 0.6;
      return [];
    }
    const out: AutoStrike[] = [];
    let guard = 0;
    while (t >= this.nextAt && guard++ < 8) {
      out.push(this.makeStrike());
      this.nextAt += this.nextInterval();
    }
    return out;
  }

  private nextInterval(): number {
    // A slow pulse with occasional rests — breathes rather than metronomes.
    const beats = [0.5, 0.5, 0.75, 1.0, 0.5, 1.5];
    let d = beats[int(this.rng, beats.length)];
    if (this.rng() < 0.18) d += 1.0; // a rest
    if (this.calm) d *= 1.7;
    return d;
  }

  private makeStrike(): AutoStrike {
    // Walk around the head so successive hits trace a melody; occasionally jump.
    this.phrasePos++;
    if (this.phrasePos > this.phraseLen) {
      this.phrasePos = 0;
      this.phraseLen = 6 + int(this.rng, 6);
    }
    const jump = this.rng() < 0.3;
    const ang = jump
      ? range(this.rng, 0, Math.PI * 2)
      : (this.phrasePos / this.phraseLen) * Math.PI * 2 + range(this.rng, -0.3, 0.3);
    const r = range(this.rng, 0.15, 0.82);
    const strength = (this.calm ? 0.22 : 0.32) + range(this.rng, 0, 0.28);
    return {
      nx: Math.cos(ang) * r,
      ny: Math.sin(ang) * r,
      strength,
    };
  }
}
