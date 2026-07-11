// ─────────────────────────────────────────────────────────────────────────────
// vision.ts — turn a camera frame (or a deterministic synthetic presence) into
// cheap per-frame body features, WITHOUT any ML library. Hand-rolled pixel math
// on a tiny 80×60 downsample:
//
//   • presence map  — camera: slow-adapting background subtraction |luma−bg|;
//                     synthetic: an analytic breathing body-blob.
//   • motion energy — frame-difference sum |cur − prev| over the presence map.
//   • silhouette features — luma-threshold over the presence map → centroid,
//     vertical spread, height, width, fill.
//
//   The SAME feature-extraction path serves both camera and synthetic modes, so
//   a headless review (camera denied) still drives a live, moving room.
// ─────────────────────────────────────────────────────────────────────────────

export interface Presence {
  mode: "camera" | "synthetic";
  motion: number; // 0..1 instantaneous motion energy
  fill: number; // 0..1 fraction of frame occupied
  height: number; // 0..1 vertical extent of the body
  width: number; // 0..1 horizontal extent
  centroidX: number; // 0..1
  centroidY: number; // 0..1 (0 = top, 1 = bottom)
  spread: number; // 0..1 vertical std-dev
  /** presence map, W*H bytes 0..255 — uploaded to the renderer as a texture. */
  silhouette: Uint8Array;
  w: number;
  h: number;
}

export interface VisionHandle {
  start(): Promise<"camera" | "synthetic">;
  sample(tSec: number): Presence;
  stop(): void;
  mode: "camera" | "synthetic";
  error: string | null;
}

const W = 80;
const H = 60;
const TH = 0.12; // presence threshold for shape features

// mulberry32 — deterministic PRNG for the synthetic presence (no Math.random).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createVision(): VisionHandle {
  const cur = new Float32Array(W * H); // presence 0..1 this frame
  const prev = new Float32Array(W * H);
  const bg = new Float32Array(W * H); // slow background estimate (camera)
  const silhouette = new Uint8Array(W * H);
  let bgReady = false;

  // synthetic phase offsets (deterministic)
  const rnd = mulberry32(0x1458);
  const p1 = rnd() * 6.283;
  const p2 = rnd() * 6.283;
  const p3 = rnd() * 6.283;

  let mode: "camera" | "synthetic" = "synthetic";
  let error: string | null = null;

  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let cctx: CanvasRenderingContext2D | null = null;

  const start = async (): Promise<"camera" | "synthetic"> => {
    // If getUserMedia is unavailable (SSR / insecure origin / headless), stay synthetic.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      error = "camera API unavailable";
      mode = "synthetic";
      return mode;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      cctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!cctx) throw new Error("no 2d context");
      mode = "camera";
      error = null;
    } catch (e) {
      // Permission denied / no device / any failure → clean synthetic fallback.
      error = e instanceof Error && e.name === "NotAllowedError" ? "camera permission denied" : "camera unavailable";
      stopStream();
      mode = "synthetic";
    }
    return mode;
  };

  const stopStream = () => {
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    stream = null;
    if (video) {
      try {
        video.pause();
        video.srcObject = null;
      } catch {
        /* ignore */
      }
    }
    video = null;
    canvas = null;
    cctx = null;
  };

  // Camera: draw mirrored frame, background-subtract into `cur`.
  const grabCamera = () => {
    if (!cctx || !video || video.readyState < 2) return false;
    cctx.save();
    cctx.translate(W, 0);
    cctx.scale(-1, 1); // mirror so it reads like a reflection
    cctx.drawImage(video, 0, 0, W, H);
    cctx.restore();
    const img = cctx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < W * H; i++) {
      const r = img[i * 4],
        g = img[i * 4 + 1],
        b = img[i * 4 + 2];
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (!bgReady) bg[i] = luma;
      else bg[i] = bg[i] * 0.99 + luma * 0.01; // slow-adapting background
      cur[i] = Math.min(1, Math.abs(luma - bg[i]) * 3.2);
    }
    bgReady = true;
    return true;
  };

  // Synthetic: an analytic breathing body — an elliptical torso plus a head,
  // drifting slowly. Fully deterministic in tSec.
  const grabSynthetic = (t: number) => {
    const cx = 0.5 + 0.16 * Math.sin(t * 0.11 + p1);
    const cyTorso = 0.62 + 0.06 * Math.sin(t * 0.09 + p2);
    const breathe = 1 + 0.16 * Math.sin(t * 0.28 + p3);
    const rx = 0.16 * breathe;
    const ry = 0.24 * breathe;
    const headCy = cyTorso - ry - 0.05;
    const headR = 0.075 * breathe;
    const sway = 0.03 * Math.sin(t * 0.5 + p1);
    for (let y = 0; y < H; y++) {
      const ny = y / H;
      for (let x = 0; x < W; x++) {
        const nx = x / W;
        // torso ellipse (with a little sway that scales toward the shoulders)
        const dx = (nx - cx - sway * (cyTorso - ny)) / rx;
        const dy = (ny - cyTorso) / ry;
        const torso = 1 - (dx * dx + dy * dy);
        // head circle
        const hx = (nx - cx) / headR;
        const hy = (ny - headCy) / headR;
        const head = 1 - (hx * hx + hy * hy);
        const f = Math.max(torso, head);
        cur[y * W + x] = f > 0 ? Math.min(1, f * 1.4) : 0;
      }
    }
  };

  const sample = (tSec: number): Presence => {
    let ok = false;
    if (mode === "camera") ok = grabCamera();
    if (!ok) grabSynthetic(tSec);

    // motion energy — frame difference over the presence map.
    let motionSum = 0;
    for (let i = 0; i < W * H; i++) {
      motionSum += Math.abs(cur[i] - prev[i]);
      prev[i] = cur[i];
      silhouette[i] = (cur[i] * 255) | 0;
    }
    // scale: typical moving-body diff is small; normalise to a usable 0..1.
    const motion = Math.min(1, motionSum / (W * H) * 12);

    // shape features from thresholded presence.
    let count = 0,
      sumX = 0,
      sumY = 0,
      sumY2 = 0,
      minX = W,
      maxX = 0,
      minY = H,
      maxY = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (cur[y * W + x] > TH) {
          count++;
          sumX += x;
          sumY += y;
          sumY2 += y * y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    let centroidX = 0.5,
      centroidY = 0.5,
      spread = 0,
      height = 0,
      width = 0,
      fill = 0;
    if (count >= 8) {
      centroidX = sumX / count / W;
      centroidY = sumY / count / H;
      const meanY = sumY / count;
      const varY = Math.max(0, sumY2 / count - meanY * meanY);
      spread = Math.min(1, (Math.sqrt(varY) / H) * 2.6);
      height = (maxY - minY) / H;
      width = (maxX - minX) / W;
      fill = count / (W * H);
    }

    return {
      mode,
      motion,
      fill,
      height,
      width,
      centroidX,
      centroidY,
      spread,
      silhouette,
      w: W,
      h: H,
    };
  };

  const stop = () => {
    stopStream();
  };

  return {
    start,
    sample,
    stop,
    get mode() {
      return mode;
    },
    get error() {
      return error;
    },
  };
}
