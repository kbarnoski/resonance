// ─────────────────────────────────────────────────────────────────────────────
// flow.ts — webcam optical-flow → somatic motion telemetry.
//
//   NO ML / NO MediaPipe / NO CDN. A hidden tiny <canvas> (~96×72) draws the
//   video each frame, downsamples to an 8×6 grid, and computes frame-difference
//   vs the previous frame:
//
//     energy     total motion (0..1)
//     centroidX  motion centre of mass, 0..1 (mirror-corrected: right = 1)
//     centroidY  motion centre of mass, 0..1 (top = 0)
//     cells      per-cell energy (for the visual field)
//     smoothness INVERSE-JERK — how continuous the motion is. Slow, deliberate,
//                present movement → 1. Jerky / agitated / fast → 0. This is the
//                spine of the whole piece: stillness & smoothness are rewarded.
//
//   Determinism: NO Math.random / Date.now / argless new Date() anywhere — a
//   seeded mulberry32 PRNG + performance.now() drive the headless ghost mover
//   so the piece self-demos the agitation → calm → reward arc with no camera.
// ─────────────────────────────────────────────────────────────────────────────

export const GRID_W = 8;
export const GRID_H = 6;
export const GRID_N = GRID_W * GRID_H;
const THUMB_W = 96;
const THUMB_H = 72;

export interface FlowFrame {
  /** Total motion this frame, normalised 0..1. */
  energy: number;
  /** Motion centre of mass X, 0..1 (right = 1, already un-mirrored). */
  centroidX: number;
  /** Motion centre of mass Y, 0..1 (top = 0). */
  centroidY: number;
  /** Per-cell energy, 0..1, row-major GRID_W×GRID_H. */
  cells: Float32Array;
  /** Inverse-jerk smoothness, 0..1. High = slow continuous present motion. */
  smoothness: number;
  /** Which motion source produced this frame. */
  source: "camera" | "ghost";
}

// ── seeded PRNG (mulberry32) — banned APIs must never appear ─────────────────
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

/** Shared smoothing / jerk state carried across frames by both sources. */
export class FlowTracker {
  private prevGray: Float32Array | null = null;
  private cells = new Float32Array(GRID_N);
  // smoothing of the top-line signals
  private eEnergy = 0; // EMA energy
  private eCx = 0.5;
  private eCy = 0.5;
  // velocity of the signals, for the jerk (acceleration) estimate
  private vEnergy = 0;
  private vCx = 0;
  private vCy = 0;
  private smooth = 0.5; // running smoothness estimate

  reset(): void {
    this.prevGray = null;
    this.eEnergy = 0;
    this.eCx = 0.5;
    this.eCy = 0.5;
    this.vEnergy = 0;
    this.vCx = 0;
    this.vCy = 0;
    this.smooth = 0.5;
  }

  /** Ingest a downsampled grayscale field (length THUMB_W*THUMB_H, 0..1). */
  ingestGray(gray: Float32Array, dt: number): FlowFrame {
    const cells = this.cells;
    cells.fill(0);
    const cw = THUMB_W / GRID_W;
    const ch = THUMB_H / GRID_H;
    let total = 0;
    let sumX = 0;
    let sumY = 0;

    if (this.prevGray) {
      const prev = this.prevGray;
      for (let y = 0; y < THUMB_H; y++) {
        const gy = Math.min(GRID_H - 1, (y / ch) | 0);
        const rowBase = y * THUMB_W;
        for (let x = 0; x < THUMB_W; x++) {
          const idx = rowBase + x;
          const d = Math.abs(gray[idx] - prev[idx]);
          if (d > 0.06) {
            // threshold kills sensor noise
            const gx = Math.min(GRID_W - 1, (x / cw) | 0);
            cells[gy * GRID_W + gx] += d;
          }
        }
      }
      // normalise cells and build centroid
      let maxCell = 1e-4;
      for (let i = 0; i < GRID_N; i++) if (cells[i] > maxCell) maxCell = cells[i];
      for (let i = 0; i < GRID_N; i++) {
        const v = cells[i] / maxCell;
        cells[i] = v;
        total += v;
        const cx = i % GRID_W;
        const cy = (i / GRID_W) | 0;
        sumX += v * cx;
        sumY += v * cy;
      }
    }

    // swap prev buffer
    if (!this.prevGray || this.prevGray.length !== gray.length) {
      this.prevGray = new Float32Array(gray.length);
    }
    this.prevGray.set(gray);

    const rawEnergy = Math.min(1, total / (GRID_N * 0.5));
    let cx = total > 1e-3 ? sumX / total / (GRID_W - 1) : 0.5;
    const cy = total > 1e-3 ? sumY / total / (GRID_H - 1) : 0.5;
    // un-mirror X so moving right reads as right
    cx = 1 - cx;

    return this.finish(rawEnergy, cx, cy, dt, "camera");
  }

