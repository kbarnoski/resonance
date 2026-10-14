import { describe, it, expect } from "vitest";
import { OfflineAnalyser, blackman, fftInPlace, downmixInterleaved, KIOSK_ANALYSER } from "./offline-analyser";
import { computeCurves, toDataTableCsv, toCurveTableCsv, CURVE_COLUMNS, CURVE_RANGES, spanAt, fmtNum, type CurveInput } from "./curves";
import { SIGNATURE_FLIGHTS, FLIGHT } from "@/lib/particles/signature-flight";
import type { ParticleProfile } from "@/lib/journeys/particle-casting";

const SR = KIOSK_ANALYSER.sampleRate;

/** A deterministic piano-ish test track: decaying partials struck at known
 *  times over a quiet floor, with a silent gap. */
function synthTrack(seconds: number, strikes: readonly [number, number, number][]): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (const [t0, f, amp] of strikes) {
    const s0 = Math.round(t0 * SR);
    for (let i = s0; i < Math.min(out.length, s0 + 3 * SR); i++) {
      const t = (i - s0) / SR;
      const env = Math.exp(-t * 2.2) * Math.min(1, t * 400);
      out[i] += amp * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * 2 * f * t) + 0.2 * Math.sin(2 * Math.PI * 3 * f * t));
    }
  }
  return out;
}

const STRIKES: [number, number, number][] = [];
for (let k = 0; k < 60; k++) {
  const t = 1 + k * 1.1;
  if (t > 30 && t < 36) continue; // a silent gap
  STRIKES.push([t, [110, 220, 330, 440, 660, 880, 1320][k % 7], 0.25]);
}
const D = 72;
const TRACK = synthTrack(D, STRIKES);

const PROFILE: ParticleProfile = {
  name: "Test", recordingId: "rec", palette: null, duration: D, key: "F Major", climaxTime: 50, quietestTime: 66,
  phaseBounds: [12, 30, 48, 60],
  curve: Array.from({ length: Math.floor(D / 5) + 1 }, (_, i) => [i * 5, 0.3 + 0.5 * Math.sin((i * 5 * Math.PI) / D)] as [number, number]),
  sections: [
    { start: 0, end: 25, trend: "building", intensity: 0.4, onsetRate: 1, localKey: "F Major", major: 0.6, minor: 0.1, suspended: 0.1, diminished: 0, centerMidi: 60, brightnessHz: 500 },
    { start: 25, end: 50, trend: "steady", intensity: 0.9, onsetRate: 1.2, localKey: "D Minor", major: 0.2, minor: 0.6, suspended: 0.1, diminished: 0.05, centerMidi: 57, brightnessHz: 480 },
    { start: 50, end: 72, trend: "receding", intensity: 0.3, onsetRate: 0.8, localKey: "F Major", major: 0.6, minor: 0.1, suspended: 0.1, diminished: 0, centerMidi: 62, brightnessHz: 520 },
  ],
  mood: { words: ["tender"], arousal: 0.4, valence: 0.5 },
  tempo: { bpm: 96, feel: "moderate", steadiness: 0.6, pulseClarity: 0.2, onsetRate: 1 },
};

const BASE: CurveInput = {
  mono: TRACK, sampleRate: SR, journeyId: "c80a89bc-2c88-4bde-bec8-4be6916acb62", profile: PROFILE,
  phaseBounds: [12, 30, 48, 60], formChanges: [], rate: 30,
  flight: SIGNATURE_FLIGHTS["c80a89bc-2c88-4bde-bec8-4be6916acb62"],
};

