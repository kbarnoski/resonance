"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

/* ------------------------------------------------------------------ *
 * 1051 — Hand Hyperspace
 * Reach into hyperspace and rotate a 4D jewel with your bare hands.
 * Webcam hand-tracking (MediaPipe Tasks-Vision via CDN) drives the six
 * independent rotation planes of a 4D polytope, stereographically
 * projected to the 2D canvas. Each plane maps to a just-intonation
 * partial, so the gesture plays a shifting neon chord.
 * Falls back to pointer drag if the camera / CDN is unavailable.
 * ------------------------------------------------------------------ */

// ---- 4D math --------------------------------------------------------
type Vec4 = [number, number, number, number];
// the six rotation planes, in canonical order
type Angles6 = [number, number, number, number, number, number]; // XY XZ XW YZ YW ZW

const PLANE_AXES: [number, number][] = [
  [0, 1], // XY
  [0, 2], // XZ
  [0, 3], // XW
  [1, 2], // YZ
  [1, 3], // YW
  [2, 3], // ZW
];

// just-intonation ratios for the six partials (one per plane)
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 15 / 8];
const BASE_HZ = 110; // A2

function rotate4(v: Vec4, ang: Angles6): Vec4 {
  const out: Vec4 = [v[0], v[1], v[2], v[3]];
  for (let p = 0; p < 6; p++) {
    const a = ang[p];
    if (a === 0) continue;
    const [i, j] = PLANE_AXES[p];
    const c = Math.cos(a);
    const s = Math.sin(a);
    const vi = out[i];
    const vj = out[j];
    out[i] = vi * c - vj * s;
    out[j] = vi * s + vj * c;
  }
  return out;
}

// stereographic projection 4D -> 3D (from the w = +1 pole), then a fixed
// perspective 3D -> 2D. Returns screen-ish coords + a depth cue.
function project4(v: Vec4, zoom: number): { x: number; y: number; depth: number } {
  const wPole = 2.2; // distance of the projection pole on the w axis
  const k = wPole / (wPole - v[3]);
  const x3 = v[0] * k;
  const y3 = v[1] * k;
  const z3 = v[2] * k;
  // 3D perspective toward a camera on +z
  const camZ = 4.0;
  const persp = (camZ * zoom) / (camZ - z3 * 0.6);
  return { x: x3 * persp, y: y3 * persp, depth: k };
}

// ---- polytope construction -----------------------------------------
interface Polytope {
  verts: Vec4[];
  edges: [number, number][];
}

// The tesseract (8-cell): 16 vertices at (±1,±1,±1,±1); edges connect
// vertices differing in exactly one coordinate.
function buildTesseract(): Polytope {
  const verts: Vec4[] = [];
  for (let i = 0; i < 16; i++) {
    verts.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }
  const edges: [number, number][] = [];
  for (let a = 0; a < 16; a++) {
    for (let b = a + 1; b < 16; b++) {
      const diff = a ^ b;
      if (diff && (diff & (diff - 1)) === 0) edges.push([a, b]);
    }
  }
  return { verts, edges };
}

// The 24-cell: 24 vertices = all permutations of (±1,±1,0,0). Edges join
// vertices at the minimum (squared) distance of 2.
function build24Cell(): Polytope {
  const verts: Vec4[] = [];
  const signs = [-1, 1];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (const si of signs) {
        for (const sj of signs) {
          const v: Vec4 = [0, 0, 0, 0];
          v[i] = si;
          v[j] = sj;
          verts.push(v);
        }
      }
    }
  }
  const edges: [number, number][] = [];
  for (let a = 0; a < verts.length; a++) {
    for (let b = a + 1; b < verts.length; b++) {
      let d = 0;
      for (let k = 0; k < 4; k++) {
        const dd = verts[a][k] - verts[b][k];
        d += dd * dd;
      }
      if (Math.abs(d - 2) < 1e-6) edges.push([a, b]);
    }
  }
  return { verts, edges };
}

type Shape = "8-cell" | "24-cell";

function buildPolytope(shape: Shape): Polytope {
  return shape === "8-cell" ? buildTesseract() : build24Cell();
}

