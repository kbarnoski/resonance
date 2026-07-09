// Camera -> cell occupancy via lightweight motion + background subtraction.
// The video is mirrored and downscaled to a tiny canvas; per grid cell we
// track a decaying "presence" field (max of frame-difference motion and
// deviation from a captured background). No MediaPipe, no external deps —
// just getUserMedia + Canvas 2D.

import { STEPS, VOICES } from "./sequencer";

export interface MotionSample {
  occ: boolean[][]; // [row][col] — row 0 is the TOP of the screen
  cellPresence: number[][]; // [row][col] 0..1
  intensity: number; // instantaneous whole-frame motion 0..1
  presence: Float32Array; // per-pixel presence for the silhouette glow
  lw: number;
  lh: number;
}

export interface SilhouetteHandle {
  sample(): MotionSample;
  captureBackground(): void;
  dispose(): void;
  video: HTMLVideoElement;
}

const LW = 64; // 8 cols * 8px
const LH = 40; // 5 rows * 8px

export function startSilhouette(
  stream: MediaStream,
): SilhouetteHandle | null {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  void video.play().catch(() => {});

  const cv = document.createElement("canvas");
  cv.width = LW;
  cv.height = LH;
  const c2d = cv.getContext("2d", { willReadFrequently: true });
  if (!c2d) return null;

  const prev = new Float32Array(LW * LH);
  const bg = new Float32Array(LW * LH);
  let hasBg = false;
  const presence = new Float32Array(LW * LH);

  const occ = Array.from({ length: VOICES }, () =>
    Array.from({ length: STEPS }, () => false),
  );
  const cellPresence = Array.from({ length: VOICES }, () =>
    Array.from({ length: STEPS }, () => 0),
  );

  function readLuma(out: Float32Array) {
    c2d!.save();
    c2d!.translate(LW, 0);
    c2d!.scale(-1, 1); // mirror so it reads like a mirror
    c2d!.drawImage(video, 0, 0, LW, LH);
    c2d!.restore();
    const img = c2d!.getImageData(0, 0, LW, LH).data;
    for (let i = 0; i < LW * LH; i++) {
      const r = img[i * 4];
      const g = img[i * 4 + 1];
      const b = img[i * 4 + 2];
      out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
  }

  const cur = new Float32Array(LW * LH);
  let ready = false;

  return {
    video,
    captureBackground() {
      if (video.readyState < 2) return;
      readLuma(bg);
      hasBg = true;
    },
    sample(): MotionSample {
      let intensity = 0;
      if (video.readyState >= 2) {
        readLuma(cur);
        let motionSum = 0;
        for (let i = 0; i < LW * LH; i++) {
          const diff = ready ? Math.abs(cur[i] - prev[i]) : 0;
          const bgd = hasBg ? Math.abs(cur[i] - bg[i]) : 0;
          const m = Math.max(diff * 2.2, bgd * 1.3);
          motionSum += diff;
          // presence lingers so a still-but-present body keeps glowing
          presence[i] = Math.max(presence[i] * 0.88, Math.min(1, m));
          prev[i] = cur[i];
        }
        intensity = Math.min(1, (motionSum / (LW * LH)) * 6);
        ready = true;
      }

      // fold pixel presence into the 8x5 cells
      const cw = LW / STEPS;
      const ch = LH / VOICES;
      for (let r = 0; r < VOICES; r++) {
        for (let cIdx = 0; cIdx < STEPS; cIdx++) {
          let sum = 0;
          let n = 0;
          for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
              const px = Math.floor(cIdx * cw + x);
              const py = Math.floor(r * ch + y);
              sum += presence[py * LW + px];
              n++;
            }
          }
          const val = sum / Math.max(1, n);
          cellPresence[r][cIdx] = val;
          occ[r][cIdx] = val > 0.16;
        }
      }

      return { occ, cellPresence, intensity, presence, lw: LW, lh: LH };
    },
    dispose() {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      video.srcObject = null;
    },
  };
}