describe("offline analyser (the kiosk's AnalyserNode)", () => {
  it("fft matches a naive DFT", () => {
    const N = 64;
    const x = Array.from({ length: N }, (_, i) => Math.sin(i * 1.3) + 0.5 * Math.cos(i * 0.21) + (i % 5) * 0.1);
    const re = Float64Array.from(x), im = new Float64Array(N);
    fftInPlace(re, im);
    for (const k of [0, 1, 5, 17, 31]) {
      let r = 0, j = 0;
      for (let n = 0; n < N; n++) { r += x[n] * Math.cos((-2 * Math.PI * k * n) / N); j += x[n] * Math.sin((-2 * Math.PI * k * n) / N); }
      expect(re[k]).toBeCloseTo(r, 9);
      expect(im[k]).toBeCloseTo(j, 9);
    }
  });

  it("uses the spec's Blackman window", () => {
    const w = blackman(256);
    expect(w[0]).toBeCloseTo(0, 9);
    expect(w[128]).toBeCloseTo(1, 9);
  });

  it("a 1 kHz tone lands in bin 5 (187.5 Hz bins) and silence reads all zeros", () => {
    // -40 dBFS: below the -30 dB ceiling, so the main lobe does not saturate at 255
    const tone = new Float32Array(SR);
    for (let i = 0; i < tone.length; i++) tone[i] = 0.01 * Math.sin((2 * Math.PI * 1000 * i) / SR);
    const an = new OfflineAnalyser();
    const b = new Uint8Array(128);
    for (let k = 0; k < 30; k++) an.read(tone, 4096 + k * 800, b); // settle the 0.8 smoothing
    const peak = b.indexOf(Math.max(...b));
    expect(peak).toBe(5);
    // |X| = 0.01 · 0.42 / 2 → -53.6 dB → byte ⌊255 · 46.4 / 70⌋ ≈ 169 (the bin is 0.33 off-centre: a little less)
    expect(b[5]).toBeGreaterThan(150);
    expect(b[5]).toBeLessThanOrEqual(170);
    expect(b[40]).toBeLessThan(40);
    const quiet = new OfflineAnalyser();
    quiet.read(new Float32Array(SR), 10000, b);
    expect(Math.max(...b)).toBe(0);
  });

  it("smoothing is per read (0.8): a tone rises over several reads", () => {
    const tone = new Float32Array(SR);
    for (let i = 0; i < tone.length; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR);
    const an = new OfflineAnalyser();
    const b = new Uint8Array(128);
    an.read(tone, 2000, b);
    const first = b[5];
    for (let k = 0; k < 20; k++) an.read(tone, 2000 + k * 800, b);
    expect(b[5]).toBeGreaterThan(first);
  });

  it("down-mixes stereo by the mean", () => {
    expect(Array.from(downmixInterleaved(Float32Array.from([1, 0, 0.5, 0.5, -1, 1]), 2))).toEqual([0.5, 0.5, 0]);
  });
});

