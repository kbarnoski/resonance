"use client";

// 9560 · Handflux
// "What if your two hands could STIR a boundless river of light — tens of
//  thousands of particles flowing on the GPU — and the way they flow near your
//  hands is what you HEAR?"
//
// The field is a WebGPU COMPUTE particle flow-field (curl-noise river), not a
// fragment shader. Each hand is a curl-vortex + attractor that stirs the current;
// pinch fires an outward burst; a fast downward sweep drives a stronger downward
// current and an audio ACCENT. Aggregate flow near the hands drives an ambient
// synth through the shared ear-safety master.
//
// Fallbacks (never a blank screen):
//   • No WebGPU  → Canvas2D CPU particle field (fewer particles, same forces).
//   • No camera  → seeded two-synthetic-hands auto-demo that stirs the current
//                  itself, so a muted phone still sees + hears the art.
//   • Reduced-motion → the flow is calmed to a near-still gentle drift.

import { useCallback, useEffect, useRef, useState } from "react";
import { makeHandLandmarker, type HandLandmarkerLike } from "./handLoader";
import { HandfluxAudio, type FlowState } from "./audio";
import {
  buildGpu,
  packComputeUniform,
  packRenderUniform,
  PARTICLE_COUNT,
  WORKGROUP_DISPATCH,
  type GpuCtx,
  type HandUniform,
} from "./gpu";
import { Canvas2DField, type HandForceInput } from "./canvas2d";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";

const SEED = 0x9560;
const PINCH_THRESHOLD = 0.06;

interface HandTrack {
  x: number;
  y: number;
  present: boolean;
  vxEma: number;
  vyEma: number;
  speedEma: number;
  prevX: number;
  prevY: number;
  pinchLatch: boolean;
  burst: number;
  accentCooldown: number;
}

interface Observed {
  x: number;
  y: number;
  pinch: boolean;
}

interface Metrics {
  mode: "demo" | "camera";
  backend: "webgpu" | "canvas2d" | "none";
  hands: number;
  energy: number;
}

function makeTrack(x: number): HandTrack {
  return {
    x,
    y: 0.5,
    present: false,
    vxEma: 0,
    vyEma: 0,
    speedEma: 0,
    prevX: x,
    prevY: 0.5,
    pinchLatch: false,
    burst: 0,
    accentCooldown: 0,
  };
}

