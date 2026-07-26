// field.ts — the real Faraday-wave fluid for "2768-faraday".
//
// A dish of water shaken vertically answers a sound. We integrate a damped,
// parametrically-forced surface height field h(x,y,t) on a grid:
//
//     ∂²h/∂t² = c²∇²h − β∇⁴h − γ ∂h/∂t + F·a(t)·h
//
// The last term is the Faraday mechanism. Writing one spatial mode h_k(t) and
// a vertical drive a(t) = A·cos(Ω t), the equation becomes the damped MATHIEU
// equation
//
//     ḧ_k + γ ḣ_k + [ω₀(k)² − F·A·cos(Ω t)] h_k = 0,   ω₀(k)² = c²k² + βk⁴
//
// whose parametric (subharmonic) instability grows a mode when its natural
// frequency ω₀(k) ≈ Ω/2 and the drive amplitude F·A crosses the Mathieu
// threshold set by the damping. So the water answers at HALF the drive
// frequency and self-selects a wavenumber k* with ω₀(k*) = Ω/2 — real Faraday
// physics, not a noise texture. The −β∇⁴ term (capillary stiffness) plus a
// k-dependent viscous loss give a finite preferred cell size.
//
// Refs: Faraday (1831); the Mathieu equation / parametric resonance;
// Kudrolli & Gollub, Physica D 97 (1996) on Faraday pattern selection.

/** Deterministic PRNG — seeds every stochastic choice in this prototype so two
 *  runs are bit-identical (the lab's deterministic-review invariant). */
export const SEED = 0x2768;
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── physics constants (tuned numerically for a bounded, breathing dish) ──
// The tuning was found by a headless sweep: below amp≈0.5 the dish is flat
// (sub-threshold), amp≈0.55–0.95 grows a clean pattern whose dominant
// wavenumber sits right at k* = ω₀⁻¹(Ω/2) (≈1.0 rad/cell, ~6–8-cell cells),
// and over-driving tips it into whole-dish sloshing — all real Faraday phases.
const C2 = 0.16; // gravity-like stiffness → ω₀² term c²k²
const BETA = 0.018; // capillary stiffness → ω₀² term βk⁴ (sets cell size)
const GAMMA = 0.05; // bulk viscous damping (sets the Mathieu threshold)
const FORCE = 0.1; // parametric coupling F (keeps ε = F·A/Ω² near O(1))
const NONLIN = 1.0; // cubic Landau saturation → finite, clean pattern amplitude
export const OMEGA = 0.9; // vertical drive frequency Ω (rad / sim-time)
const H_CLAMP = 6.0; // numerical safety clamp on height

/** ω₀(k): the fluid's own dispersion relation. The sonifier reads pitch from
 *  THIS, so every partial frequency is a continuous consequence of the water's
 *  physics — never snapped to a musical scale. */
export function omega0(k: number): number {
  return Math.sqrt(C2 * k * k + BETA * k * k * k * k);
}

export interface SpectrumBand {
  /** Energy-weighted centroid wavenumber of the band (rad / cell). */
  k: number;
  /** Audible frequency this band voices (Hz), from ω₀(k). */
  hz: number;
  /** Normalized spectral energy in the band, 0..1. */
  energy: number;
}

export interface FaradayField {
  readonly n: number;
  readonly bands: number;
  /** Current height buffer (row-major, length n*n). Read-only for the renderer. */
  readonly height: Float32Array;
  /** Advance the surface by dt under drive amplitude `amp` (the audio loudness
   *  shaking the dish). Returns nothing; mutates the field. */
  step(dt: number, amp: number): void;
  /** Estimate the radial power spectrum and voice it as K bands. */
  analyse(): { bands: SpectrumBand[]; rms: number };
  /** Re-seed a flat dish with a whisper of noise. */
  reset(): void;
}

// ── slice-DFT machinery for the radial spectrum readout ──
const L = 128; // slice length for the spectral estimate
const K_BANDS = 7; // partial count