// ---- audio ----------------------------------------------------------
interface HyperAudio {
  ctx: AudioContext;
  setPlane: (i: number, speed: number) => void;
  setBrightness: (b: number) => void;
  dispose: () => void;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function makeAudio(ctx: AudioContext): HyperAudio {
  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(ctx.destination);

  // gentle ramp-in to avoid a click
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.2);

  // cosmic reverb tail
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 3.5, 3.0);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  conv.connect(wet).connect(master);
  dry.connect(master);

  // a low-pass driven by brightness for the "breakthrough" opening up
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 900;
  tone.Q.value = 0.6;
  tone.connect(dry);
  tone.connect(conv);

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (let i = 0; i < 6; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = BASE_HZ * RATIOS[i];
    const g = ctx.createGain();
    g.gain.value = 0.0;
    osc.connect(g).connect(tone);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  return {
    ctx,
    setPlane(i, speed) {
      const g = gains[i];
      // map rotation speed -> partial loudness (with a floor so the chord
      // always breathes a little) and a small detune-on-motion shimmer
      const lvl = Math.min(0.22, 0.02 + Math.min(1, speed) * 0.2);
      g.gain.setTargetAtTime(lvl, ctx.currentTime, 0.08);
      const detune = Math.min(40, speed * 60);
      oscs[i].detune.setTargetAtTime(detune * (i % 2 ? 1 : -1), ctx.currentTime, 0.1);
    },
    setBrightness(b) {
      const f = 500 + b * 5500;
      tone.frequency.setTargetAtTime(f, ctx.currentTime, 0.12);
    },
    dispose() {
      try {
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
      } catch {
        /* noop */
      }
      setTimeout(() => {
        oscs.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* noop */
          }
        });
        try {
          ctx.close();
        } catch {
          /* noop */
        }
      }, 250);
    },
  };
}

// ---- hand tracking via CDN MediaPipe --------------------------------
interface HandState {
  // normalized 0..1 across the (mirrored) frame
  leftY: number; // vertical position of left hand
  rightX: number; // horizontal position of right hand
  spread: number; // distance between the two hands (or hand visibility)
  leftPinch: boolean;
  rightPinch: boolean;
  seen: number; // number of hands seen
}

type TrackStatus =
  | "init"
  | "loading"
  | "tracking"
  | "no-hands"
  | "no-camera"
  | "no-cdn";

interface HandLandmark {
  x: number;
  y: number;
  z: number;
}
interface DetectResult {
  landmarks: HandLandmark[][];
  handedness: { categoryName: string }[][];
}
interface HandLandmarkerLike {
  detectForVideo: (v: HTMLVideoElement, ts: number) => DetectResult;
  close: () => void;
}

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// ---- component ------------------------------------------------------
type Phase = "idle" | "running";

