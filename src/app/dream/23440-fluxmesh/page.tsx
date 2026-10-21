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

// Live, normalised two-region params (also read by the signal-flow overlay).
interface FlowState {
  leftEnergy01: number;
  leftStretch01: number;
  rightEnergy01: number;
  rightCentroidY: number;
  tilt: number;
  balance: number;
}

export default function FluxMeshPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
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
  const leftEnvRef = useRef(0);
  const rightEnvRef = useRef(0);
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

  // ── signal-flow overlay — the Fluxion graph drawn over the field ────────────
  // A thin schematic layer above the mesh: a divider marking the two conducted
  // regions (L → FILTER, R → COMB) and a bottom signal-flow strip whose blocks
  // fill live from the same scalars that steer the DSP graph. Pure art strings
  // (teal/cyan/graphite) — this is the piece's visualisation, kept in immersive.
  const drawFlow = useCallback((f: FlowState) => {
    const cv = overlayRef.current;
    if (!cv) return;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const wantW = Math.max(1, Math.floor(cv.clientWidth * dpr));
    const wantH = Math.max(1, Math.floor(cv.clientHeight * dpr));
    if (cv.width !== wantW || cv.height !== wantH) {
      cv.width = wantW;
      cv.height = wantH;
    }
    const g = cv.getContext("2d");
    if (!g) return;
    const W = cv.width;
    const H = cv.height;
    g.clearRect(0, 0, W, H);
    g.save();
    g.scale(dpr, dpr);
    const w = W / dpr;
    const h = H / dpr;

    const dim = "rgba(150,180,190,0.42)";
    const hot = (a: number) => `rgba(102,242,255,${a})`;
    const teal = (a: number) => `rgba(40,150,175,${a})`;

    // Region divider + labels.
    g.strokeStyle = "rgba(120,160,175,0.18)";
    g.lineWidth = 1;
    g.setLineDash([4, 6]);
    g.beginPath();
    g.moveTo(w / 2, 10);
    g.lineTo(w / 2, h - 70);
    g.stroke();
    g.setLineDash([]);

    g.font = "600 11px ui-monospace, monospace";
    g.textBaseline = "top";
    g.textAlign = "center";
    const lGlow = 0.4 + f.leftEnergy01 * 0.6;
    const rGlow = 0.4 + f.rightEnergy01 * 0.6;
    g.fillStyle = hot(lGlow);
    g.fillText("L · FILTER", w * 0.25, 12);
    g.fillStyle = hot(rGlow);
    g.fillText("R · COMB", w * 0.75, 12);

    // Bottom signal-flow strip.
    const cells: { label: string; level: number; mark?: number }[] = [
      { label: "SRC", level: 0.5 },
      { label: "SOS", level: f.leftEnergy01 },
      { label: "FIR", level: f.rightEnergy01 },
      { label: "DLY", level: f.tilt },
      { label: "PAN", level: 0, mark: (f.balance + 1) / 2 },
    ];
    const n = cells.length;
    const pad = 16;
    const gap = 10;
    const cw = Math.min(110, (w - pad * 2 - gap * (n - 1)) / n);
    const totalW = cw * n + gap * (n - 1);
    const x0 = (w - totalW) / 2;
    const cy = h - 48;
    const ch = 30;

    for (let i = 0; i < n; i++) {
      const cx = x0 + i * (cw + gap);
      // connector arrow
      if (i > 0) {
        g.strokeStyle = dim;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx - gap, cy + ch / 2);
        g.lineTo(cx, cy + ch / 2);
        g.stroke();
      }
      // cell frame
      g.strokeStyle = "rgba(120,160,175,0.30)";
      g.lineWidth = 1;
      g.strokeRect(cx, cy, cw, ch);
      // fill bar (level)
      const c = cells[i];
      if (c.mark === undefined) {
        g.fillStyle = teal(0.22 + c.level * 0.5);
        g.fillRect(cx + 1, cy + 1, (cw - 2) * Math.max(0, Math.min(1, c.level)), ch - 2);
      } else {
        // pan marker
        const mx = cx + 2 + (cw - 4) * Math.max(0, Math.min(1, c.mark));
        g.strokeStyle = hot(0.8);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(mx, cy + 3);
        g.lineTo(mx, cy + ch - 3);
        g.stroke();
      }
      // label
      g.fillStyle = dim;
      g.font = "600 10px ui-monospace, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(c.label, cx + cw / 2, cy + ch / 2);
    }
    g.restore();
  }, []);

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

      // GPU-reduced per-region scalars → two parts of the DSP graph.
      const s = sim.scalars;
      energyPeakRef.current = Math.max(energyPeakRef.current * 0.992, s.energy, 1e-3);
      const peak = energyPeakRef.current;
      const leftE = Math.min(1, s.left.energy / peak);
      const rightE = Math.min(1, s.right.energy / peak);
      leftEnvRef.current += (leftE - leftEnvRef.current) * 0.18;
      rightEnvRef.current += (rightE - rightEnvRef.current) * 0.18;

      const flow: FlowState = {
        leftEnergy01: leftEnvRef.current,
        leftStretch01: Math.min(1, s.left.stretch * 20),
        rightEnergy01: rightEnvRef.current,
        rightCentroidY: s.right.centroidY,
        tilt: s.centroidY,
        balance: s.balance,
      };
      graph.update(flow);
      drawFlow(flow);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => simRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [phase, cameraOn, readPose, gatherPushes, drawFlow]);

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
    "The field is split in two: the LEFT half drives a resonant filter, the RIGHT half drives a comb. Push a side to shape that part of the sound.",
    "Drag with the mouse to push the membrane; where you push brightens and that part of the piano responds at that instant.",
    "Optional: turn on the camera and reach with BOTH hands — keep your shoulders in frame; your left and right wrists conduct the two regions independently.",
    "Watch the signal-flow strip at the bottom: SRC → SOS filter → FIR comb → delay → pan fills live from what your hands are doing.",
  ];

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* stage */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none", cursor: phase === "running" ? "crosshair" : "default" }}
      />
      {/* signal-flow overlay — the Fluxion graph drawn over the field */}
      <canvas
        ref={overlayRef}
        className={`pointer-events-none absolute inset-0 z-10 h-full w-full transition-opacity duration-500 ${
          phase === "running" ? "opacity-100" : "opacity-0"
        }`}
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
              A large mass-spring membrane runs on the GPU, split into two conducted
              halves. Each half is reduced on the GPU and read back to steer a
              different part of a Fluxion-style DSP graph over one of Karel&apos;s real
              piano takes: your left hand works a resonant filter cascade, your right
              hand carves a feedforward comb. Reach into the field and the piano
              responds where you touch it.
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
        description="A GPU mass-spring field split into two conducted halves: the left drives a resonant filter cascade, the right a feedforward comb, both shaping Karel's piano. Push a side and that part of the sound responds where you touch."
        howTo={howTo}
      />
    </div>
  );
}
