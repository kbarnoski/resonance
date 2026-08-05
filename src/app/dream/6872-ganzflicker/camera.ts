// ════════════════════════════════════════════════════════════════════════════
// 6872 · GANZFLICKER — the room coupler (privacy-first)
//
// Couples the Ganzfeld to the real environment WITHOUT ever showing the camera.
// getUserMedia({video}) streams into an offscreen <video> that is never added to
// the visible DOM; each sample() draws it into a tiny 16×12 canvas and reads the
// averaged pixels back to a single brightness + dominant hue. Only those two
// scalars leave this module — the raw feed is never rendered, stored, or exposed.
//
// Fallback ladder: no camera → microphone level drives the field's pulse; no mic
// → the module stays idle and the page falls back to its seeded auto-drift.
//
// No React. Deterministic (no Math.random / Date.now).
// ════════════════════════════════════════════════════════════════════════════

export type RoomMode = "idle" | "camera" | "mic";

const SAMPLE_W = 16;
const SAMPLE_H = 12;

export class RoomSensor {
  mode: RoomMode = "idle";
  brightness = 0.4; // 0..1  (smoothed)
  hue = 0.72; // 0..1  (smoothed, violet default)
  level = 0; // 0..1  mic level (smoothed)

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private cctx: CanvasRenderingContext2D | null = null;

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micData: Uint8Array<ArrayBuffer> | null = null;

  /** Try camera; on failure fall back to mic; on failure stay idle. */
  async couple(): Promise<RoomMode> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, facingMode: "user" },
        audio: false,
      });
      this.stream = stream;
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play().catch(() => {});
      this.video = video;
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_W;
      canvas.height = SAMPLE_H;
      this.canvas = canvas;
      this.cctx = canvas.getContext("2d", { willReadFrequently: true });
      this.mode = "camera";
      return "camera";
    } catch {
      // camera denied / unavailable → try mic
      return this.coupleMic();
    }
  }

  private async coupleMic(): Promise<RoomMode> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      this.audioCtx = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this.analyser = analyser;
      this.micData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      this.mode = "mic";
      return "mic";
    } catch {
      this.mode = "idle";
      return "idle";
    }
  }

  /** Called each frame; refreshes brightness/hue (camera) or level (mic). */
  sample(): void {
    if (this.mode === "camera" && this.video && this.cctx) {
      if (this.video.readyState < 2) return; // not enough data yet
      try {
        this.cctx.drawImage(this.video, 0, 0, SAMPLE_W, SAMPLE_H);
        const d = this.cctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        let rs = 0,
          gs = 0,
          bs = 0;
        const n = SAMPLE_W * SAMPLE_H;
        for (let i = 0; i < d.length; i += 4) {
          rs += d[i];
          gs += d[i + 1];
          bs += d[i + 2];
        }
        const r = rs / n / 255;
        const g = gs / n / 255;
        const b = bs / n / 255;
        const bright = 0.299 * r + 0.587 * g + 0.114 * b;
        const hue = rgbToHue(r, g, b);
        // smooth to keep the field calm
        this.brightness += (bright - this.brightness) * 0.08;
        this.hue = lerpHue(this.hue, hue, 0.05);
      } catch {
        /* CORS / not ready — keep last values */
      }
    } else if (this.mode === "mic" && this.analyser && this.micData) {
      this.analyser.getByteTimeDomainData(this.micData);
      let sum = 0;
      for (let i = 0; i < this.micData.length; i++) {
        const v = (this.micData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.micData.length);
      const lvl = Math.min(1, rms * 3.5);
      this.level += (lvl - this.level) * 0.15;
    }
  }

  stop(): void {
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* noop */
    }
    try {
      if (this.video) {
        this.video.pause();
        this.video.srcObject = null;
      }
    } catch {
      /* noop */
    }
    const ac = this.audioCtx;
    if (ac) {
      setTimeout(() => {
        if (ac.state !== "closed") ac.close().catch(() => {});
      }, 300);
    }
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.cctx = null;
    this.analyser = null;
    this.micData = null;
    this.audioCtx = null;
    this.mode = "idle";
  }
}

// rgb (0..1) → hue (0..1)
function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-4) return 0.72; // near-grey room → keep violet default
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return h;
}

// shortest-path hue lerp so it never spins the long way round the wheel
function lerpHue(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  let h = a + d * t;
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  return h;
}
