"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makeFieldRenderer, MAX_EMITTERS, type FieldRenderer } from "./shader";
import { makeTheurgyAudio, type TheurgyAudio } from "./audio";

/* ------------------------------------------------------------------ *
 * 5096 — Theurgy
 * Conduct a living plasma of light and sound with your bare hands, in
 * the air, with no controller. A webcam + MediaPipe HandLandmarker turns
 * up to two hands (21 landmarks each) into forces inside a WebGL2
 * wave-interference / domain-warped fBm plasma that also drives a
 * real-time Web Audio drone. Pointer-drag fallback if no camera.
 * ------------------------------------------------------------------ */

// ---- MediaPipe (loaded from CDN at runtime — copied from 1051) -------
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

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

const TIPS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky

// A parsed hand ready to feed the field.
interface ParsedHand {
  tips: { x: number; y: number }[]; // mirrored, normalized 0..1
  palm: { x: number; y: number };
  pinchAmt: number; // 0 (open) .. 1 (thumb+index touching)
  openness: number; // 0 (fist) .. 1 (splayed)
}

type TrackStatus =
  | "init"
  | "loading"
  | "tracking"
  | "no-hands"
  | "no-camera"
  | "no-cdn"
  | "no-webgl";

type Phase = "idle" | "running";

export default function Theurgy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<TrackStatus>("init");
  const [showNotes, setShowNotes] = useState(false);

  // engine refs
  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<TheurgyAudio | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const statusRef = useRef<TrackStatus>("init");
  const usingHandsRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // latest parsed hands + pointer state read by the loop
  const handsRef = useRef<{ hands: ParsedHand[] }>({ hands: [] });
  const pointerRef = useRef<{ active: boolean; x: number; y: number; down: boolean }>(
    { active: false, x: 0.5, y: 0.5, down: false },
  );
  const prevPinchRef = useRef(false);
  const prevPointerDownRef = useRef(false);

  // ---- pointer fallback handlers ----
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerRef.current = {
      active: true,
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      down: true,
    };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = pointerRef.current;
    if (!p.active) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    p.x = (e.clientX - r.left) / r.width;
    p.y = (e.clientY - r.top) / r.height;
  }, []);
  const onPointerUp = useCallback(() => {
    pointerRef.current.down = false;
  }, []);

  // ---- try to start hand tracking ----
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
      landmarkerRef.current = await v.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
    } catch {
      setStatus("no-cdn");
      usingHandsRef.current = false;
      return;
    }
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

  // ---- per-frame hand detection ----
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
    const n = res.landmarks?.length ?? 0;
    if (n === 0) {
      handsRef.current.hands = [];
      if (statusRef.current === "tracking") setStatus("no-hands");
      return;
    }
    if (statusRef.current === "no-hands") setStatus("tracking");

    const parsed: ParsedHand[] = [];
    for (let i = 0; i < n; i++) {
      const h = res.landmarks[i];
      const tips = TIPS.map((t) => ({ x: 1 - h[t].x, y: h[t].y })); // mirror x
      const palm = { x: 1 - h[9].x, y: h[9].y };
      // hand scale = wrist(0) -> middle-MCP(9)
      const scale =
        Math.hypot(h[0].x - h[9].x, h[0].y - h[9].y) || 0.001;
      // pinch: thumb(4) <-> index(8)
      const pd = Math.hypot(h[4].x - h[8].x, h[4].y - h[8].y);
      const pinchAmt = Math.min(1, Math.max(0, 1 - pd / (scale * 1.6)));
      // openness: mean fingertip distance from palm, relative to hand scale
      let sum = 0;
      for (const t of [8, 12, 16, 20]) {
        sum += Math.hypot(h[t].x - h[9].x, h[t].y - h[9].y);
      }
      const openness = Math.min(1, Math.max(0, (sum / 4 / scale - 0.6) / 1.4));
      parsed.push({ tips, palm, pinchAmt, openness });
    }
    handsRef.current.hands = parsed;
  }, []);

  // ---- main loop ----
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const emitters = new Float32Array(MAX_EMITTERS * 2);
    const strengths = new Float32Array(MAX_EMITTERS);
    const tEx = new Float32Array(MAX_EMITTERS);
    const tEy = new Float32Array(MAX_EMITTERS);
    const tEs = new Float32Array(MAX_EMITTERS);
    // seed emitter positions at centre so first lerp isn't a fly-in
    for (let i = 0; i < MAX_EMITTERS; i++) {
      emitters[i * 2] = 0.5;
      emitters[i * 2 + 1] = 0.5;
      tEx[i] = 0.5;
      tEy[i] = 0.5;
    }

    // smoothed scalar state
    let symmetry = 3;
    let hue = 0;
    let intensity = 0.35;
    let zoom = 1;
    let cx = 0.5;
    let cy = 0.5;
    let openness = 0.4;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.resize(
        Math.floor(canvas.clientWidth * dpr),
        Math.floor(canvas.clientHeight * dpr),
      );
    };
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    const start = performance.now();

    const frame = (now: number) => {
      const t = (now - start) / 1000;

      if (usingHandsRef.current) runDetect(now);
      const hands = handsRef.current.hands;
      const usingHands = usingHandsRef.current && hands.length > 0;
      const usingPointer = !usingHands && pointerRef.current.active;

      // -------- build this frame's targets --------
      let tCount = 0;
      let tSym = 3;
      let tHue = 0;
      let tInt = 0.35;
      let tZoom = 1;
      let tCx = 0.5;
      let tCy = 0.5;
      let tOpen = 0.4;
      let pinchNow = false;
      // clear active strengths (inactive fade out but keep position)
      for (let i = 0; i < MAX_EMITTERS; i++) tEs[i] = 0;

      if (usingHands) {
        let idx = 0;
        let maxPinch = 0;
        let sumOpen = 0;
        let sumHeight = 0;
        for (const hnd of hands) {
          for (const tip of hnd.tips) {
            if (idx >= MAX_EMITTERS) break;
            tEx[idx] = tip.x;
            tEy[idx] = tip.y;
            tEs[idx] = 0.45 + hnd.pinchAmt * 0.5 + hnd.openness * 0.15;
            idx++;
          }
          sumOpen += hnd.openness;
          sumHeight += 1 - hnd.palm.y;
          if (hnd.pinchAmt > maxPinch) {
            maxPinch = hnd.pinchAmt;
            tCx = hnd.palm.x;
            tCy = hnd.palm.y;
          }
          if (hnd.pinchAmt > 0.75) pinchNow = true;
        }
        tCount = idx;
        tOpen = sumOpen / hands.length;
        const height = sumHeight / hands.length; // 0..1, up is 1
        tHue = height * 2 - 1;
        if (hands.length >= 2) {
          const s = Math.min(
            1,
            Math.hypot(
              hands[0].palm.x - hands[1].palm.x,
              hands[0].palm.y - hands[1].palm.y,
            ) * 1.4,
          );
          tSym = 1 + s * 7; // spread -> ordered kaleidoscope
        } else {
          tSym = 1 + tOpen * 3;
        }
        tZoom = 1 + maxPinch * 2;
        tInt = Math.min(1, 0.35 + hands.length * 0.2 + maxPinch * 0.3 + tOpen * 0.15);
      } else if (usingPointer) {
        const p = pointerRef.current;
        tCx = p.x;
        tCy = p.y;
        tOpen = 0.45 + 0.35 * Math.sin(t * 0.6);
        // splay 5 emitters like fingers around the pointer
        const spread = 0.05 + tOpen * 0.06;
        for (let i = 0; i < 5; i++) {
          const ang = -Math.PI * 0.5 + (i - 2) * 0.42;
          const wob = 0.012 * Math.sin(t * 1.4 + i);
          tEx[i] = p.x + Math.cos(ang) * (spread + wob) * 0.9;
          tEy[i] = p.y + Math.sin(ang) * (spread + wob);
          tEs[i] = 0.55 + (p.down ? 0.4 : 0);
        }
        tCount = 5;
        tSym = 1 + p.x * 7;
        tHue = (1 - p.y) * 2 - 1;
        tZoom = 1 + (p.down ? 1.6 : 0);
        tInt = 0.5 + (p.down ? 0.3 : 0);
        pinchNow = p.down;
      } else {
        // auto: a slow orbiting virtual hand so the piece stays alive + audible
        tCx = 0.5 + 0.18 * Math.cos(t * 0.15);
        tCy = 0.5 + 0.14 * Math.sin(t * 0.19);
        tOpen = 0.5 + 0.35 * Math.sin(t * 0.4);
        const spread = 0.05 + tOpen * 0.06;
        for (let i = 0; i < 5; i++) {
          const ang = -Math.PI * 0.5 + (i - 2) * 0.42 + Math.sin(t * 0.2) * 0.3;
          const wob = 0.012 * Math.sin(t * 1.1 + i);
          tEx[i] = tCx + Math.cos(ang) * (spread + wob) * 0.9;
          tEy[i] = tCy + Math.sin(ang) * (spread + wob);
          tEs[i] = 0.5;
        }
        tCount = 5;
        tSym = 3 + 2 * (0.5 + 0.5 * Math.sin(t * 0.1));
        tHue = Math.sin(t * 0.12);
        tZoom = 1;
        tInt = 0.4;
      }

      // -------- shimmer on pinch / pointer-down rising edge --------
      if (usingHands) {
        if (pinchNow && !prevPinchRef.current) {
          audioRef.current?.shimmer(tInt);
        }
        prevPinchRef.current = pinchNow;
      } else if (usingPointer) {
        if (pointerRef.current.down && !prevPointerDownRef.current) {
          audioRef.current?.shimmer(tInt);
        }
        prevPointerDownRef.current = pointerRef.current.down;
        prevPinchRef.current = false;
      } else {
        prevPinchRef.current = false;
        prevPointerDownRef.current = false;
      }

      // -------- smooth toward targets --------
      const k = 0.14;
      symmetry += (tSym - symmetry) * k;
      hue += (tHue - hue) * k;
      intensity += (tInt - intensity) * 0.08;
      zoom += (tZoom - zoom) * 0.1;
      cx += (tCx - cx) * k;
      cy += (tCy - cy) * k;
      openness += (tOpen - openness) * 0.1;

      for (let i = 0; i < MAX_EMITTERS; i++) {
        emitters[i * 2] += (tEx[i] - emitters[i * 2]) * 0.25;
        emitters[i * 2 + 1] += (tEy[i] - emitters[i * 2 + 1]) * 0.25;
        strengths[i] += (tEs[i] - strengths[i]) * 0.2;
      }

      // -------- audio --------
      const audio = audioRef.current;
      if (audio) {
        audio.setOpenness(openness);
        audio.setEnergy(intensity);
      }

      // -------- render --------
      // slow, photosensitive-safe luminance drift (~0.15 Hz), never a strobe
      const luma = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.15));
      renderer.render({
        time: t,
        emitters,
        strengths,
        count: Math.max(tCount, MAX_EMITTERS), // keep loop bound; strengths gate
        symmetry,
        hue,
        intensity,
        zoom,
        center: [cx, cy],
        luma,
      });

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => window.removeEventListener("resize", onResize);
  }, [runDetect]);

  const cleanupRef = useRef<(() => void) | null>(null);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = makeFieldRenderer(canvas);
    if (!renderer) {
      setStatus("no-webgl");
      setPhase("running");
      return;
    }
    rendererRef.current = renderer;

    // audio under the user gesture
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    audioRef.current = makeTheurgyAudio(ctx);

    setPhase("running");
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
      rendererRef.current?.dispose();
      rendererRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, []);

  const statusLine: Record<TrackStatus, string> = {
    init: "Press Start, then raise your hands to the camera.",
    loading: "Summoning the hand tracker…",
    tracking: "Conducting — spread, pinch and raise your hands.",
    "no-hands": "Hands not found — show your palms, or drag to conduct.",
    "no-camera": "Camera unavailable — pointer-fallback is active; drag to conduct.",
    "no-cdn": "Tracker unavailable — pointer-fallback is active; drag to conduct.",
    "no-webgl": "WebGL2 is unavailable in this browser, so the plasma can't render.",
  };
  const fallbackActive = status === "no-camera" || status === "no-cdn";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* hidden video: MediaPipe input only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* overlay chrome */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="p-5 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Theurgy
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            Conduct a living plasma of light and sound with your bare hands, in
            the air, with no controller. Your fingertips are emitters in an
            interference field; pinch to bloom, spread to order the kaleidoscope.
          </p>
          {phase === "running" && (
            <p
              className={`mt-3 font-mono text-base ${
                status === "no-webgl" ? "text-destructive" : "text-primary"
              }`}
            >
              {statusLine[status]}
            </p>
          )}
          {fallbackActive && (
            <p className="mt-1 font-mono text-base text-destructive">
              Camera offline — pointer-fallback engaged.
            </p>
          )}
        </header>

        {phase === "idle" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="pointer-events-auto flex flex-col items-center gap-4">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start camera
              </button>
              <p className="max-w-sm text-center text-base text-muted-foreground">
                Sound and light begin on Start. Works with a webcam — or just
                drag on the canvas if you would rather not turn one on.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Theurgy — design notes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">The question:</span> what if you
              could conduct a living plasma of light and sound with your bare
              hands, in the air, with no controller?
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              A webcam feeds MediaPipe HandLandmarker (two hands, 21 keypoints
              each). Each of the ten fingertips becomes a bright interference
              source in a WebGL2 domain-warped fBm plasma. A{" "}
              <span className="text-primary">pinch</span> blooms the field and
              zooms inward; the <span className="text-primary">spread</span>{" "}
              between your hands sets the kaleidoscope&apos;s symmetry order;{" "}
              <span className="text-primary">hand height</span> drifts the hue
              through the violet band. Finger openness widens the drone&apos;s
              partial spread and opens a resonant filter; a pinch fires a
              shimmer bloom.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              References: &ldquo;Real-time hand tracking visualization using
              MediaPipe and TouchDesigner&rdquo; (WJARR, 2026 — 21-keypoint
              hands to OSC to GPU visuals, &lt;35 ms end-to-end), and Heinrich
              Kl&uuml;ver&apos;s <em>form constants</em> — the four geometries
              (lattice, spiral, tunnel, cobweb) that recur in visual
              hallucination and are echoed by the kaleidoscopic fold.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["5096-theurgy"]} />
    </main>
  );
}
