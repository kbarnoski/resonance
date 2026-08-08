// Webcam hand/motion tracking with ZERO ML dependencies.
//
// getUserMedia video -> draw each frame small -> per-cell brightness delta
// (temporal) combined with spatial gradient gives a coarse optical-flow field
// (single-point Lucas-Kanade). The strongest-moving cells become force+dye
// splats, so waving a hand literally stirs the fluid. If the camera is denied
// or absent, start() rejects and the caller falls back to the seeded conductor.

export interface MotionSample {
  /** normalized position, mirrored so it feels like a mirror, top-left origin */
  x: number;
  y: number;
  /** normalized flow velocity */
  vx: number;
  vy: number;
  strength: number;
}

export interface Camera {
  start(): Promise<void>;
  /** Called once per frame; returns overall motion energy + a few splat sites. */
  poll(): { motion: number; samples: MotionSample[] };
  stop(): void;
  readonly video: HTMLVideoElement;
}

const GW = 48;
const GH = 36;

export function makeCamera(): Camera {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;

  const grid = document.createElement("canvas");
  grid.width = GW;
  grid.height = GH;
  const gctx = grid.getContext("2d", { willReadFrequently: true });

  let stream: MediaStream | null = null;
  let prev: Float32Array | null = null;
  const gray = new Float32Array(GW * GH);

  return {
    video,
    async start(): Promise<void> {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
    },
    poll(): { motion: number; samples: MotionSample[] } {
      if (!gctx || video.readyState < 2) return { motion: 0, samples: [] };
      gctx.drawImage(video, 0, 0, GW, GH);
      const px = gctx.getImageData(0, 0, GW, GH).data;
      for (let i = 0; i < GW * GH; i++) {
        const o = i * 4;
        gray[i] = (px[o] * 0.3 + px[o + 1] * 0.59 + px[o + 2] * 0.11) / 255;
      }
      if (!prev) {
        prev = new Float32Array(gray);
        return { motion: 0, samples: [] };
      }
      const candidates: MotionSample[] = [];
      let motionSum = 0;
      for (let j = 1; j < GH - 1; j++) {
        for (let i = 1; i < GW - 1; i++) {
          const c = i + j * GW;
          const dt = gray[c] - prev[c];
          const ad = Math.abs(dt);
          motionSum += ad;
          if (ad < 0.06) continue; // reject sensor noise
          const gx = (gray[c + 1] - gray[c - 1]) * 0.5;
          const gy = (gray[c + GW] - gray[c - GW]) * 0.5;
          const g2 = gx * gx + gy * gy + 1e-4;
          // optical-flow constraint: I_x*u + I_y*v + I_t = 0
          let vx = (-dt * gx) / g2;
          let vy = (-dt * gy) / g2;
          const sp = Math.hypot(vx, vy);
          if (sp > 1.5) {
            vx = (vx / sp) * 1.5;
            vy = (vy / sp) * 1.5;
          }
          candidates.push({
            x: 1 - i / GW, // mirror horizontally
            y: j / GH,
            vx: -vx, // mirror flips horizontal velocity too
            vy,
            strength: ad,
          });
        }
      }
      prev.set(gray);
      candidates.sort((a, b) => b.strength - a.strength);
      const samples = candidates.slice(0, 6);
      const motion = motionSum / (GW * GH);
      return { motion, samples };
    },
    stop(): void {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      video.srcObject = null;
      prev = null;
    },
  };
}
