// vision.ts — 3008 · Daylight
//
// Reads THE ENVIRONMENT (not a body): the whole camera frame is downscaled
// into a tiny offscreen canvas and reduced to three scalars every tick —
//   L  mean perceptual luminance          0 (dark room / cupped lens) → 1 (bright)
//   H  warmth on a warm↔cool axis          0 (cool window) → 1 (warm lamp)
//   M  mean absolute frame-to-frame motion 0 (still) → ~1 (a hand sweeps by)
//
// When there is no camera (denied, absent, or headless) a seeded autopilot
// drifts the very same three scalars like a room settling into dusk with
// passing clouds — so the piece is always alive and demoable. All pixel work
// is local; nothing here touches the network.

/** The three light scalars the whole instrument is built from. */
export interface Light {
  L: number;
  H: number;
  M: number;
}

/** Deterministic PRNG (Tommy Ettinger's mulberry32). Seeded so the autopilot
 *  replays identically — a stable "room at dusk" for demos and screenshots. */
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

const SW = 64; // downscale width — plenty for whole-frame statistics
const SH = 48; // downscale height

/**
 * Downscales a <video> into a 64×48 offscreen canvas and derives L/H/M.
 * Keeps the previous small-frame buffer so motion is a true frame-diff.
 */
export class LightSensor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prev: Float32Array | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SW;
    this.canvas.height = SH;
    // willReadFrequently: we call getImageData every single frame.
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  /** Read one frame. Returns null when the video has no drawable data yet. */
  read(video: HTMLVideoElement): Light | null {
    const ctx = this.ctx;
    if (!ctx || video.readyState < 2 || video.videoWidth === 0) return null;

    ctx.drawImage(video, 0, 0, SW, SH);
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, SW, SH).data;
    } catch {
      // Tainted canvas (shouldn't happen for a same-origin webcam) — bail.
      return null;
    }

    const n = SW * SH;
    let sumLum = 0;
    let sumR = 0;
    let sumB = 0;
    let sumMotion = 0;
    const lumBuf = new Float32Array(n);

    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      // Rec. 601 perceptual luminance, normalized 0..1.
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      lumBuf[i] = lum;
      sumLum += lum;
      sumR += r;
      sumB += b;
      if (this.prev) sumMotion += Math.abs(lum - this.prev[i]);
    }

    this.prev = lumBuf;

    const L = sumLum / n;
    const meanR = sumR / n;
    const meanB = sumB / n;
    // Warm↔cool: red-heavy light reads warm, blue-heavy reads cool. Center on
    // 0.5, scale so an ordinary R−B swing fills the range, then clamp.
    const H = clamp01(0.5 + ((meanR - meanB) / 255) * 2.2);
    // Motion averaged, then lifted a touch so a hand-wave clearly registers.
    const M = clamp01((sumMotion / n) * 6);

    return { L, H, M };
  }

  reset(): void {
    this.prev = null;
  }
}

/**
 * Seeded "virtual light" autopilot: a room easing into dusk with clouds
 * drifting past a warm lamp. Layered sines with PRNG-fixed phases keep it
 * smooth, endless, and identical every run. `t` is elapsed seconds.
 */
export function createAutopilot(seed: number): (t: number) => Light {
  const rnd = mulberry32(seed);
  // Fix a handful of phases/rates up front so the drift is reproducible.
  const pL0 = rnd() * Math.PI * 2;
  const pL1 = rnd() * Math.PI * 2;
  const pCloud = rnd() * Math.PI * 2;
  const pH0 = rnd() * Math.PI * 2;
  const pH1 = rnd() * Math.PI * 2;
  const gust0 = rnd() * Math.PI * 2;
  const gust1 = rnd() * Math.PI * 2;

  return (t: number): Light => {
    // Slow day→dusk fall in the mid-brightness range, with two beating
    // "cloud" waves that dip the light and a rare deeper cloud shadow.
    const base = 0.52 + 0.16 * Math.sin(t * 0.045 + pL0);
    const clouds =
      0.1 * Math.sin(t * 0.19 + pL1) + 0.06 * Math.sin(t * 0.37 + pCloud);
    const shadow = Math.max(0, Math.sin(t * 0.023 + pCloud) - 0.85) * 1.6;
    const L = clamp01(base + clouds - shadow);

    // Warmth swings gently toward the lamp as the sky cools — a slow drift.
    const H = clamp01(
      0.55 + 0.28 * Math.sin(t * 0.031 + pH0) + 0.08 * Math.sin(t * 0.11 + pH1),
    );

    // Mostly still air with occasional gusts (a curtain, someone passing).
    const gust = Math.max(0, Math.sin(t * 0.6 + gust0)) * Math.max(0, Math.sin(t * 0.23 + gust1));
    const M = clamp01(0.04 + gust * 0.5);

    return { L, H, M };
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
