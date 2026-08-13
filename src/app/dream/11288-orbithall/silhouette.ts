// ─────────────────────────────────────────────────────────────────────────────
// silhouette.ts — model-free body sensing for orbit•hall.
//
// No MediaPipe, no TensorFlow, no network. The front camera is grabbed to a tiny
// offscreen canvas (160×120). A slow running per-pixel background mean is kept;
// each frame we threshold |luma − slowMean| to get a foreground mask, then take
// its CENTROID (x,y) and AREA. That gives the body's horizontal position,
// vertical position, and "closeness" (a bigger silhouette = nearer the camera).
//
// Centroid-X drives the listener avatar's X (mirrored); area (bigger = closer)
// drives its depth Z. With no camera (denied / unavailable) a deterministic
// seeded virtual walker drifts the centroid along a slow Lissajous orbit, so the
// hall animates and the tethers breathe on their own — never blank.
//
// Copied into this folder (self-contained) from 10808-orbitroom's silhouette
// primitive, unchanged in mechanism.
// ─────────────────────────────────────────────────────────────────────────────

export type SilhouetteMode = "camera" | "virtual";

/** Normalised body reading. x,y ∈ [0,1] (image space), area ∈ [0,1] closeness. */
export interface CentroidReading {
  x: number;
  y: number;
  area: number;
}

export interface SilhouetteRig {
  mode: SilhouetteMode;
  /** Advance by dt seconds and return the current smoothed centroid reading. */
  read: (dt: number) => CentroidReading;
  /** Stop the camera stream / release everything. */
  stop: () => void;
}

export interface SilhouetteStart {
  rig: SilhouetteRig;
  /** Human-readable reason we fell back to the virtual walker, or null. */
  fallbackReason: string | null;
}

const GRAB_W = 160;
const GRAB_H = 120;

// ── deterministic PRNG (never Math.random / Date.now) ────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── the seeded virtual walker ────────────────────────────────────────────────
export function makeVirtualRig(seed: number): SilhouetteRig {
  const rng = mulberry32(seed);
  // Two slightly irrational Lissajous rates → a slow, non-repeating orbit.
  const fx = 0.055 + rng() * 0.03;
  const fy = 0.041 + rng() * 0.025;
  const fa = 0.028 + rng() * 0.02;
  const px = rng() * Math.PI * 2;
  const py = rng() * Math.PI * 2;
  const pa = rng() * Math.PI * 2;
  let t = 0;
  return {
    mode: "virtual",
    read(dt: number): CentroidReading {
      t += dt;
      const x = 0.5 + 0.36 * Math.sin(t * fx * Math.PI * 2 + px);
      const y = 0.5 + 0.16 * Math.sin(t * fy * Math.PI * 2 + py);
      const area =
        0.34 + 0.24 * (0.5 + 0.5 * Math.sin(t * fa * Math.PI * 2 + pa));
      return { x, y, area };
    },
    stop() {
      /* nothing to release */
    },
  };
}

// ── the camera-driven rig ────────────────────────────────────────────────────
function makeCameraRig(
  video: HTMLVideoElement,
  stream: MediaStream,
): SilhouetteRig {
  const canvas = document.createElement("canvas");
  canvas.width = GRAB_W;
  canvas.height = GRAB_H;
  const c2d = canvas.getContext("2d", { willReadFrequently: true });

  // Slow running background mean of luma, per pixel.
  const bg = new Float32Array(GRAB_W * GRAB_H);
  let bgReady = false;

  // Smoothed centroid so the audio listener isn't fed raw per-frame jitter.
  let sx = 0.5;
  let sy = 0.5;
  let sArea = 0.3;
  let stopped = false;

  const read = (dt: number): CentroidReading => {
    if (stopped || !c2d || video.readyState < 2 || video.videoWidth === 0) {
      return { x: sx, y: sy, area: sArea };
    }
    // Mirror horizontally so stepping to YOUR left moves the avatar left.
    c2d.save();
    c2d.scale(-1, 1);
    c2d.drawImage(video, -GRAB_W, 0, GRAB_W, GRAB_H);
    c2d.restore();

    let data: Uint8ClampedArray;
    try {
      data = c2d.getImageData(0, 0, GRAB_W, GRAB_H).data;
    } catch {
      return { x: sx, y: sy, area: sArea }; // tainted canvas / permission race
    }

    // background adaptation rate (slow) and foreground threshold on 0..255 luma
    const bgAlpha = bgReady ? 0.03 : 1;
    const thresh = 26;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let i = 0;
    for (let y = 0; y < GRAB_H; y++) {
      for (let x = 0; x < GRAB_W; x++) {
        const p = i << 2;
        const luma =
          0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        const mean = bg[i];
        const diff = luma - mean;
        if (bgReady && (diff > thresh || diff < -thresh)) {
          sumX += x;
          sumY += y;
          count++;
        }
        bg[i] = mean + diff * bgAlpha;
        i++;
      }
    }
    bgReady = true;

    const total = GRAB_W * GRAB_H;
    // Ignore trivially small masks (sensor noise) — hold the last reading.
    if (count > total * 0.01) {
      const cx = sumX / count / GRAB_W;
      const cy = sumY / count / GRAB_H;
      const area = Math.min(1, count / (total * 0.55));
      // exponential smoothing toward the fresh reading (~0.18 s time constant)
      const k = 1 - Math.exp(-dt / 0.18);
      sx += (cx - sx) * k;
      sy += (cy - sy) * k;
      sArea += (area - sArea) * k;
    } else {
      // decay closeness back toward neutral when the room is empty/still
      const k = 1 - Math.exp(-dt / 1.4);
      sArea += (0.28 - sArea) * k;
    }
    return { x: sx, y: sy, area: sArea };
  };

  return {
    mode: "camera",
    read,
    stop() {
      stopped = true;
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

/**
 * Try the front camera; on any failure fall back to the deterministic walker.
 * Audio is unaffected — the caller owns the AudioContext and its user gesture.
 */
export async function startSilhouette(seed: number): Promise<SilhouetteStart> {
  const md =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md || typeof md.getUserMedia !== "function") {
    return {
      rig: makeVirtualRig(seed),
      fallbackReason: "No camera API here — running the virtual walker.",
    };
  }
  try {
    const stream = await md.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 320 },
        height: { ideal: 240 },
      },
      audio: false,
    });
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => {
      /* some browsers resolve play() late; the loop guards readyState */
    });
    return { rig: makeCameraRig(video, stream), fallbackReason: null };
  } catch {
    return {
      rig: makeVirtualRig(seed),
      fallbackReason:
        "Camera not available — running the virtual walker instead.",
    };
  }
}
