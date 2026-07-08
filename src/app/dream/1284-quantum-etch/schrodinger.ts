// 1284-quantum-etch — schrodinger.ts
//
// The 2D time-dependent Schrödinger equation  iħ ∂ψ/∂t = −(ħ²/2m)∇²ψ + V·ψ
// solved by the SPLIT-STEP FOURIER method (Feit–Fleck–Steiger 1982). Each step
// is the symmetric factorisation
//
//     ψ ← e^{-i V dt/2} ψ            (half potential kick, real space)
//     ψ ← FFT⁻¹ e^{-i k²dt/2} FFT ψ  (kinetic drift, Fourier space)
//     ψ ← e^{-i V dt/2} ψ            (half potential kick)
//
// which is UNITARY by construction (each factor is a pure phase), so ∑|ψ|² is
// conserved to machine precision in the interior. A raised-cosine absorbing
// mask on a ~10-cell border ring quietly removes probability that reaches the
// walls so packets leave the frame instead of wrapping and interfering.
//
// Natural units ħ = m = 1. Grid dx = 1, so L = N and the Fourier wavenumbers
// are k = 2π·[0..N/2-1, -N/2..-1]/N.

import { createFFT2D, type FFT2D } from "./fft";

export type Tool = "inject" | "wall" | "well";

export interface QuantumField {
  readonly N: number;
  readonly L: number;
  readonly dt: number;
  /** Real / imaginary parts of ψ, row-major (length N·N). */
  readonly re: Float32Array;
  readonly im: Float32Array;
  /** Potential V, row-major (length N·N). */
  readonly V: Float32Array;
  /** |ψ|², refreshed by computeProb(). */
  readonly prob: Float32Array;

  step(substeps: number): void;
  computeProb(): number; // returns current max |ψ|²
  norm(): number;

  injectPacket(nx: number, ny: number, kx: number, ky: number, sigma: number, amp: number): void;
  paintPotential(nx: number, ny: number, sign: number, radius: number, amp: number): void;

  clear(): void;
  clearWave(): void;
  presetDoubleSlit(): void;
  presetStadium(): void;
  presetLattice(): void;
  presetHarmonic(): void;

  /** Fraction of |ψ|² currently sitting inside a wall (V above thresh). */
  wallContact(): number;
  /** Radial |FFT(ψ)|² spectrum, binned by |k| into `out`. Returns total. */
  radialSpectrum(out: Float32Array): number;
}

