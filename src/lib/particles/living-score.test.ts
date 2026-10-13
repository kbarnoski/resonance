/**
 * THE LIVING SCORE — onset detector, ripple scheduler, gain ladder, flag and
 * shader injection (living-score.ts). The analyser is modelled the way the
 * journeys' shared one behaves: 256-pt FFT (128 bins, ~187 Hz each), linear
 * magnitudes smoothed at 0.8 per frame, then mapped to bytes over -100…-30 dB.
 */
import { describe, it, expect } from "vitest";
import {
  OnsetDetector, LivingScore, rippleEnvelope, scoreGain, binPitch, livingScoreEnabled,
  LIVING_SCORE_DEFAULT, SCORE_LOCKED_JOURNEYS, SCORE_SESSION_KEY, SCORE_STRIDE, SCORE_TUNING as T,
  type Onset,
} from "./living-score";
import { buildSimFS, SCORE_ANCHOR_FORCE, SCORE_ANCHOR_UNIFORMS } from "./shaders";

const FPS = 60;
const DT = 1 / FPS;

/** Deterministic noise. */
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

/** A piano-ish analyser: notes = fundamental + decaying partials over a noisy
 *  room floor with a brief hammer knock (and an optional sustained pad), smoothed like the real node;
 *  bytes clip at -30 dB like the real one. */
function analyserFrames(notes: Note[], secs: number, opts: { seed?: number; pad?: number; repeat?: number } = {}): Uint8Array[] {
  const r = rng(opts.seed ?? 3);
  const S = new Float64Array(128);
  const out: Uint8Array[] = [];
  const n = Math.round(secs * FPS);
  const repeat = opts.repeat ?? 1;
  let last = new Uint8Array(128);
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    if (f % repeat === 0) {
      const X = new Float64Array(128);
      for (let k = 0; k < 128; k++) X[k] = 1e-4 * (0.6 + 0.8 * r()) / (1 + k * 0.05) + (opts.pad ?? 0) * Math.exp(-k / 12) * (0.9 + 0.2 * r());
      for (const nt of notes) {
        const age = t - nt.t;
        if (age < 0) continue;
        // a re-struck key replaces its own ringing string (the damper)
        if (notes.some((o) => o.bin === nt.bin && o.t > nt.t && o.t <= t)) continue;
        const env = (nt.amp ?? 0.02) * Math.exp(-age / 1.4);
        // the hammer: a brief broadband knock above the note (~40 ms)
        const knock = (nt.amp ?? 0.02) * 0.08 * Math.exp(-age / 0.04);
        for (let k = 0; k < 128; k++) X[k] += knock / (1 + Math.abs(k - nt.bin) * 0.15);
        for (let h = 1; h <= 6; h++) {
          const b = Math.round(nt.bin * h);
          if (b < 128) X[b] += env / h;
        }
      }
      for (let k = 0; k < 128; k++) S[k] = 0.8 * S[k] + 0.2 * X[k];
      last = new Uint8Array(128);
      for (let k = 0; k < 128; k++) last[k] = Math.max(0, Math.min(255, Math.round(((20 * Math.log10(S[k] + 1e-12) + 100) / 70) * 255)));
    }
    out.push(last);
  }
  return out;
}

function runDetector(frames: Uint8Array[], det = new OnsetDetector()): { t: number; o: Onset }[] {
  const hits: { t: number; o: Onset }[] = [];
  frames.forEach((b, i) => {
    const o = det.push(b, DT);
    if (o) hits.push({ t: i / FPS, o });
  });
  return hits;
}

/** A phrase: 12 notes, 0.6 s apart, from low to high and back. */
const PHRASE_BINS = [1, 2, 3, 5, 8, 12, 16, 12, 8, 4, 2, 1];
const phrase = (t0 = 1.5, gap = 0.6): Note[] => PHRASE_BINS.map((bin, i) => ({ t: t0 + i * gap, bin }));

