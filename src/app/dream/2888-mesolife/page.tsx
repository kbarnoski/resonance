"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GpuSim, CoarseField, type SimParams, type FieldScalars } from "./sim";
import { AudioEngine } from "./audio";
import { README_TEXT } from "./readme-text";

// iOS Safari exposes a permission gate on the orientation event.
type OrientCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

interface Readout {
  defects: number;
  drive: number;
  mode: string;
}

export default function MesolifePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const startedRef = useRef(false);

  // Live, mutable simulation params (read inside the rAF loop without re-render).
  const paramsRef = useRef<SimParams>({
    activity: 0.9,
    confine: 0.35,
    shearX: 0,
    shearY: 0,
  });
  const lastInputRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activity, setActivity] = useState(0.9);
  const [confine, setConfine] = useState(0.35);
  const [readout, setReadout] = useState<Readout>({
    defects: 0,
    drive: 0,
    mode: "auto-demo",
  });

  // Keep the loop's param refs synced to the slider state.
  useEffect(() => {
    paramsRef.current.activity = activity;
  }, [activity]);
  useEffect(() => {
    paramsRef.current.confine = confine;
  }, [confine]);

  // ── main simulation + render loop ─────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeScale = reduceMotion ? 0.4 : 1.0;

    // Coarse CPU mirror always runs — it drives audio and the 2D fallback.
    const coarse = new CoarseField(44);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });

    let sim: GpuSim | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let fallbackImg: ImageData | null = null;
    let fallbackCanvas: HTMLCanvasElement | null = null;
    let fallbackCtx: CanvasRenderingContext2D | null = null;

    if (gl) {
      try {
        sim = new GpuSim(gl);
      } catch (e) {
        sim = null;
        setErr(
          "WebGL2 shaders failed to initialize — showing the Canvas2D churn instead. " +
            (e instanceof Error ? e.message : ""),
        );
      }
    }
    if (!sim) {
      if (!gl) {
        setErr(
          "WebGL2 is unavailable on this device — showing an on-brand Canvas2D fallback. It still churns and sounds.",
        );
      }
      ctx2d = canvas.getContext("2d");
      if (ctx2d) {
        fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.width = 300;
        fallbackCanvas.height = 300;
        fallbackCtx = fallbackCanvas.getContext("2d");
        fallbackImg = fallbackCtx
          ? fallbackCtx.createImageData(300, 300)
          : null;
      }
    }

    let raf = 0;
    let prev = performance.now();
    let t = 0;
    let uiAccum = 0;
    let latest: FieldScalars = {
      speed: 0,
      turbulence: 0,
      defects: 0,
      events: [],
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dtReal = (now - prev) / 1000;
      prev = now;
      if (dtReal > 0.05) dtReal = 0.05; // clamp after tab-switch stalls
      const dt = dtReal * timeScale;
      t += dt;

      const p = paramsRef.current;

      // Seeded auto-demo shear: a slow Lissajous drift that keeps the material
      // alive with no sensor and no touch. Real input (recent) overrides it.
      const idle = now - lastInputRef.current > 1800;
      let sx = p.shearX;
      let sy = p.shearY;
      if (idle) {
        sx = Math.sin(t * 0.23) * 0.5 + Math.sin(t * 0.11 + 1.7) * 0.3;
        sy = Math.cos(t * 0.19) * 0.5 + Math.sin(t * 0.07 + 0.4) * 0.3;
      }
      const stepParams: SimParams = {
        activity: p.activity,
        confine: p.confine,
        shearX: sx * 0.9,
        shearY: sy * 0.9,
      };

      // Slowly rotating polarizer angle — well under 3 Hz (no strobe).
      const alpha = t * 0.06;

      // Coarse mirror advances a couple of substeps for responsive audio.
      const scMirror = coarse.step(dt * 3.0, stepParams);
      latest = scMirror;

      if (sim && gl) {
        const substeps = reduceMotion ? 1 : 2;
        sim.step(substeps, dt * 3.0, alpha, stepParams);
        sim.present(canvas.width, canvas.height);
      } else if (ctx2d && fallbackImg && fallbackCtx && fallbackCanvas) {
        coarse.paint(fallbackImg, alpha);
        fallbackCtx.putImageData(fallbackImg, 0, 0);
        ctx2d.imageSmoothingEnabled = true;
        ctx2d.drawImage(
          fallbackCanvas,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }

      if (audioRef.current) audioRef.current.update(scMirror);

      uiAccum += dtReal;
      if (uiAccum > 0.2) {
        uiAccum = 0;
        setReadout({
          defects: latest.defects,
          drive: Math.min(1, latest.speed * 26),
          mode: idle ? "auto-demo" : "you",
        });
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (sim) sim.dispose();
    };
    // Setup runs once when `started` flips true; params/audio flow via refs.
  }, [started]);

  // ── input: pointer drag sets shear ────────────────────────────────────────
  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!started) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      if (e.buttons > 0 || e.type === "pointermove") {
        if (e.buttons === 0 && e.type === "pointermove") return;
        paramsRef.current.shearX = nx * 2.2;
        paramsRef.current.shearY = -ny * 2.2;
        lastInputRef.current = performance.now();
      }
    },
    [started],
  );

  // ── device orientation (primary input) ────────────────────────────────────
  const attachOrientation = useCallback(() => {
    const handler = (ev: DeviceOrientationEvent) => {
      const gx = (ev.gamma ?? 0) / 45; // left/right tilt
      const gy = (ev.beta ?? 0) / 45; // front/back tilt
      paramsRef.current.shearX = Math.max(-2, Math.min(2, gx)) * 1.6;
      paramsRef.current.shearY = Math.max(-2, Math.min(2, gy)) * 1.6;
      lastInputRef.current = performance.now();
    };
    window.addEventListener("deviceorientation", handler);
    // Detach on teardown.
    orientCleanupRef.current = () =>
      window.removeEventListener("deviceorientation", handler);
  }, []);
  const orientCleanupRef = useRef<(() => void) | null>(null);

  // ── start (user gesture) ──────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Audio must begin from the gesture.
    try {
      const engine = new AudioEngine();
      audioRef.current = engine;
      await engine.start();
    } catch {
      setErr((prev) => prev ?? "Audio could not start on this device.");
    }

    // iOS: request orientation permission inside the gesture.
    try {
      const Ctor = DeviceOrientationEvent as OrientCtor;
      if (typeof Ctor?.requestPermission === "function") {
        const res = await Ctor.requestPermission();
        if (res === "granted") attachOrientation();
      } else if (typeof window.DeviceOrientationEvent !== "undefined") {
        attachOrientation();
      }
    } catch {
      // Sensor denied or unavailable — pointer drag + auto-demo still work.
    }

    setStarted(true);
  }, [attachOrientation]);

  // ── teardown on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (orientCleanupRef.current) orientCleanupRef.current();
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: "block", cursor: started ? "crosshair" : "default" }}
      />

      {/* pre-start overlay */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
          <div className="max-w-md text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Resonance · Dream Lab
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Mesolife
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              A liquid crystal that is alive — an active nematic stirring itself
              forever, seen through crossed polarizers as oil-film iridescence.
              Tilt or drag to shear the living material.
            </p>
            <button
              onClick={handleStart}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Allow motion &amp; begin
            </button>
            {err && (
              <p className="mt-4 text-sm text-destructive">{err}</p>
            )}
          </div>
        </div>
      )}

      {/* running HUD */}
      {started && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 select-none">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Mesolife · active nematic
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              defects {readout.defects} · drive{" "}
              {readout.drive.toFixed(2)} · shear {readout.mode}
            </p>
            {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
          </div>

          {/* controls */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-4 backdrop-blur-sm">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Activity {activity.toFixed(2)}
              </span>
              <input
                type="range"
                min={0.2}
                max={1.6}
                step={0.01}
                value={activity}
                onChange={(e) => setActivity(parseFloat(e.target.value))}
                className="w-44 accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Confinement {confine.toFixed(2)}
              </span>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.01}
                value={confine}
                onChange={(e) => setConfine(parseFloat(e.target.value))}
                className="w-44 accent-primary"
              />
            </label>
          </div>
        </>
      )}

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
          <div className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
