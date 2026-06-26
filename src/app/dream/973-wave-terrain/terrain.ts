// Wave-terrain synthesis — the terrain math.
//
// A terrain is a height function z = f(x, y) over the unit-ish square
// [-1, 1] x [-1, 1]. An orbit is a closed 2D path; sampling f along that
// path, one full loop, yields one period of an audio waveform.
//
// Refs: Mitsuhashi (1982), Borgonovo & Haus (1986), Roads "Microsound" (2001).

export type TerrainId = "dunes" | "ridges" | "ripples" | "saddle" | "crater";

export interface TerrainPreset {
  id: TerrainId;
  name: string;
  blurb: string;
}

export const TERRAIN_PRESETS: TerrainPreset[] = [
  { id: "dunes", name: "Smooth Dunes", blurb: "rolling sine hills — mellow, round" },
  { id: "ridges", name: "Jagged Ridges", blurb: "folded crests — bright, buzzy" },
  { id: "ripples", name: "Concentric Ripples", blurb: "radial rings — hollow, formant" },
  { id: "saddle", name: "Saddle Pass", blurb: "hyperbolic gap — odd harmonics" },
  { id: "crater", name: "Impact Crater", blurb: "ringed bowl — woody, pinched" },
];

// Height functions. `m` (0..1) is the morph phase, slowly drifting so the
// timbre evolves. All return roughly [-1, 1].
export function terrainHeight(id: TerrainId, x: number, y: number, m: number): number {
  const tau = Math.PI * 2;
  switch (id) {
    case "dunes": {
      const a = Math.sin(x * 2.1 + m * tau) * Math.cos(y * 1.7 - m * tau * 0.5);
      const b = 0.4 * Math.sin((x + y) * 3.3 + m * tau);
      return 0.7 * a + b * 0.5;
    }
    case "ridges": {
      // Triangle-ish folds give a saw/square character (rich harmonics).
      const fold = (v: number) => 2 * Math.abs(v - Math.round(v)) - 0.5;
      const r = fold(x * 1.6 + Math.sin(m * tau) * 0.5) + fold(y * 1.9 - Math.cos(m * tau) * 0.5);
      return Math.tanh(r * 1.3);
    }
    case "ripples": {
      const d = Math.sqrt(x * x + y * y);
      return Math.cos(d * 9.0 - m * tau * 1.5) * Math.exp(-d * 0.6);
    }
    case "saddle": {
      const s = (x * x - y * y) * 1.1 + 0.5 * Math.sin(x * 3.0 + m * tau);
      return Math.tanh(s);
    }
    case "crater": {
      const d = Math.sqrt(x * x + y * y);
      const rim = Math.exp(-((d - 0.6) * (d - 0.6)) * 9.0);
      const bowl = -Math.exp(-d * d * 3.0) * 0.8;
      const ring = 0.25 * Math.cos(d * 12 - m * tau);
      return (rim * 1.4 + bowl + ring) - 0.2;
    }
  }
}

export interface Orbit {
  // Closed Lissajous-ish loop in terrain space, centered at the origin.
  radius: number; // 0.2 .. 0.95
  lobes: number; // 1 .. 5 — adds harmonic structure to the path
  twist: number; // 0 .. 1 — phase offset between x/y, reshapes the loop
  rot: number; // 0..2pi — orientation, slowly rotates
}

export function orbitPoint(orb: Orbit, t: number): [number, number] {
  // t in [0, 1) parametrizes one closed loop.
  const a = t * Math.PI * 2;
  // Base ellipse plus a lobed modulation so the read path is non-trivial.
  const rx = orb.radius * (1 + 0.35 * Math.sin(a * orb.lobes + orb.twist * Math.PI * 2));
  const ry = orb.radius * (1 + 0.35 * Math.cos(a * orb.lobes));
  const px = Math.cos(a) * rx;
  const py = Math.sin(a) * ry;
  // rotate
  const c = Math.cos(orb.rot);
  const s = Math.sin(orb.rot);
  const x = px * c - py * s;
  const y = px * s + py * c;
  // clamp inside the field
  return [Math.max(-0.99, Math.min(0.99, x)), Math.max(-0.99, Math.min(0.99, y))];
}

// One period of the waveform: sample terrain height along the orbit.
// DC-blocked (mean subtracted) and peak-normalized to ~1.
export function sampleWaveform(
  id: TerrainId,
  orb: Orbit,
  m: number,
  n: number,
): Float32Array {
  const out = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const [x, y] = orbitPoint(orb, t);
    const z = terrainHeight(id, x, y, m);
    out[i] = z;
    mean += z;
  }
  mean /= n;
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    out[i] -= mean; // DC block
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  const inv = 1 / peak;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

// Naive real DFT → cosine/sine coefficient arrays for createPeriodicWave.
// n samples in, returns { real, imag } of length harmonics+1.
export function waveformToFourier(
  samples: Float32Array,
  harmonics: number,
): { real: Float32Array; imag: Float32Array } {
  const n = samples.length;
  const h = Math.min(harmonics, Math.floor(n / 2));
  const real = new Float32Array(h + 1);
  const imag = new Float32Array(h + 1);
  // real[0] stays 0 (DC removed by createPeriodicWave anyway).
  for (let k = 1; k <= h; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const phase = (-2 * Math.PI * k * i) / n;
      re += samples[i] * Math.cos(phase);
      im += samples[i] * Math.sin(phase);
    }
    // PeriodicWave: real = cosine terms, imag = sine terms.
    real[k] = (2 * re) / n;
    imag[k] = (2 * im) / n;
  }
  return { real, imag };
}
