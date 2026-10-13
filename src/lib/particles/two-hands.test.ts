/**
 * TWO HANDS — call and response (two-hands.ts): the register split on a
 * modelled piano, the easing laws, the layer membership, the flag, the
 * per-journey strength (the mastered takes included) and the shader injection.
 * The analyser is modelled like living-score.test.ts: 256-pt FFT (~187 Hz
 * bins), smoothed 0.8, bytes over -100…-30 dB.
 */
import { describe, it, expect } from "vitest";
import {
  TwoHands, registerShare, handsMembership, handsGain, handsEnabled, handsStrength, handsAllowed,
  HANDS_DEFAULT, HANDS_SESSION_KEY, HANDS_JOURNEY_STRENGTH, HANDS_TUNING as T,
} from "./two-hands";
import { OnsetDetector, binPitch } from "./living-score";
import { buildSimFS, SCORE_ANCHOR_FORCE, HANDS_FORCE_GLSL, HANDS_UNIFORMS_GLSL, DRAW_VS, DRAW_FS, COMP_FS } from "./shaders";

const FPS = 60;
const DT = 1 / FPS;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Note { t: number; bin: number; amp?: number }

/** A piano-ish analyser (same model as living-score.test.ts). */
function analyserFrames(notes: Note[], secs: number, seed = 3): Uint8Array[] {
  const r = rng(seed);
  const S = new Float64Array(128);
  const out: Uint8Array[] = [];
  const n = Math.round(secs * FPS);
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    const X = new Float64Array(128);
    for (let k = 0; k < 128; k++) X[k] = 1e-4 * (0.6 + 0.8 * r()) / (1 + k * 0.05);
    for (const nt of notes) {
      const age = t - nt.t;
      if (age < 0 || age > 8) continue;
      if (notes.some((o) => o.bin === nt.bin && o.t > nt.t && o.t <= t)) continue;
      const env = (nt.amp ?? 0.02) * Math.exp(-age / 1.4);
      const knock = (nt.amp ?? 0.02) * 0.08 * Math.exp(-age / 0.04);
      for (let k = 0; k < 128; k++) X[k] += knock / (1 + Math.abs(k - nt.bin) * 0.15);
      for (let h = 1; h <= 6; h++) {
        const b = Math.round(nt.bin * h);
        if (b < 128) X[b] += env / h;
      }
    }
    for (let k = 0; k < 128; k++) S[k] = 0.8 * S[k] + 0.2 * X[k];
    const bytes = new Uint8Array(128);
    for (let k = 0; k < 128; k++) bytes[k] = Math.max(0, Math.min(255, Math.round(((20 * Math.log10(S[k] + 1e-12) + 100) / 70) * 255)));
    out.push(bytes);
  }
  return out;
}

/** Run detector + hands over frames at full gain; returns the voices per frame. */
function run(frames: Uint8Array[], gain = 1, hands = new TwoHands(), det = new OnsetDetector()) {
  const lo: number[] = [], hi: number[] = [], st: number[] = [];
  for (const b of frames) {
    const on = det.push(b, DT);
    const v = hands.step(b, on, DT, gain);
    lo.push(v.low); hi.push(v.high); st.push(v.strata);
  }
  return { lo, hi, st, hands };
}

const mean = (xs: number[], a: number, b: number) => {
  const s = xs.slice(Math.round(a * FPS), Math.round(b * FPS));
  return s.reduce((x, y) => x + y, 0) / Math.max(1, s.length);
};

/** Left hand: bass notes (bins 0.6-1.3) every 0.5 s; right hand: melody (bins 5-12). */
const LEFT = [1, 0.6, 1.3, 0.8]; // ≈ 110-245 Hz: left-hand bass notes (the model takes fractional bins)
const RIGHT = [6, 8, 10, 12, 10, 8, 6, 5];
const leftHand = (t0: number, t1: number, gap = 0.5): Note[] => {
  const out: Note[] = [];
  for (let t = t0, i = 0; t < t1; t += gap, i++) out.push({ t, bin: LEFT[i % LEFT.length], amp: 0.03 });
  return out;
};
const rightHand = (t0: number, t1: number, gap = 0.35): Note[] => {
  const out: Note[] = [];
  for (let t = t0, i = 0; t < t1; t += gap, i++) out.push({ t, bin: RIGHT[i % RIGHT.length], amp: 0.02 });
  return out;
};