export function createField(N: number, dt: number): QuantumField {
  const size = N * N;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const V = new Float32Array(size);
  const prob = new Float32Array(size);

  const fft: FFT2D = createFFT2D(N);

  // ── Kinetic phase e^{-i k²dt/2}, precomputed per grid point ──
  const kinCos = new Float32Array(size);
  const kinSin = new Float32Array(size);
  const kAxis = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const m = i < N / 2 ? i : i - N;
    kAxis[i] = (2 * Math.PI * m) / N; // dx = 1 ⇒ L = N
  }
  const kMag = new Float32Array(size); // |k| per point, for radial spectrum
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const idx = y * N + x;
      const k2 = kAxis[x] * kAxis[x] + kAxis[y] * kAxis[y];
      const ang = -0.5 * k2 * dt;
      kinCos[idx] = Math.cos(ang);
      kinSin[idx] = Math.sin(ang);
      kMag[idx] = Math.sqrt(k2);
    }
  }
  const kMax = Math.max(...kMag);

  // ── Potential half-phase e^{-i V dt/2}, cached, recomputed when V is dirty ──
  const potCos = new Float32Array(size);
  const potSin = new Float32Array(size);
  let potDirty = true;
  const refreshPotentialPhase = () => {
    for (let i = 0; i < size; i++) {
      const ang = -0.5 * V[i] * dt;
      potCos[i] = Math.cos(ang);
      potSin[i] = Math.sin(ang);
    }
    potDirty = false;
  };

  // ── Absorbing raised-cosine mask on a border ring ──
  const border = Math.max(4, Math.round(N * 0.08));
  const mask = new Float32Array(size);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dEdge = Math.min(x, y, N - 1 - x, N - 1 - y);
      let m = 1;
      if (dEdge < border) {
        const t = dEdge / border; // 0 at wall, 1 at ring inner edge
        m = 0.5 - 0.5 * Math.cos(Math.PI * t); // raised cosine 0→1
      }
      mask[y * N + x] = m;
    }
  }

  const applyPotentialHalf = () => {
    for (let i = 0; i < size; i++) {
      const c = potCos[i];
      const s = potSin[i];
      const r = re[i];
      const m = im[i];
      re[i] = r * c - m * s;
      im[i] = r * s + m * c;
    }
  };

  const applyKinetic = () => {
    for (let i = 0; i < size; i++) {
      const c = kinCos[i];
      const s = kinSin[i];
      const r = re[i];
      const m = im[i];
      re[i] = r * c - m * s;
      im[i] = r * s + m * c;
    }
  };

  const applyMask = () => {
    for (let i = 0; i < size; i++) {
      const m = mask[i];
      re[i] *= m;
      im[i] *= m;
    }
  };

  const stepOnce = () => {
    if (potDirty) refreshPotentialPhase();
    applyPotentialHalf();
    fft.forward(re, im);
    applyKinetic();
    fft.inverse(re, im);
    applyPotentialHalf();
    applyMask();
  };

  // Scratch buffers for the k-spectrum (never touch the live ψ).
  const sRe = new Float32Array(size);
  const sIm = new Float32Array(size);

  const WALL_THRESH = 1.0;

  const field: QuantumField = {
    N,
    L: N,
    dt,
    re,
    im,
    V,
    prob,

    step(substeps: number) {
      for (let s = 0; s < substeps; s++) stepOnce();
    },

    computeProb() {
      let max = 0;
      for (let i = 0; i < size; i++) {
        const p = re[i] * re[i] + im[i] * im[i];
        prob[i] = p;
        if (p > max) max = p;
      }
      return max;
    },

    norm() {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += re[i] * re[i] + im[i] * im[i];
      return sum;
    },

    injectPacket(nx, ny, kx, ky, sigma, amp) {
      const cx = nx * N;
      const cy = ny * N;
      const inv2s2 = 1 / (2 * sigma * sigma);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const g = amp * Math.exp(-(dx * dx + dy * dy) * inv2s2);
          if (g < 1e-4) continue;
          const phase = kx * x + ky * y;
          const idx = y * N + x;
          re[idx] += g * Math.cos(phase);
          im[idx] += g * Math.sin(phase);
        }
      }
    },

    paintPotential(nx, ny, sign, radius, amp) {
      const cx = nx * N;
      const cy = ny * N;
      const inv2r2 = 1 / (2 * radius * radius);
      const rad = Math.ceil(radius * 3);
      const x0 = Math.max(0, Math.floor(cx - rad));
      const x1 = Math.min(N - 1, Math.ceil(cx + rad));
      const y0 = Math.max(0, Math.floor(cy - rad));
      const y1 = Math.min(N - 1, Math.ceil(cy + rad));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const g = amp * Math.exp(-(dx * dx + dy * dy) * inv2r2);
          const idx = y * N + x;
          V[idx] += sign * g;
          // Keep V bounded so the phase per step stays sane.
          if (V[idx] > 6) V[idx] = 6;
          else if (V[idx] < -6) V[idx] = -6;
        }
      }
      potDirty = true;
    },

    clear() {
      re.fill(0);
      im.fill(0);
      V.fill(0);
      potDirty = true;
    },

    clearWave() {
      re.fill(0);
      im.fill(0);
    },

    presetDoubleSlit() {
      V.fill(0);
      const bx = Math.round(N * 0.5);
      const thick = Math.max(2, Math.round(N * 0.02));
      const gap = Math.max(3, Math.round(N * 0.06));
      const sep = Math.round(N * 0.16);
      const c1 = Math.round(N * 0.5 - sep / 2);
      const c2 = Math.round(N * 0.5 + sep / 2);
      for (let y = 0; y < N; y++) {
        const inGap1 = Math.abs(y - c1) < gap / 2;
        const inGap2 = Math.abs(y - c2) < gap / 2;
        if (inGap1 || inGap2) continue;
        for (let x = bx - thick; x <= bx + thick; x++) {
          if (x >= 0 && x < N) V[y * N + x] = 5;
        }
      }
      potDirty = true;
    },

    presetStadium() {
      // Bunimovich stadium billiard: V ≈ 0 inside, a high wall outside, so a
      // packet rattles and settles into chaotic scar figures.
      V.fill(5);
      const rr = N * 0.3; // half-height / cap radius
      const straight = N * 0.18; // half-length of the straight section
      const cyc = N * 0.5;
      const cxL = N * 0.5 - straight;
      const cxR = N * 0.5 + straight;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dyc = y - cyc;
          let inside = false;
          if (x >= cxL && x <= cxR) {
            inside = Math.abs(dyc) <= rr;
          } else if (x < cxL) {
            const dxc = x - cxL;
            inside = dxc * dxc + dyc * dyc <= rr * rr;
          } else {
            const dxc = x - cxR;
            inside = dxc * dxc + dyc * dyc <= rr * rr;
          }
          if (inside) V[y * N + x] = 0;
        }
      }
      potDirty = true;
    },

    presetLattice() {
      V.fill(0);
      const cells = 5;
      const spacing = N / cells;
      const rad = spacing * 0.16;
      const inv2r2 = 1 / (2 * rad * rad);
      for (let gy = 0; gy < cells; gy++) {
        for (let gx = 0; gx < cells; gx++) {
          const cx = (gx + 0.5) * spacing;
          const cy = (gy + 0.5) * spacing;
          const span = Math.ceil(rad * 3);
          for (let y = Math.max(0, cy - span | 0); y <= Math.min(N - 1, cy + span | 0); y++) {
            for (let x = Math.max(0, cx - span | 0); x <= Math.min(N - 1, cx + span | 0); x++) {
              const dx = x - cx;
              const dy = y - cy;
              V[y * N + x] -= 4 * Math.exp(-(dx * dx + dy * dy) * inv2r2);
            }
          }
        }
      }
      potDirty = true;
    },

    presetHarmonic() {
      V.fill(0);
      const cx = N * 0.5;
      const cy = N * 0.5;
      const omega = 0.06;
      const k = 0.5 * omega * omega;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = x - cx;
          const dy = y - cy;
          let v = k * (dx * dx + dy * dy);
          if (v > 6) v = 6;
          V[y * N + x] = v;
        }
      }
      potDirty = true;
    },

    wallContact() {
      let inWall = 0;
      let total = 0;
      for (let i = 0; i < size; i++) {
        const p = re[i] * re[i] + im[i] * im[i];
        total += p;
        if (V[i] > WALL_THRESH) inWall += p;
      }
      return total > 1e-9 ? inWall / total : 0;
    },

    radialSpectrum(out: Float32Array) {
      sRe.set(re);
      sIm.set(im);
      fft.forward(sRe, sIm);
      const bins = out.length;
      out.fill(0);
      let total = 0;
      for (let i = 0; i < size; i++) {
        const power = sRe[i] * sRe[i] + sIm[i] * sIm[i];
        let b = Math.floor((kMag[i] / kMax) * bins);
        if (b >= bins) b = bins - 1;
        out[b] += power;
        total += power;
      }
      return total;
    },
  };

  return field;
}

