import { describe, it, expect } from "vitest";
import {
  blackmanWindow, fftInPlace, analyserMagnitudes, smoothSpectrum, toByteFrequency, toFloatFrequency,
  toByteTimeDomain, mixWindow, downmixInterleaved, sampleIndexAt, precomputeByteSpectra,
} from "./analyser-math.mjs";

function naiveDft(x) {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      re[k] += x[t] * Math.cos(a);
      im[k] += x[t] * Math.sin(a);
    }
  }
  return { re, im };
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

describe("analyser math (Chromium RealtimeAnalyser)", () => {
  it("FFT matches a naive DFT", () => {
    const r = lcg(7);
    const x = Array.from({ length: 256 }, r);
    const re = Float64Array.from(x);
    const im = new Float64Array(256);
    fftInPlace(re, im);
    const ref = naiveDft(x);
    let err = 0;
    for (let k = 0; k < 256; k++) err = Math.max(err, Math.abs(re[k] - ref.re[k]), Math.abs(im[k] - ref.im[k]));
    expect(err).toBeLessThan(1e-9);
  });

  it("rejects non power-of-two sizes", () => {
    expect(() => fftInPlace(new Float64Array(100), new Float64Array(100))).toThrow(/power of 2/);
  });

  it("Blackman window: alpha 0.16, zero at the ends, 1 at the centre", () => {
    const w = blackmanWindow(256);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[128]).toBeCloseTo(1, 6);
    expect(w[64]).toBeCloseTo(0.42 - 0.5 * Math.cos(Math.PI / 2) + 0.08 * Math.cos(Math.PI), 6);
  });

  it("a full-scale sine centred on bin 10 peaks at bin 10 with the Blackman coherent gain / 2", () => {
    const n = 256;
    const x = Float32Array.from({ length: n }, (_, t) => Math.sin((2 * Math.PI * 10 * t) / n));
    const m = analyserMagnitudes(x, n);
    expect(m.length).toBe(128);
    let peak = 0;
    for (let k = 1; k < 128; k++) if (m[k] > m[peak]) peak = k;
    expect(peak).toBe(10);
    expect(m[10]).toBeCloseTo(0.42 / 2, 3);
    expect(m[40]).toBeLessThan(1e-4); // Blackman sidelobes
  });

  it("smoothing: X̂ = τ·prev + (1-τ)·|X|, non-finite → 0", () => {
    const prev = new Float64Array(2);
    const mags = Float64Array.from([1, NaN]);
    for (let i = 0; i < 3; i++) smoothSpectrum(prev, mags, 0.8);
    expect(prev[0]).toBeCloseTo(1 - 0.8 ** 3, 12);
    expect(prev[1]).toBe(0);
  });

  it("byte frequency conversion truncates and clamps like Chromium", () => {
    const db = (d) => 10 ** (d / 20);
    const out = new Uint8Array(6);
    toByteFrequency(Float64Array.from([db(-100), db(-30), db(-65), 0, db(0), db(-120)]), -100, -30, out);
    expect(Array.from(out)).toEqual([0, 255, 127, 0, 255, 0]);
  });

  it("writes only min(out.length, bins) entries", () => {
    const out = new Uint8Array(4).fill(9);
    toByteFrequency(Float64Array.from([1, 1]), -100, -30, out);
    expect(Array.from(out)).toEqual([255, 255, 9, 9]);
  });

  it("float frequency is dB, -Infinity for zero", () => {
    const out = new Float32Array(2);
    toFloatFrequency(Float64Array.from([0.1, 0]), out);
    expect(out[0]).toBeCloseTo(-20, 5);
    expect(out[1]).toBe(-Infinity);
  });

  it("byte time domain = trunc(128·(x+1)) clamped", () => {
    const out = new Uint8Array(5);
    toByteTimeDomain(Float32Array.from([0, 1, -1, 0.5, 2]), out);
    expect(Array.from(out)).toEqual([128, 255, 0, 192, 255]);
  });

  it("mixWindow ends exclusive at `end`, zero-pads, applies gain and accumulates", () => {
    const pcm = Float32Array.from([1, 2, 3, 4]);
    const out = new Float32Array(4);
    mixWindow(pcm, 2, 4, 0.5, out); // samples -2,-1,0,1
    expect(Array.from(out)).toEqual([0, 0, 0.5, 1]);
    mixWindow(pcm, 2, 4, 1, out);
    expect(Array.from(out)).toEqual([0, 0, 1.5, 3]);
  });

  it("speakers down-mix: stereo → 0.5·(L+R)", () => {
    expect(Array.from(downmixInterleaved(Float32Array.from([1, 0, 0.5, 0.5, -1, 1]), 2))).toEqual([0.5, 0.5, 0]);
    expect(Array.from(downmixInterleaved(Float32Array.from([0.25, 0.5]), 1))).toEqual([0.25, 0.5]);
  });

  it("sampleIndexAt rounds to the nearest sample", () => {
    expect(sampleIndexAt(1, 48000)).toBe(48000);
    expect(sampleIndexAt(1 / 60, 48000)).toBe(800);
  });

  it("precompute: a 1 kHz tone lights bin ~5 and ramps in with the 0.8 smoothing; silence stays 0", () => {
    const sr = 48000;
    const tone = Float32Array.from({ length: sr * 2 }, (_, i) => (i < sr ? 0 : 0.01 * Math.sin((2 * Math.PI * 1000 * i) / sr))); // quiet enough not to clip at 255
    const s = precomputeByteSpectra(tone, sr, { fps: 60, frames: 120, startTime: 0 });
    expect(s.bins).toBe(128);
    const at = (f, k) => s.data[f * 128 + k];
    expect(at(30, 5)).toBe(0); // silence
    // first tone frame vs a later one: smoothing ramps up
    expect(at(61, 5)).toBeGreaterThan(0);
    expect(at(80, 5)).toBeGreaterThan(at(61, 5));
    // energy sits at 1000 / (48000/256) = 5.33 → bin 5
    let peak = 0;
    for (let k = 0; k < 128; k++) if (at(100, k) > at(100, peak)) peak = k;
    expect(peak).toBe(5);
    expect(at(100, 100)).toBeLessThan(at(100, 5));
  });
});
