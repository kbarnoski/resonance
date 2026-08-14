// ─────────────────────────────────────────────────────────────────────────────
// 11888-chorusrooms · demo.ts — the seeded phantom room (muted-06:30 stand-in).
//
//   The contract: a LONE, MUTED tab with zero peers must still show a FULL, living
//   room within ~1s and — the instant you tap Join — SOUND like an ensemble, so the
//   piece is never a static page nor a self-playing drone. So we seed three
//   "phantom participants" from a fixed seed (0x11888) with mulberry32. Each drifts
//   its pointer on slow, incommensurate sine tides (a calm breath, never a flicker),
//   holds a stable canon slot and pitch, and thus takes its turn in the shared bar.
//
//   Phantoms are residents, not a template drone: they RECEDE as real tabs join
//   (presence falls), so an occupied room is carried by the people in it.
//   `assignFromId` gives real tabs (self + peers) the same kind of stable
//   slot+pitch from a hash of their id — position-stable, so joining never reshuffles
//   anyone already in the room.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, hashStr, clamp01, SEED } from "./prng";
import { PITCH_COUNT } from "./voice";
import type { Participant } from "./types";

const PHANTOM_COUNT = 3;

interface Tide {
  freq: number; // Hz — all well under 0.1 Hz (a slow drift, never a flicker)
  phase: number;
  amp: number;
}

interface Phantom {
  id: string;
  slot: number;
  scaleIdx: number;
  baseX: number;
  baseY: number;
  tideX: Tide;
  tideY: Tide;
}

/** Stable canon slot + pitch for any real tab, hashed from its id. */
export function assignFromId(id: string): { slot: number; scaleIdx: number } {
  const r = mulberry32(hashStr(id));
  const slot = r();
  const scaleIdx = Math.floor(r() * PITCH_COUNT);
  return { slot, scaleIdx };
}

function makeTide(rnd: () => number): Tide {
  return {
    freq: 0.012 + rnd() * 0.05, // period ~20–80 s
    phase: rnd() * Math.PI * 2,
    amp: 0.12 + rnd() * 0.16,
  };
}

export class PhantomRoom {
  private readonly phantoms: Phantom[] = [];

  constructor() {
    const rnd = mulberry32(SEED);
    for (let i = 0; i < PHANTOM_COUNT; i++) {
      // Evenly spread canon slots with a little seeded jitter so their entries
      // stagger cleanly across the bar.
      const slot = (i + 0.5) / PHANTOM_COUNT + (rnd() - 0.5) * 0.08;
      this.phantoms.push({
        id: `phantom-${i}`,
        slot: slot - Math.floor(slot),
        scaleIdx: Math.floor(rnd() * PITCH_COUNT),
        baseX: 0.24 + rnd() * 0.52,
        baseY: 0.28 + rnd() * 0.4,
        tideX: makeTide(rnd),
        tideY: makeTide(rnd),
      });
    }
  }

  /** Resolve the phantom residents at elapsed seconds `t`, faded by `presence`. */
  list(t: number, presence: number): Participant[] {
    const TWO_PI = 6.28318530718;
    return this.phantoms.map((p) => {
      const px = clamp01(p.baseX + p.tideX.amp * Math.sin(TWO_PI * p.tideX.freq * t + p.tideX.phase));
      const py = clamp01(p.baseY + p.tideY.amp * Math.sin(TWO_PI * p.tideY.freq * t + p.tideY.phase));
      return {
        id: p.id,
        kind: "phantom" as const,
        px,
        py,
        slot: p.slot,
        scaleIdx: p.scaleIdx,
        presence,
        conducting: false,
      };
    });
  }
}
