// flow.ts — a coarse optical-flow proxy from the webcam.
//
// A live-body sensor: each frame the camera image is drawn to a tiny 64×48
// offscreen canvas and compared to the previous frame by absolute luma
// difference per cell. That frame-difference motion field is aggregated into
// three driving scalars — total motion ENERGY and a coarse motion CENTROID
// (x, y) — which the mandala shader consumes as uniforms. This is not
// Lucas-Kanade; a cheap difference is plenty to make waving a hand bloom the
// tunnel of light.
//
// No frameworks, no DOM ownership beyond a detached <video>. If the camera is
// denied or unavailable the sensor reports its mode and the caller drives the
// same scalars synthetically, so the piece never blanks.

export type FlowMode = "camera" | "denied" | "unavailable";

export interface FlowReading {
  energy: number; // 0..1 total motion energy this frame (raw, unsmoothed)
  cx: number; // -1..1 motion centroid x (mirrored for intuitive control)
  cy: number; // -1..1 motion centroid y
}

const GRID_W = 64;
const GRID_H = 48;

export class MotionSensor {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private prev: Float32Array | null = null;
  private _mode: FlowMode = "unavailable";

  get mode(): FlowMode {
    return this._mode;
  }

  /** Request the camera. Resolves to the resulting mode; never throws. */
  async start(): Promise<FlowMode> {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      this._mode = "unavailable";
      return this._mode;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
        audio: false,
      });
      this.stream = stream;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play().catch(() => {});
      this.video = video;

      const canvas = document.createElement("canvas");
      canvas.width = GRID_W;
      canvas.height = GRID_H;
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { willReadFrequently: true });
      this.prev = null;
      this._mode = this.ctx ? "camera" : "unavailable";
      return this._mode;
    } catch {
      this._mode = "denied";
      return this._mode;
    }
  }

  /** Sample the current frame → motion reading, or null if not ready yet. */
  read(): FlowReading | null {
    if (this._mode !== "camera") return null;
    const video = this.video;
    const ctx = this.ctx;
    if (!video || !ctx || video.readyState < 2) return null;

    ctx.drawImage(video, 0, 0, GRID_W, GRID_H);
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    } catch {
      return null;
    }

    const n = GRID_W * GRID_H;
    const cur = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      // Rec.601 luma
      cur[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    }

    const prev = this.prev;
    this.prev = cur;
    if (!prev) return { energy: 0, cx: 0, cy: 0 };

    let sum = 0;
    let wx = 0;
    let wy = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        let d = cur[i] - prev[i];
        if (d < 0) d = -d;
        // small deadzone kills sensor noise
        if (d < 8) d = 0;
        sum += d;
        wx += d * x;
        wy += d * y;
      }
    }

    // Normalize: divide by cell count and a reference contrast (~40 luma).
    const energy = Math.min(1, sum / (n * 40));
    let cx = 0;
    let cy = 0;
    if (sum > 1e-3) {
      cx = (wx / sum / (GRID_W - 1)) * 2 - 1; // -1..1
      cy = (wy / sum / (GRID_H - 1)) * 2 - 1;
    }
    // Mirror x so moving your hand right pushes the field right.
    cx = -cx;
    return { energy, cx, cy };
  }

  /** Stop tracks, drop the video, release buffers. Idempotent. */
  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      }
      this.stream = null;
    }
    if (this.video) {
      try {
        this.video.pause();
        this.video.srcObject = null;
      } catch {
        /* detached */
      }
      this.video = null;
    }
    this.ctx = null;
    this.canvas = null;
    this.prev = null;
  }
}
