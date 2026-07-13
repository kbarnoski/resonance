"use client";

// 1590 · Body Mirror
// "What if your whole body — not your voice — is the instrument, and the room
//  hears where your hands are?"
//
// Four wired subsystems:
//   1. Camera capture      — getUserMedia → hidden <video>
//   2. Landmark model      — MediaPipe Tasks-Vision HandLandmarker (CDN runtime)
//   3. Spatial Web Audio   — StereoPannerNode per hand + PannerNode plucks
//   4. WebGL2 render       — warm reactive glow that mirrors the hands
//
// Degrades gracefully: the visual + a synthetic "demo" body run before and
// without any camera, so the idea is visible even with no webcam.

import { useCallback, useEffect, useRef, useState } from "react";
import { makeHandLandmarker, type HandLandmarkerLike } from "./handLoader";
import { BodyAudio } from "./audio";
import {
  createRenderer,
  MAX_POINTS,
  type Renderer,
  type TrailPoint,
  type HandRenderState,
} from "./render";

interface HandSlot {
  x: number;
  y: number;
  present: boolean;
  energy: number;
  pinchLatch: boolean;
}

interface Metrics {
  hands: number;
  panL: number;
  panR: number;
  swell: number;
  mode: "demo" | "camera";
}

const HAND_HUES = [0.15, 0.9]; // copper/amber, teal
const PINCH_THRESHOLD = 0.06;