describe("two hands — the register split", () => {
  it("splits the stave at SPLIT, softly, with the living score's pitch map", () => {
    expect(registerShare(0)).toBe(0);
    expect(registerShare(1)).toBe(1);
    expect(registerShare(T.SPLIT)).toBeCloseTo(0.5, 6);
    expect(registerShare(binPitch(1))).toBeLessThan(0.2); // a bass chord's centroid
    expect(registerShare(binPitch(6))).toBeGreaterThan(0.8); // a melody note
    expect(registerShare(NaN)).toBe(0.5);
  });

  it("the left hand alone moves the deep layer; the right hand alone the near one", () => {
    const L = run(analyserFrames(leftHand(1, 14), 15));
    const R = run(analyserFrames(rightHand(1, 14), 15));
    expect(mean(L.lo, 6, 14)).toBeGreaterThan(0.35);
    expect(mean(L.lo, 6, 14)).toBeGreaterThan(2 * mean(L.hi, 6, 14));
    expect(mean(R.hi, 6, 14)).toBeGreaterThan(0.35);
    expect(mean(R.hi, 6, 14)).toBeGreaterThan(2 * mean(R.lo, 6, 14));
  });

  it("CALL AND RESPONSE: the motion passes from the deep layer to the near one and back — readable within 10 s", () => {
    // bass calls 1-11 s, melody answers 12-22 s, bass again 23-33 s
    const notes = [...leftHand(1, 11), ...rightHand(12, 22), ...leftHand(23, 33)];
    const { lo, hi, hands } = run(analyserFrames(notes, 35));
    // within 10 s of each entry the entering hand clearly leads
    expect(mean(lo, 5, 11)).toBeGreaterThan(1.5 * mean(hi, 5, 11) + 0.05);
    expect(mean(hi, 16, 22)).toBeGreaterThan(1.5 * mean(lo, 16, 22) + 0.05);
    expect(mean(lo, 27, 33)).toBeGreaterThan(1.5 * mean(hi, 27, 33) + 0.05);
    // both hands led for a good while
    expect(hands.led.low).toBeGreaterThan(8);
    expect(hands.led.high).toBeGreaterThan(4);
  });

  it("is silent in silence and on a null feed; survives NaN / huge dt", () => {
    const s = run(analyserFrames([], 8));
    expect(Math.max(...s.lo, ...s.hi)).toBeLessThan(0.02);
    const h = new TwoHands();
    for (let i = 0; i < 300; i++) h.step(null, null, DT, 1);
    expect(h.voices.low).toBe(0);
    expect(h.voices.high).toBe(0);
    const v = h.step(null, { strength: NaN, pitch: NaN }, NaN, NaN);
    for (const x of [v.low, v.high, v.strata]) expect(Number.isFinite(x)).toBe(true);
    h.step(null, { strength: 1, pitch: 0.9 }, 99, 1);
    for (const x of [h.voices.low, h.voices.high, h.voices.strata]) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
  });
});

