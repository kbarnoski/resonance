// ─────────────────────────────────────────────────────────────────────────────
// sonify.ts — the image-as-spectrum engine for 4184-scrying.
//
//   This is the inverse of an audio visualizer. A vertical column of an image is
//   read literally as a MAGNITUDE SPECTRUM and resynthesized into continuous
//   audio via an additive bank of sine partials — a real-time inverse-STFT
//   read-out ("Images that Sound," made live).
//
//   • N partials at LOG-spaced frequencies (bottom of image = low, top = high).
//   • Each frame, the pixel column under the scan-line is resampled to N bins;
//     per-bin luminance becomes that partial's target gain, ramped click-free
//     with setTargetAtTime so the sound glides instead of stepping.
//
//   No React here — pure Web Audio + typed-array DSP so the render loop stays
//   cheap and this stays testable in isolation.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG — deterministic, never Math.random(). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const N_PARTIALS = 128;
export const F_MIN = 80; // Hz — bottom of the image
export const F_MAX = 4800; // Hz — top of the image

/** Log-spaced partial frequencies, index 0 = low (bottom) → N-1 = high (top). */
export function makeFrequencies(n = N_PARTIALS, fMin = F_MIN, fMax = F_MAX): number[] {
  const out = new Array<number>(n);
  const ratio = fMax / fMin;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out[i] = fMin * Math.pow(ratio, t);
  }
  return out;
}

export interface SonEngine {
  ctx: AudioContext;
  master: GainNode;
  freqs: number[];
  gains: GainNode[];
  /** Push a fresh magnitude spectrum (length N, values ~[0,1]) into the bank. */
  applySpectrum: (mags: Float32Array, level: number) => void;
  setMaster: (v: number) => void;
  stop: () => void;
}

type WinWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

/** Build the additive resynthesis bank. MUST be called inside a user gesture. */
export function makeEngine(): SonEngine {
  const Ctor = window.AudioContext ?? (window as WinWithWebkit).webkitAudioContext;
  const ctx = new (Ctor as typeof AudioContext)();

  // master → gentle compressor → destination (keeps 128 partials from clipping)
  const master = ctx.createGain();
  master.gain.value = 0.0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  master.connect(comp);
  comp.connect(ctx.destination);

  const freqs = makeFrequencies();
  const gains: GainNode[] = [];
  const oscs: OscillatorNode[] = [];
  // Slight high-frequency roll-off so the top of the image is not shrill, and a
  // per-partial ceiling that keeps the summed bank near unity.
  const perPartial = 1.35 / Math.sqrt(N_PARTIALS);

  for (let i = 0; i < freqs.length; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freqs[i];
    // decorrelate phases deterministically for a smoother sum
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(master);
    o.start();
    oscs.push(o);
    gains.push(g);
  }

  const rolloff = freqs.map((f) => {
    // ~ -6 dB/oct above 1.2 kHz to tame sine harshness at the top rows
    const knee = 1200;
    return f <= knee ? 1 : Math.max(0.25, knee / f);
  });

  function applySpectrum(mags: Float32Array, level: number): void {
    const t = ctx.currentTime;
    const tc = 0.045; // smoothing time-constant — click-free glide
    const n = Math.min(mags.length, gains.length);
    for (let i = 0; i < n; i++) {
      const target = mags[i] * perPartial * rolloff[i] * level;
      gains[i].gain.setTargetAtTime(target, t, tc);
    }
  }

  function setMaster(v: number): void {
    master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  function stop(): void {
    for (const o of oscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    for (const g of gains) g.disconnect();
    try {
      master.disconnect();
      comp.disconnect();
    } catch {
      /* noop */
    }
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  }

  return { ctx, master, freqs, gains, applySpectrum, setMaster, stop };
}

/**
 * Read a single pixel column of an image buffer into an N-bin magnitude
 * spectrum. `col` is RGBA for one column, top→bottom, length h*4.
 * Output index 0 = LOW freq = BOTTOM of the image (so we flip vertically),
 * index N-1 = HIGH freq = TOP. Each bin averages the rows in its band.
 */
export function readColumn(
  col: Uint8ClampedArray,
  h: number,
  out: Float32Array,
): void {
  const n = out.length;
  // Precompute per-row luminance (0..1).
  // Band for bin i spans rows [i*h/n, (i+1)*h/n) in BOTTOM-UP order.
  for (let i = 0; i < n; i++) {
    const yLo = Math.floor((i * h) / n);
    const yHi = Math.max(yLo + 1, Math.floor(((i + 1) * h) / n));
    let sum = 0;
    let cnt = 0;
    for (let y = yLo; y < yHi; y++) {
      // flip: bin 0 (low) reads the BOTTOM of the image
      const row = h - 1 - y;
      const p = row * 4;
      const lum =
        (0.299 * col[p] + 0.587 * col[p + 1] + 0.114 * col[p + 2]) / 255;
      sum += lum;
      cnt++;
    }
    const lum = cnt > 0 ? sum / cnt : 0;
    // contrast curve: lift the noise floor away, emphasize bright bands
    const shaped = Math.max(0, (lum - 0.12) / 0.88);
    out[i] = shaped * shaped; // gamma ~2 — quiet grays stay quiet
  }
}

/**
 * Render the seeded procedural fallback image into a canvas 2d context: slowly
 * drifting horizontal bands + a moving bright blob. Sonified identically to a
 * real camera frame, so the piece self-demos with zero permissions.
 */
export function drawProcedural(
  cctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tSec: number,
  rnd: () => number,
  bands: number,
): void {
  cctx.fillStyle = "#000";
  cctx.fillRect(0, 0, w, h);

  // horizontal bands drifting vertically, each with its own phase/speed/hue
  for (let b = 0; b < bands; b++) {
    const phase = rnd() * Math.PI * 2;
    const speed = 0.05 + rnd() * 0.12;
    const hue = 200 + rnd() * 140;
    const yc = ((rnd() + tSec * speed) % 1) * h;
    const thick = h * (0.04 + rnd() * 0.06);
    const bright = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(phase + tSec * 0.6));
    const grad = cctx.createLinearGradient(0, yc - thick, 0, yc + thick);
    grad.addColorStop(0, `hsla(${hue}, 60%, 50%, 0)`);
    grad.addColorStop(0.5, `hsla(${hue}, 70%, ${Math.round(55 * bright)}%, ${bright})`);
    grad.addColorStop(1, `hsla(${hue}, 60%, 50%, 0)`);
    cctx.fillStyle = grad;
    cctx.fillRect(0, yc - thick, w, thick * 2);
  }

  // a moving bright blob sweeping a slow Lissajous path
  const bx = (0.5 + 0.4 * Math.sin(tSec * 0.4)) * w;
  const by = (0.5 + 0.35 * Math.sin(tSec * 0.53 + 1.3)) * h;
  const r = Math.min(w, h) * 0.16;
  const blob = cctx.createRadialGradient(bx, by, 0, bx, by, r);
  blob.addColorStop(0, "hsla(48, 90%, 72%, 0.95)");
  blob.addColorStop(0.6, "hsla(30, 85%, 55%, 0.4)");
  blob.addColorStop(1, "hsla(20, 80%, 45%, 0)");
  cctx.fillStyle = blob;
  cctx.fillRect(0, 0, w, h);
}
