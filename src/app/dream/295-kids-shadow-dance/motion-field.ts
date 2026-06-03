// motion-field.ts — dependency-free, MediaPipe-free whole-body motion sensing.
//
// We draw the current camera frame to a tiny offscreen canvas (MOTION_W×
// MOTION_H), read its pixels, and compute per-cell luminance difference
// against the previous frame. That difference field is the "motion field":
// hot cells are where the child is moving. No skeleton, no model — just robust
// frame-difference optical flow that loves a constantly-wiggling 4-year-old.
//
// Output is packed for the renderer as RG8 bytes (R = motion this frame,
// G = silhouette presence = current luminance) plus a summarised MeadowFrame
// for the audio engine.
//
// When no camera is available the SAME pipeline is fed by a hand-authored
// "ghost dancer" that sweeps a soft blob across the grid, so downstream audio
// and visuals are identical and never silent.

import { MOTION_W, MOTION_H } from "./meadow-gl";
import type { MeadowFrame } from "./meadow-audio";

const CELLS = MOTION_W * MOTION_H;

export type MotionMode = "camera" | "ghost";

export interface MotionSample {
  /** RG8 bytes for the GL motion texture: R = motion, G = silhouette. */
  rg: Uint8Array;
  /** Summarised frame for the audio engine. */
  frame: MeadowFrame;
}

export interface MotionHandle {
  /** Pull a fresh motion sample (call once per animation frame). */
  sample: () => MotionSample;
  mode: MotionMode;
  dispose: () => void;
}

interface Buffers {
  rg: Uint8Array;
  prevLum: Float32Array;
  curLum: Float32Array;
  field: Float32Array; // smoothed motion (light-trail in the data)
}

function makeBuffers(): Buffers {
  return {
    rg: new Uint8Array(CELLS * 2),
    prevLum: new Float32Array(CELLS),
    curLum: new Float32Array(CELLS),
    field: new Float32Array(CELLS),
  };
}

// Turn current/previous luminance into the packed RG texture + summary.
// `hasPrev` gates the diff so the first frame doesn't flash.
function buildSample(buf: Buffers, hasPrev: boolean): MotionSample {
  const { rg, prevLum, curLum, field } = buf;
  let total = 0;
  let hot = 0;
  let wy = 0;

  for (let y = 0; y < MOTION_H; y++) {
    for (let x = 0; x < MOTION_W; x++) {
      const i = y * MOTION_W + x;
      let m = hasPrev ? Math.abs(curLum[i] - prevLum[i]) : 0;
      // Small camera-noise gate, then expand the useful range.
      m = m > 0.04 ? Math.min(1, (m - 0.04) * 5.0) : 0;
      // Keep a little of the previous value so a wiggle leaves a brief glow.
      field[i] = Math.max(m, field[i] * 0.8);

      const mv = field[i];
      total += mv;
      if (mv > 0.25) hot++;
      // Row 0 is the TOP of the camera → invert so heightY: 0=bottom, 1=top.
      wy += mv * (1 - y / (MOTION_H - 1));

      rg[i * 2] = Math.max(0, Math.min(255, Math.round(mv * 255)));
      rg[i * 2 + 1] = Math.max(0, Math.min(255, Math.round(curLum[i] * 255)));
    }
  }

  const energy = Math.min(1, (total / CELLS) * 6.0);
  const heightY = total > 1e-4 ? wy / total : 0.5;
  const spawn = Math.min(1, hot / 40);
  return { rg, frame: { energy, heightY, spawn } };
}

// ── Camera-backed motion ───────────────────────────────────────────────────
export function startCameraMotion(stream: MediaStream): MotionHandle | null {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;
  void video.play().catch(() => {});

  const small = document.createElement("canvas");
  small.width = MOTION_W;
  small.height = MOTION_H;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;

  const buf = makeBuffers();
  let hasPrev = false;

  const sample = (): MotionSample => {
    if (video.readyState >= 2 && video.videoWidth > 0) {
      buf.prevLum.set(buf.curLum);
      sctx.drawImage(video, 0, 0, MOTION_W, MOTION_H);
      const img = sctx.getImageData(0, 0, MOTION_W, MOTION_H);
      const d = img.data;
      for (let i = 0; i < CELLS; i++) {
        const p = i * 4;
        buf.curLum[i] =
          (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255;
      }
      const out = buildSample(buf, hasPrev);
      hasPrev = true;
      return out;
    }
    return buildSample(buf, false);
  };

  return {
    sample,
    mode: "camera",
    dispose: () => {
      video.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

// ── Ghost-dancer fallback ───────────────────────────────────────────────────
// Hand-authored choreography: a soft blob figure-eights across the meadow,
// occasionally jumping and flailing limbs, so the identical pipeline lights up
// without a camera and is never silent.
export function startGhostMotion(): MotionHandle {
  const buf = makeBuffers();
  const t0 = performance.now();
  let hasPrev = false;

  const sample = (): MotionSample => {
    const t = (performance.now() - t0) / 1000;
    buf.prevLum.set(buf.curLum);

    // Dancer centre traces a lissajous + a periodic "jump".
    const cx = 0.5 + 0.34 * Math.sin(t * 0.9);
    const jump = Math.max(0, Math.sin(t * 1.7));
    const cy = 0.55 - 0.3 * jump * Math.abs(Math.sin(t * 0.45));
    const limb = 0.13 + 0.06 * Math.sin(t * 6.0);
    const armX = 0.18 * Math.sin(t * 5.0);

    for (let y = 0; y < MOTION_H; y++) {
      for (let x = 0; x < MOTION_W; x++) {
        const i = y * MOTION_W + x;
        const nx = x / (MOTION_W - 1);
        const ny = y / (MOTION_H - 1);
        const dx = nx - cx;
        const dy = ny - cy;
        const body = Math.exp(-(dx * dx + dy * dy) / (2 * limb * limb));
        const arm = Math.exp(
          -((nx - cx - armX) ** 2 + (ny - cy + 0.08) ** 2) / (2 * 0.05 * 0.05),
        );
        buf.curLum[i] = Math.min(1, body + 0.6 * arm) * (0.7 + 0.3 * jump);
      }
    }
    const out = buildSample(buf, hasPrev);
    hasPrev = true;
    return out;
  };

  return { sample, mode: "ghost", dispose: () => {} };
}