describe("living score — onset detector", () => {
  it("pitch map: log frequency over the piano's range, clamped 0..1", () => {
    expect(binPitch(0)).toBe(0);
    expect(binPitch(T.PITCH_HI_BIN)).toBeCloseTo(1, 6);
    expect(binPitch(63)).toBe(1);
    for (let k = 1; k <= T.PITCH_HI_BIN; k++) expect(binPitch(k)).toBeGreaterThan(binPitch(k - 1));
    // octaves are (roughly) equal steps
    expect(binPitch(7) - binPitch(3)).toBeCloseTo(binPitch(15) - binPitch(7), 1);
  });

  it("hears every note of a phrase, once, close to when it was struck", () => {
    const notes = phrase();
    const hits = runDetector(analyserFrames(notes, 10));
    expect(hits.length).toBe(notes.length);
    hits.forEach((h, i) => {
      expect(h.t).toBeGreaterThanOrEqual(notes[i].t);
      expect(h.t - notes[i].t).toBeLessThan(0.1); // ≤ 6 frames of latency
      expect(h.o.strength).toBeGreaterThan(0.3);
      expect(h.o.strength).toBeLessThanOrEqual(1);
    });
  });

  it("places each note by register: the pitch estimate follows the fundamental", () => {
    const notes = phrase();
    const hits = runDetector(analyserFrames(notes, 10));
    const byBin = new Map<number, number[]>();
    hits.forEach((h, i) => byBin.set(notes[i].bin, [...(byBin.get(notes[i].bin) ?? []), h.o.pitch]));
    const mean = (b: number) => byBin.get(b)!.reduce((a, x) => a + x, 0) / byBin.get(b)!.length;
    const bins = [...byBin.keys()].sort((a, b) => a - b);
    for (let i = 1; i < bins.length; i++) expect(mean(bins[i])).toBeGreaterThan(mean(bins[i - 1]));
    expect(mean(1)).toBeLessThan(0.3);
    expect(mean(16)).toBeGreaterThan(0.6);
    for (const h of hits) { expect(h.o.pitch).toBeGreaterThanOrEqual(0); expect(h.o.pitch).toBeLessThanOrEqual(1); }
  });

  it("is silent in silence, on a null feed and on a steady noisy room", () => {
    expect(runDetector(analyserFrames([], 10))).toHaveLength(0);
    const det = new OnsetDetector();
    for (let i = 0; i < 600; i++) expect(det.push(null, DT)).toBeNull();
    // a sustained pad (loud, fluctuating, no attacks)
    expect(runDetector(analyserFrames([], 10, { pad: 0.004, seed: 9 }))).toHaveLength(0);
  });

  it("still hears notes over a sustained pad", () => {
    const notes = phrase(2, 0.8);
    const hits = runDetector(analyserFrames(notes, 13, { pad: 0.004, seed: 9 }));
    expect(hits.length).toBeGreaterThanOrEqual(notes.length - 2);
    expect(hits.length).toBeLessThanOrEqual(notes.length);
  });

  it("skips stale frames: a 30 Hz feed at 60 fps finds the same notes", () => {
    const notes = phrase();
    const a = runDetector(analyserFrames(notes, 10));
    const b = runDetector(analyserFrames(notes, 10, { repeat: 2 }));
    expect(b.length).toBe(a.length);
  });

  it("refractory: a chord rolled within 50 ms is ONE onset; warm-up fires nothing", () => {
    const rolled: Note[] = [{ t: 2, bin: 3 }, { t: 2.033, bin: 5 }, { t: 2.05, bin: 8 }];
    expect(runDetector(analyserFrames(rolled, 4))).toHaveLength(1);
    // a note in the first frames (stats not settled) is not taken
    expect(runDetector(analyserFrames([{ t: 0.1, bin: 4 }], 2))).toHaveLength(0);
  });

  it("repeated notes on one key are each heard; a soft phrase is heard too", () => {
    const rep = Array.from({ length: 8 }, (_, i) => ({ t: 1.5 + i * 0.5, bin: 4 }));
    expect(runDetector(analyserFrames(rep, 6))).toHaveLength(8);
    const soft = phrase().map((n) => ({ ...n, amp: 0.003 }));
    expect(runDetector(analyserFrames(soft, 10)).length).toBeGreaterThanOrEqual(soft.length - 1);
  });

  it("a fast run is thinned by the refractory gap, never a machine-gun", () => {
    const run = Array.from({ length: 30 }, (_, i) => ({ t: 1.5 + i * 0.07, bin: 2 + (i % 9) }));
    const hits = runDetector(analyserFrames(run, 5));
    expect(hits.length).toBeGreaterThanOrEqual(3); // a blur of notes reads as a few ripples
    for (let i = 1; i < hits.length; i++) expect(hits[i].t - hits[i - 1].t).toBeGreaterThanOrEqual(T.REFRACTORY_SEC - 1e-9);
  });

  it("frame-rate jitter (45-75 fps) finds the same phrase", () => {
    const notes = phrase();
    const frames = analyserFrames(notes, 10);
    const r = rng(17);
    const det = new OnsetDetector();
    let n = 0;
    for (const b of frames) if (det.push(b, DT * (0.8 + 0.4 * r()))) n++;
    expect(n).toBe(notes.length);
  });

  it("louder notes are stronger", () => {
    const soft = runDetector(analyserFrames([{ t: 2, bin: 6, amp: 0.004 }], 4));
    const loud = runDetector(analyserFrames([{ t: 2, bin: 6, amp: 0.05 }], 4));
    expect(soft).toHaveLength(1);
    expect(loud).toHaveLength(1);
    expect(loud[0].o.strength).toBeGreaterThan(soft[0].o.strength);
  });
});

