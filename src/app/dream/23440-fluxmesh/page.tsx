"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 23440-fluxmesh — "What if a GPU mass-spring mesh you push with your body
// became the filter shaping Karel's piano?"
//
// A large mass-spring membrane is simulated on the GPU (compute shaders). Each
// frame the field is reduced on the GPU to four scalars that are read back and
// driven straight onto a Fluxion-style Web-Audio DSP graph (a biquad SOS cascade
// + a delay feedback line) processing one real Karel take. You reach into the
// field with a wrist (camera pose) or the mouse; where you push brightens, and
// the piano opens up at the same instant. See == hear.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createGpuMesh, type MeshSim, type Push } from "./gpu";
import { createCpuMesh } from "./cpuMesh";
import { createFluxGraph, type FluxGraph } from "./audio";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

type Phase = "idle" | "loading" | "running" | "error";
type TrackStatus = "pointer" | "live" | "lost";

const DRAG_GAIN = 360;
const PRESS = 10;
const WRIST_GAIN = 340;

interface PointerState {
  x: number;
  y: number;
  px: number;
  py: number;
  down: boolean;
}

interface WristState {
  x: number;
  y: number;
  has: boolean;
}

export default function FluxMeshPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const simRef = useRef<MeshSim | null>(null);
  const graphRef = useRef<FluxGraph | null>(null);
  const poseRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pointerRef = useRef<PointerState>({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false });
  const wristRef = useRef<[WristState, WristState]>([
    { x: 0.5, y: 0.5, has: false },
    { x: 0.5, y: 0.5, has: false },
  ]);
  const wristPrevRef = useRef<[WristState, WristState]>([
    { x: 0.5, y: 0.5, has: false },
    { x: 0.5, y: 0.5, has: false },
  ]);
  const monoRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const energyPeakRef = useRef(1e-3);
  const energyEnvRef = useRef(0);
  const statusRef = useRef<TrackStatus>("pointer");

  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<"gpu" | "cpu" | null>(null);
  const [gpuNotice, setGpuNotice] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState<TrackStatus>("pointer");
  const [trackIdx, setTrackIdx] = useState(0);
  const [trackTitle, setTrackTitle] = useState("");

  const { immersive, toggle } = useImmersive();

  // ── pointer (fallback — fully playable with the mouse alone) ────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const toSim = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (cx - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (cy - r.top) / r.height)),
      };
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const { x, y } = toSim(e.clientX, e.clientY);
      pointerRef.current = { x, y, px: x, py: y, down: true };
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerRef.current.down) return;
      const { x, y } = toSim(e.clientX, e.clientY);
      pointerRef.current.x = x;
      pointerRef.current.y = y;
    };
    const onUp = () => {
      pointerRef.current.down = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ── read pose → up to two wrist pushes, gated on shoulders only ─────────────
  const readPose = useCallback(() => {
    const pose = poseRef.current;
    const video = videoRef.current;
    if (!pose || !video || video.readyState < 2) return;
    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;
    monoRef.current = Math.max(monoRef.current + 1, performance.now());

    let lm: Landmark[] | undefined;
    try {
      lm = pose.detectForVideo(video, monoRef.current).landmarks[0];
    } catch {
      return;
    }
    if (!lm) {
      wristRef.current[0].has = false;
      wristRef.current[1].has = false;
      statusRef.current = "lost";
      setStatus("lost");
      return;
    }

    const vis = (p?: Landmark) => (p ? (p.visibility ?? 1) : 0);
    const shouldersOk =
      vis(lm[POSE_LM.leftShoulder]) > 0.5 && vis(lm[POSE_LM.rightShoulder]) > 0.5;
    if (!shouldersOk) {
      wristRef.current[0].has = false;
      wristRef.current[1].has = false;
      statusRef.current = "lost";
      setStatus("lost");
      return;
    }

    // Resolve each wrist; synthesise from the elbow if the wrist itself is
    // hidden (never reject the frame on a missing wrist).
    const resolve = (wristI: number, elbowI: number, shoulderI: number): WristState => {
      const wr = lm![wristI];
      if (vis(wr) > 0.4) return { x: 1 - wr.x, y: wr.y, has: true };
      const el = lm![elbowI];
      const sh = lm![shoulderI];
      if (vis(el) > 0.4 && vis(sh) > 0.4) {
        // extrapolate past the elbow along the shoulder→elbow line
        const ex = el.x + (el.x - sh.x) * 0.8;
        const ey = el.y + (el.y - sh.y) * 0.8;
        return { x: 1 - ex, y: ey, has: true };
      }
      return { x: 0.5, y: 0.5, has: false };
    };

    wristRef.current[0] = resolve(POSE_LM.leftWrist, POSE_LM.leftElbow, POSE_LM.leftShoulder);
    wristRef.current[1] = resolve(POSE_LM.rightWrist, POSE_LM.rightElbow, POSE_LM.rightShoulder);
    statusRef.current = "live";
    setStatus("live");
  }, []);

  // ── collect this frame's pushes from pointer + wrists ───────────────────────
  const gatherPushes = useCallback((): Push[] => {
    const pushes: Push[] = [];
    const pt = pointerRef.current;
    if (pt.down) {
      const fx = (pt.x - pt.px) * DRAG_GAIN;
      const fy = (pt.y - pt.py) * DRAG_GAIN + PRESS;
      pushes.push({ x: pt.x, y: pt.y, fx, fy });
      pt.px = pt.x;
      pt.py = pt.y;
    }
    if (cameraOn && statusRef.current === "live") {
      for (let i = 0; i < 2; i++) {
        const w = wristRef.current[i];
        const prev = wristPrevRef.current[i];
        if (w.has) {
          const fx = prev.has ? (w.x - prev.x) * WRIST_GAIN : 0;
          const fy = (prev.has ? (w.y - prev.y) * WRIST_GAIN : 0) + PRESS * 0.7;
          pushes.push({ x: w.x, y: w.y, fx, fy });
        }
        wristPrevRef.current[i] = { x: w.x, y: w.y, has: w.has };
      }
    }
    return pushes;
  }, [cameraOn]);

  // ── main loop (runs while phase === "running") ──────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const tick = (now: number) => {
      const sim = simRef.current;
      const graph = graphRef.current;
      if (!sim || !graph) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const timeSec = (now - t0) / 1000;

      if (cameraOn) readPose();
      sim.frame(dt, gatherPushes(), timeSec);

      // GPU-reduced scalars → DSP params.
      const s = sim.scalars;
      energyPeakRef.current = Math.max(energyPeakRef.current * 0.992, s.energy, 1e-3);
      const energy01 = Math.min(1, s.energy / energyPeakRef.current);
      energyEnvRef.current += (energy01 - energyEnvRef.current) * 0.18;
      const stretch01 = Math.min(1, s.stretch * 20);
      graph.update(energyEnvRef.current, stretch01, s.centroidY, s.balance);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => simRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [phase, cameraOn, readPose, gatherPushes]);

  // ── teardown on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      simRef.current?.dispose();
      graphRef.current?.dispose();
      poseRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      simRef.current = null;
      graphRef.current = null;
      poseRef.current = null;
      streamRef.current = null;
    };
  }, []);

  // ── start ───────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setPhase("loading");
    setAudioError(null);
    setGpuNotice(false);

    // 1) audio graph + real take
    let graph: FluxGraph;
    try {
      graph = await createFluxGraph();
      await graph.ctx.resume().catch(() => {});
      const track = REAL_TRACKS[trackIdx];
      const { buffer, title } = await loadRealTrackBuffer(graph.ctx, track.id);
      graph.start(buffer);
      graphRef.current = graph;
      setTrackTitle(title);
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : "audio failed to load");
      setPhase("error");
      return;
    }

    // 2) mesh — GPU if we can, else a smaller CPU membrane
    const canvas = canvasRef.current;
    if (!canvas) {
      setAudioError("no canvas");
      setPhase("error");
      return;
    }
    try {
      simRef.current = await createGpuMesh(canvas);
      setBackend("gpu");
    } catch {
      try {
        simRef.current = createCpuMesh(canvas);
        setBackend("cpu");
        setGpuNotice(true);
      } catch (e) {
        setAudioError(e instanceof Error ? e.message : "simulation failed");
        graphRef.current?.dispose();
        graphRef.current = null;
        setPhase("error");
        return;
      }
    }
    setPhase("running");
  }, [trackIdx]);

  // ── camera toggle ────────────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      poseRef.current?.close();
      poseRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOn(false);
      statusRef.current = "pointer";
      setStatus("pointer");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setCameraError(null);
    try {
      streamRef.current = await startCamera(video);
      poseRef.current = await createPoseTracker(1);
      setCameraOn(true);
      statusRef.current = "lost";
      setStatus("lost");
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : "camera unavailable");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [cameraOn]);

  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnSecondary =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  const howTo = [
    "Press Start — one of Karel's piano takes begins playing through the mesh.",
    "Drag anywhere on the field with the mouse to push the membrane; where you push brightens and the piano opens at that instant.",
    "Optional: turn on the camera and reach with your hands — keep your shoulders in frame; your wrists push the field.",
    "Energy opens the filter, how far you stretch the mesh adds resonance, up/down tilts the delay, left/right pans the piano.",
  ];

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* stage */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none", cursor: phase === "running" ? "crosshair" : "default" }}
      />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* tracking status — always visible while the camera is on */}
      {(cameraOn || (phase === "running")) && (
        <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs">
          {cameraOn ? (
            status === "live" ? (
              <span className="text-foreground">tracking · live</span>
            ) : (
              <span className="text-destructive">
                tracking · lost — face the camera, shoulders in frame
              </span>
            )
          ) : (
            <span className="text-muted-foreground">pointer · drag the field to play</span>
          )}
        </div>
      )}

      {/* backend + degradation notices */}
      {phase === "running" && (
        <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col items-end gap-1 font-mono text-xs">
          {!immersive && (
            <span className="text-muted-foreground">
              {backend === "gpu" ? "WebGPU compute · mass-spring field" : "CPU mass-spring field"}
            </span>
          )}
          {gpuNotice && (
            <span className="max-w-[18rem] text-right text-muted-foreground">
              GPU unavailable — running a smaller CPU simulation
            </span>
          )}
        </div>
      )}

      {/* write-up chrome — hidden while immersive */}
      {!immersive && phase !== "running" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border border-border bg-background/80 p-6 backdrop-blur-md sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Fluxmesh
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A large mass-spring membrane runs on the GPU. Every frame its emergent
              state — kinetic energy, where the energy sits, how far it is stretched —
              is reduced on the GPU and read back to steer a cascaded biquad filter and
              a delay line shaping one of Karel&apos;s real piano takes. Reach into the
              field and the piano responds where you touch it.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                Piano take
                <select
                  value={trackIdx}
                  onChange={(e) => setTrackIdx(Number(e.target.value))}
                  disabled={phase === "loading"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {REAL_TRACKS.map((t, i) => (
                    <option key={t.id} value={i}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={start} disabled={phase === "loading"} className={btnPrimary}>
                  {phase === "loading" ? "Loading…" : "Start"}
                </button>
                <Link href="/dream" className={btnSecondary}>
                  ← back to dream
                </Link>
              </div>

              {audioError && (
                <p className="text-sm text-destructive">
                  Audio could not start: {audioError}
                </p>
              )}
            </div>

            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Drag with the mouse to play — no camera required. Allow the camera to
              conduct with your body instead.
            </p>
          </div>
        </div>
      )}

      {/* running controls */}
      {phase === "running" && !immersive && (
        <div className="absolute bottom-4 left-4 z-30 flex flex-wrap items-center gap-3">
          <button type="button" onClick={toggleCamera} className={btnSecondary}>
            {cameraOn ? "Stop camera" : "Conduct with camera"}
          </button>
          <Link href="/dream" className={btnSecondary}>
            ← back
          </Link>
          {trackTitle && (
            <span className="font-mono text-xs text-muted-foreground">{trackTitle}</span>
          )}
          {cameraError && <span className="text-sm text-destructive">{cameraError}</span>}
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Fluxmesh"
        description="A GPU mass-spring field whose emergent motion drives a biquad cascade and delay line over Karel's piano. Push the membrane and the piano brightens where you touch."
        howTo={howTo}
      />
    </div>
  );
}
