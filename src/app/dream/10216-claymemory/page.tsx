"use client";

// 10216 · Clay Memory
// "What if the clay REMEMBERED your hands? You reach into the webcam and knead a
//  glowing lump of warm clay — and every dent, pinch, and pull is PERMANENT. The
//  clay does not spring back. It plastically holds the shape you sculpt, so the
//  piece is a record of everything you did to it."
//
// The clay is a region-based shape-matching soft body (Müller et al. 2005) with an
// XPBD-flavoured plasticity threshold (Macklin et al. 2016): past the yield point,
// the REST shape itself creeps toward the deformed state, so the dent becomes the
// new home. Gentle touches are elastic; firm kneading is permanent memory.
//
// Input degrades: MediaPipe Hands → pointer drag → frame-diff blob → a seeded
// ghost sculptor that kneads and resets the lump from frame one (the muted-phone
// read). Audio waits for the first user gesture (autoplay policy); the clay
// sculpts itself silently before then.

import * as THREE from "three";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { ClaySolver, type ClayHand } from "./clay";
import { ClayAudio } from "./audio";
import {
  makeHandLandmarker,
  readMediaPipeHands,
  FrameDiffTracker,
  GhostSculptor,
  cameraSupported,
  type HandLandmarkerLike,
  type HandObservation,
} from "./hands";

type Mode = "auto" | "pointer" | "camera";
type Tracker = "mediapipe" | "frame-diff" | "none";

interface Readout {
  mode: Mode;
  tracker: Tracker;
  plastic: number;
  motion: number;
}

// Pointer state → one hand; a short dwell converts a drag into a pinch-grab.
interface PointerState {
  down: boolean;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  dwell: number;
}

