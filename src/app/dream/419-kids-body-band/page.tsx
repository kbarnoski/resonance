"use client";

/**
 * 419-kids-body-band — a 4-year-old's whole-body dance becomes a live DRUM groove.
 *
 * The headline of a 3-way exploration of one question: "What if a child's
 * whole-body dance, seen through the camera, generated a live DRUM groove — no
 * melody, no tuning, just the beat their body is making?" This sibling is the
 * MediaPipe-Pose zone-triggered DRUM KIT.
 *
 * The front camera shows a mirrored, dimmed video of the child with glowing
 * limb markers drawn over their joints (Canvas2D). MediaPipe Pose Landmarker
 * tracks 33 body landmarks in real time and the body becomes a drum kit:
 *   left hand up  → TOM      right hand up → SNARE/clap
 *   both hands up/wide fast → CRASH        knee lift / body drop → KICK
 *   head bob      → HI-HAT ticks
 * A groove engine keeps a steady ~100 BPM 16th-note grid; every gesture hit is
 * QUANTIZED onto the nearest slot so even a flailing toddler locks into a beat.
 * A soft always-on pulse keeps a groove going when still; motion energy raises
 * its fullness. PURE PERCUSSION — no melody, no scale, no tuning. Everything is
 * summed through a brick-wall limiter + soft master gain so it can never blast
 * small ears.
 *
 * Graceful degradation: if the camera is denied or MediaPipe fails to load, a
 * synthetic "ghost dancer" loops through the SAME gesture detector + groove so a
 * reviewer hears + sees a full groove hands-free within ~2s. Drum pads at the
 * bottom are also tappable as a direct fallback input.
 *
 * Named refs: "Dance Motion-Guided Music Generation via RVQ" (Electronics, May
 * 2026); BlazePose (Bazarevsky et al., 2020); Lee et al. "Dancing to Music"
 * (NeurIPS 2019).
 *
 * Fully client-side. No API route. No new npm dependencies (MediaPipe is loaded
 * at runtime from a CDN). Audio = Web Audio API; visuals = Canvas2D.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildKit, type DrumKind, type DrumKit } from "./drums";
import { Groove } from "./groove";
import {
  GestureDetector,
  ghostPose,
  fullLmArray,
  smoothLandmarks,
  LM,
  type Lm,
} from "./pose";

// ── README link ───────────────────────────────────────────────────────────────
const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/419-kids-body-band/README.md";

// ── MediaPipe (loaded at runtime from CDN — NOT an npm dependency) ────────────
// Minimal local typings; the CDN module is not installed so we do not import
// types from it. webpackIgnore keeps the bundler from resolving the specifier.
interface PoseResult {
  landmarks: Lm[][];
}
interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numPoses?: number;
      },
    ): Promise<PoseLandmarkerInst>;
  };
}
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// ── Drum-pad colours / labels (no reading required — emoji + colour) ──────────
interface PadDef {
  kind: DrumKind;
  emoji: string;
  color: string; // glow / flash colour
  label: string; // for a11y only
}
const PADS: PadDef[] = [
  { kind: "kick", emoji: "🦵", color: "#fb7185", label: "kick" },
  { kind: "snare", emoji: "👏", color: "#f0abfc", label: "snare" },
  { kind: "hat", emoji: "🤘", color: "#5eead4", label: "hi-hat" },
  { kind: "tom", emoji: "🥁", color: "#fcd34d", label: "tom" },
  { kind: "crash", emoji: "💥", color: "#93c5fd", label: "crash" },
];
const PAD_COLOR: Record<DrumKind, string> = {
  kick: "#fb7185",
  snare: "#f0abfc",
  hat: "#5eead4",
  tom: "#fcd34d",
  crash: "#93c5fd",
};

// ── Limb-flash burst (drawn at the triggering joint when a drum fires) ────────
interface Burst {
  x: number; // canvas px
  y: number;
  color: string;
  born: number; // ms
  life: number; // ms
  size: number;
}

// Which landmark a gesture's flash should sit on.
const LIMB_LM: Record<string, number> = {
  lWrist: LM.L_WRIST,
  rWrist: LM.R_WRIST,
  head: LM.NOSE,
};

// Skeleton bone pairs to draw glowing limbs.
const BONES: [number, number][] = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
];
const JOINTS = [
  LM.NOSE,
  LM.L_SHOULDER,
  LM.R_SHOULDER,
  LM.L_ELBOW,
  LM.R_ELBOW,
  LM.L_WRIST,
  LM.R_WRIST,
  LM.L_HIP,
  LM.R_HIP,
  LM.L_KNEE,
  LM.R_KNEE,
  LM.L_ANKLE,
  LM.R_ANKLE,
];

type Mode = "idle" | "loading" | "camera" | "ghost";

export default function KidsBodyBandPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  // Which pads are currently lit (for the bottom row).
  const [litPads, setLitPads] = useState<Record<DrumKind, number>>({
    kick: 0,
    snare: 0,
    hat: 0,
    tom: 0,
    crash: 0,
  });

  // ── Long-lived refs (never trigger re-render) ───────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const kitRef = useRef<DrumKit | null>(null);
  const grooveRef = useRef<Groove | null>(null);
  const detectorRef = useRef<GestureDetector | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const burstsRef = useRef<Burst[]>([]);
  // Last smoothed landmark frame (canvas-normalized, MIRRORED for display).
  const lmRef = useRef<Lm[] | null>(null);
  const ghostStartRef = useRef<number>(0);
  const startedRef = useRef(false);

  // Mirror a normalized landmark frame horizontally (display is mirrored).
  const mirror = (lms: Lm[]): Lm[] =>
    lms.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z, visibility: p.visibility }));

  // Flash a pad in the bottom row + spawn a burst at the right limb.
  const flash = useCallback((kind: DrumKind, limb: string) => {
    setLitPads((prev) => ({ ...prev, [kind]: performance.now() }));
    const canvas = canvasRef.current;
    const lms = lmRef.current;
    if (!canvas) return;
    let x = canvas.width / 2;
    let y = canvas.height * 0.5;
    if (lms) {
      if (limb === "both") {
        const lw = lms[LM.L_WRIST];
        const rw = lms[LM.R_WRIST];
        x = ((lw.x + rw.x) / 2) * canvas.width;
        y = ((lw.y + rw.y) / 2) * canvas.height;
      } else if (limb === "body") {
        const lh = lms[LM.L_HIP];
        const rh = lms[LM.R_HIP];
        x = ((lh.x + rh.x) / 2) * canvas.width;
        y = ((lh.y + rh.y) / 2) * canvas.height;
      } else {
        const idx = LIMB_LM[limb] ?? LM.NOSE;
        const p = lms[idx];
        x = p.x * canvas.width;
        y = p.y * canvas.height;
      }
    }
    burstsRef.current.push({
      x,
      y,
      color: PAD_COLOR[kind],
      born: performance.now(),
      life: kind === "crash" ? 700 : 420,
      size: kind === "crash" ? 120 : kind === "kick" ? 90 : 64,
    });
  }, []);

  // ── Render loop (Canvas2D): video → dim → skeleton glow → bursts ────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const video = videoRef.current;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Mirrored, dimmed camera frame (only in camera mode).
    if (mode === "camera" && video && video.readyState >= 2) {
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.55;
      // cover-fit the video
      const vr = video.videoWidth / video.videoHeight;
      const cr = W / H;
      let dw = W;
      let dh = H;
      if (vr > cr) {
        dh = H;
        dw = H * vr;
      } else {
        dw = W;
        dh = W / vr;
      }
      ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
      ctx.globalAlpha = 1;
      // Dark veil on top so glow pops and faces stay soft.
      ctx.fillStyle = "rgba(8,4,20,0.45)";
      ctx.fillRect(0, 0, W, H);
    } else {
      // Ghost / loading backdrop — a soft violet vignette.
      const g = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.5, H);
      g.addColorStop(0, "rgba(40,20,70,0.9)");
      g.addColorStop(1, "rgba(8,4,20,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Glowing limb markers over the (mirrored) skeleton.
    const lms = lmRef.current;
    if (lms) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#a78bfa";
      ctx.strokeStyle = "rgba(196,181,253,0.9)";
      ctx.lineWidth = 7;
      for (const [a, b] of BONES) {
        const pa = lms[a];
        const pb = lms[b];
        if ((pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x * W, pa.y * H);
        ctx.lineTo(pb.x * W, pb.y * H);
        ctx.stroke();
      }
      ctx.shadowColor = "#f0abfc";
      ctx.fillStyle = "#fde68a";
      for (const j of JOINTS) {
        const p = lms[j];
        if ((p.visibility ?? 1) < 0.3) continue;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Limb-flash bursts (additive-ish radial pops).
    const now = performance.now();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    burstsRef.current = burstsRef.current.filter((bst) => {
      const age = now - bst.born;
      if (age > bst.life) return false;
      const t = age / bst.life;
      const r = bst.size * (0.4 + t * 1.2);
      const alpha = (1 - t) * 0.85;
      const g = ctx.createRadialGradient(bst.x, bst.y, 0, bst.x, bst.y, r);
      g.addColorStop(0, hexA(bst.color, alpha));
      g.addColorStop(0.6, hexA(bst.color, alpha * 0.4));
      g.addColorStop(1, hexA(bst.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bst.x, bst.y, r, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.restore();
  }, [mode]);

  // ── The per-frame drive loop (camera OR ghost) ──────────────────────────────
  const driveFrame = useCallback(() => {
    const detector = detectorRef.current;
    const groove = grooveRef.current;
    if (!detector || !groove) return;

    let rawLms: Lm[] | null = null;

    if (mode === "camera" && landmarkerRef.current && videoRef.current) {
      const video = videoRef.current;
      if (video.readyState >= 2) {
        try {
          const res = landmarkerRef.current.detectForVideo(
            video,
            performance.now(),
          );
          if (res.landmarks && res.landmarks.length > 0) {
            rawLms = res.landmarks[0];
          }
        } catch {
          // transient detect error — skip this frame
        }
      }
    } else if (mode === "ghost") {
      const tSec = (performance.now() - ghostStartRef.current) / 1000;
      rawLms = ghostPose(tSec);
    }

    if (rawLms) {
      // Gestures run on RAW (un-mirrored) coords; display uses MIRRORED coords.
      const events = detector.update(rawLms, performance.now());
      groove.energy = detector.energy;

      const display = mirror(rawLms);
      const prev = lmRef.current;
      lmRef.current = prev
        ? smoothLandmarks(prev, display, 0.45)
        : display;

      for (const ev of events) {
        groove.trigger(ev.kind, ev.velocity);
        // The flash limb must be mirrored too (lWrist↔rWrist swap on display).
        const dispLimb =
          ev.limb === "lWrist"
            ? "rWrist"
            : ev.limb === "rWrist"
              ? "lWrist"
              : ev.limb;
        flash(ev.kind, dispLimb);
      }
    }
  }, [mode, flash]);

  // ── rAF pump ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "camera" && mode !== "ghost") return;
    const loop = () => {
      driveFrame();
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, driveFrame, render]);

  // ── Size the canvas to its box (handles rotation / resize) ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [mode]);

  // ── Start everything inside the user tap (autoplay / permission rules) ──────
  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setNotice(null);
    setMode("loading");

    // Audio first — must be created inside the gesture.
    const kit = buildKit();
    if (kit.ctx.state === "suspended") {
      try {
        await kit.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    kitRef.current = kit;
    detectorRef.current = new GestureDetector();
    const groove = new Groove(kit, {
      onHit: (kind) => {
        // Backbone (engine) hits also light their pad so the row always moves.
        setLitPads((prev) => ({ ...prev, [kind]: performance.now() }));
      },
    });
    grooveRef.current = groove;
    groove.start();

    // Seed a neutral standing pose so the skeleton is visible immediately.
    lmRef.current = mirror(
      fullLmArray({
        [LM.NOSE]: { x: 0.5, y: 0.14, z: 0, visibility: 1 },
        [LM.L_SHOULDER]: { x: 0.38, y: 0.3, z: 0, visibility: 1 },
        [LM.R_SHOULDER]: { x: 0.62, y: 0.3, z: 0, visibility: 1 },
        [LM.L_ELBOW]: { x: 0.34, y: 0.45, z: 0, visibility: 1 },
        [LM.R_ELBOW]: { x: 0.66, y: 0.45, z: 0, visibility: 1 },
        [LM.L_WRIST]: { x: 0.32, y: 0.58, z: 0, visibility: 1 },
        [LM.R_WRIST]: { x: 0.68, y: 0.58, z: 0, visibility: 1 },
        [LM.L_HIP]: { x: 0.42, y: 0.6, z: 0, visibility: 1 },
        [LM.R_HIP]: { x: 0.58, y: 0.6, z: 0, visibility: 1 },
        [LM.L_KNEE]: { x: 0.42, y: 0.78, z: 0, visibility: 1 },
        [LM.R_KNEE]: { x: 0.58, y: 0.78, z: 0, visibility: 1 },
        [LM.L_ANKLE]: { x: 0.42, y: 0.94, z: 0, visibility: 1 },
        [LM.R_ANKLE]: { x: 0.58, y: 0.94, z: 0, visibility: 1 },
      }),
    );

    // Try camera + MediaPipe; fall back to the ghost dancer on any failure.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const vision = (await import(
        /* webpackIgnore: true */ MEDIAPIPE_CDN
      )) as unknown as MediaPipeVision;
      const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      landmarkerRef.current = landmarker;
      setMode("camera");
    } catch {
      // Camera denied or MediaPipe failed → ghost dancer drives the same kit.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setNotice(
        "No camera right now — so a friendly robot dancer is playing the drums for you. Tap the colored buttons too!",
      );
      ghostStartRef.current = performance.now();
      setMode("ghost");
    }
  }, []);

  // ── Direct pad taps (fallback input — always works) ─────────────────────────
  const tapPad = useCallback((kind: DrumKind) => {
    const groove = grooveRef.current;
    if (!groove) return;
    groove.trigger(kind, 0.9);
    flash(kind, "body");
  }, [flash]);

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      grooveRef.current?.stop();
      landmarkerRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      kitRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  const now = performance.now();

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#08041a] font-mono text-white">
      {/* Live canvas fills the screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />
      {/* Hidden source video (drawn into canvas, never shown directly) */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Title */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow">
          🥁 Body Band
        </h1>
        {mode !== "idle" && (
          <p className="mt-1 text-base text-white/75">
            Dance! Your body plays the drums.
          </p>
        )}
      </div>

      {/* Start overlay */}
      {mode === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#08041a]/80 px-6 text-center">
          <p className="max-w-md text-xl text-white/95">
            Stand back so the camera sees you, then dance with your whole body to
            make a beat!
          </p>
          <button
            onClick={start}
            className="min-h-[84px] rounded-3xl bg-violet-500/30 px-10 py-5 text-2xl font-bold text-white ring-2 ring-violet-300/70 transition active:scale-95"
          >
            Start the band 🥁
          </button>
        </div>
      )}

      {mode === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#08041a]/70">
          <p className="text-xl text-white/95">Warming up the drums… 🥁</p>
        </div>
      )}

      {/* Degradation notice */}
      {notice && (
        <div className="absolute left-1/2 top-20 z-10 w-[90%] max-w-md -translate-x-1/2 rounded-2xl bg-black/60 px-4 py-3 text-center">
          <p className="text-base text-rose-300">{notice}</p>
        </div>
      )}

      {/* Drum-pad row (tap targets ≥64px; light up when their drum fires) */}
      {mode !== "idle" && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-center gap-2 px-2 pb-4 sm:gap-4">
          {PADS.map((pad) => {
            const lit = now - litPads[pad.kind] < 180;
            return (
              <button
                key={pad.kind}
                onClick={() => tapPad(pad.kind)}
                aria-label={pad.label}
                className="flex h-[76px] w-[76px] items-center justify-center rounded-2xl text-4xl transition-transform active:scale-90 sm:h-[88px] sm:w-[88px]"
                style={{
                  background: lit
                    ? hexA(pad.color, 0.55)
                    : hexA(pad.color, 0.12),
                  boxShadow: lit
                    ? `0 0 28px 6px ${hexA(pad.color, 0.7)}`
                    : `inset 0 0 0 2px ${hexA(pad.color, 0.5)}`,
                  transform: lit ? "scale(1.08)" : "scale(1)",
                }}
              >
                {pad.emoji}
              </button>
            );
          })}
        </div>
      )}

      {/* Design notes link (corner) */}
      <Link
        href={README_URL}
        className="absolute bottom-2 right-3 z-20 text-base text-violet-300 underline decoration-violet-300/50 underline-offset-2"
      >
        Read the design notes
      </Link>
    </main>
  );
}

// ── tiny helper: hex (#rrggbb) + alpha → rgba() string ───────────────────────
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}
