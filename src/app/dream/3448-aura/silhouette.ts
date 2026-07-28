// ════════════════════════════════════════════════════════════════════════════
// silhouette.ts — dependency-free, all-in-browser silhouette + shape descriptors
// for 3448-aura.
//
// Two mask sources feed the SAME descriptor pipeline and the SAME R8 mask
// texture:
//   1. CameraSilhouette — background-subtraction on a hidden downscaled buffer.
//      Only the derived binary shape ever leaves this file; the raw camera
//      frame is never displayed or stored (privacy-forward).
//   2. renderSynthMask — a seeded, breathing synthetic figure used as the
//      no-camera self-demo. Driven by mulberry32(0x3448) + performance.now();
//      NEVER Math.random / Date.now.
//
// From a binary mask we extract five shape descriptors — area, boundary
// complexity, reach, centroid, aspect — that the audio + shader read
// cross-modally. The SHAPE of you makes the sound, not your motion or pitch.
// ════════════════════════════════════════════════════════════════════════════

export const MASK_W = 128;
export const MASK_H = 96;

/** Shape descriptors, all normalized to a friendly 0..1 (except centroid, also 0..1). */
export interface Descriptors {
  /** Fraction of the frame the silhouette fills (0..1). Fuller body → fuller sound. */
  area: number;
  /** Boundary complexity: perimeter² / area, normalized. Ragged/reaching → 1, compact → 0. */
  complexity: number;
  /** How much the shape reaches up (top extent + centroid height), 0..1. */
  reach: number;
  /** Centroid x in 0..1 (0 = left). */
  cx: number;
  /** Centroid y in 0..1 (0 = top). */
  cy: number;
  /** Bounding-box aspect, normalized so ~0.5 is square, →1 tall, →0 wide. */
  aspect: number;
}

export const EMPTY_DESCRIPTORS: Descriptors = {
  area: 0,
  complexity: 0,
  reach: 0,
  cx: 0.5,
  cy: 0.5,
  aspect: 0.5,
};

// ── seeded PRNG ─────────────────────────────────────────────────────────────
// mulberry32: tiny, fast, deterministic. The ONLY randomness in this piece.
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

// ── descriptor extraction (shared by camera + synthetic) ─────────────────────
/** Single-pass shape analysis over a binary mask (values 0 or 255). */
export function computeDescriptors(mask: Uint8Array, w: number, h: number): Descriptors {
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let perimeter = 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x] === 0) continue;
      count++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // Boundary pixel: foreground touching a background (or out-of-bounds) 4-neighbor.
      const up = y > 0 ? mask[row - w + x] : 0;
      const down = y < h - 1 ? mask[row + w + x] : 0;
      const left = x > 0 ? mask[row + x - 1] : 0;
      const right = x < w - 1 ? mask[row + x + 1] : 0;
      if (up === 0 || down === 0 || left === 0 || right === 0) perimeter++;
    }
  }

  if (count < 12) return { ...EMPTY_DESCRIPTORS };

  const total = w * h;
  const area = count / total;
  const cx = sumX / count / w;
  const cy = sumY / count / h;

  // Boundary complexity: perimeter² / area (pixel units). Filled disc ≈ 4π ≈ 12.6;
  // ragged/spread shapes climb well above that. Map ~14..95 → 0..1.
  const raw = (perimeter * perimeter) / count;
  const complexity = clamp01((raw - 14) / (95 - 14));

  // Reach: how high the shape climbs (top extent) plus a nudge for a high centroid.
  const topNorm = minY / h; // 0 = touches the top
  const vExtent = (maxY - minY) / h;
  const reach = clamp01((1 - topNorm) * 0.62 + vExtent * 0.24 + (1 - cy) * 0.14);

  // Aspect: tall (arms in) vs wide (arms out). 0.5 square, →1 tall, →0 wide.
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const ratio = bh / (bw + bh);
  const aspect = clamp01(ratio);

  return { area, complexity, reach, cx, cy, aspect };
}

// ── seeded synthetic figure (the no-camera self-demo) ────────────────────────
// A slowly breathing standing figure: head + torso + two arms that rise and
// fall. Rasterized directly into the mask so it sweeps the FULL descriptor →
// sound → shader chain (area breathes, arms raising lifts reach & complexity).

interface SynthState {
  phaseBreath: number;
  phaseArm: number;
  phaseSway: number;
  swayAmp: number;
  armSpread: number;
}

/** Build the seeded synthetic figure state from mulberry32(0x3448). */
export function makeSynthState(): SynthState {
  const rng = mulberry32(0x3448);
  return {
    phaseBreath: rng() * Math.PI * 2,
    phaseArm: rng() * Math.PI * 2,
    phaseSway: rng() * Math.PI * 2,
    swayAmp: 0.018 + rng() * 0.02,
    armSpread: 0.6 + rng() * 0.35,
  };
}

/** Distance from point p to segment a→b (all in normalized 0..1 space). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-6;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cxp = ax + t * dx;
  const cyp = ay + t * dy;
  return Math.hypot(px - cxp, py - cyp);
}

/**
 * Rasterize the breathing synthetic figure into `mask` (values 0/255).
 * `reduceMotion` freezes the breathing/arm cycles to a calm pose.
 */