describe("living score — ripple scheduler", () => {
  it("envelope: 0 at birth and death, ≤ 1, smooth rise (no jolt), monotone decay", () => {
    for (const life of [T.LIFE_HIGH_SEC, 2, T.LIFE_LOW_SEC]) {
      expect(rippleEnvelope(0, life)).toBe(0);
      expect(rippleEnvelope(life, life)).toBe(0);
      let prev = 0, peakAt = 0, peak = 0;
      for (let a = DT; a < life; a += DT) {
        const e = rippleEnvelope(a, life);
        expect(e).toBeLessThanOrEqual(1);
        expect(Math.abs(e - prev)).toBeLessThan(0.12); // per-frame change bounded
        if (e > peak) { peak = e; peakAt = a; }
        prev = e;
      }
      expect(peakAt).toBeGreaterThan(0.2);
      expect(peakAt).toBeLessThan(0.5);
      expect(peak).toBeGreaterThan(0.6);
    }
  });

  it("caps concurrent ripples at MAX_RIPPLES and drops the rest", () => {
    const s = new LivingScore(4);
    let maxLive = 0;
    for (let f = 0; f < 600; f++) {
      const on = f % 11 === 0 ? { strength: 1, pitch: 0 } : null; // a low note every 0.18 s, each lives 3 s
      s.step(DT, on, 1);
      maxLive = Math.max(maxLive, s.live());
      expect(s.count).toBeLessThanOrEqual(T.MAX_RIPPLES);
    }
    expect(maxLive).toBe(T.MAX_RIPPLES);
    expect(s.dropped).toBeGreaterThan(0);
  });

  it("respects the spawn gap", () => {
    const s = new LivingScore(1);
    s.step(DT, { strength: 1, pitch: 0.5 }, 1);
    s.step(DT, { strength: 1, pitch: 0.5 }, 1); // 17 ms later: dropped
    expect(s.spawned).toBe(1);
    for (let i = 0; i < 12; i++) s.step(DT, null, 1);
    s.step(DT, { strength: 1, pitch: 0.5 }, 1);
    expect(s.spawned).toBe(2);
  });

  it("register mapping: low notes low / wide / long, high notes high / fine / brief", () => {
    const lo = new LivingScore(2), hi = new LivingScore(2);
    lo.spawn({ strength: 1, pitch: 0 });
    hi.spawn({ strength: 1, pitch: 1 });
    const a = lo.slots.find((r) => r.live)!, b = hi.slots.find((r) => r.live)!;
    expect(a.y).toBeLessThan(b.y);
    expect(a.radius).toBeGreaterThan(b.radius);
    expect(a.life).toBeGreaterThan(b.life);
    expect(a.life).toBeLessThanOrEqual(3);
    expect(b.life).toBeGreaterThanOrEqual(1);
    for (const r of [a, b]) { expect(Math.abs(r.x)).toBeLessThanOrEqual(0.9); expect(Math.abs(r.y)).toBeLessThan(1); }
  });

  it("every ripple ends: the field is clear 3 s after the last note", () => {
    const s = new LivingScore(5);
    for (let f = 0; f < 120; f++) s.step(DT, f % 15 === 0 ? { strength: 0.8, pitch: (f % 45) / 45 } : null, 1);
    expect(s.live()).toBeGreaterThan(0);
    for (let f = 0; f < 3.1 * FPS; f++) s.step(DT, null, 1);
    expect(s.live()).toBe(0);
    expect(s.count).toBe(0);
  });

  it("packs live ripples with a bounded amplitude, signed by the pen's direction", () => {
    const s = new LivingScore(6);
    s.step(DT, { strength: 1, pitch: 0.3 }, 1);
    for (let f = 0; f < 20; f++) s.step(DT, null, 1);
    for (let f = 0; f < 20; f++) s.step(DT, null, 1);
    expect(s.count).toBe(1);
    const amp = s.packed[2];
    expect(Math.abs(amp)).toBeGreaterThan(0.2);
    expect(Math.abs(amp)).toBeLessThanOrEqual(1);
    expect(s.packed.length).toBe(T.MAX_RIPPLES * SCORE_STRIDE);
    expect(s.packed[5]).toBeGreaterThan(0); // life phase
    expect(s.packed[5]).toBeLessThan(1);
  });

  it("the gate slews: never a step, and zero gain packs nothing", () => {
    const s = new LivingScore(7);
    let prev = 0;
    for (let f = 0; f < 180; f++) {
      s.step(DT, f % 20 === 0 ? { strength: 1, pitch: 0.5 } : null, f < 90 ? 1 : 0);
      expect(Math.abs(s.gate - prev)).toBeLessThan(0.05);
      prev = s.gate;
    }
    for (let f = 0; f < 600; f++) s.step(DT, f % 20 === 0 ? { strength: 1, pitch: 0.5 } : null, 0);
    expect(s.count).toBe(0);
  });
});