export default function ClayMemoryPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const solverRef = useRef<ClaySolver | null>(null);
  const audioRef = useRef<ClayAudio | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const frameDiffRef = useRef<FrameDiffTracker | null>(null);
  const ghostRef = useRef<GhostSculptor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const rafRef = useRef<number | null>(null);
  const startMsRef = useRef<number>(0);
  const prevMsRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const monoRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  const cameraLiveRef = useRef<boolean>(false);
  const trackerRef = useRef<Tracker>("none");
  const camObsRef = useRef<HandObservation[]>([]);
  const pointerRef = useRef<PointerState>({
    down: false,
    x: 0.5,
    y: 0.5,
    lastX: 0.5,
    lastY: 0.5,
    dwell: 0,
  });
  const readoutRef = useRef<Readout>({
    mode: "auto",
    tracker: "none",
    plastic: 0,
    motion: 0,
  });

  const [audioOn, setAudioOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"off" | "loading" | "on">("off");
  const [note, setNote] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<Readout>(readoutRef.current);
  const [hasCamera] = useState<boolean>(() =>
    typeof window === "undefined" ? true : cameraSupported(),
  );

  // ── Read camera hands (MediaPipe or frame-diff), null = no fresh frame ──────
  const readCamera = useCallback((nowMs: number): HandObservation[] | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    if (video.currentTime === lastVideoTimeRef.current) return null;
    lastVideoTimeRef.current = video.currentTime;

    const lm = landmarkerRef.current;
    if (lm) {
      monoRef.current = Math.max(monoRef.current + 1, nowMs);
      try {
        return readMediaPipeHands(lm, video, monoRef.current);
      } catch {
        return null;
      }
    }
    const fd = frameDiffRef.current;
    if (fd) {
      const obs = fd.sample(video, nowMs);
      return obs ? [obs] : [];
    }
    return null;
  }, []);

  // ── Three.js scene (imperative), built once on mount ────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    ghostRef.current = new GhostSculptor(reducedRef.current);
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setNote(
        "WebGL could not start on this device — the sculpt can't be shown here.",
      );
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x140b07); // warm near-black

    const camera = new THREE.PerspectiveCamera(
      42,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0, 4.6);

    // Warm terracotta clay body.
    const solver = new ClaySolver();
    solverRef.current = solver;
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xb75a37, // terracotta
      roughness: 0.72,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.55,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xd98a4a),
      sheenRoughness: 0.7,
      emissive: new THREE.Color(0x2a0f06),
      emissiveIntensity: 0.5,
    });
    const clayMesh = new THREE.Mesh(solver.geometry, material);
    scene.add(clayMesh);

    // Lighting: ochre key + terracotta rim over a dim ambient, warm world.
    const key = new THREE.DirectionalLight(0xffb457, 2.4); // ochre key
    key.position.set(2.2, 2.6, 3.0);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff6a3c, 1.6); // terracotta rim
    rim.position.set(-2.6, -1.0, -2.2);
    scene.add(rim);
    const fill = new THREE.PointLight(0xffd9a0, 0.6, 20);
    fill.position.set(-1.5, 1.8, 2.5);
    scene.add(fill);
    const amb = new THREE.AmbientLight(0x3a1c10, 0.9);
    scene.add(amb);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);

    prevMsRef.current = performance.now();

    const runFrame = (nowMs: number) => {
      rafRef.current = requestAnimationFrame(runFrame);
      if (startMsRef.current === 0) startMsRef.current = nowMs;
      const t = (nowMs - startMsRef.current) / 1000;
      let dt = (nowMs - prevMsRef.current) / 1000;
      prevMsRef.current = nowMs;
      if (!isFinite(dt) || dt <= 0) dt = 0.016;
      dt = Math.min(dt, 0.05);

      const reduced = reducedRef.current;

      // Determine the active mode + gather hands.
      let mode: Mode;
      let hands: ClayHand[] = [];
      if (cameraLiveRef.current) {
        mode = "camera";
        const fresh = readCamera(nowMs);
        if (fresh !== null) camObsRef.current = fresh;
        hands = camObsRef.current
          .slice(0, 2)
          .map((o) => ({ active: true, x: o.x, y: o.y, grab: o.grab }));
      } else if (pointerRef.current.down) {
        mode = "pointer";
        const p = pointerRef.current;
        const moved = Math.hypot(p.x - p.lastX, p.y - p.lastY);
        if (moved < 0.004) p.dwell += dt;
        else p.dwell = 0;
        p.lastX = p.x;
        p.lastY = p.y;
        // dwell (hold roughly still) → pinch-grab; a moving drag pushes.
        hands = [{ active: true, x: p.x, y: p.y, grab: p.dwell > 0.35 }];
      } else {
        mode = "auto";
        const gf = ghostRef.current?.step(t);
        if (gf) {
          if (gf.reset) solver.reset();
          hands = gf.hands.map((o) => ({
            active: true,
            x: o.x,
            y: o.y,
            grab: o.grab,
          }));
        }
      }

      solver.step(dt, hands);
      const m = solver.getMetrics();

      // Fold sim state into sound (only after the first user gesture).
      audioRef.current?.update(m.motion, m.plastic, m.yieldEnergy, dt);

      // Slow turntable so the sculpt reads in the round (still, but alive).
      clayMesh.rotation.y += dt * (reduced ? 0.05 : 0.16);
      clayMesh.rotation.x = Math.sin(t * 0.13) * 0.12;

      // Warm the glow with plastic memory — the more sculpted, the deeper the ember.
      material.emissiveIntensity = 0.4 + m.plastic * 0.7;

      renderer.render(scene, camera);

      readoutRef.current = {
        mode,
        tracker: trackerRef.current,
        plastic: m.plastic,
        motion: m.motion,
      };
    };
    rafRef.current = requestAnimationFrame(runFrame);

    const hud = window.setInterval(() => {
      setReadout({ ...readoutRef.current });
    }, 180);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(hud);
      window.removeEventListener("resize", resize);
      audioRef.current?.stop();
      audioRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      frameDiffRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      solver.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      solverRef.current = null;
    };
    // runFrame is stable via refs; intentional one-shot mount.
  }, [readCamera]);

  // ── Audio (first user gesture) ──────────────────────────────────────────────
  const beginAudio = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const audio = new ClayAudio();
      await audio.start();
      audioRef.current = audio;
      setAudioOn(true);
    } catch (err) {
      setNote(
        "Web Audio could not start on this device — the clay keeps sculpting silently. " +
          (err instanceof Error ? err.message : ""),
      );
    }
  }, []);

  // ── Camera (opt-in) + degrade ───────────────────────────────────────────────
  const enableCamera = useCallback(async () => {
    if (cameraStatus === "loading" || cameraStatus === "on") return;
    if (!hasCamera) {
      setNote(
        "No camera API in this browser — sculpt with the pointer (drag to press, hold still to pinch), or just watch the clay knead itself.",
      );
      return;
    }
    setNote(null);
    setCameraStatus("loading");
    if (!audioRef.current) await beginAudio();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch (err) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setCameraStatus("off");
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setNote(
        denied
          ? "Camera permission was denied — the clay keeps kneading itself; you can also sculpt with the pointer."
          : "The camera couldn't open — the clay keeps kneading itself; sculpt with the pointer instead.",
      );
      return;
    }

    // Tier 1: MediaPipe; Tier 3: fall to frame-diff on any failure.
    try {
      const lm = await makeHandLandmarker();
      landmarkerRef.current = lm;
      trackerRef.current = "mediapipe";
    } catch {
      try {
        frameDiffRef.current = new FrameDiffTracker();
        trackerRef.current = "frame-diff";
        setNote(
          "MediaPipe Hands couldn't load (needs network + WebGL/WASM) — falling back to motion tracking: move your hand over the clay to press, hold still to pinch a peak.",
        );
      } catch {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        setCameraStatus("off");
        trackerRef.current = "none";
        setNote(
          "Hand tracking is unavailable here — sculpt with the pointer, or watch the clay knead itself.",
        );
        return;
      }
    }
    cameraLiveRef.current = true;
    setCameraStatus("on");
  }, [beginAudio, cameraStatus, hasCamera]);

  const freshLump = useCallback(() => {
    solverRef.current?.reset();
  }, []);

  // ── Pointer fallback ────────────────────────────────────────────────────────
  const pointerPos = useCallback((e: React.PointerEvent) => {
    const el = mountRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const r = el.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (cameraLiveRef.current) return;
      if (!audioRef.current) void beginAudio();
      const p = pointerPos(e);
      const st = pointerRef.current;
      st.down = true;
      st.x = st.lastX = p.x;
      st.y = st.lastY = p.y;
      st.dwell = 0;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [beginAudio, pointerPos],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointerRef.current.down) return;
      const p = pointerPos(e);
      pointerRef.current.x = p.x;
      pointerRef.current.y = p.y;
    },
    [pointerPos],
  );
  const onPointerUp = useCallback(() => {
    const st = pointerRef.current;
    st.down = false;
    st.dwell = 0;
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        {/* Top */}
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              10216 · Clay Memory
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              The clay remembers your hands
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Reach in and knead a warm lump. Every dent, pinch, and pull is
              permanent — it does not spring back. The piece becomes a record of
              everything you did to it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {/* Bottom */}
        <div className="flex flex-col gap-4">
          {note && (
            <p className="max-w-xl text-sm leading-relaxed text-destructive">{note}</p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              {!audioOn ? (
                <button
                  type="button"
                  onClick={hasCamera ? enableCamera : beginAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {hasCamera ? "Enable camera — reach in" : "Start the sound"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={cameraStatus === "on" || cameraStatus === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {cameraStatus === "loading"
                    ? "Loading hand tracking…"
                    : cameraStatus === "on"
                      ? "Camera live — sculpt"
                      : "Enable camera"}
                </button>
              )}
              <button
                type="button"
                onClick={freshLump}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-5 text-sm text-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
              >
                Fresh lump
              </button>
              {!audioOn && (
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  or drag to press · hold still to pinch
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>
                mode:{" "}
                {readout.mode === "auto"
                  ? "auto-sculptor"
                  : readout.mode === "camera"
                    ? `camera · ${readout.tracker}`
                    : "pointer"}
              </span>
              <span>memory: {(readout.plastic * 100).toFixed(0)}%</span>
              <span>strain: {readout.motion.toFixed(3)}</span>
            </div>
          </div>
        </div>
      </div>

      {notesOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Clay Memory
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The lump is a meshless soft body: a subdivided icosphere de-duped into
              ~642 particles, grouped into overlapping regions. Each frame, every
              region finds the rotation + translation that best fits its rest shape
              to its current shape (shape matching, Müller et al. 2005), and a
              spring pulls each particle toward that goal.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              What makes it CLAY: a plasticity threshold. Push a particle past its
              yield point and its rest position permanently creeps toward the
              deformed state (an XPBD-style plastic flow, after Macklin et al.
              2016). The rest shape itself changes, so the dent becomes the new home
              — the clay never springs back and never heals on its own. Only
              &ldquo;Fresh lump&rdquo; restores the sphere.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Hands come from MediaPipe (Zhang et al., Google 2020): an open palm
              dents, a pinch pulls a peak. Input degrades to pointer, to a
              frame-diff blob, and finally to a seeded ghost sculptor that kneads
              and wipes the lump on a loop — so the memory is legible with no input.
              The struck-bar drone (inharmonic ratios 1 : 2.76 : 5.40) darkens as
              plastic deformation accumulates, and wet-clay grains fire on strain,
              so the sound is a record of the sculpting too.
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

      <PrototypeNav slugs={["10216-claymemory"]} />
    </div>
  );
}