/**
 * Console self-check (call once on init; do not render). A free Gaussian packet
 * should conserve ∑|ψ|² within ~0.1% over a few hundred steps and stay finite.
 */
export function runSelfCheck(N: number, dt: number): void {
  const f = createField(N, dt);
  // A STATIONARY centred packet (k=0): it spreads but never reaches the
  // absorbing border, so this isolates the unitary interior — any drift here is
  // pure integrator error, not physical absorption.
  f.injectPacket(0.5, 0.5, 0, 0, N * 0.08, 1);
  const n0 = f.norm();
  let finite = true;
  for (let s = 0; s < 300; s++) {
    f.step(1);
  }
  const n1 = f.norm();
  for (let i = 0; i < f.re.length; i++) {
    if (!Number.isFinite(f.re[i]) || !Number.isFinite(f.im[i])) {
      finite = false;
      break;
    }
  }
  const drift = Math.abs(n1 - n0) / n0;
  // The absorbing mask can only remove norm at the border; a centred packet
  // that never reaches the ring should hold to well under 0.1%.
  console.info(
    `[1284-quantum-etch] self-check: norm ${n0.toFixed(4)}→${n1.toFixed(4)} ` +
      `(drift ${(drift * 100).toFixed(4)}%), finite=${finite}`,
  );
}