  /** Ingest already-computed grid energies + centroid (ghost path). */
  ingestField(
    cells: Float32Array,
    rawEnergy: number,
    cx: number,
    cy: number,
    dt: number,
  ): FlowFrame {
    this.cells.set(cells);
    return this.finish(rawEnergy, cx, cy, dt, "ghost");
  }

  private finish(
    rawEnergy: number,
    cx: number,
    cy: number,
    dt: number,
    source: FlowFrame["source"],
  ): FlowFrame {
    const k = Math.min(1, dt * 6); // ~time-constant of the EMA
    // previous smoothed values → velocities
    const pE = this.eEnergy;
    const pCx = this.eCx;
    const pCy = this.eCy;
    this.eEnergy += (rawEnergy - this.eEnergy) * k;
    this.eCx += (cx - this.eCx) * k;
    this.eCy += (cy - this.eCy) * k;

    const invDt = dt > 1e-3 ? 1 / dt : 0;
    const nvE = (this.eEnergy - pE) * invDt;
    const nvCx = (this.eCx - pCx) * invDt;
    const nvCy = (this.eCy - pCy) * invDt;
    // jerk = change in velocity (acceleration of the signal)
    const jerk =
      Math.abs(nvE - this.vEnergy) +
      Math.abs(nvCx - this.vCx) +
      Math.abs(nvCy - this.vCy);
    this.vEnergy = nvE;
    this.vCx = nvCx;
    this.vCy = nvCy;

    // Two ingredients make motion "unsmooth": jerk (acceleration) AND raw speed.
    // Slow + continuous → both low → smoothness near 1.
    const agitation = Math.min(1, jerk * 2.2 + this.eEnergy * 0.55);
    const targetSmooth = 1 - agitation;
    // slew the smoothness so it eases, and so returning to stillness is a
    // gradual, earned reward rather than an instant snap.
    const sk = Math.min(1, dt * (targetSmooth > this.smooth ? 1.3 : 3.0));
    this.smooth += (targetSmooth - this.smooth) * sk;
    this.smooth = Math.max(0, Math.min(1, this.smooth));

    return {
      energy: this.eEnergy,
      centroidX: Math.max(0, Math.min(1, this.eCx)),
      centroidY: Math.max(0, Math.min(1, this.eCy)),
      cells: this.cells,
      smoothness: this.smooth,
      source,
    };
  }
}

// ── camera capture ───────────────────────────────────────────────────────────

export interface CameraCapture {
  video: HTMLVideoElement;
  stream: MediaStream;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  gray: Float32Array;
}

/** Try to open the webcam and wire up the hidden downsample canvas.
 *  Throws / rejects if getUserMedia is unavailable or denied — the caller then
 *  falls back to the seeded ghost mover. */
export async function openCamera(): Promise<CameraCapture> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    throw new Error("getUserMedia unavailable");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
    audio: false,
  });
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("2d context unavailable");
  }
  return { video, stream, canvas, ctx, gray: new Float32Array(THUMB_W * THUMB_H) };
}