export default function HandHyperspace() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shape, setShape] = useState<Shape>("8-cell");
  const [status, setStatus] = useState<TrackStatus>("init");
  const [showNotes, setShowNotes] = useState(false);

  // mutable refs the render loop reads (so we don't re-trigger effects)
  const shapeRef = useRef<Shape>("8-cell");
  const polyRef = useRef<Polytope>(buildPolytope("8-cell"));
  const audioRef = useRef<HyperAudio | null>(null);
  const rafRef = useRef<number>(0);

  const handRef = useRef<HandState>({
    leftY: 0.5,
    rightX: 0.5,
    spread: 0.4,
    leftPinch: false,
    rightPinch: false,
    seen: 0,
  });
  // pointer fallback drives a synthetic hand-state
  const pointerRef = useRef<{ active: boolean; x: number; y: number; downDist: number }>(
    { active: false, x: 0.5, y: 0.5, downDist: 0.4 },
  );
  const usingHandsRef = useRef(false);

  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<TrackStatus>("init");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // keep shapeRef + polytope in sync with state without restarting the loop
  useEffect(() => {
    shapeRef.current = shape;
    polyRef.current = buildPolytope(shape);
  }, [shape]);

  // -- pointer fallback handlers --
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    pointerRef.current = { active: true, x, y, downDist: pointerRef.current.downDist };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerRef.current.active) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerRef.current.x = (e.clientX - r.left) / r.width;
    pointerRef.current.y = (e.clientY - r.top) / r.height;
  }, []);
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    const p = pointerRef.current;
    p.downDist = Math.min(0.95, Math.max(0.05, p.downDist - e.deltaY * 0.0008));
  }, []);

  // -- try to start hand tracking; resolve which input we use --
  const startTracking = useCallback(async () => {
    setStatus("loading");
    let vision: unknown;
    try {
      vision = await import(
        // @ts-expect-error — remote ESM module loaded from CDN at runtime
        /* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
      );
    } catch {
      setStatus("no-cdn");
      usingHandsRef.current = false;
      return;
    }
    try {
      const v = vision as {
        FilesetResolver: { forVisionTasks: (u: string) => Promise<unknown> };
        HandLandmarker: {
          createFromOptions: (
            f: unknown,
            o: Record<string, unknown>,
          ) => Promise<HandLandmarkerLike>;
        };
      };
      const fileset = await v.FilesetResolver.forVisionTasks(WASM_URL);
      const lm = await v.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
      landmarkerRef.current = lm;
    } catch {
      setStatus("no-cdn");
      usingHandsRef.current = false;
      return;
    }

    // camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video el");
      video.srcObject = stream;
      await video.play();
      usingHandsRef.current = true;
      setStatus("tracking");
    } catch {
      setStatus("no-camera");
      usingHandsRef.current = false;
    }
  }, []);

  const runDetect = useCallback((tsMs: number) => {
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (!lm || !video || video.readyState < 2) return;
    let res: DetectResult;
    try {
      res = lm.detectForVideo(video, tsMs);
    } catch {
      return;
    }
    const hs = handRef.current;
    const n = res.landmarks?.length ?? 0;
    hs.seen = n;
    if (n === 0) {
      if (statusRef.current === "tracking") setStatus("no-hands");
      return;
    }
    if (statusRef.current === "no-hands") setStatus("tracking");

    // assign left/right; the frame is mirrored, so MediaPipe "Left"/"Right"
    // already corresponds to the user's mirrored hands.
    let left: HandLandmark[] | null = null;
    let right: HandLandmark[] | null = null;
    for (let i = 0; i < n; i++) {
      const label = res.handedness?.[i]?.[0]?.categoryName ?? "Right";
      if (label === "Left" && !left) left = res.landmarks[i];
      else if (label === "Right" && !right) right = res.landmarks[i];
      else if (!left) left = res.landmarks[i];
      else if (!right) right = res.landmarks[i];
    }

    const pinch = (h: HandLandmark[]) => {
      const dx = h[4].x - h[8].x;
      const dy = h[4].y - h[8].y;
      return Math.hypot(dx, dy) < 0.06;
    };
    const palm = (h: HandLandmark[]) => h[9]; // middle-finger MCP ~ palm center

    if (left) {
      hs.leftY = 1 - palm(left).y; // invert so "raise hand" => up
      hs.leftPinch = pinch(left);
    }
    if (right) {
      hs.rightX = 1 - palm(right).x; // mirror corrected
      hs.rightPinch = pinch(right);
    }
    if (left && right) {
      const a = palm(left);
      const b = palm(right);
      hs.spread = Math.min(1, Math.hypot(a.x - b.x, a.y - b.y) * 1.3);
    } else {
      // single hand: use its height as a pseudo-spread
      const h = left || right;
      if (h) hs.spread = 1 - palm(h).y;
    }
  }, []);

  // -- main loop (visual + audio + input merge) --
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // current smoothed angles + speeds
    const angles: Angles6 = [0, 0, 0, 0, 0, 0];
    const rates: Angles6 = [0.04, 0.02, 0.0, 0.03, 0.0, 0.015]; // gentle auto-drift base
    const dispRate: Angles6 = [0, 0, 0, 0, 0, 0]; // smoothed for audio
    let zoom = 1.0;
    let bright = 0.3;
    let hue = 0;
    let last = performance.now();

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // run hand detection (cheap to call; guarded inside)
      if (usingHandsRef.current) runDetect(now);

      // --- gather input -> target rotation rates ---
      let lY: number, rX: number, spread: number, lPinch: boolean, rPinch: boolean;
      if (usingHandsRef.current && handRef.current.seen > 0) {
        const hs = handRef.current;
        lY = hs.leftY;
        rX = hs.rightX;
        spread = hs.spread;
        lPinch = hs.leftPinch;
        rPinch = hs.rightPinch;
      } else if (pointerRef.current.active) {
        const p = pointerRef.current;
        lY = 1 - p.y;
        rX = p.x;
        spread = p.downDist;
        lPinch = false;
        rPinch = false;
      } else {
        // no input: slow auto-drift only
        lY = 0.5;
        rX = 0.5;
        spread = 0.4;
        lPinch = false;
        rPinch = false;
      }

      // map gestures to per-plane rates (centered around 0.5)
      // left-hand height -> XW; right-hand horizontal -> YW; spread -> ZW
      const target: Angles6 = [
        0.03 + (rX - 0.5) * 0.4, // XY from right hand horizontal (secondary)
        0.02 + (lY - 0.5) * 0.3, // XZ from left height (secondary)
        (lY - 0.5) * 1.6, // XW <- left height (primary)
        0.03, // YZ baseline drift
        (rX - 0.5) * 1.6, // YW <- right horizontal (primary)
        (spread - 0.4) * 1.4, // ZW <- spread
      ];

      // pinch holds the geometry: freeze rates when held
      const hold = lPinch || rPinch;

      for (let p = 0; p < 6; p++) {
        const t = hold ? 0 : rates[p] + target[p];
        dispRate[p] += (Math.abs(t) - dispRate[p]) * 0.12;
        angles[p] += t * dt;
      }

      // zoom toward breakthrough with spread; brighten/saturate
      const zTarget = 0.8 + spread * 1.4;
      zoom += (zTarget - zoom) * 0.06;
      const bTarget = hold ? bright : Math.min(1, 0.2 + spread * 0.9);
      bright += (bTarget - bright) * 0.05;
      hue = (hue + dt * (10 + bright * 40)) % 360;

      // --- audio ---
      const audio = audioRef.current;
      if (audio) {
        for (let p = 0; p < 6; p++) audio.setPlane(p, dispRate[p] * 1.2);
        audio.setBrightness(bright);
      }

      // --- render ---
      drawScene(ctx, canvas, polyRef.current, angles, zoom, bright, hue, hold);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [runDetect]);

  const cleanupRef = useRef<(() => void) | null>(null);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    setPhase("running");
    // resume audio under the user gesture
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    audioRef.current = makeAudio(ctx);
    // kick off tracking (async; loop runs regardless)
    void startTracking();
    cleanupRef.current = startLoop() ?? null;
  }, [phase, startTracking, startLoop]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
      audioRef.current?.dispose();
      audioRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const statusLine: Record<TrackStatus, string> = {
    init: "Press Start, then raise your hands to the camera.",
    loading: "Loading hand tracker…",
    tracking: "Tracking hands — raise, sweep and spread them.",
    "no-hands": "Hands not found — show your palms, or drag to rotate.",
    "no-camera": "Camera blocked — drag on the canvas to rotate.",
    "no-cdn": "Tracker unavailable — drag on the canvas to rotate.",
  };
  const statusColor =
    status === "tracking"
      ? "text-violet-300"
      : status === "no-camera" || status === "no-cdn"
        ? "text-violet-300"
        : "text-foreground";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* hidden video used only as MediaPipe input */}
      <video ref={videoRef} className="hidden" playsInline muted />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />

      {/* overlay UI */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="p-5 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Hand Hyperspace
          </h1>
          <p className="mt-2 max-w-xl text-base text-foreground">
            Reach into hyperspace and turn a four-dimensional jewel with your
            bare hands. Your gestures rotate it through six planes at once —
            and play the chord those rotations make.
          </p>
          <p className={`mt-3 font-mono text-base ${statusColor}`}>
            {statusLine[status]}
          </p>
        </header>

        {phase === "idle" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="pointer-events-auto flex flex-col items-center gap-4">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-full bg-violet-500/90 px-8 py-3 text-lg font-semibold text-foreground shadow-lg transition-colors hover:bg-violet-400"
              >
                Start
              </button>
              <p className="max-w-sm text-center text-base text-muted-foreground">
                Sound starts on Start. Works with a webcam, or just drag on the
                canvas if you{"'"}d rather not turn one on.
              </p>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="pointer-events-auto mt-auto flex flex-wrap items-center gap-3 p-5 sm:p-8">
            <span className="font-mono text-base text-muted-foreground">jewel:</span>
            {(["8-cell", "24-cell"] as Shape[]).map((s) => (
              <button
                key={s}
                onClick={() => setShape(s)}
                className={`min-h-[44px] rounded-full px-4 py-2.5 text-base font-medium transition-colors ${
                  shape === s
                    ? "bg-violet-500/90 text-foreground"
                    : "bg-muted text-foreground hover:bg-accent"
                }`}
              >
                {s === "8-cell" ? "tesseract (8-cell)" : "24-cell"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute right-4 top-4 z-30 min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur transition-colors hover:bg-accent"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur">
          <div className="max-w-lg rounded-2xl border border-border bg-zinc-900/90 p-6 text-base text-foreground">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-3">
              A 4D polytope (tesseract or 24-cell) is rotated through all six
              independent planes (XY, XZ, XW, YZ, YW, ZW), stereographically
              projected 4D{"→"}3D{"→"}2D, and drawn as glowing edges. Your{" "}
              <span className="text-violet-300">left hand{"'"}s height</span>{" "}
              drives the XW spin, your{" "}
              <span className="text-violet-300">right hand{"'"}s sweep</span>{" "}
              drives YW, and the{" "}
              <span className="text-violet-300">spread between hands</span> drives
              ZW and zooms toward breakthrough. A pinch holds the geometry still.
            </p>
            <p className="mt-3">
              Each plane{"'"}s spin sets the loudness of one partial in a
              just-intonation stack (1, 9/8, 5/4, 3/2, 5/3, 15/8) over A2, so a
              gesture is literally a shifting neon chord with a cosmic reverb
              tail.
            </p>
            <p className="mt-3 text-muted-foreground">
              Reference: the Pardesco 4D Polytope Viewer (4d.pardesco.com) and
              the DMT {"“"}hyperdimensional / more-real-than-real
              geometry{"”"} phenomenology — turned from a watch-only viewer
              into a hand-played instrument.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-full bg-violet-500/90 px-5 py-2.5 text-base font-semibold text-foreground hover:bg-violet-400"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1051-hand-hyperspace"]} />
    </main>
  );
}

// ---- rendering ------------------------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  poly: Polytope,
  angles: Angles6,
  zoom: number,
  bright: number,
  hue: number,
  held: boolean,
) {
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const scale = Math.min(W, H) * 0.22 * zoom;

  // trailing fade for the bloom (don't fully clear)
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(4, 2, 10, ${0.18 + bright * 0.12})`;
  ctx.fillRect(0, 0, W, H);

  // project all vertices once
  const pts = poly.verts.map((v) => {
    const r = rotate4(v, angles);
    const p = project4(r, 1);
    return { x: cx + p.x * scale, y: cy + p.y * scale, depth: p.depth };
  });

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (const [a, b] of poly.edges) {
    const pa = pts[a];
    const pb = pts[b];
    // depth: nearer-the-w-pole edges glow hotter/thicker
    const d = (pa.depth + pb.depth) * 0.5;
    const dn = Math.max(0, Math.min(1, (d - 0.6) / 1.6));
    const sat = 70 + bright * 30;
    const light = 45 + dn * 25 + bright * 15;
    // chromatic per-edge hue drift
    const eh = (hue + (a * 13 + b * 7)) % 360;

    const lw = (0.8 + dn * 2.6) * (1 + bright * 0.8);
    const alpha = 0.18 + dn * 0.5 + bright * 0.2;

    // soft outer glow
    ctx.strokeStyle = `hsla(${eh}, ${sat}%, ${light}%, ${alpha * 0.5})`;
    ctx.lineWidth = lw * 3.5;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();

    // bright core
    ctx.strokeStyle = `hsla(${eh}, ${sat}%, ${Math.min(90, light + 25)}%, ${alpha})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // vertex sparks
  for (const p of pts) {
    const dn = Math.max(0, Math.min(1, (p.depth - 0.6) / 1.6));
    const rad = (1.2 + dn * 3) * (1 + bright);
    ctx.fillStyle = `hsla(${(hue + 40) % 360}, 90%, ${70 + dn * 20}%, ${0.4 + dn * 0.4})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  if (held) {
    ctx.fillStyle = "rgba(196, 181, 253, 0.9)";
    ctx.font = `${Math.round(H * 0.02)}px ui-monospace, monospace`;
    ctx.fillText("held", 18, H - 18);
  }
}
