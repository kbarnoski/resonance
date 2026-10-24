"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 24680-chromafield — "What if Karel's piano were a living chemistry: a
// reaction-diffusion membrane you grow with your body, whose emergent pattern
// conducts the sound?"
//
// A Gray-Scott reaction-diffusion field is simulated on the GPU (WGSL compute,
// ping-pong storage buffers) and rendered obsidian → electric violet. You DEPOSIT
// reagent into it — an arm sweep seeds the B chemical at your wrists, or a pointer
// drag does the same — and your arm-span slides the feed/kill regime between
// spots, stripes, worms and chaos. Hold still and the pattern matures. Each frame
// the field is reduced on the GPU to four scalars (coverage, edge-turbulence,
// left/right balance, vertical centroid) and read back to conduct a Web-Audio DSP
// graph over one real Karel take: a mature, ordered membrane plays the piano
// clear; a churning, chaotic one smears and resonates it. See == hear.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createGpuRd, type RdSim, type Deposit } from "./gpu";
import { createCpuRd } from "./cpuRd";
import { createChromaGraph, type ChromaGraph } from "./audio";
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

interface PointerState {
  x: number;
  y: number;
  down: boolean;
}
interface WristState {
  x: number;
  y: number;
  has: boolean;
}

// ── feed/kill regime: a continuum through four classic Gray-Scott morphologies ─
const REGIME_POINTS = [
  { r: 0.0, f: 0.022, k: 0.061 }, // spots
  { r: 0.33, f: 0.03, k: 0.057 }, // stripes / maze
  { r: 0.66, f: 0.058, k: 0.063 }, // worms
  { r: 1.0, f: 0.026, k: 0.052 }, // chaos / mitosis
] as const;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function regimeToFeedKill(r: number): { feed: number; kill: number } {
  const x = clamp01(r);
  for (let i = 0; i < REGIME_POINTS.length - 1; i++) {
    const a = REGIME_POINTS[i];
    const b = REGIME_POINTS[i + 1];
    if (x <= b.r) {
      const t = (x - a.r) / (b.r - a.r);
      return { feed: a.f + (b.f - a.f) * t, kill: a.k + (b.k - a.k) * t };
    }
  }
  const last = REGIME_POINTS[REGIME_POINTS.length - 1];
  return { feed: last.f, kill: last.k };
}

function regimeName(r: number): string {
  if (r < 0.25) return "spots";
  if (r < 0.5) return "stripes";
  if (r < 0.78) return "worms";
  return "chaos";
}