describe("two hands — the easing laws (motion swells, never a beat-level kick)", () => {
  it("attack ≥ 0.6 s and release ≥ 2 s, and the law constants say so", () => {
    expect(T.ATTACK_SEC).toBeGreaterThanOrEqual(0.6);
    expect(T.RELEASE_SEC).toBeGreaterThanOrEqual(2);
    // a sudden flood of right-hand notes: the voice takes ≥ 0.6 s to reach 63 % of where it settles
    const h = new TwoHands();
    const hi: number[] = [];
    for (let f = 0; f < 10 * FPS; f++) hi.push(h.step(null, f % 12 === 0 ? { strength: 1, pitch: 0.9 } : null, DT, 1).high);
    const settled = mean(hi, 7, 10);
    expect(settled).toBeGreaterThan(0.4);
    const t63 = hi.findIndex((x) => x >= 0.63 * settled) / FPS;
    expect(t63).toBeGreaterThanOrEqual(0.6);
    // then the hand stops: ≥ 2 s before it falls to 37 %
    const start = h.voices.high;
    let f = 0;
    while (h.step(null, null, DT, 1).high > 0.37 * start && f < 60 * FPS) f++;
    expect(f / FPS).toBeGreaterThanOrEqual(2);
  });

  it("never jumps: per-frame change ≤ MAX_RATE_PER_SEC · dt, on any onset train, any gain step", () => {
    const h = new TwoHands();
    let prev = { ...h.voices };
    const r = rng(11);
    for (let f = 0; f < 40 * FPS; f++) {
      const on = r() < 0.12 ? { strength: r(), pitch: r() } : null;
      const gain = f < 10 * FPS ? 1 : f < 20 * FPS ? 0 : f < 30 * FPS ? 1 : 0.3; // hard gain steps
      const v = h.step(null, on, DT, gain);
      for (const k of ["low", "high", "strata"] as const) expect(Math.abs(v[k] - prev[k])).toBeLessThanOrEqual(T.MAX_RATE_PER_SEC * DT + 1e-9);
      prev = { ...v };
    }
  });

  it("a steady beat leans a layer in — it does not pulse with the beat", () => {
    const h = new TwoHands();
    const lo: number[] = [];
    for (let f = 0; f < 20 * FPS; f++) lo.push(h.step(null, f % 30 === 0 ? { strength: 1, pitch: 0 } : null, DT, 1).low);
    const tail = lo.slice(10 * FPS);
    expect(Math.min(...tail)).toBeGreaterThan(0.3);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.12); // ripple per 0.5 s beat
  });

  it("the gain gate eases in and out too (a worn image takes it to zero, gently)", () => {
    expect(T.GATE_ATTACK_SEC).toBeGreaterThanOrEqual(0.6);
    expect(T.GATE_RELEASE_SEC).toBeGreaterThanOrEqual(2);
  });
});

describe("two hands — the gain", () => {
  const base = { respK: 1.3, shown: 1, held: 0, busy: false };
  it("readable on solo piano, full up the ladder, nothing while an image is worn or the field is hidden", () => {
    expect(handsGain(base)).toBeCloseTo(T.AMP_SOLO, 6);
    expect(T.AMP_SOLO).toBeGreaterThanOrEqual(0.6);
    expect(handsGain({ ...base, respK: 2.5 })).toBeCloseTo(T.AMP_FULL, 6);
    expect(handsGain({ ...base, held: 1 })).toBe(0);
    expect(handsGain({ ...base, shown: 0 })).toBe(0);
    expect(handsGain({ ...base, busy: true })).toBeCloseTo(T.AMP_SOLO * T.BUSY_K, 6);
    expect(handsGain({ respK: NaN, shown: NaN, held: NaN, busy: false })).toBe(0);
  });
});

describe("two hands — layers", () => {
  it("membership is stable per mote, split roughly in half, leaned by depth", () => {
    expect(handsMembership(0.3, 0.5)).toEqual(handsMembership(0.3, 0.5));
    let hiFar = 0, hiNear = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const hsh = (i + 0.5) / N;
      const m = handsMembership(hsh, 0.5);
      expect(m.low + m.high).toBeCloseTo(1, 9);
      hiFar += handsMembership(hsh, 0).high;
      hiNear += handsMembership(hsh, 1).high;
    }
    const mid = Array.from({ length: N }, (_, i) => handsMembership((i + 0.5) / N, 0.5).high).reduce((a, b) => a + b, 0) / N;
    expect(mid).toBeCloseTo(0.5, 2);
    expect(hiNear / N).toBeGreaterThan(hiFar / N + 0.2); // near motes lean to the right hand
    // the hash dominates: a strongly hashed mote keeps its hand at any depth
    expect(handsMembership(0.02, 1).high).toBeLessThan(0.5);
    expect(handsMembership(0.98, 0).high).toBeGreaterThan(0.5);
    expect(T.HASH_W).toBeGreaterThan(T.DEPTH_W);
    expect(T.STRATA_FAR).toBeLessThan(0);
    expect(T.STRATA_NEAR).toBeGreaterThan(0);
  });
});