export function renderSynthMask(
  mask: Uint8Array,
  w: number,
  h: number,
  timeMs: number,
  s: SynthState,
  reduceMotion: boolean,
): void {
  const t = reduceMotion ? 0 : timeMs * 0.001;

  // Slow cycles — everything sub-Hz so it feels meditative.
  const breath = Math.sin(t * 2 * Math.PI * 0.14 + s.phaseBreath); // torso width
  const armRaise = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.055 + s.phaseArm); // 0 down .. 1 up
  const sway = reduceMotion ? 0 : Math.sin(t * 2 * Math.PI * 0.045 + s.phaseSway) * s.swayAmp;

  const cx = 0.5 + sway;
  const headY = 0.2;
  const headR = 0.058;
  const shoulderY = 0.32;
  const hipY = 0.66;
  const torsoHalf = 0.052 + 0.03 * (0.5 + 0.5 * breath); // breathing width

  // Arms swing from resting-down (~0.62) up past the head as armRaise → 1.
  const handY = 0.6 - armRaise * 0.5; // 0.6 (down) .. 0.1 (reaching up)
  const handSpread = 0.1 + s.armSpread * (0.12 + armRaise * 0.16);
  const shoulderX = 0.075;

  const lShoulderX = cx - shoulderX;
  const rShoulderX = cx + shoulderX;
  const lHandX = cx - handSpread;
  const rHandX = cx + handSpread;
  const limbR = 0.03;

  for (let y = 0; y < h; y++) {
    const py = y / h;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const px = x / w;
      let inside = false;

      // Head.
      const dh = Math.hypot(px - cx, py - headY);
      if (dh < headR) inside = true;

      // Torso: tapered vertical capsule between shoulders and hips.
      if (!inside && py >= shoulderY - 0.04 && py <= hipY + 0.05) {
        const dT = segDist(px, py, cx, shoulderY, cx, hipY);
        if (dT < torsoHalf) inside = true;
      }

      // Arms: shoulder → hand capsules.
      if (!inside) {
        const dL = segDist(px, py, lShoulderX, shoulderY, lHandX, handY);
        if (dL < limbR) inside = true;
      }
      if (!inside) {
        const dR = segDist(px, py, rShoulderX, shoulderY, rHandX, handY);
        if (dR < limbR) inside = true;
      }

      // Legs: hip → feet, spread slightly.
      if (!inside) {
        const dLl = segDist(px, py, cx - 0.02, hipY, cx - 0.06, 0.96);
        if (dLl < 0.032) inside = true;
      }
      if (!inside) {
        const dRl = segDist(px, py, cx + 0.02, hipY, cx + 0.06, 0.96);
        if (dRl < 0.032) inside = true;
      }

      mask[row + x] = inside ? 255 : 0;
    }
  }
}

// ── camera silhouette via background subtraction ─────────────────────────────
/**
 * Hidden-buffer camera silhouette. The video element is never attached to the
 * DOM — we only ever read pixels into a downscaled buffer and keep the derived
 * binary mask. A slow per-pixel background model (updated faster on pixels we
 * believe are background) keeps a still figure in the foreground.
 */
export class CameraSilhouette {
  readonly w: number;
  readonly h: number;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private bg: Float32Array | null = null;
  private mask: Uint8Array;
  ready = false;

  constructor(w = MASK_W, h = MASK_H) {
    this.w = w;
    this.h = h;
    this.mask = new Uint8Array(w * h);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** Request the camera and begin decoding. Must be called inside a user gesture. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });
    const video = document.createElement("video");
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    // Never appended to the DOM — the raw frame is never shown.
    await video.play();
    this.video = video;
    this.ready = true;
  }

  /**
   * Read one frame, update the background model, and return the binary mask.
   * Returns null until the camera has a usable frame.
   */
  sample(): Uint8Array | null {
    const v = this.video;
    if (!v || v.readyState < 2 || v.videoWidth === 0) return null;
    const { w, h } = this;

    // Mirror horizontally for a selfie feel while downscaling.
    this.ctx.save();
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(v, -w, 0, w, h);
    this.ctx.restore();

    const data = this.ctx.getImageData(0, 0, w, h).data;
    if (!this.bg) this.bg = new Float32Array(w * h);
    const bg = this.bg;
    const mask = this.mask;
    const n = w * h;

    // First good frame: seed the background with the current luminance so we
    // don't flash a full-frame silhouette on start.
    const seeding = bg[0] === 0 && bg[n - 1] === 0;

    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const lum = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
      if (seeding) {
        bg[i] = lum;
        mask[i] = 0;
        continue;
      }
      const diff = Math.abs(lum - bg[i]);
      const fg = diff > 0.14;
      mask[i] = fg ? 255 : 0;
      // Adapt the background quickly where we see background, slowly under the
      // figure — so a still silhouette persists instead of dissolving.
      bg[i] += (lum - bg[i]) * (fg ? 0.006 : 0.06);
    }
    return mask;
  }

  dispose(): void {
    this.ready = false;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.bg = null;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