describe("living score — gain ladder + laws", () => {
  const base = { respK: 1.3, shown: 1, held: 0, busy: false };
  it("solo piano subtle, intense tracks fuller", () => {
    expect(scoreGain(base)).toBeCloseTo(T.AMP_SOLO, 5);
    expect(scoreGain({ ...base, respK: 2.5 })).toBeCloseTo(T.AMP_FULL, 5);
    expect(scoreGain({ ...base, respK: 2.0 })).toBeGreaterThan(scoreGain({ ...base, respK: 1.7 }));
  });
  it("invisible field = silent score", () => {
    expect(scoreGain({ ...base, shown: 0 })).toBe(0);
    expect(scoreGain({ ...base, shown: T.SHOWN_LO })).toBe(0);
  });
  it("forms / emblems held: strongly reduced; busy zone: halved", () => {
    expect(scoreGain({ ...base, held: 1 })).toBeCloseTo(scoreGain(base) * T.HELD_FLOOR, 6);
    expect(T.HELD_FLOOR).toBeLessThanOrEqual(0.2);
    expect(scoreGain({ ...base, busy: true })).toBeCloseTo(scoreGain(base) * T.BUSY_K, 6);
  });
  it("the mastered takes are never played", () => {
    expect(SCORE_LOCKED_JOURNEYS.has("first-snow")).toBe(true);
    expect(SCORE_LOCKED_JOURNEYS.has("ghost")).toBe(true);
  });
});

describe("living score — flag", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  it("on by default (Karel kept it 2026-10-13)", () => {
    expect(LIVING_SCORE_DEFAULT).toBe(true);
    expect(livingScoreEnabled("", mem())).toBe(true);
  });
  it("?score=1 turns it on and is kept for the tab; ?score=0 turns it off", () => {
    const st = mem();
    expect(livingScoreEnabled("?score=1", st)).toBe(true);
    expect(st.m.get(SCORE_SESSION_KEY)).toBe("1");
    expect(livingScoreEnabled("?journey=x", st)).toBe(true);
    expect(livingScoreEnabled("?score=0", st)).toBe(false);
    expect(livingScoreEnabled("", st)).toBe(false);
    expect(livingScoreEnabled("?score=1", null)).toBe(true);
  });
});

describe("living score — shader injection", () => {
  it("off: the simulation source is untouched (the show build's)", () => {
    const off = buildSimFS([0]);
    expect(off).not.toContain("uScore");
    expect(buildSimFS([0], { score: false })).toBe(off);
  });
  it("on: uniforms + force injected once each, before the acceleration cap", () => {
    const off = buildSimFS([3]);
    expect(off).toContain(SCORE_ANCHOR_UNIFORMS);
    expect(off).toContain(SCORE_ANCHOR_FORCE);
    const on = buildSimFS([3], { score: true });
    expect(on.match(/uniform vec4 uScoreA\[/g)).toHaveLength(1);
    expect(on.match(/THE LIVING SCORE: each note/g)).toHaveLength(1);
    expect(on.indexOf("uniform int uScoreN")).toBeLessThan(on.indexOf(SCORE_ANCHOR_UNIFORMS));
    expect(on.indexOf("THE LIVING SCORE: each note")).toBeLessThan(on.indexOf(SCORE_ANCHOR_FORCE));
    expect(on.indexOf("THE LIVING SCORE: each note")).toBeGreaterThan(on.indexOf("void main()"));
    // motion only: the score never writes colour, alpha or size
    const block = on.slice(on.indexOf("THE LIVING SCORE: each note"), on.indexOf(SCORE_ANCHOR_FORCE));
    expect(block).not.toMatch(/oPos|oVel|alpha|uSize|uHue/);
    expect(block).toMatch(/f\.xyz \+=/);
  });
});