export default function BodyMirrorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<BodyAudio | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const rafRef = useRef<number | null>(null);
  const prevTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const monoRef = useRef<number>(0);

  const trailsRef = useRef<TrailPoint[]>([]);
  const slotsRef = useRef<HandSlot[]>([
    { x: 0.35, y: 0.5, present: false, energy: 0, pinchLatch: false },
    { x: 0.65, y: 0.5, present: false, energy: 0, pinchLatch: false },
  ]);
  const modeRef = useRef<"demo" | "camera">("demo");
  const reducedMotionRef = useRef<boolean>(false);
  const audioOnRef = useRef<boolean>(false);
  const metricsRef = useRef<Metrics>({
    hands: 0,
    panL: 0,
    panR: 0,
    swell: 0,
    mode: "demo",
  });
  const trailTimerRef = useRef<number>(0);

  const [audioOn, setAudioOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"off" | "loading" | "on">(
    "off",
  );
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(metricsRef.current);

  // --- Synthetic "demo body": two hands trace slow paths, occasional pinch ---
  const computeDemoHands = useCallback(
    (t: number): { x: number; y: number; pinch: boolean }[] => {
      const h0 = {
        x: 0.33 + 0.17 * Math.sin(t * 0.55),
        y: 0.5 + 0.24 * Math.sin(t * 0.9 + 0.4),
        pinch: Math.sin(t * 1.3) > 0.92,
      };
      const h1 = {
        x: 0.67 + 0.17 * Math.sin(t * 0.47 + 2.1),
        y: 0.5 + 0.24 * Math.cos(t * 0.7),
        pinch: Math.cos(t * 1.1 + 1.0) > 0.92,
      };
      return [h0, h1];
    },
    [],
  );

  // --- Read up to two hands from the live MediaPipe result ---
  // "stale" = no fresh camera frame this tick → callers keep previous hands
  // rather than flickering them absent. "ok" carries a (possibly empty) list.
  const readCameraHands = useCallback(():
    | { status: "stale" }
    | { status: "ok"; hands: { x: number; y: number; pinch: boolean }[] } => {
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (!lm || !video || video.readyState < 2) return { status: "stale" };
    if (video.currentTime === lastVideoTimeRef.current) return { status: "stale" };
    lastVideoTimeRef.current = video.currentTime;
    monoRef.current = Math.max(monoRef.current + 1, performance.now());
    let result;
    try {
      result = lm.detectForVideo(video, monoRef.current);
    } catch {
      return { status: "stale" };
    }
    const hands = result.landmarks.map((pts) => {
      // Palm center = midpoint of wrist(0) and middle-finger MCP(9).
      const cx = (pts[0].x + pts[9].x) / 2;
      const cy = (pts[0].y + pts[9].y) / 2;
      // Mirror X so moving your hand left moves the glow/sound left.
      const x = 1 - cx;
      const y = cy;
      const dx = pts[4].x - pts[8].x;
      const dy = pts[4].y - pts[8].y;
      const pinch = Math.hypot(dx, dy) < PINCH_THRESHOLD;
      return { x, y, pinch };
    });
    // Sort left→right for stable slot assignment (stable panning).
    hands.sort((a, b) => a.x - b.x);
    return { status: "ok", hands: hands.slice(0, 2) };
  }, []);

  // --- The frame loop (NOT a hook — plain function driven by rAF) ---
  const runFrame = useCallback(
    (now: number) => {
      rafRef.current = requestAnimationFrame(runFrame);
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (startTimeRef.current === 0) startTimeRef.current = now;
      const time = (now - startTimeRef.current) / 1000;
      let dt = (now - prevTimeRef.current) / 1000;
      prevTimeRef.current = now;
      if (!isFinite(dt) || dt <= 0) dt = 0.016;
      dt = Math.min(dt, 0.05);

      const reduced = reducedMotionRef.current;
      const audio = audioRef.current;

      // Gather hand observations from whichever source is live.
      // `observed === null` means "no fresh data this tick" → keep the last
      // known hands (no flicker). Demo mode always yields two hands.
      let observed: { x: number; y: number; pinch: boolean }[] | null;
      if (modeRef.current === "camera") {
        const r = readCameraHands();
        observed = r.status === "ok" ? r.hands : null;
      } else {
        observed = computeDemoHands(time);
      }

      const slots = slotsRef.current;
      const k = reduced ? 0.35 : 0.55;

      for (let i = 0; i < 2; i++) {
        const slot = slots[i];
        if (observed !== null) {
          const obs = observed[i];
          slot.present = obs !== undefined;
          if (obs) {
            // Smooth toward the observation.
            slot.x += (obs.x - slot.x) * k;
            slot.y += (obs.y - slot.y) * k;
            // Pinch rising-edge → spatial pluck.
            if (obs.pinch && !slot.pinchLatch) {
              slot.pinchLatch = true;
              slot.energy = 1;
              audio?.pluck(i, slot.x, slot.y);
            } else if (!obs.pinch) {
              slot.pinchLatch = false;
            }
          }
        }
        // Energy flash decays every frame regardless of source.
        slot.energy = Math.max(0, slot.energy - dt * 2.2);

        // Drive the continuous spatial voice.
        if (audio) {
          audio.setHand(i, slot.present, slot.x, 1 - slot.y);
        }
      }

      // Chord swell = both hands present and raised.
      const bothPresent = slots[0].present && slots[1].present;
      const avgHeight =
        (1 - slots[0].y + (1 - slots[1].y)) / 2;
      const swell = bothPresent ? Math.max(0, (avgHeight - 0.55) / 0.4) : 0;
      audio?.setSwell(swell);

      // Grow trails behind each present hand (throttled a touch).
      trailTimerRef.current += dt;
      const trailStep = reduced ? 0.05 : 0.024;
      if (trailTimerRef.current >= trailStep) {
        trailTimerRef.current = 0;
        for (let i = 0; i < 2; i++) {
          const slot = slots[i];
          if (!slot.present) continue;
          trailsRef.current.push({
            x: slot.x,
            y: slot.y,
            life: 1,
            hue: HAND_HUES[i],
          });
        }
      }
      // Age + prune trails.
      const decay = reduced ? 2.6 : 1.5;
      const trails = trailsRef.current;
      for (const p of trails) p.life -= dt * decay;
      let alive = trails.filter((p) => p.life > 0);
      if (alive.length > MAX_POINTS) alive = alive.slice(alive.length - MAX_POINTS);
      trailsRef.current = alive;

      const handRender: HandRenderState[] = slots.map((s, i) => ({
        x: s.x,
        y: s.y,
        present: s.present,
        energy: s.energy,
        hue: HAND_HUES[i],
      }));

      renderer.render({
        time,
        points: alive,
        hands: handRender,
        swell,
      });

      // Publish HUD metrics (read out by a throttled interval below).
      metricsRef.current = {
        hands: slots.filter((s) => s.present).length,
        panL: slots[0].present ? slots[0].x * 2 - 1 : 0,
        panR: slots[1].present ? slots[1].x * 2 - 1 : 0,
        swell,
        mode: modeRef.current,
      };
    },
    [computeDemoHands, readCameraHands],
  );

  // --- Mount: build renderer, detect reduced-motion, start the visual loop ---
  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const canvas = canvasRef.current;
    if (canvas) {
      try {
        rendererRef.current = createRenderer(canvas);
      } catch (err) {
        setSensorError(
          "WebGL2 is unavailable in this browser, so the visual can't run. " +
            (err instanceof Error ? err.message : ""),
        );
      }
    }

    prevTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);

    const hud = window.setInterval(() => {
      setMetrics({ ...metricsRef.current });
    }, 150);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(hud);
      audioRef.current?.stop();
      audioRef.current = null;
      audioOnRef.current = false;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // runFrame is stable (useCallback with stable deps); intentional one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginAudio = useCallback(async () => {
    if (audioOnRef.current) return;
    try {
      const audio = new BodyAudio();
      await audio.start();
      audioRef.current = audio;
      audioOnRef.current = true;
      setAudioOn(true);
    } catch (err) {
      setSensorError(
        "Web Audio could not start. " +
          (err instanceof Error ? err.message : ""),
      );
    }
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraStatus === "loading" || cameraStatus === "on") return;
    setSensorError(null);
    setCameraStatus("loading");
    // Make sure sound is running too — the piece is audio-visual.
    if (!audioOnRef.current) await beginAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const landmarker = await makeHandLandmarker();
      landmarkerRef.current = landmarker;
      modeRef.current = "camera";
      setCameraStatus("on");
    } catch (err) {
      // Degrade: keep the demo body running, explain what happened.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "demo";
      setCameraStatus("off");
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was denied — running the synthetic demo body instead."
          : "Camera or the MediaPipe hand model couldn't load (needs network + WebGL/WASM). Running the synthetic demo body instead.";
      setSensorError(msg);
    }
  }, [beginAudio, cameraStatus]);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Art canvas — WebGL2, warm/embodied palette lives here only */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Hidden capture feed for MediaPipe */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />

      {/* Chrome overlay — semantic tokens only */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              1590 · Body Mirror
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              The room hears where your hands are
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Your body is the instrument. Move a hand across the frame and the
              sound pans with it; raise both hands to swell a chord; pinch to
              pluck a note into space.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* Bottom row — controls + readouts */}
        <div className="flex flex-col gap-4">
          {sensorError && (
            <p className="max-w-xl text-sm leading-relaxed text-destructive">
              {sensorError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              {!audioOn ? (
                <button
                  type="button"
                  onClick={beginAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Start — begin the sound
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={cameraStatus === "on" || cameraStatus === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {cameraStatus === "loading"
                    ? "Enabling camera…"
                    : cameraStatus === "on"
                      ? "Camera live — play with your hands"
                      : "Enable camera to play with your body"}
                </button>
              )}
            </div>

            {/* Live readouts */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>
                mode: {metrics.mode === "camera" ? "camera" : "demo body"}
              </span>
              <span>hands: {metrics.hands}</span>
              <span>swell: {metrics.swell.toFixed(2)}</span>
              <span>
                pan: {metrics.panL >= 0 ? "+" : ""}
                {metrics.panL.toFixed(2)} / {metrics.panR >= 0 ? "+" : ""}
                {metrics.panR.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Design-notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Body Mirror
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A camera-driven, hands-free spatial instrument. The webcam feeds
              MediaPipe&apos;s HandLandmarker; each hand&apos;s position is
              mapped to real Web Audio panning and a warm WebGL glow that
              mirrors you. Move left → the sound and its trail follow left.
              Raise both hands → a chord swells. Pinch thumb to index → a note
              is plucked and placed in 3-D space.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              After Myron Krueger&apos;s <em>Videoplace</em> (1975) and Daniel
              Rozin&apos;s mechanical mirrors: the body silhouette as a live
              interactive surface. Here the &quot;mirror&quot; is a field of
              warm light that answers where your hands are.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              No camera? It still runs. A synthetic demo body drives the same
              audio and visuals so the idea is always visible.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