/** Draw the current video frame to the tiny canvas and return grayscale 0..1. */
export function grabGray(cap: CameraCapture): Float32Array | null {
  if (cap.video.readyState < 2) return null;
  cap.ctx.drawImage(cap.video, 0, 0, THUMB_W, THUMB_H);
  let img: ImageData;
  try {
    img = cap.ctx.getImageData(0, 0, THUMB_W, THUMB_H);
  } catch {
    return null;
  }
  const d = img.data;
  const gray = cap.gray;
  for (let i = 0; i < gray.length; i++) {
    const p = i << 2;
    gray[i] = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255;
  }
  return gray;
}

export function stopCamera(cap: CameraCapture | null): void {
  if (!cap) return;
  try {
    cap.stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  cap.video.srcObject = null;
}

// ── seeded ghost mover — headless self-demo of the full arc ──────────────────

/** A Lissajous "body" that moves agitatedly for ~20s then DECELERATES to
 *  near-stillness, so the piece demos agitation → calm → reward with no camera.
 *  Deterministic: driven only by a mulberry32 PRNG + elapsed seconds. */
export class GhostMover {
  private rnd: () => number;
  private cells = new Float32Array(GRID_N);
  // fixed Lissajous character, chosen once from the seed
  private ax: number;
  private ay: number;
  private phx: number;
  private phy: number;
  private jitterPhase: number;

  constructor(seed = 0x50a71c9e) {
    this.rnd = mulberry32(seed);
    this.ax = 1.6 + this.rnd() * 1.4;
    this.ay = 2.1 + this.rnd() * 1.4;
    this.phx = this.rnd() * 6.283;
    this.phy = this.rnd() * 6.283;
    this.jitterPhase = this.rnd() * 6.283;
  }

  /** elapsed seconds since ghost start. Returns raw field for FlowTracker. */
  sample(elapsed: number): { cells: Float32Array; energy: number; cx: number; cy: number } {
    // Arc envelope: agitation for ~14s, decel over ~8s, then near-still.
    const AGITATE = 14;
    const DECEL = 8;
    let drive: number;
    if (elapsed < AGITATE) {
      drive = 1;
    } else if (elapsed < AGITATE + DECEL) {
      const t = (elapsed - AGITATE) / DECEL;
      // smoothstep-ish ease down to a tiny residual sway
      drive = 1 - t * t * (3 - 2 * t);
    } else {
      drive = 0.04; // a barely-breathing residual — the reward state
    }

    // Base Lissajous position, always slow & continuous.
    const cx = 0.5 + 0.32 * Math.sin(this.ax * elapsed * 0.5 + this.phx);
    const cy = 0.5 + 0.28 * Math.sin(this.ay * elapsed * 0.5 + this.phy);

    // Agitation adds fast jitter (jerk) that the tracker reads as "unsmooth".
    const jitter =
      drive *
      (Math.sin(elapsed * 11 + this.jitterPhase) * 0.5 +
        Math.sin(elapsed * 17.3) * 0.5);
    const jx = cx + jitter * 0.12 * drive;
    const jy = cy + Math.sin(elapsed * 13.7) * 0.1 * drive * drive;

    // Energy: high while agitated, fades to near-zero.
    const energy = Math.max(0.01, drive * (0.55 + 0.35 * Math.abs(jitter)));

    // paint a soft blob of per-cell energy around (jx,jy)
    const cells = this.cells;
    cells.fill(0);
    const bx = jx * (GRID_W - 1);
    const by = jy * (GRID_H - 1);
    for (let i = 0; i < GRID_N; i++) {
      const gx = i % GRID_W;
      const gy = (i / GRID_W) | 0;
      const dx = gx - bx;
      const dy = gy - by;
      const falloff = Math.exp(-(dx * dx + dy * dy) / 2.2);
      cells[i] = falloff * energy;
    }
    return { cells, energy, cx: jx, cy: jy };
  }
}
