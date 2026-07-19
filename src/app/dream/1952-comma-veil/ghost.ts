// ghost.ts — Seeded deterministic ghost player.
//
// After a few seconds of idle, this plays a slow, evolving progression that
// builds tension, resolves, and breathes — so the piece is never a dead screen
// and self-demos with zero input. Fully deterministic (mulberry32, fixed
// seed); no nondeterministic entropy sources. Time is advanced by explicit
// deltas from the render loop.

import { makeRng, TONIC_MIDI } from "./harmony";

// Scale degrees (semitone offsets from tonic) the ghost draws from — a warm
// JI-friendly palette that can still reach dissonance for the tension arc.
const CONSONANT = [0, 7, 12, 4, 9, 16, 19]; // unison, 5th, oct, 3rd, 6th...
const TENSE = [6, 11, 1, 13, 18]; // tritone, maj7, min2 — the shearing notes

export interface GhostVoice {
  midi: number;
  offAt: number; // absolute ghost-clock seconds
}

/**
 * A slow phrase generator. `advance(dt, onNoteOn, onNoteOff)` steps the ghost
 * clock; it emits chord changes on a slow grid and rides a tension envelope
 * that swells and releases, so you hear build → peak → resolve → breathe.
 */
export function createGhost() {
  const rng = makeRng(0x1952c0aa); // fixed seed
  let clock = 0;
  let nextChangeAt = 0;
  let phrasePos = 0; // 0..1 around the tension arc
  const active: GhostVoice[] = [];

  function pick(pool: number[]): number {
    return pool[Math.floor(rng() * pool.length) % pool.length];
  }

  function advance(
    dt: number,
    onNoteOn: (midi: number, vel: number) => void,
    onNoteOff: (midi: number) => void
  ) {
    clock += dt;

    // Retire expired voices.
    for (let i = active.length - 1; i >= 0; i--) {
      if (clock >= active[i].offAt) {
        onNoteOff(active[i].midi);
        active.splice(i, 1);
      }
    }

    if (clock < nextChangeAt) return;

    // Advance around a slow breathing arc (~40s per full cycle).
    phrasePos = (phrasePos + 0.06) % 1;
    // Tension envelope: rise to a peak near 0.6, resolve toward 1.0.
    const arc = phrasePos < 0.6 ? phrasePos / 0.6 : (1 - phrasePos) / 0.4;
    const tenseAmount = arc; // 0 = resolved, 1 = peak tension

    // Release the previous chord before laying a new one.
    for (const v of active) onNoteOff(v.midi);
    active.length = 0;

    // Base register drifts up as tension climbs (deeper into the tunnel).
    const octave = 12 * (rng() < 0.5 ? 1 : 2);
    const root = TONIC_MIDI + octave;

    // Two to three notes; add a tense degree proportional to the arc.
    const voiceCount = 2 + (rng() < 0.4 + tenseAmount * 0.4 ? 1 : 0);
    const chosen = new Set<number>();
    chosen.add(0); // always sound the root of the chord for grounding
    for (let i = 1; i < voiceCount; i++) {
      const useTense = rng() < tenseAmount * 0.85;
      chosen.add(pick(useTense ? TENSE : CONSONANT));
    }

    const holdBase = 3.5 + rng() * 3.5; // slow: 3.5–7s chords
    chosen.forEach((deg) => {
      const midi = root + deg;
      const vel = 0.35 + rng() * 0.35;
      onNoteOn(midi, vel);
      active.push({ midi, offAt: clock + holdBase + rng() * 1.5 });
    });

    // Next change on a slow grid (~2.5–5s), with a longer breath at resolution.
    const breath = phrasePos > 0.9 ? 3 : 0;
    nextChangeAt = clock + 2.5 + rng() * 2.5 + breath;
  }

  function stop(onNoteOff: (midi: number) => void) {
    for (const v of active) onNoteOff(v.midi);
    active.length = 0;
    // Reset so a later re-activation starts a fresh, still-deterministic phrase.
    nextChangeAt = clock;
  }

  return { advance, stop };
}
