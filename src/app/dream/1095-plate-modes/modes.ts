// ─────────────────────────────────────────────────────────────────────────────
// modes.ts — spatial eigenmodes of the fixed-edge square plate.
//
//   A square plate with clamped-to-zero edges has standing modes
//       φ_mn(x,y) = sin(mπx) sin(nπy),  x,y ∈ [0,1]
//   with modal "radius" q = √(m²+n²). The number of nodal lines is (m-1)+(n-1),
//   so higher q ⇒ finer Chladni figures. We project the (downsampled) plate
//   field onto these modes to learn which are currently ringing; the audio layer
//   then drives one resonant voice per mode at a frequency ∝ q. That projection
//   is the literal bridge between the picture and the sound.
// ─────────────────────────────────────────────────────────────────────────────

export interface Mode {
  m: number;
  n: number;
  /** √(m²+n²) — sets pitch and nodal-line count */
  q: number;
}

/** Modes m,n ∈ 1..MAX_MN, ordered by q (low → high). */
export const MAX_MN = 4;

export const MODES: Mode[] = (() => {
  const list: Mode[] = [];
  for (let m = 1; m <= MAX_MN; m++) {
    for (let n = 1; n <= MAX_MN; n++) {
      list.push({ m, n, q: Math.sqrt(m * m + n * n) });
    }
  }
  list.sort((a, b) => a.q - b.q);
  return list;
})();

export interface Basis {
  side: number;
  /** for each mode, a Float32Array of length side*side: φ_mn sampled at cell centres */
  fields: Float32Array[];
  /** 1 / Σφ² per mode, for normalized projection */
  invNorm: Float32Array;
}

/** Precompute the sampled eigenmodes for a given readback resolution. */
export function makeBasis(side: number): Basis {
  const fields: Float32Array[] = [];
  const invNorm = new Float32Array(MODES.length);
  for (let k = 0; k < MODES.length; k++) {
    const { m, n } = MODES[k];
    const f = new Float32Array(side * side);
    let norm = 0;
    for (let y = 0; y < side; y++) {
      const sy = Math.sin((n * Math.PI * (y + 0.5)) / side);
      for (let x = 0; x < side; x++) {
        const sx = Math.sin((m * Math.PI * (x + 0.5)) / side);
        const v = sx * sy;
        f[y * side + x] = v;
        norm += v * v;
      }
    }
    fields.push(f);
    invNorm[k] = norm > 1e-9 ? 1 / norm : 0;
  }
  return { side, fields, invNorm };
}

/**
 * Project the field u onto every eigenmode; returns |coefficient| per mode.
 * Large |c_mn| ⇒ that standing pattern is strongly present in the plate right
 * now — which is exactly the pattern you see and the note you hear.
 */
export function projectField(u: Float32Array, basis: Basis, out: Float32Array): void {
  const cells = basis.side * basis.side;
  for (let k = 0; k < MODES.length; k++) {
    const f = basis.fields[k];
    let dot = 0;
    for (let i = 0; i < cells; i++) dot += u[i] * f[i];
    out[k] = Math.abs(dot * basis.invNorm[k]);
  }
}
