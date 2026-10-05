import { describe, it, expect } from "vitest";
import { SpectrumProcessor, driveToRate, logBandEdges } from "./spectrum";
import { governExposure, texSideFor, SOULS } from "./souls";
import { BAND_PROFILES } from "@/lib/journeys/kinetic";

const FFT_BINS = 2048;
const BIN_HZ = 48000 / 4096;

function spectrumWith(fn: (hz: number) => number): Float32Array {
  const db = new Float32Array(FFT_BINS);
  for (let i = 0; i < FFT_BINS; i++) db[i] = fn(i * BIN_HZ);
  return db;
}
const quiet = spectrumWith(() => -110);
const bassHit = spectrumWith((hz) => (hz < 180 ? -30 : -110));

function run(p: SpectrumProcessor, db: Float32Array, frames: number) {
  for (let i = 0; i < frames; i++) {
    p.ingest(db, BIN_HZ);
    p.step(1 / 60);
  }
}

describe("spectrum processor", () => {
  it("log band edges span the range monotonically", () => {
    const e = logBandEdges(128, 30, 12000);
    expect(e[0]).toBeCloseTo(30);
    expect(e[128]).toBeCloseTo(12000, 0);
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThan(e[i - 1]);
  });

  it("silence stays at rest (zero drive, no onsets)", () => {
    const p = new SpectrumProcessor();
    run(p, quiet, 120);
    expect(Math.abs(p.bands.bass)).toBeLessThan(0.01);
    expect(p.onsets).toBe(0);
    expect(p.rates.bass).toBeCloseTo(1, 1);
  });

  it("a bass hit drives the bass band, not the treble, and fires an onset", () => {
    const p = new SpectrumProcessor();
    run(p, quiet, 120);
    run(p, bassHit, 12);
    expect(p.bands.bass).toBeGreaterThan(0.2);
    expect(Math.abs(p.bands.treble)).toBeLessThan(0.05);
    expect(p.onsets).toBeGreaterThanOrEqual(1);
    expect(p.swell).toBeGreaterThan(0.05);
    expect(p.rates.bass).toBeGreaterThan(1);
  });

  it("drive is zero-mean: a sustained level relaxes back toward rest", () => {
    const p = new SpectrumProcessor();
    run(p, quiet, 60);
    run(p, bassHit, 600); // 10 s held
    expect(Math.abs(p.bands.bass)).toBeLessThan(0.05);
  });

  it("drive is slewed — one frame of input cannot jump it to the rail", () => {
    const p = new SpectrumProcessor();
    run(p, quiet, 120);
    run(p, bassHit, 1);
    expect(p.bands.bass).toBeLessThan(0.15);
  });

  it("driveToRate honours the kinetic BAND_PROFILES ranges", () => {
    for (const b of ["bass", "mid", "treble"] as const) {
      expect(driveToRate(b, 0)).toBe(1);
      expect(driveToRate(b, 1)).toBeCloseTo(BAND_PROFILES[b].rateHi);
      expect(driveToRate(b, -1)).toBeCloseTo(BAND_PROFILES[b].rateLo);
      expect(driveToRate(b, 5)).toBeCloseTo(BAND_PROFILES[b].rateHi);
    }
  });
});

describe("luminance governor (WCAG 2.3.1 backstop)", () => {
  it("never changes exposure by more than maxStep per update", () => {
    let e = 1;
    for (const lum of [0.9, 0.9, 0.01, 0.9, 0.5]) {
      const n = governExposure(e, lum, { maxStep: 0.02 });
      expect(Math.abs(n / e - 1)).toBeLessThanOrEqual(0.02 + 1e-9);
      e = n;
    }
  });
  it("pulls a too-bright frame down and relaxes to base when dark", () => {
    let e = 1;
    for (let i = 0; i < 200; i++) e = governExposure(e, 0.5 * e);
    expect(e).toBeLessThan(0.4);
    for (let i = 0; i < 400; i++) e = governExposure(e, 0.02);
    expect(e).toBeCloseTo(1, 5);
  });
});

describe("souls", () => {
  it("has four distinct souls with indices matching the shader branches", () => {
    expect(SOULS.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(new Set(SOULS.map((s) => s.id)).size).toBe(4);
  });
  it("texSideFor rounds to a clamped square", () => {
    expect(texSideFor(409_600)).toBe(640);
    expect(texSideFor(10)).toBe(64);
    expect(texSideFor(5e6)).toBe(1024);
  });
});
