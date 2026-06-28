// ════════════════════════════════════════════════════════════════════════════
// chaos.test.ts — Headless self-test (no DOM) for 1027 Kids Chaos Aurora
//
// Verifies the three load-bearing math claims:
//   (1) RK4 double-pendulum step stays finite & bounded over many damped steps.
//   (2) The UNDAMPED integrator approximately conserves total energy (sanity
//       check that the integrator is real, not hand-wavy).
//   (3) snapToChord ALWAYS returns a frequency in the current chord's tone set,
//       across all four chords and the full input range — never out of key.
//
// Runs under vitest (`npm test`) with zero DOM access.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PARAMS,
  PendulumState,
  PendulumParams,
  stepRK4,
  totalEnergy,
  applyFlick,
} from "./physics";
import {
  PROGRESSION,
  snapToChord,
  chordFreqSet,
  chordToneMidis,
  midiToFreq,
} from "./harmony";

describe("double-pendulum RK4 integrator", () => {
  it("(1) stays finite and bounded over many damped steps", () => {
    let s: PendulumState = { t1: 2.4, t2: 1.1, w1: 0, w2: 0 };
    s = applyFlick(s, 6); // a hard kid-flick
    const dt = 1 / 240;
    for (let i = 0; i < 240 * 30; i++) {
      // 30 simulated seconds
      s = stepRK4(s, DEFAULT_PARAMS, dt);
      expect(Number.isFinite(s.t1)).toBe(true);
      expect(Number.isFinite(s.t2)).toBe(true);
      expect(Number.isFinite(s.w1)).toBe(true);
      expect(Number.isFinite(s.w2)).toBe(true);
    }
    // With damping it should have lost most of its energy by 30s.
    expect(Math.abs(s.w1)).toBeLessThan(5);
    expect(Math.abs(s.w2)).toBeLessThan(5);
  });

  it("(2) approximately conserves energy when undamped", () => {
    const undamped: PendulumParams = { ...DEFAULT_PARAMS, damping: 0 };
    let s: PendulumState = { t1: 1.2, t2: -0.6, w1: 0.4, w2: -0.3 };
    const e0 = totalEnergy(s, undamped);
    const dt = 1 / 480; // small step for the conservation check
    for (let i = 0; i < 480 * 4; i++) {
      // 4 simulated seconds
      s = stepRK4(s, undamped, dt);
    }
    const e1 = totalEnergy(s, undamped);
    const relErr = Math.abs(e1 - e0) / Math.max(1e-6, Math.abs(e0));
    // RK4 with this step should hold energy to a small relative error.
    expect(relErr).toBeLessThan(0.02);
  });
});

describe("functional harmony snapping", () => {
  it("(3) always returns an in-chord frequency across all 4 chords", () => {
    for (const chord of PROGRESSION) {
      const valid = chordFreqSet(chord);
      // Sweep the full normalized height range and octave biases.
      for (let h = 0; h <= 1.0001; h += 0.013) {
        for (const bias of [-1, 0, 1, 2]) {
          const f = snapToChord(h, chord, bias);
          // Membership check, tolerant of float rounding.
          let inSet = false;
          for (const vf of valid) {
            if (Math.abs(vf - f) < 1e-6) {
              inSet = true;
              break;
            }
          }
          expect(inSet).toBe(true);
        }
      }
    }
  });

  it("(3b) the progression is genuinely diatonic, not pentatonic", () => {
    // Sanity: the four chords use distinct triads (I, vi, IV, V) — proving this
    // is real functional harmony, not a single fixed scale.
    const names = PROGRESSION.map((c) => c.name);
    expect(names).toEqual(["I (C)", "vi (Am)", "IV (F)", "V (G)"]);
    // V (G major) must contain B natural (the leading tone) — impossible in a
    // pentatonic "all safe" set.
    const g = PROGRESSION[3];
    const bNat = midiToFreq(g.rootMidi + 4); // G + 4 semitones = B
    const gSet = chordFreqSet(g);
    let hasB = false;
    for (const vf of gSet) if (Math.abs(vf - bNat) < 1e-6) hasB = true;
    expect(hasB).toBe(true);
    // And C major must NOT contain that same B (chords genuinely differ).
    const cSet = chordFreqSet(PROGRESSION[0]);
    let cHasB = false;
    for (const vf of cSet) if (Math.abs(vf - bNat) < 1e-6) cHasB = true;
    expect(cHasB).toBe(false);
  });

  it("higher input maps to higher pitch (monotone-ish snapping)", () => {
    const chord = PROGRESSION[0];
    const low = snapToChord(0.0, chord, 0);
    const high = snapToChord(1.0, chord, 0);
    expect(high).toBeGreaterThan(low);
    // Both endpoints are valid chord tones.
    const tones = chordToneMidis(chord, 3).map(midiToFreq);
    expect(tones.some((t) => Math.abs(t - low) < 1e-6)).toBe(true);
    expect(tones.some((t) => Math.abs(t - high) < 1e-6)).toBe(true);
  });
});