export default function HandfluxPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<HandfluxAudio | null>(null);
  const gpuRef = useRef<GpuCtx | null>(null);
  const cpuFieldRef = useRef<Canvas2DField | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const rafRef = useRef<number | null>(null);
  const prevTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const monoRef = useRef<number>(0);
  const energyRef = useRef<number>(0);
  const brightnessRef = useRef<number>(1);

  const tracksRef = useRef<HandTrack[]>([makeTrack(0.35), makeTrack(0.65)]);
  const demoPhaseRef = useRef<[number, number]>([0, 0]);
  const modeRef = useRef<"demo" | "camera">("demo");
  const backendRef = useRef<"webgpu" | "canvas2d" | "none">("none");
  const reducedRef = useRef<boolean>(false);
  const audioOnRef = useRef<boolean>(false);
  const metricsRef = useRef<Metrics>({
    mode: "demo",
    backend: "none",
    hands: 0,
    energy: 0,
  });

  const [audioOn, setAudioOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"off" | "loading" | "on">(
    "off",
  );
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(metricsRef.current);

  // --- Seeded two-synthetic-hands demo: smooth Lissajous orbits that stir the
  //     current themselves. Derived from seed-based phases + elapsed time only. ---
  const computeDemoHands = useCallback((t: number): Observed[] => {
    const [p0, p1] = demoPhaseRef.current;
    const h0: Observed = {
      x: 0.32 + 0.2 * Math.sin(t * 0.53 + p0),
      y: 0.5 + 0.26 * Math.sin(t * 0.83 + p0 * 1.7),
      pinch: Math.sin(t * 1.27 + p0) > 0.94,
    };
    const h1: Observed = {
      x: 0.68 + 0.2 * Math.sin(t * 0.47 + p1 + 2.1),
      y: 0.5 + 0.26 * Math.cos(t * 0.71 + p1),
      pinch: Math.cos(t * 1.09 + p1 + 1.0) > 0.94,
    };
    return [h0, h1];
  }, []);

  // --- Read up to two hands from the live MediaPipe result. ---
  const readCameraHands = useCallback(():
    | { status: "stale" }
    | { status: "ok"; hands: Observed[] } => {
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
    const hands: Observed[] = result.landmarks.map((pts) => {
      const cx = (pts[0].x + pts[9].x) / 2;
      const cy = (pts[0].y + pts[9].y) / 2;
      const x = 1 - cx; // mirror for selfie view
      const y = cy;
      const dx = pts[4].x - pts[8].x;
      const dy = pts[4].y - pts[8].y;
      const pinch = Math.hypot(dx, dy) < PINCH_THRESHOLD;
      return { x, y, pinch };
    });
    hands.sort((a, b) => a.x - b.x);
    return { status: "ok", hands: hands.slice(0, 2) };
  }, []);

  // --- The frame loop (plain function driven by rAF). ---
  const runFrame = useCallback(
    (now: number) => {
      rafRef.current = requestAnimationFrame(runFrame);

      if (startTimeRef.current === 0) startTimeRef.current = now;
      const time = (now - startTimeRef.current) / 1000;
      let dt = (now - prevTimeRef.current) / 1000;
      prevTimeRef.current = now;
      if (!isFinite(dt) || dt <= 0) dt = 0.016;
      dt = Math.min(dt, 0.05);

      const reduced = reducedRef.current;
      const audio = audioRef.current;

      // Gather observations.
      let observed: Observed[] | null;
      if (modeRef.current === "camera") {
        const r = readCameraHands();
        observed = r.status === "ok" ? r.hands : null;
      } else {
        observed = computeDemoHands(time);
      }

      const tracks = tracksRef.current;
      const posK = reduced ? 0.3 : 0.5;

      for (let i = 0; i < 2; i++) {
        const tr = tracks[i];
        if (observed !== null) {
          const obs = observed[i];
          tr.present = obs !== undefined;
          if (obs) {
            tr.x += (obs.x - tr.x) * posK;
            tr.y += (obs.y - tr.y) * posK;
            if (obs.pinch && !tr.pinchLatch) {
              tr.pinchLatch = true;
              tr.burst = 1;
              audio?.pluck(tr.x, 1 - tr.y, tr.speedEma);
            } else if (!obs.pinch) {
              tr.pinchLatch = false;
            }
          }
        }
        // velocity EMA (inter-frame landmark speed)
        const instVx = (tr.x - tr.prevX) / dt;
        const instVy = (tr.y - tr.prevY) / dt;
        tr.prevX = tr.x;
        tr.prevY = tr.y;
        const a = 0.3;
        tr.vxEma += (instVx - tr.vxEma) * a;
        tr.vyEma += (instVy - tr.vyEma) * a;
        const inst = Math.hypot(instVx, instVy);
        tr.speedEma += (inst - tr.speedEma) * a;

        // fast DOWNWARD sweep → accent (vy positive = downward in image space)
        tr.accentCooldown = Math.max(0, tr.accentCooldown - dt);
        if (
          tr.present &&
          tr.vyEma > 1.6 &&
          tr.speedEma > 1.8 &&
          tr.accentCooldown <= 0
        ) {
          tr.accentCooldown = 0.45;
          const strength = Math.min(1, (tr.speedEma - 1.5) / 3);
          audio?.accent(tr.x, 1 - tr.y, strength);
        }

        tr.burst = Math.max(0, tr.burst - dt * 2.2);
      }

      // Global energy = smoothed aggregate stir speed → field brightness + flow.
      let stirSum = 0;
      let presentCount = 0;
      for (const tr of tracks) {
        if (tr.present) {
          presentCount++;
          stirSum += Math.min(1, tr.speedEma * 0.4);
        }
      }
      const targetEnergy = presentCount > 0 ? stirSum / presentCount : 0;
      energyRef.current += (targetEnergy - energyRef.current) * 0.1;
      const energy = energyRef.current;
      const targetBright = reduced ? 0.9 : 1 + energy * 0.8;
      brightnessRef.current += (targetBright - brightnessRef.current) * 0.08;

      // Build per-hand field uniforms.
      const handU = (tr: HandTrack): HandUniform => ({
        x: tr.x,
        y: tr.y,
        active: tr.present ? 1 : 0,
        force: Math.min(1, tr.speedEma * 0.5),
        vx: Math.max(-0.4, Math.min(0.4, tr.vxEma * 0.08)),
        vy: Math.max(-0.4, Math.min(0.4, tr.vyEma * 0.08)),
        burst: tr.burst,
      });
      const h0 = handU(tracks[0]);
      const h1 = handU(tracks[1]);

      // --- Render the field ---
      const canvas = canvasRef.current;
      const gpu = gpuRef.current;
      if (gpu && canvas) {
        const aspect = canvas.width / Math.max(1, canvas.height);
        gpu.device.queue.writeBuffer(
          gpu.computeUniBuf,
          0,
          packComputeUniform({
            dt,
            time,
            reduced: reduced ? 1 : 0,
            energy,
            hands: [h0, h1],
          }),
        );
        gpu.device.queue.writeBuffer(
          gpu.renderUniBuf,
          0,
          packRenderUniform(aspect, 0.010, brightnessRef.current, time),
        );
        const enc = gpu.device.createCommandEncoder();
        const cpass = enc.beginComputePass();
        cpass.setPipeline(gpu.computePipeline);
        cpass.setBindGroup(0, gpu.computeBG);
        cpass.dispatchWorkgroups(WORKGROUP_DISPATCH);
        cpass.end();
        const view = gpu.ctx.getCurrentTexture().createView();
        const rpass = enc.beginRenderPass({
          colorAttachments: [
            {
              view,
              clearValue: { r: 0.023, g: 0.016, b: 0.07, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        rpass.setPipeline(gpu.renderPipeline);
        rpass.setBindGroup(0, gpu.renderBG);
        rpass.draw(PARTICLE_COUNT * 6);
        rpass.end();
        gpu.device.queue.submit([enc.finish()]);
      } else if (cpuFieldRef.current && ctx2dRef.current && canvas) {
        const field = cpuFieldRef.current;
        const g = ctx2dRef.current;
        const toForce = (u: HandUniform): HandForceInput => ({
          x: u.x,
          y: u.y,
          active: u.active,
          force: u.force,
          vx: u.vx,
          vy: u.vy,
          burst: u.burst,
        });
        field.step(dt, time, [toForce(h0), toForce(h1)], energy, reduced);
        field.draw(g, canvas.width, canvas.height, brightnessRef.current);
      }

      // --- Drive the synth from the flow near the hands ---
      if (audio) {
        const flowSpeed = (tr: HandTrack): number =>
          Math.min(1, tr.speedEma * 0.5);
        let handDistance = 0;
        if (tracks[0].present && tracks[1].present) {
          handDistance = Math.hypot(
            tracks[0].x - tracks[1].x,
            tracks[0].y - tracks[1].y,
          );
        }
        const density = Math.min(
          1,
          presentCount * 0.3 + (flowSpeed(tracks[0]) + flowSpeed(tracks[1])) * 0.4,
        );
        const state: FlowState = {
          hands: [
            {
              active: tracks[0].present,
              x: tracks[0].x,
              height: 1 - tracks[0].y,
              flowSpeed: flowSpeed(tracks[0]),
            },
            {
              active: tracks[1].present,
              x: tracks[1].x,
              height: 1 - tracks[1].y,
              flowSpeed: flowSpeed(tracks[1]),
            },
          ],
          handDistance,
          density,
        };
        audio.update(state);
      }

      metricsRef.current = {
        mode: modeRef.current,
        backend: backendRef.current,
        hands: presentCount,
        energy,
      };
    },
    [computeDemoHands, readCameraHands],
  );

  // --- Mount: size the canvas, build the field (WebGPU → Canvas2D), start loop ---
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    // seed the demo phases deterministically
    demoPhaseRef.current = [
      ((SEED % 97) / 97) * Math.PI * 2,
      ((SEED % 131) / 131) * Math.PI * 2,
    ];

    const canvas = canvasRef.current;
    let cancelled = false;

    function sizeCanvas(): void {
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    }

    async function setup(): Promise<void> {
      if (!canvas) return;
      sizeCanvas();
      // Try WebGPU compute first.
      if (typeof navigator !== "undefined" && navigator.gpu) {
        try {
          const gpu = await buildGpu(canvas, SEED);
          if (cancelled) {
            gpu.destroy();
            return;
          }
          gpuRef.current = gpu;
          backendRef.current = "webgpu";
        } catch {
          gpuRef.current = null;
        }
      }
      // Canvas2D fallback.
      if (!gpuRef.current) {
        const g = canvas.getContext("2d");
        if (g) {
          ctx2dRef.current = g;
          cpuFieldRef.current = new Canvas2DField(SEED);
          backendRef.current = "canvas2d";
          if (!navigator.gpu) {
            setSensorError("WebGPU unavailable — Canvas2D fallback.");
          }
        } else {
          backendRef.current = "none";
          setSensorError("Neither WebGPU nor Canvas2D is available here.");
        }
      }
    }

    void setup();

    prevTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);

    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    const hud = window.setInterval(() => {
      setMetrics({ ...metricsRef.current });
    }, 150);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(hud);
      window.removeEventListener("resize", onResize);
      audioRef.current?.stop();
      audioRef.current = null;
      audioOnRef.current = false;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      gpuRef.current?.destroy();
      gpuRef.current = null;
      cpuFieldRef.current = null;
      ctx2dRef.current = null;
    };
    // runFrame is stable (useCallback with stable deps); one-shot mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginAudio = useCallback(async () => {
    if (audioOnRef.current) return;
    try {
      const audio = new HandfluxAudio();
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "demo";
      setCameraStatus("off");
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied — the seeded demo keeps conducting the current."
          : "Camera or the MediaPipe hand model couldn't load (needs network + WebGL/WASM). Running the seeded demo instead.";
      setSensorError(msg);
    }
  }, [beginAudio, cameraStatus]);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      <PrototypeNav slugs={["9560-handflux"]} />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              9560 · Handflux
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Stir a boundless river of light
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Tens of thousands of particles flow on the GPU. Your two hands are
              vortices that stir the current — and the way it flows near your
              hands is what you hear. Pinch to fountain a burst; sweep down fast
              for a surge.
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
                  Start conducting
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={cameraStatus === "on" || cameraStatus === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {cameraStatus === "loading"
                    ? "Starting camera…"
                    : cameraStatus === "on"
                      ? "Camera live — conduct with your hands"
                      : "Start camera to conduct"}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>mode: {metrics.mode === "camera" ? "camera" : "demo"}</span>
              <span>field: {metrics.backend}</span>
              <span>hands: {metrics.hands}</span>
              <span>flow: {metrics.energy.toFixed(2)}</span>
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
              Handflux
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A WebGPU compute shader advects ~48k particles along a curl-noise
              flow field — a boundless, slowly-evolving river of light. Each
              detected hand injects a local curl vortex plus a gentle pull, so
              your hands stir the current; particles swirl toward and around
              them.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The synth is driven by the flow, not just position: hand height
              sets the register, how fast you stir swells the voice and its
              shimmer, the distance between your hands opens the reverb, and the
              density near your hands opens the filter. Pinch fountains a burst
              and plucks a note. A fast downward sweep drags the current down and
              fires a brighter, louder accent — gentle is quiet, a fast strike
              booms.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              No WebGPU? A Canvas2D CPU field runs the same forces with fewer
              particles. No camera? A seeded pair of synthetic hands drifts on
              smooth orbits and stirs the current itself, so the art always
              flows and sounds. Reduced-motion calms the river to a near-still
              drift.
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