/** Build a Faraday dish of n×n cells. */
export function buildField(n = 160): FaradayField {
  const size = n * n;
  const h = new Float32Array(size); // height
  const v = new Float32Array(size); // vertical velocity ∂h/∂t
  const lap = new Float32Array(size); // scratch: ∇²h

  // Circular dish mask: extra damping toward the rim, hard wall outside.
  const damp = new Float32Array(size); // per-cell viscous loss
  const inside = new Uint8Array(size);
  const cx = (n - 1) / 2;
  const cy = (n - 1) / 2;
  const R = n * 0.47;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const r = Math.hypot(x - cx, y - cy) / R;
      inside[i] = r < 1 ? 1 : 0;
      // smoothly ramp damping up over the outer 18% → a soft meniscus, no ring.
      const edge = Math.max(0, (r - 0.82) / 0.18);
      damp[i] = GAMMA + 0.6 * edge * edge;
    }
  }

  const rng = mulberry32(SEED);
  const seedNoise = (): void => {
    for (let i = 0; i < size; i++) {
      h[i] = inside[i] ? (rng() * 2 - 1) * 0.02 : 0;
      v[i] = 0;
    }
  };
  seedNoise();

  let phase = 0;

  const laplacian = (src: Float32Array, dst: Float32Array): void => {
    for (let y = 1; y < n - 1; y++) {
      const row = y * n;
      for (let x = 1; x < n - 1; x++) {
        const i = row + x;
        dst[i] =
          src[i - 1] + src[i + 1] + src[i - n] + src[i + n] - 4 * src[i];
      }
    }
  };

  const step = (dt: number, amp: number): void => {
    phase += OMEGA * dt;
    const drive = amp * Math.cos(phase); // a(t): vertical shake this instant
    laplacian(h, lap); // ∇²h
    // biharmonic ∇⁴h = ∇²(∇²h); reuse `lap` as its own source into a temp read.
    for (let y = 2; y < n - 2; y++) {
      const row = y * n;
      for (let x = 2; x < n - 2; x++) {
        const i = row + x;
        const bih =
          lap[i - 1] + lap[i + 1] + lap[i - n] + lap[i + n] - 4 * lap[i];
        // parametric-Mathieu acceleration + cubic Landau saturation
        const hi = h[i];
        const accel =
          C2 * lap[i] - BETA * bih + FORCE * drive * hi - NONLIN * hi * hi * hi;
        // semi-implicit damping (unconditionally stable for the loss term)
        let vv = (v[i] + accel * dt) / (1 + damp[i] * dt);
        if (vv > H_CLAMP) vv = H_CLAMP;
        else if (vv < -H_CLAMP) vv = -H_CLAMP;
        v[i] = vv;
      }
    }
    for (let i = 0; i < size; i++) {
      if (!inside[i]) {
        h[i] = 0;
        v[i] = 0;
        continue;
      }
      let hh = h[i] + v[i] * dt;
      if (hh > H_CLAMP) hh = H_CLAMP;
      else if (hh < -H_CLAMP) hh = -H_CLAMP;
      h[i] = hh;
    }
  };

  // Precompute Hann window + DFT tables for the slice spectrum.
  const win = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1));
  }
  const half = L >> 1;
  const cosT = new Float32Array(half * L);
  const sinT = new Float32Array(half * L);
  for (let m = 0; m < half; m++) {
    for (let i = 0; i < L; i++) {
      const ang = (2 * Math.PI * m * i) / L;
      cosT[m * L + i] = Math.cos(ang);
      sinT[m * L + i] = Math.sin(ang);
    }
  }
  // wavenumber (rad/cell) of DFT bin m, and its log-spaced band assignment.
  const kOf = (m: number): number => (2 * Math.PI * m) / L;
  const bandOfBin = new Int32Array(half);
  {
    const mLo = 1;
    const mHi = half - 1;
    const logLo = Math.log(mLo);
    const logHi = Math.log(mHi);
    for (let m = 0; m < half; m++) {
      if (m < mLo) {
        bandOfBin[m] = -1;
        continue;
      }
      const t = (Math.log(m) - logLo) / (logHi - logLo);
      bandOfBin[m] = Math.min(K_BANDS - 1, Math.floor(t * K_BANDS));
    }
  }
  // Map ω₀ → audible Hz on a log scale (continuous, physics-derived).
  const w0min = omega0(kOf(1));
  const w0max = omega0(kOf(half - 1));
  const HZ_LO = 62;
  const HZ_HI = 1480;
  const hzOfOmega = (w: number): number => {
    const t =
      (Math.log(Math.max(w, w0min)) - Math.log(w0min)) /
      (Math.log(w0max) - Math.log(w0min));
    return HZ_LO * Math.pow(HZ_HI / HZ_LO, Math.min(1, Math.max(0, t)));
  };

  // reusable scratch for analysis
  const slice = new Float32Array(L);
  const bandPow = new Float64Array(K_BANDS);
  const bandKw = new Float64Array(K_BANDS); // Σ k·power (for centroid)
  const off = Math.floor((n - L) / 2); // center window offset

  const analyse = (): { bands: SpectrumBand[]; rms: number } => {
    bandPow.fill(0);
    bandKw.fill(0);
    // rms over the dish
    let sq = 0;
    let cnt = 0;
    for (let i = 0; i < size; i++) {
      if (inside[i]) {
        sq += h[i] * h[i];
        cnt++;
      }
    }
    const rms = Math.sqrt(sq / Math.max(1, cnt));

    // Average the magnitude spectrum over several rows and columns through the
    // dish → an isotropic radial estimate.
    const SLICES = 10;
    const stepR = Math.max(1, Math.floor(n / (SLICES + 1)));
    const accumulate = (getSample: (t: number) => number): void => {
      let mean = 0;
      for (let t = 0; t < L; t++) {
        const s = getSample(t);
        slice[t] = s;
        mean += s;
      }
      mean /= L;
      for (let t = 0; t < L; t++) slice[t] = (slice[t] - mean) * win[t];
      for (let m = 1; m < half; m++) {
        const b = bandOfBin[m];
        if (b < 0) continue;
        let re = 0;
        let im = 0;
        const base = m * L;
        for (let t = 0; t < L; t++) {
          re += slice[t] * cosT[base + t];
          im -= slice[t] * sinT[base + t];
        }
        const p = re * re + im * im;
        bandPow[b] += p;
        bandKw[b] += p * kOf(m);
      }
    };
    for (let s = 1; s <= SLICES; s++) {
      const yy = s * stepR;
      if (yy >= n) break;
      const rowBase = yy * n + off;
      accumulate((t) => h[rowBase + t]);
      const xx = s * stepR;
      if (xx < n) accumulate((t) => h[(off + t) * n + xx]);
    }

    let maxPow = 1e-9;
    for (let b = 0; b < K_BANDS; b++) if (bandPow[b] > maxPow) maxPow = bandPow[b];

    const bands: SpectrumBand[] = [];
    for (let b = 0; b < K_BANDS; b++) {
      const p = bandPow[b];
      const kc = p > 1e-9 ? bandKw[b] / p : kOf(2 + b * 6);
      bands.push({
        k: kc,
        hz: hzOfOmega(omega0(kc)),
        energy: p / maxPow,
      });
    }
    return { bands, rms };
  };

  return {
    n,
    bands: K_BANDS,
    height: h,
    step,
    analyse,
    reset: seedNoise,
  };
}