describe("computeCurves", () => {
  const res = computeCurves(BASE);

  it("is deterministic (byte-identical CSV)", () => {
    const again = computeCurves(BASE);
    expect(toDataTableCsv(again)).toBe(toDataTableCsv(res));
    expect(toCurveTableCsv(again)).toBe(toCurveTableCsv(res));
  });

  it("emits rows at the requested rate", () => {
    expect(res.rows.length).toBe(Math.floor(D * 30) + 1);
    const ti = CURVE_COLUMNS.indexOf("Time");
    res.rows.forEach((r, i) => expect(r[ti]).toBeCloseTo(i / 30, 9));
    const r60 = computeCurves({ ...BASE, rate: 60 });
    expect(r60.rows.length).toBe(Math.floor(D * 60) + 1);
    // the analyser runs at 60 Hz whatever the rate: 30/s rows are every other 60/s row
    const bi = CURVE_COLUMNS.indexOf("Bass");
    for (const i of [100, 777, 1500]) expect(res.rows[i][bi]).toBeCloseTo(r60.rows[i * 2][bi], 12);
  });

  it("keeps every column inside its declared range", () => {
    CURVE_COLUMNS.forEach((c, ci) => {
      const [lo, hi] = CURVE_RANGES[c];
      for (const r of res.rows) {
        expect(Number.isFinite(r[ci])).toBe(true);
        if (r[ci] < lo - 1e-9 || r[ci] > hi + 1e-9) throw new Error(`${c} = ${r[ci]} outside ${lo}..${hi}`);
      }
    });
  });

  it("hears the strikes as onsets (and none in the silent gap)", () => {
    expect(res.onsets.length).toBeGreaterThan(STRIKES.length * 0.6);
    // within 0.4 s after a strike (low notes rise slower through the 0.8 smoothing)
    for (const o of res.onsets) expect(STRIKES.some(([t]) => o.t >= t - 0.05 && o.t <= t + 0.4)).toBe(true);
    expect(res.onsets.some((o) => o.t > 31 && o.t < 35)).toBe(false);
  });

  it("freezes the drive in silence and flags it", () => {
    const si = CURVE_COLUMNS.indexOf("Silent"), bi = CURVE_COLUMNS.indexOf("Bass");
    const row = (t: number) => res.rows[Math.round(t * 30)];
    expect(row(35.5)[si]).toBe(1);
    expect(row(35.5)[bi]).toBeCloseTo(row(35)[bi], 9);
    expect(row(10)[si]).toBe(0);
  });

  it("follows the analysis: sections, phases, beat clock, conducted timelines", () => {
    const c = (name: (typeof CURVE_COLUMNS)[number], t: number) => res.rows[Math.round(t * 30)][CURVE_COLUMNS.indexOf(name)];
    expect(c("SectionIndex", 10)).toBe(0);
    expect(c("SectionIndex", 40)).toBe(1);
    expect(c("PhaseIndex", 50)).toBe(3);
    expect(c("Bpm", 5)).toBe(96);
    expect(c("Beat", 10)).toBeCloseTo(16, 6);
    expect(res.phrase?.events.length).toBeGreaterThan(0);
    expect(res.breath).not.toBeNull();
    expect(res.currents).not.toBeNull();
  });

  it("flies the Yellow Bird twice (opening + closing), wings only while flying", () => {
    expect(res.flights.map((f) => f.kind)).toEqual(["opening", "closing"]);
    const c = (name: (typeof CURVE_COLUMNS)[number], t: number) => res.rows[Math.round(t * 30)][CURVE_COLUMNS.indexOf(name)];
    expect(c("FlightActive", 5)).toBe(0);
    expect(c("FlightActive", FLIGHT.OPEN_START_SEC + 2)).toBe(1);
    expect(Math.abs(c("FlightX", FLIGHT.OPEN_START_SEC + 2))).toBeGreaterThan(0);
    expect(c("FlightActive", 30)).toBe(0);
    expect(c("WingRoot", 30)).toBe(0);
    const noBird = computeCurves({ ...BASE, flight: null });
    const fi = CURVE_COLUMNS.indexOf("FlightActive");
    expect(noBird.rows.every((r) => r[fi] === 0)).toBe(true);
  });

  it("writes Unreal-shaped CSVs", () => {
    const dt = toDataTableCsv(res).trim().split("\n");
    expect(dt[0]).toBe("Name," + CURVE_COLUMNS.join(","));
    expect(dt[1].startsWith("F000000,0,")).toBe(true);
    expect(dt.length).toBe(res.rows.length + 1);
    const ct = toCurveTableCsv(res).trim().split("\n");
    expect(ct.length).toBe(CURVE_COLUMNS.length); // header + every column but Time
    expect(ct[0].split(",").length).toBe(res.rows.length + 1);
    expect(ct[1].startsWith("Bass,")).toBe(true);
  });
});

describe("helpers", () => {
  it("spanAt indexes spans between bounds", () => {
    expect(spanAt([10, 20], 5, 30)).toEqual({ index: 0, progress: 0.5 });
    expect(spanAt([10, 20], 25, 30)).toEqual({ index: 2, progress: 0.5 });
    expect(spanAt([], 30, 30)).toEqual({ index: 0, progress: 1 });
  });
  it("fmtNum is compact and stable", () => {
    expect(fmtNum(1)).toBe("1");
    expect(fmtNum(0.123456)).toBe("0.1235");
    expect(fmtNum(-0.00001)).toBe("0");
    expect(fmtNum(NaN)).toBe("0");
  });
});
