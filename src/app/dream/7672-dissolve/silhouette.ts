// ─────────────────────────────────────────────────────────────────────────────
// silhouette.ts — the body-boundary sensor for DISSOLVE.
//
//   Feeds the WebGL2 dissolution shader ONE thing every frame: an RGBA
//   silhouette-mask texture (small, GRAB_W×GRAB_H) whose .r channel is the felt
//   "this-is-me" field, plus a scalar MOTION energy in 0..1. Both are computed on
//   the CPU from a source frame so the shader stays a pure warp/compositor.
//
//   Two interchangeable sources, same interface, so the shader never cares:
//
//     • "camera" — the front webcam. Each frame is drawn (mirror-flipped) into a
//       tiny grab canvas; we read its pixels and derive the mask from a running
//       BACKGROUND model (foreground = |luma − slow-mean|, a standing silhouette
//       of whatever recently differs from the room) BLENDED with an instantaneous
//       frame-difference (the crisp moving edge). MOTION = mean |frame − prev|.
//       No segmentation model, no network — just arithmetic on luma.
//
//     • "virtual" — a DETERMINISTIC performer (seeded mulberry32 + performance.now,
//       never Math.random / Date.now). A breathing, orbiting body+head blob that
//       is scripted: a short MOVEMENT burst (intense pole) then a long STILLNESS
//       (precision decays → cosmic dissolution), on a ~60 s loop. So the whole
//       arc self-demos with zero camera — the silent-review path.
//
//   Motion is returned already normalised & mildly smoothed; the page turns it
//   into the running edge-precision that drives everything else.
// ─────────────────────────────────────────────────────────────────────────────

export const GRAB_W = 256;
export const GRAB_H = 192;

export type SilhouetteMode = "camera" | "virtual";

export interface SilhouetteFrame {
  /** Normalised motion energy this frame, 0..1 (0 = perfectly still). */
  motion: number;
}

export interface SilhouetteRig {
  mode: SilhouetteMode;
  width: number;
  height: number;
  /** RGBA mask pixels, length GRAB_W*GRAB_H*4; .r = .g = .b = mask, a = 255. */
  mask: Uint8Array;
  /** Advance internal state, recompute the mask, return motion. dt in seconds. */
  read(dt: number): SilhouetteFrame;
  stop(): void;
}

// ── deterministic PRNG (seeded; never Math.random) ───────────────────────────
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

const N = GRAB_W * GRAB_H;