describe("two hands — every journey, each at its own strength", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
  it("on by default (Karel kept it); ?hands=1 on and kept for the session; ?hands=0 off", () => {
    expect(HANDS_DEFAULT).toBe(true);
    const st = mem();
    expect(handsEnabled("", st)).toBe(true);
    expect(handsEnabled("?hands=1", st)).toBe(true);
    expect(st.m.get(HANDS_SESSION_KEY)).toBe("1");
    expect(handsEnabled("?journey=x", st)).toBe(true);
    expect(handsEnabled("?hands=0", st)).toBe(false);
    expect(handsEnabled("", st)).toBe(false);
    expect(handsEnabled("?hands=1", null)).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(handsEnabled("", broken)).toBe(true);
    expect(handsEnabled("?hands=1", broken)).toBe(true);
  });

  it("Snowflake and Ghost get the hands too (Karel 2026-10-13), with a strength knob defaulting to 1", () => {
    for (const id of ["first-snow", "ghost"]) {
      expect(handsAllowed(id, true)).toBe(true);
      expect(id in HANDS_JOURNEY_STRENGTH).toBe(true);
      expect(handsStrength(id)).toBe(1);
    }
    expect(handsStrength("any-other-journey")).toBe(1);
    expect(handsAllowed("any-other-journey", true)).toBe(true);
    expect(handsAllowed("first-snow", false)).toBe(false); // the flag still rules
  });
});

describe("two hands — the shader", () => {
  it("off: the simulation source is byte-for-byte the show build's (also with the score alone)", () => {
    expect(buildSimFS([3], { hands: false })).toBe(buildSimFS([3]));
    expect(buildSimFS([3], { score: true, hands: false })).toBe(buildSimFS([3], { score: true }));
    expect(buildSimFS([3])).not.toContain("uHands");
  });

  it("on: one gated block before the acceleration cap; composes with the score", () => {
    const on = buildSimFS([3], { hands: true });
    expect(on).toContain(HANDS_UNIFORMS_GLSL);
    expect(on.indexOf(HANDS_FORCE_GLSL)).toBeGreaterThan(0);
    expect(on.indexOf(HANDS_FORCE_GLSL)).toBeLessThan(on.indexOf(SCORE_ANCHOR_FORCE));
    const both = buildSimFS([3], { hands: true, score: true });
    expect(both).toContain(HANDS_FORCE_GLSL);
    expect(both).toContain("uScoreN");
  });

  it("is a FORCE only, gated by the image form + presence (emblems / Ghost's angel + blossom untouched), on its own clock", () => {
    const block = HANDS_FORCE_GLSL;
    expect(block).toContain("(1.0 - uImgForm) * (1.0 - uImgShow)");
    expect(block).toContain("if (handsG > 0.001");
    expect(block).not.toMatch(/(^|[^.\w])[pv]\s*[+\-*]?=(?!=)/m);
    expect(block).not.toMatch(/uAlpha|uGain|uDensity|uHue|uSat|uSize|oPos|oVel/);
    expect(block).not.toMatch(/uClock|uBands|uBandLv|uSwell|uTime|drv|lvl/);
    expect(block).toMatch(/f\.xyz \+= fhd \* handsG;/);
    for (const src of [DRAW_VS, DRAW_FS, COMP_FS]) expect(src).not.toContain("uHands");
    // GLSL floats only (no bare integers from the tunables)
    expect(block).not.toMatch(/\* -?\d+\)|\* -?\d+;|, -?\d+\)/);
  });

  it("mirrors the TS membership", () => {
    expect(HANDS_FORCE_GLSL).toContain(`* ${2 * T.HASH_W}`);
    expect(HANDS_FORCE_GLSL).toContain(`* ${2 * T.DEPTH_W}`);
    expect(HANDS_FORCE_GLSL).toContain(`smoothstep(${-T.MEMBER_SOFT}, ${T.MEMBER_SOFT}, hBias)`);
  });
});