export default function ChromafieldPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const simRef = useRef<RdSim | null>(null);
  const graphRef = useRef<ChromaGraph | null>(null);
  const poseRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pointerRef = useRef<PointerState>({ x: 0.5, y: 0.5, down: false });
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
  const statusRef = useRef<TrackStatus>("pointer");
  const regimeRef = useRef(0.4);
  const driftingRef = useRef(true);
  const lastRegimeDisplayRef = useRef(0);
  // live stats mirror (for the legibility readout), updated each frame via ref.
  const statRef = useRef({ coverage: 0, edge: 0, balance: 0, centroidY: 0.5 });

  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<"gpu" | "cpu" | null>(null);
  const [gpuNotice, setGpuNotice] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState<TrackStatus>("pointer");
  const [drifting, setDrifting] = useState(true);
  const [regime, setRegime] = useState(0.4);
  const [trackIdx, setTrackIdx] = useState(0);
  const [trackTitle, setTrackTitle] = useState("");
  const [readout, setReadout] = useState({ coverage: 0, edge: 0, balance: 0 });

  const { immersive, toggle } = useImmersive();

  const applyRegime = useCallback((v: number) => {
    const c = clamp01(v);
    regimeRef.current = c;
    setRegime(c);
  }, []);

  // ── pointer fallback — fully playable with the mouse alone ──────────────────
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
      pointerRef.current = { x, y, down: true };
    };
    const onMove = (e: PointerEvent) => {
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

  // ── keyboard: ← / → (or [ / ]) nudge the feed/kill regime ───────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft" || e.key === "[") applyRegime(regimeRef.current - 0.05);
      else if (e.key === "ArrowRight" || e.key === "]") applyRegime(regimeRef.current + 0.05);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyRegime]);

  // ── read pose → up to two wrist deposits, gated on SHOULDERS only ───────────
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
    const setLost = () => {
      wristRef.current[0].has = false;
      wristRef.current[1].has = false;
      if (statusRef.current !== "lost") {
        statusRef.current = "lost";
        setStatus("lost");
      }
    };
    if (!lm) {
      setLost();
      return;
    }
    const vis = (p?: Landmark) => (p ? (p.visibility ?? 1) : 0);
    const shouldersOk =
      vis(lm[POSE_LM.leftShoulder]) > 0.5 && vis(lm[POSE_LM.rightShoulder]) > 0.5;
    if (!shouldersOk) {
      setLost();
      return;
    }

    // Resolve each wrist; synthesise from the elbow if the wrist is hidden.
    const resolve = (wristI: number, elbowI: number, shoulderI: number): WristState => {
      const wr = lm![wristI];
      if (vis(wr) > 0.4) return { x: 1 - wr.x, y: wr.y, has: true };
      const el = lm![elbowI];
      const sh = lm![shoulderI];
      if (vis(el) > 0.4 && vis(sh) > 0.4) {
        const ex = el.x + (el.x - sh.x) * 0.8;
        const ey = el.y + (el.y - sh.y) * 0.8;
        return { x: 1 - ex, y: ey, has: true };
      }
      return { x: 0.5, y: 0.5, has: false };
    };
    wristRef.current[0] = resolve(POSE_LM.leftWrist, POSE_LM.leftElbow, POSE_LM.leftShoulder);
    wristRef.current[1] = resolve(POSE_LM.rightWrist, POSE_LM.rightElbow, POSE_LM.rightShoulder);
    if (statusRef.current !== "live") {
      statusRef.current = "live";
      setStatus("live");
    }
  }, []);

  // ── assemble this frame's deposits + regime from the IDENTICAL control struct ─
  const gatherDeposits = useCallback(
    (timeSec: number): Deposit[] => {
      const deposits: Deposit[] = [];
      let userActive = false;

      // pointer (fallback path).
      const pt = pointerRef.current;
      if (pt.down) {
        deposits.push({ x: pt.x, y: pt.y, r: 0.04, amount: 0.55 });
        userActive = true;
      }

      // camera path.
      if (cameraOn && statusRef.current === "live") {
        userActive = true;
        let spanA: WristState | null = null;
        let spanB: WristState | null = null;
        for (let i = 0; i < 2; i++) {
          const w = wristRef.current[i];
          const prev = wristPrevRef.current[i];
          if (w.has) {
            const motion = prev.has ? Math.hypot(w.x - prev.x, w.y - prev.y) : 0;
            // Stillness → a faint deposit; a sweep → a strong one.
            const amount = Math.min(0.75, 0.14 + motion * 9);
            deposits.push({ x: w.x, y: w.y, r: 0.05, amount });
            if (i === 0) spanA = w;
            else spanB = w;
          }
          wristPrevRef.current[i] = { x: w.x, y: w.y, has: w.has };
        }
        // arm-span → feed/kill regime (overrides the slider while conducting).
        if (spanA && spanB) {
          const span = Math.hypot(spanA.x - spanB.x, spanA.y - spanB.y);
          const r = clamp01((span - 0.12) / (0.62 - 0.12));
          regimeRef.current = r;
          if (timeSec - lastRegimeDisplayRef.current > 0.12) {
            lastRegimeDisplayRef.current = timeSec;
            setRegime(r);
          }
        }
      }

      const nowDrifting = !userActive;
      if (nowDrifting) {
        // Hands-free: a reagent wanderer keeps the chemistry alive and evolving.
        const ax = 0.5 + 0.32 * Math.sin(timeSec * 0.37);
        const ay = 0.5 + 0.3 * Math.sin(timeSec * 0.53 + 1.3);
        deposits.push({ x: ax, y: ay, r: 0.05, amount: 0.4 });
      }
      if (nowDrifting !== driftingRef.current) {
        driftingRef.current = nowDrifting;
        setDrifting(nowDrifting);
      }
      return deposits;
    },
    [cameraOn],
  );

  // ── main loop (runs while phase === "running") ──────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    let readoutClock = 0;

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

      const deposits = gatherDeposits(timeSec);
      const { feed, kill } = regimeToFeedKill(regimeRef.current);
      sim.frame(dt, deposits, feed, kill, timeSec);

      // GPU-reduced chemistry scalars → the DSP graph over Karel's take.
      const s = sim.stats;
      statRef.current = s;
      graph.update({
        coverage: s.coverage,
        edge: s.edge,
        balance: s.balance,
        centroidY: s.centroidY,
      });

      // Throttled legibility readout (~6/s) — cheap, avoids per-frame re-render.
      if (timeSec - readoutClock > 0.16) {
        readoutClock = timeSec;
        setReadout({ coverage: s.coverage, edge: s.edge, balance: s.balance });
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => simRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [phase, cameraOn, readPose, gatherDeposits]);

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

    // 1) audio graph + real take.
    let graph: ChromaGraph;
    try {
      graph = await createChromaGraph();
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

    // 2) field — GPU Gray-Scott if we can, else a real low-res CPU membrane.
    const canvas = canvasRef.current;
    if (!canvas) {
      setAudioError("no canvas");
      setPhase("error");
      return;
    }
    try {
      simRef.current = await createGpuRd(canvas);
      setBackend("gpu");
    } catch {
      try {
        simRef.current = createCpuRd(canvas);
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
    "Press Start — one of Karel's piano takes begins playing through the membrane.",
    "Drag anywhere on the field to deposit reagent — the chemistry blooms where you touch, and the piano responds at that instant. No camera needed.",
    "Slide the Regime control (or ← / →) between spots, stripes, worms and chaos: an ordered pattern plays the take clear, a chaotic one smears and resonates it.",
    "Optional: turn on the camera and sweep your arms — keep your shoulders in frame. Your wrists deposit reagent; your arm-span sets the regime.",
    "Stop moving and let the pattern mature: coverage opens the filter, turbulence rings it, the field's balance pans the piano, its height tilts the tone.",
  ];

  const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
  const fmtBal = (v: number) =>
    v > 0.05 ? `R ${Math.round(v * 100)}` : v < -0.05 ? `L ${Math.round(-v * 100)}` : "center";

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* stage — the chemical membrane IS the page */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none", cursor: phase === "running" ? "crosshair" : "default" }}
      />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* tracking / input status — always visible while running */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-1 font-mono text-xs">
          {cameraOn ? (
            status === "live" ? (
              <span className="text-foreground">tracking · live</span>
            ) : (
              <span className="text-destructive">
                tracking · lost — stand back, shoulders in frame (pointer still deposits)
              </span>
            )
          ) : (
            <span className="text-muted-foreground">pointer · drag the field to deposit reagent</span>
          )}
          {drifting && (
            <span className="text-muted-foreground/80">
              autonomous · field drifting — reach in or drag to deposit
            </span>
          )}
        </div>
      )}

      {/* backend + degradation + live coupling readout */}
      {phase === "running" && (
        <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col items-end gap-1 font-mono text-xs">
          {!immersive && (
            <span className="text-muted-foreground">
              {backend === "gpu"
                ? "WebGPU compute · Gray-Scott membrane"
                : "CPU reaction-diffusion"}
            </span>
          )}
          {gpuNotice && (
            <span className="max-w-[18rem] text-right text-muted-foreground">
              WebGPU unavailable — running a real low-res CPU reaction-diffusion
            </span>
          )}
          {!immersive && (
            <span className="text-primary">
              cover {fmtPct(readout.coverage)} · turb {fmtPct(readout.edge)} · pan{" "}
              {fmtBal(readout.balance)}
            </span>
          )}
        </div>
      )}

      {/* intro / write-up chrome — hidden while immersive or running */}
      {!immersive && phase !== "running" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border border-border bg-background/80 p-6 backdrop-blur-md sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Chromafield
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A Gray-Scott reaction-diffusion membrane grows on the GPU in electric
              violet. You deposit reagent into it with an arm sweep or a pointer drag,
              and your arm-span slides its chemistry between spots, stripes, worms and
              chaos. The emergent pattern is reduced on the GPU and read back to
              conduct one of Karel&apos;s real piano takes: a mature, ordered membrane
              plays it clear; a churning one smears and resonates it.
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
                <p className="text-sm text-destructive">Audio could not start: {audioError}</p>
              )}
            </div>

            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Fully playable with the mouse alone — drag to deposit, ← / → to shift the
              regime. Allow the camera to grow the membrane with your body instead.
            </p>
          </div>
        </div>
      )}

      {/* running controls — hidden while immersive */}
      {phase === "running" && !immersive && (
        <div className="absolute bottom-4 left-4 right-4 z-30 flex flex-wrap items-center gap-3">
          <button type="button" onClick={toggleCamera} className={btnSecondary}>
            {cameraOn ? "Stop camera" : "Grow with camera"}
          </button>
          <label className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
            regime · <span className="text-primary">{regimeName(regime)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={regime}
              onChange={(e) => applyRegime(Number(e.target.value))}
              className="h-1 w-32 accent-primary"
              aria-label="Feed/kill regime"
            />
          </label>
          <Link href="/dream" className={btnSecondary}>
            ← back
          </Link>
          {trackTitle && <span className="font-mono text-xs text-muted-foreground">{trackTitle}</span>}
          {cameraError && <span className="text-sm text-destructive">{cameraError}</span>}
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Chromafield"
        description="A GPU Gray-Scott reaction-diffusion membrane you grow with your body. Deposit reagent with an arm sweep or a pointer drag; your arm-span slides the chemistry between spots, stripes, worms and chaos. The emergent pattern is reduced on the GPU and conducts Karel's real piano take — ordered plays it clear, chaotic smears and resonates it."
        howTo={howTo}
      />
    </div>
  );
}
