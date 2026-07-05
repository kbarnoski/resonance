// mhd-core.ts — the Alfvén-wave "plasma string" engine.
//
// A magnetic field line threading a plasma behaves like a string under
// tension: transverse (Alfvén) waves travel ALONG it at the Alfvén speed
//
//     v_A = B / sqrt(mu0 * rho)              (B = field, rho = density)
//
// Reflecting at the anchored footpoints, they set up standing modes with a
// fundamental f1 = v_A / (2L) and harmonics f_n = n * f1 — a genuine string
// spectrum. We model each field line by MODAL SUPERPOSITION of those standing
// harmonics; the SAME modal amplitudes drive both the visible whip of the
// tube and the additive audio partials, so sight and sound are one model.
//
// (One honest concession: the true partials sit at hundreds of Hz — invisible
// to the eye — so the VISUAL motion is time-dilated to a few Hz while keeping
// the exact modal spectrum, decays and pitch ratios. The audio rings at the
// real f_n. Pitch is set physically by L and B; L is tuned so the rack lands
// on a pentatonic set — see README.)

import * as THREE from "three";

export const NMODES = 8;

// slight inharmonic "coronal" stretch of the partials (piano-like shimmer)
export const INHARMONIC = 0.0007;

// reference Alfvén speed in scene units. With this and the tuned fundamentals
// below, the loop radii R = v_A / (2*pi*f1) land in a pleasant scene range.
const V_A_REF = 1790;

// C minor pentatonic, low → high → longest loop (lowest) to shortest (highest)
const SCALE_HZ = [130.81, 155.56, 174.61, 196.0, 233.08, 261.63, 311.13];

export interface FieldLine {
  index: number;
  radius: number; // loop radius (scene units)
  length: number; // L = pi * R (semicircular arc length)
  f1Ref: number; // fundamental at field scale B = 1
  center: THREE.Vector3;
  planeU: THREE.Vector3; // in-plane axis: footpoint-to-footpoint direction
  planeV: THREE.Vector3; // in-plane axis: "up" out of the surface
  normal: THREE.Vector3; // transverse polarisation (out of loop plane)
  hue: number; // aurora green (0.33) → violet (0.78)
  modeEnv: Float32Array; // signed envelope amplitude per mode (running sum)
  clock: number; // line-local time for visual phase (seconds)
  flash: number; // 0..1 pluck-flash, smoothly ramped
}

// exponential decay RATE (1/s) of mode n — higher partials die faster.
// The identical rate feeds the audio gain envelopes, so decays agree.
export function modeDecay(n: number): number {
  return 0.4 + 0.3 * (n - 1); // n=1 ~2.5s, n=8 ~0.4s
}

// harmonic ratio of partial n including the coronal inharmonic stretch.
export function modeRatio(n: number): number {
  return n * (1 + INHARMONIC * n * n);
}

// Build the rack: one semicircular coronal loop per scale degree, fanned in x
// with gentle depth in z. Longer loop ⇒ lower fundamental.
export function buildRack(): FieldLine[] {
  const lines: FieldLine[] = [];
  const count = SCALE_HZ.length;
  for (let i = 0; i < count; i++) {
    const f1Ref = SCALE_HZ[i];
    const radius = V_A_REF / (2 * Math.PI * f1Ref); // R = v_A / (2*pi*f1)
    const length = Math.PI * radius;

    // fan the footpoints across x, tucked back in z toward the higher notes
    const x = (i - (count - 1) / 2) * 1.35;
    const z = -0.15 * (i - (count - 1) / 2);
    const center = new THREE.Vector3(x, -1.7, z);

    const planeU = new THREE.Vector3(1, 0, 0); // footpoint axis
    const planeV = new THREE.Vector3(0, 1, 0); // up
    const normal = new THREE.Vector3(0, 0, 1); // pluck whips out of plane

    lines.push({
      index: i,
      radius,
      length,
      f1Ref,
      center,
      planeU,
      planeV,
      normal,
      hue: 0.33 + (0.78 - 0.33) * (i / (count - 1)),
      modeEnv: new Float32Array(NMODES + 1),
      clock: 0,
      flash: 0,
    });
  }
  return lines;
}

// Point on the undisturbed arc at parameter u in [0,1] (u = s/L).
// theta sweeps 0..pi so both footpoints sit on the anchoring surface.
export function arcPoint(line: FieldLine, u: number, out: THREE.Vector3): THREE.Vector3 {
  const theta = Math.PI * u;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  out.copy(line.center);
  out.addScaledVector(line.planeU, line.radius * c);
  out.addScaledVector(line.planeV, line.radius * s);
  return out;
}

// Triangular-pluck projection onto mode n (classic plucked-string spectrum):
//   b_n = 2h / (pi^2 n^2 u0(1-u0)) * sin(n pi u0)     (~1/n^2 rolloff)
// Seed the running modal envelopes with these signed coefficients.
export function pluck(line: FieldLine, u0: number, strength: number): number[] {
  const u = Math.min(0.92, Math.max(0.08, u0));
  const denom = Math.PI * Math.PI * u * (1 - u);
  const coeffs: number[] = [];
  for (let n = 1; n <= NMODES; n++) {
    const c = (2 * strength) / (denom * n * n) * Math.sin(n * Math.PI * u);
    line.modeEnv[n] += c;
    coeffs.push(c);
  }
  line.flash = 1;
  return coeffs; // handed to the additive voice so audio == visual spectrum
}

// idle micro-perturbation: a whisper-soft pluck near the antinode that keeps
// the rack faintly alive before (and between) real plucks.
export function shimmer(line: FieldLine): number[] {
  return pluck(line, 0.5 + (Math.random() - 0.5) * 0.3, 0.012 + Math.random() * 0.02);
}

// Advance a line's envelopes and clock (decay is field-independent).
export function stepLine(line: FieldLine, dt: number) {
  line.clock += dt;
  for (let n = 1; n <= NMODES; n++) {
    line.modeEnv[n] *= Math.exp(-modeDecay(n) * dt);
  }
  // smoothly relax the pluck flash (no strobe — pure ramp)
  line.flash = Math.max(0, line.flash - dt * 1.6);
}

// Fill `out` (length NMODES+1) with E[n] = modeEnv[n] * cos(visual phase_n).
// Visual phase runs at a few Hz (time-dilated) but scaled by the line's own
// pitch and the global field so faster/higher lines shimmer faster, and by
// bScale so turning up B visibly quickens every string.
const VIS_BASE_HZ = 1.5;
const F1_MIN = SCALE_HZ[0];
export function modePhaseAmps(line: FieldLine, bScale: number, out: Float32Array): number {
  const fVis1 = VIS_BASE_HZ * (line.f1Ref / F1_MIN) * bScale;
  let energy = 0;
  for (let n = 1; n <= NMODES; n++) {
    const phase = 2 * Math.PI * modeRatio(n) * fVis1 * line.clock;
    out[n] = line.modeEnv[n] * Math.cos(phase);
    energy += Math.abs(line.modeEnv[n]);
  }
  return energy;
}

// Precompute sin(n*pi*u) for a fixed u-grid of `segments+1` samples so the
// per-frame displacement is a cheap table lookup, not a trig storm.
export function makeSinTable(segments: number): Float32Array[] {
  const table: Float32Array[] = [];
  for (let n = 0; n <= NMODES; n++) {
    const row = new Float32Array(segments + 1);
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      row[i] = Math.sin(n * Math.PI * u);
    }
    table.push(row);
  }
  return table;
}
