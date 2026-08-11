// ─────────────────────────────────────────────────────────────────────────────
// Chladni plate mode math + monophonic pitch detection.
//
// A square plate (side L = 1) vibrating in eigenmode (m, n) has the classic
// standing-wave field
//
//     ψ(x, y) = cos(mπx) cos(nπy) − cos(nπx) cos(mπy)          x, y ∈ [0, 1]
//
// Sand settles where the plate is still: the NODAL SET |ψ| ≈ 0. Requires
// m ≠ n (m = n makes ψ ≡ 0 — no figure). The pair (m, n) and (n, m) share the
// same nodal lines (ψ merely negates), so we keep m < n.
//
// Modal frequency follows Kirchhoff–Love thin-plate flexure, f_mn ∝ (m² + n²)
// (the same proportionality "ChladniSonify" (arXiv:2605.09846, 2026) inverts to
// go pattern → frequency). We run it the OTHER direction: a sung pitch picks the
// mode whose f_mn is closest, so higher notes summon busier figures.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChladniMode {
  m: number;
  n: number;
  /** Modal frequency proxy (Hz), f_mn = K·(m² + n²). */
  f: number;
}

/** Kirchhoff–Love proportionality constant, tuned so the simplest figure
 *  (1,2) rings near a low hum and the busiest sits in the upper voice range. */
const K = 22;

/** Build the mode table once: every m < n up to 7, sorted by modal frequency. */
export const MODES: ChladniMode[] = (() => {
  const out: ChladniMode[] = [];
  for (let m = 1; m <= 6; m++) {
    for (let n = m + 1; n <= 7; n++) {
      out.push({ m, n, f: K * (m * m + n * n) });
    }
  }
  out.sort((a, b) => a.f - b.f);
  return out;
})();

export const MIN_MODE_F = MODES[0].f;
export const MAX_MODE_F = MODES[MODES.length - 1].f;

/** Index of the mode whose modal frequency is closest to `hz` (log distance). */
export function pickModeIndex(hz: number): number {
  const f = Math.max(1, hz);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < MODES.length; i++) {
    const d = Math.abs(Math.log(MODES[i].f) - Math.log(f));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The Chladni field ψ and its gradient at (x, y) for mode (m, n). Used by the
 *  CPU backend; the GPU backends evaluate the identical formula in-shader. */
export function psiGrad(
  m: number,
  n: number,
  x: number,
  y: number,
): { psi: number; gx: number; gy: number } {
  const a = Math.PI * m;
  const b = Math.PI * n;
  const cmx = Math.cos(a * x);
  const smx = Math.sin(a * x);
  const cny = Math.cos(b * y);
  const sny = Math.sin(b * y);
  const cnx = Math.cos(b * x);
  const snx = Math.sin(b * x);
  const cmy = Math.cos(a * y);
  const smy = Math.sin(a * y);
  const psi = cmx * cny - cnx * cmy;
  const gx = -a * smx * cny + b * snx * cmy;
  const gy = -b * cmx * sny + a * cnx * smy;
  return { psi, gx, gy };
}

// ── Monophonic pitch detection (normalized autocorrelation) ──────────────────

/** Estimate the fundamental of a time-domain window via autocorrelation with
 *  parabolic interpolation. Returns -1 when the signal is too quiet/unvoiced. */
export function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;

  // Loudness gate — reject silence / breath.
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return -1;

  // Trim quiet head/tail so the ACF locks onto the voiced core.
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }
  const b = buf.subarray(r1, r2);
  const n = b.length;
  if (n < 128) return -1;

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let j = 0; j < n - lag; j++) sum += b[j] * b[j + lag];
    c[lag] = sum;
  }

  // Skip the initial downslope, then find the first strong peak.
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0) return -1;

  // Parabolic interpolation around the peak for sub-sample precision.
  let t0 = maxPos;
  if (maxPos > 0 && maxPos < n - 1) {
    const x1 = c[maxPos - 1];
    const x2 = c[maxPos];
    const x3 = c[maxPos + 1];
    const a2 = (x1 + x3 - 2 * x2) / 2;
    const b2 = (x3 - x1) / 2;
    if (a2 !== 0) t0 = maxPos - b2 / (2 * a2);
  }

  const hz = sampleRate / t0;
  if (hz < 70 || hz > 1400) return -1;
  return hz;
}