// A shared mask-builder: given a grab canvas' pixel data + a persistent luma
// history/background, fill `mask` and return normalised motion energy.
function buildMask(
  data: Uint8ClampedArray,
  bg: Float32Array,
  prevLuma: Float32Array,
  mask: Uint8Array,
  havePrev: boolean,
  bgRate: number,
  motionGain: number,
): number {
  let diffSum = 0;
  for (let i = 0; i < N; i++) {
    const j = i * 4;
    const luma =
      (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;

    // running background → standing silhouette (foreground vs room)
    if (!havePrev) bg[i] = luma;
    else bg[i] += (luma - bg[i]) * bgRate;
    const fg = Math.abs(luma - bg[i]);

    // instantaneous frame difference → the crisp moving edge + motion energy
    const inst = havePrev ? Math.abs(luma - prevLuma[i]) : 0;
    prevLuma[i] = luma;
    diffSum += inst;

    // blended silhouette mask: a standing body that sharpens where it moves.
    let m = fg * 2.6 + inst * 3.2;
    if (m > 1) m = 1;
    const v = (m * 255) | 0;
    mask[j] = v;
    mask[j + 1] = v;
    mask[j + 2] = v;
    mask[j + 3] = 255;
  }
  const motion = Math.min(1, (diffSum / N) * motionGain);
  return motion;
}

// ── virtual performer ────────────────────────────────────────────────────────
function drawVirtual(
  g: CanvasRenderingContext2D,
  t: number,
  act: number,
  wobble: number,
): void {
  g.fillStyle = "#000000";
  g.fillRect(0, 0, GRAB_W, GRAB_H);

  // orbiting drift (scaled by the activity envelope) + tiny always-on breathing
  const bx =
    Math.sin(t * 0.9 + wobble) * GRAB_W * 0.16 * act +
    Math.sin(t * 0.17) * GRAB_W * 0.015;
  const by =
    Math.cos(t * 0.63 + wobble * 1.7) * GRAB_H * 0.12 * act +
    Math.cos(t * 0.23) * GRAB_H * 0.012;
  const breath = 1 + Math.sin(t * 0.8) * 0.05 + act * 0.06;

  const cx = GRAB_W * 0.5 + bx;
  const cy = GRAB_H * 0.58 + by;

  // torso — a soft bright radial blob (bright = "body" for the foreground model)
  const bw = GRAB_W * 0.22 * breath;
  const bh = GRAB_H * 0.34 * breath;
  const bodyGrad = g.createRadialGradient(cx, cy, bw * 0.15, cx, cy, bh);
  bodyGrad.addColorStop(0, "rgba(255,255,255,0.98)");
  bodyGrad.addColorStop(0.55, "rgba(210,210,210,0.85)");
  bodyGrad.addColorStop(1, "rgba(0,0,0,0)");
  g.save();
  g.translate(cx, cy);
  g.scale(bw / bh, 1);
  g.beginPath();
  g.arc(0, 0, bh, 0, Math.PI * 2);
  g.fillStyle = bodyGrad;
  g.fill();
  g.restore();

  // head — a smaller blob above, nodding slightly with activity
  const hx = cx + Math.sin(t * 1.3) * GRAB_W * 0.03 * act;
  const hy = cy - bh * 0.9 - Math.abs(Math.sin(t * 0.7)) * GRAB_H * 0.02 * act;
  const hr = GRAB_W * 0.075 * breath;
  const headGrad = g.createRadialGradient(hx, hy, hr * 0.2, hx, hy, hr);
  headGrad.addColorStop(0, "rgba(255,255,255,0.98)");
  headGrad.addColorStop(0.6, "rgba(215,215,215,0.85)");
  headGrad.addColorStop(1, "rgba(0,0,0,0)");
  g.beginPath();
  g.arc(hx, hy, hr, 0, Math.PI * 2);
  g.fillStyle = headGrad;
  g.fill();
}

function makeVirtualRig(seed: number): SilhouetteRig {
  const canvas = document.createElement("canvas");
  canvas.width = GRAB_W;
  canvas.height = GRAB_H;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const rng = mulberry32(seed);
  const wobble = rng() * Math.PI * 2; // deterministic phase offset

  const mask = new Uint8Array(N * 4);
  const bg = new Float32Array(N);
  const prevLuma = new Float32Array(N);
  let havePrev = false;
  let t = 0;

  // Scripted activity envelope on a ~60 s loop:
  //   0–6 s   → MOVEMENT burst (act≈1)      → intense pole, edge snaps sharp
  //   6–60 s  → STILLNESS (act decays → ~0) → precision decays, cosmic dissolve
  const activity = (tt: number): number => {
    const cyc = tt % 60;
    if (cyc < 6) return 0.6 + 0.4 * Math.sin(cyc * 1.6); // lively burst
    // exponential settle into deep stillness for the long dissolve
    return 0.9 * Math.exp(-(cyc - 6) / 7);
  };

  return {
    mode: "virtual",
    width: GRAB_W,
    height: GRAB_H,
    mask,
    read(dt: number): SilhouetteFrame {
      t += dt;
      const act = activity(t);
      if (g) {
        drawVirtual(g, t, act, wobble);
        const img = g.getImageData(0, 0, GRAB_W, GRAB_H);
        const motion = buildMask(
          img.data,
          bg,
          prevLuma,
          mask,
          havePrev,
          0.012,
          9.0,
        );
        havePrev = true;
        return { motion };
      }
      return { motion: 0 };
    },
    stop() {
      /* nothing to release */
    },
  };
}

// ── camera rig ───────────────────────────────────────────────────────────────
interface CameraDeps {
  video: HTMLVideoElement;
  stream: MediaStream;
}

function makeCameraRig(deps: CameraDeps): SilhouetteRig {
  const { video, stream } = deps;
  const canvas = document.createElement("canvas");
  canvas.width = GRAB_W;
  canvas.height = GRAB_H;
  const g = canvas.getContext("2d", { willReadFrequently: true });

  const mask = new Uint8Array(N * 4);
  const bg = new Float32Array(N);
  const prevLuma = new Float32Array(N);
  let havePrev = false;

  return {
    mode: "camera",
    width: GRAB_W,
    height: GRAB_H,
    mask,
    read(): SilhouetteFrame {
      if (!g || video.videoWidth === 0) return { motion: 0 };
      // Draw mirror-flipped (selfie) and cover-fit into the grab canvas.
      g.save();
      g.translate(GRAB_W, 0);
      g.scale(-1, 1);
      g.drawImage(video, 0, 0, GRAB_W, GRAB_H);
      g.restore();
      try {
        const img = g.getImageData(0, 0, GRAB_W, GRAB_H);
        const motion = buildMask(
          img.data,
          bg,
          prevLuma,
          mask,
          havePrev,
          0.01,
          11.0,
        );
        havePrev = true;
        return { motion };
      } catch {
        return { motion: 0 };
      }
    },
    stop() {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

export interface SilhouetteStart {
  rig: SilhouetteRig;
  /** Set when we fell back to the virtual performer, and why (for the notice). */
  fallbackReason: string | null;
}

/** Try the camera; on ANY failure fall back to the deterministic performer. */
export async function startSilhouette(seed: number): Promise<SilhouetteStart> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return {
      rig: makeVirtualRig(seed),
      fallbackReason: "No camera API here — running the virtual performer.",
    };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
    });
  } catch {
    return {
      rig: makeVirtualRig(seed),
      fallbackReason:
        "Camera denied or unavailable — running the virtual performer instead.",
    };
  }

  const video = document.createElement("video");
  video.style.display = "none";
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.videoWidth > 0) {
        resolve();
        return;
      }
      const onReady = () => {
        video.removeEventListener("loadeddata", onReady);
        resolve();
      };
      video.addEventListener("loadeddata", onReady);
    });
  } catch {
    for (const tr of stream.getTracks()) tr.stop();
    return {
      rig: makeVirtualRig(seed),
      fallbackReason: "The camera stream could not start — using the performer.",
    };
  }

  return { rig: makeCameraRig({ video, stream }), fallbackReason: null };
}
