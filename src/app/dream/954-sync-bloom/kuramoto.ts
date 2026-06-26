// kuramoto.ts — the soul of the piece.
//
// A field of N phase oscillators. Each oscillator i has a phase theta_i and a
// natural frequency omega_i. We integrate the canonical Kuramoto model:
//
//   d theta_i / dt = omega_i + (K / N) * sum_j sin(theta_j - theta_i)
//
// (Kuramoto 1975). With the mean-field form above (all-to-all coupling) we can
// rewrite the coupling sum using the *order parameter*:
//
//   r * e^{i psi} = (1/N) * sum_j e^{i theta_j}
//   d theta_i / dt = omega_i + K * r * sin(psi - theta_i)
//
// so each oscillator only needs the global complex mean (r, psi) — O(N) per
// step instead of O(N^2). That is exactly what makes it tractable on the GPU:
// one reduction to get (sumCos, sumSin), then one cheap advance pass.
//
// When K is large enough relative to the spread of natural frequencies, a
// sub-population entrains (phase-LOCKS) and r jumps up. That locking is, quite
// literally, what musical consonance IS: simple frequency ratios phase-lock,
// dissonant ones beat and never settle.
//
// This module holds the pure math + cluster detection so the WebGPU path and
// the CPU/WebGL2 fallback run the SAME physics. The GPU does the heavy per-
// oscillator advance in WGSL; this file owns the CPU mirror, the natural-freq
// layout, and the readback -> clusters -> just-intonation chord pipeline.

// ── just intonation: the partials a locked cluster can snap to ───────────────
// Ratios over a slowly drifting root. Classic 5-limit JI set (Ptolemy's
// intense diatonic) plus the octave — the set of "allowed" consonant pitches.
export const JI_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
export const JI_NAMES = ["1", "9/8", "5/4", "4/3", "3/2", "5/3", "15/8", "2"];

// ── field configuration ──────────────────────────────────────────────────────
export interface FieldConfig {
  n: number; // oscillator count
  gridW: number; // visual layout width (n == gridW*gridH)
  gridH: number;
}

export function makeFieldConfig(target: number): FieldConfig {
  // snap N to a square-ish grid so the field lays out cleanly and N % 64 ~ ok
  const side = Math.round(Math.sqrt(target));
  return { n: side * side, gridW: side, gridH: side };
}

// Natural frequencies: a small spread (in rad/s) around a center, arranged so
// that *neighbourhoods* of the grid share similar omega. That spatial structure
// is what lets coherent COLOUR-BANDS bloom (locked clusters are contiguous),
// instead of locked oscillators being scattered salt-and-pepper.
export function makeNaturalFreqs(cfg: FieldConfig): Float32Array {
  const { n, gridW, gridH } = cfg;
  const omega = new Float32Array(n);
  // a few smooth low-frequency "bands" across the grid, plus jitter
  for (let i = 0; i < n; i++) {
    const gx = (i % gridW) / gridW;
    const gy = Math.floor(i / gridW) / gridH;
    // 3 overlapping sinusoidal bands -> several natural-frequency plateaus
    const band =
      0.6 * Math.sin(gx * Math.PI * 2.0 + 0.4) +
      0.5 * Math.sin(gy * Math.PI * 3.0 - 1.1) +
      0.3 * Math.sin((gx + gy) * Math.PI * 2.5);
    const jitter = (hash01(i * 2654435761) - 0.5) * 0.5;
    // center ~ 2.2 rad/s, spread ~ +/- 1.3
    omega[i] = 2.2 + band * 0.9 + jitter;
  }
  return omega;
}

export function makeInitialPhases(n: number): Float32Array {
  const ph = new Float32Array(n);
  for (let i = 0; i < n; i++) ph[i] = hash01(i * 40503 + 7) * Math.PI * 2;
  return ph;
}

// ── CPU integration step (mirror of the WGSL compute) ────────────────────────
// Mean-field Kuramoto with a per-oscillator local coupling boost `kLocal`
// (the pointer brush raises coupling where you point). Returns the global order
// parameter r for this step.
export function cpuStep(
  phase: Float32Array,
  omega: Float32Array,
  kLocal: Float32Array, // per-oscillator coupling multiplier (>=0), brush adds here
  kGlobal: number,
  dt: number,
): number {
  const n = phase.length;
  // 1. global order parameter (mean of e^{i theta})
  let sumCos = 0;
  let sumSin = 0;
  for (let i = 0; i < n; i++) {
    sumCos += Math.cos(phase[i]);
    sumSin += Math.sin(phase[i]);
  }
  const mc = sumCos / n;
  const ms = sumSin / n;
  const r = Math.sqrt(mc * mc + ms * ms);
  const psi = Math.atan2(ms, mc);

  // 2. advance each phase toward the mean field
  for (let i = 0; i < n; i++) {
    const k = kGlobal * (1 + kLocal[i]);
    const dtheta = omega[i] + k * r * Math.sin(psi - phase[i]);
    let p = phase[i] + dtheta * dt;
    // wrap to [0, 2pi)
    p %= TWO_PI;
    if (p < 0) p += TWO_PI;
    phase[i] = p;
  }
  return r;
}

// Decay the brush field a little each frame so coupling "drips" back to baseline.
export function decayKLocal(kLocal: Float32Array, factor: number): void {
  for (let i = 0; i < kLocal.length; i++) kLocal[i] *= factor;
}

