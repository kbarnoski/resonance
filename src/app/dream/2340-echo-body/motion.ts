// Motion sensing for 2340-echo-body.
//
// Produces TWO orthogonal, independent state variables from the body:
//   centroid  — horizontal location of motion (0 = far left, 1 = far right)
//   expansion — spatial spread / extent of moving pixels (0 = contracted, 1 = wide)
// There is deliberately NO single 0->1 master parameter; these two can conflict
// (e.g. you can drift left while contracting, or spread wide while holding still).
//
// Two interchangeable sources implement the same interface:
//   - a webcam frame-differencer (the real body)
//   - a synthetic auto-moving body (two incommensurate oscillators) so the piece
//     is fully alive with zero camera.

export interface MotionState {
  centroid: number; // 0..1  left <-> right
  expansion: number; // 0..1  contracted <-> spread wide
  energy: number; // 0..1  how much motion right now (drives presence)
}

export type MotionMode = "camera" | "synthetic";

export interface MotionSource {
  readonly mode: MotionMode;
  /** Sample the current body state. `nowMs` is performance.now(). */
  read(nowMs: number): MotionState;
  dispose(): void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Synthetic body: a wandering centroid and an independently breathing
 * expansion at an incommensurate rate. The two never phase-lock, so the
 * echo-self orbits and evolves indefinitely with no camera present.
 */
export function createSyntheticSource(): MotionSource {
  const t0 = performance.now();
  return {
    mode: "synthetic",
    read(nowMs: number): MotionState {
      const t = (nowMs - t0) / 1000;
      // Centroid: slow lateral wander (17s) + a faster wobble (6.3s).
      const centroid = clamp01(
        0.5 +
          0.4 * Math.sin((2 * Math.PI * t) / 17) +
          0.09 * Math.sin((2 * Math.PI * t) / 6.3 + 1.1),
      );
      // Expansion: breathing at 11s (incommensurate with 17s) + drift (29s).
      const expansion = clamp01(
        0.5 +
          0.4 * Math.sin((2 * Math.PI * t) / 11 + 0.7) +
          0.12 * Math.sin((2 * Math.PI * t) / 29),
      );
      // Energy tracks the instantaneous lateral speed of the synthetic body.
      const speed = Math.abs(Math.cos((2 * Math.PI * t) / 17));
      const energy = clamp01(0.35 + 0.55 * speed);
      return { centroid, expansion, energy };
    },
    dispose() {
      /* nothing to release */
    },
  };
}

interface CameraHandles {
  video: HTMLVideoElement;
  stream: MediaStream;
}

/**
 * Acquire the webcam and return a frame-differencing source. The offscreen
 * canvas (64x48) exists ONLY to read pixels for frame-diff; it is never shown.
 * Throws if getUserMedia is denied/unavailable — caller falls back to synthetic.
 */
export async function createCameraSource(): Promise<MotionSource> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia unavailable");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {
    /* autoplay may still resolve frames */
  });

  const W = 64;
  const H = 48;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const cctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!cctx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("2d context unavailable");
  }

  let prev: Uint8ClampedArray | null = null;
  // Smoothed, held state so a momentarily still body keeps its last position.
  let sCentroid = 0.5;
  let sExpansion = 0.2;
  let sEnergy = 0;

  const THRESH = 26; // per-pixel grayscale delta counted as "motion"
  const handles: CameraHandles = { video, stream };

  return {
    mode: "camera",
    read(): MotionState {
      const { video: v } = handles;
      if (v.readyState >= 2) {
        // Mirror horizontally so leftward body motion reads as leftward space.
        cctx.save();
        cctx.scale(-1, 1);
        cctx.drawImage(v, -W, 0, W, H);
        cctx.restore();
        const frame = cctx.getImageData(0, 0, W, H).data;

        if (prev) {
          let count = 0;
          let sumX = 0;
          let minX = W;
          let maxX = 0;
          let minY = H;
          let maxY = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              const g = (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
              const pg = (prev[i] + prev[i + 1] + prev[i + 2]) / 3;
              if (Math.abs(g - pg) > THRESH) {
                count++;
                sumX += x;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          const minPixels = 12;
          if (count > minPixels) {
            const cx = sumX / count / (W - 1);
            const spanX = (maxX - minX) / (W - 1);
            const spanY = (maxY - minY) / (H - 1);
            const spread = clamp01((spanX + spanY) / 2);
            const energy = clamp01(count / (W * H) / 0.35);
            // EMA smoothing to tame webcam jitter.
            sCentroid += (cx - sCentroid) * 0.25;
            sExpansion += (spread - sExpansion) * 0.2;
            sEnergy += (energy - sEnergy) * 0.3;
          } else {
            // Still body: hold position, let expansion + energy fall away.
            sExpansion += (0 - sExpansion) * 0.05;
            sEnergy += (0 - sEnergy) * 0.1;
          }
        }
        prev = frame;
      }
      return { centroid: sCentroid, expansion: sExpansion, energy: sEnergy };
    },
    dispose() {
      handles.stream.getTracks().forEach((t) => t.stop());
      handles.video.srcObject = null;
    },
  };
}