// Paint coupling into a circular brush region on the grid.
export function brushKLocal(
  kLocal: Float32Array,
  cfg: FieldConfig,
  cx: number, // 0..1 grid coords
  cy: number,
  radius: number, // 0..1 fraction of grid
  strength: number,
): void {
  const { gridW, gridH } = cfg;
  const px = cx * gridW;
  const py = cy * gridH;
  const rPix = radius * Math.max(gridW, gridH);
  const r2 = rPix * rPix;
  const x0 = Math.max(0, Math.floor(px - rPix));
  const x1 = Math.min(gridW - 1, Math.ceil(px + rPix));
  const y0 = Math.max(0, Math.floor(py - rPix));
  const y1 = Math.min(gridH - 1, Math.ceil(py + rPix));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const dx = gx + 0.5 - px;
      const dy = gy + 0.5 - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const fall = 1 - d2 / r2; // soft falloff
      kLocal[gy * gridW + gx] += fall * fall * strength;
    }
  }
}

// ── cluster detection: phase readback -> locked clusters -> chord ────────────
// We bin oscillators by phase into PHASE_BINS bins; a bin that holds a coherent
// mass of oscillators (high local concentration) is a phase-locked cluster.
// Each surviving cluster's *effective frequency* (we use its phase-bin centre
// mapped through the field's frequency span, plus the global order) is snapped
// to the nearest JI partial of the current root. The distinct snapped partials
// = the current chord.

export const PHASE_BINS = 24;

export interface Cluster {
  ratioIndex: number; // index into JI_RATIOS
  strength: number; // 0..1, fraction of field in this cluster
}

export interface ChordReadout {
  r: number; // global order parameter
  clusters: Cluster[]; // distinct locked JI partials, strongest first
  histogram: number[]; // phase histogram (for HUD / debug), length PHASE_BINS
}

// Given a phase snapshot + omega, detect clusters and map to JI partials.
export function detectChord(
  phase: Float32Array,
  omega: Float32Array,
): ChordReadout {
  const n = phase.length;
  // global order parameter
  let sumCos = 0;
  let sumSin = 0;
  for (let i = 0; i < n; i++) {
    sumCos += Math.cos(phase[i]);
    sumSin += Math.sin(phase[i]);
  }
  const r = Math.sqrt(sumCos * sumCos + sumSin * sumSin) / n;

  // phase histogram + per-bin mean omega (effective freq proxy)
  const hist = new Array(PHASE_BINS).fill(0);
  const binOmega = new Array(PHASE_BINS).fill(0);
  for (let i = 0; i < n; i++) {
    let b = Math.floor((phase[i] / TWO_PI) * PHASE_BINS);
    if (b >= PHASE_BINS) b = PHASE_BINS - 1;
    if (b < 0) b = 0;
    hist[b]++;
    binOmega[b] += omega[i];
  }

  // A cluster = a contiguous run of bins whose density is above a threshold.
  // Threshold scales with r: when the field is incoherent, nothing qualifies.
  const mean = n / PHASE_BINS;
  const thresh = mean * (1.35 + (1 - r) * 1.4);

  // find peaks (local maxima above threshold)
  const raw: { bin: number; count: number; omega: number }[] = [];
  for (let b = 0; b < PHASE_BINS; b++) {
    const c = hist[b];
    if (c < thresh) continue;
    const prev = hist[(b - 1 + PHASE_BINS) % PHASE_BINS];
    const next = hist[(b + 1) % PHASE_BINS];
    if (c >= prev && c >= next) {
      raw.push({ bin: b, count: c, omega: binOmega[b] / Math.max(1, c) });
    }
  }

  // map each peak's effective omega to nearest JI partial; merge duplicates.
  // omega spans roughly [0.9, 3.5]; normalize into a log-pitch the JI set covers.
  const oMin = 0.9;
  const oMax = 3.6;
  const byRatio = new Map<number, number>(); // ratioIndex -> accumulated count
  for (const pk of raw) {
    const norm = clamp((pk.omega - oMin) / (oMax - oMin), 0, 1);
    // map norm 0..1 across the JI ratio span (1..2 -> one octave) in log space
    const targetRatio = Math.pow(2, norm); // 1..2
    let best = 0;
    let bestErr = Infinity;
    for (let j = 0; j < JI_RATIOS.length; j++) {
      const err = Math.abs(Math.log2(JI_RATIOS[j]) - Math.log2(targetRatio));
      if (err < bestErr) {
        bestErr = err;
        best = j;
      }
    }
    byRatio.set(best, (byRatio.get(best) ?? 0) + pk.count);
  }

  const clusters: Cluster[] = [];
  for (const [ratioIndex, count] of byRatio) {
    clusters.push({ ratioIndex, strength: clamp(count / n, 0, 1) });
  }
  clusters.sort((a, b) => b.strength - a.strength);
  // keep at most 5 voices so the chord stays legible
  const top = clusters.slice(0, 5);

  return { r, clusters: top, histogram: hist };
}

// ── small helpers ────────────────────────────────────────────────────────────
export const TWO_PI = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// deterministic hash -> [0,1)
function hash01(seed: number): number {
  let x = seed | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return ((x >>> 0) % 100000) / 100000;
}
