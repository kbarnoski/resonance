"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { makeMandalaRenderer, type MandalaRenderer, type MotionDrive } from "./shader";
import { MotionSensor, type FlowMode } from "./flow";
import { VeilbreakAudio } from "./audio";

const SEED = 0x0b57f1;

interface Drive {
  energy: number;
  bloom: number;
  cx: number;
  cy: number;
}

export default function VeilbreakPage() {
  const [mode, setMode] = useState<MandalaRenderer["mode"] | "">("");
  const [flowMode, setFlowMode] = useState<FlowMode | "">("");
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MandalaRenderer | null>(null);
  const sensorRef = useRef<MotionSensor | null>(null);
  const audioRef = useRef<VeilbreakAudio | null>(null);
  const rafRef = useRef<number>(0);

  const driveRef = useRef<Drive>({ energy: 0, bloom: 0.12, cx: 0, cy: 0 });
  const flowModeRef = useRef<FlowMode | "">("");
  const startedRef = useRef(false);
  const reducedRef = useRef(false);
  const lastTimeRef = useRef(0);

  /* ── main loop: self-starts in synthetic mode so it always animates ──── */
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = makeMandalaRenderer(canvas, SEED);
    rendererRef.current = renderer;
    setMode(renderer.mode);
    if (renderer.mode === "none") return;

    const applyResize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(r.width, r.height, dpr);
    };
    applyResize();
    const ro = new ResizeObserver(applyResize);
    ro.observe(wrap);

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const nowS = now / 1000;
      let dt = lastTimeRef.current ? nowS - lastTimeRef.current : 0.016;
      lastTimeRef.current = nowS;
      if (dt > 0.05) dt = 0.05;

      // Raw motion signal: live optical flow if the camera is up, else a
      // seeded synthetic drift (slow LFOs) so the mandala blooms on its own.
      let rawE = 0;
      let tx = 0;
      let ty = 0;
      const sensor = sensorRef.current;
      const reading = flowModeRef.current === "camera" ? sensor?.read() : null;
      if (reading) {
        rawE = reading.energy;
        tx = reading.cx;
        ty = reading.cy;
      } else {
        const t = nowS;
        rawE = Math.min(
          1,
          Math.max(
            0,
            0.32 + 0.26 * Math.sin(t * 0.5) + 0.16 * Math.sin(t * 1.27 + 1.1),
          ),
        );
        tx = 0.6 * Math.sin(t * 0.23);
        ty = 0.5 * Math.sin(t * 0.31 + 2.0);
      }

      const d = driveRef.current;
      // Energy: quick attack, medium release.
      d.energy += (rawE - d.energy) * Math.min(1, dt * 5);
      // Bloom accumulator: blooms fast, settles slowly (the reorganizing).
      const up = d.energy > d.bloom;
      d.bloom += (d.energy - d.bloom) * Math.min(1, dt * (up ? 3.2 : 0.55));
      d.bloom = Math.min(1, Math.max(0, d.bloom));
      d.cx += (tx - d.cx) * Math.min(1, dt * 3);
      d.cy += (ty - d.cy) * Math.min(1, dt * 3);

      if (startedRef.current) audioRef.current?.update(d.energy);

      const drive: MotionDrive = {
        time: nowS,
        dt,
        energy: d.energy,
        bloom: d.bloom,
        cx: d.cx,
        cy: d.cy,
        reduced: reducedRef.current,
      };
      renderer.draw(drive);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  /* ── teardown audio + camera on unmount ──────────────────────────────── */
  useEffect(() => {
    return () => {
      sensorRef.current?.stop();
      sensorRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      startedRef.current = false;
    };
  }, []);

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = new VeilbreakAudio();
    }
    await audioRef.current.resume();
    startedRef.current = true;
    setStarted(true);
  }, []);

  // Primary: unlock audio (user gesture) AND request the camera.
  const enterTheLight = useCallback(async () => {
    await ensureAudio();
    if (!sensorRef.current) sensorRef.current = new MotionSensor();
    const m = await sensorRef.current.start();
    flowModeRef.current = m;
    setFlowMode(m);
  }, [ensureAudio]);

  // Ghost: sound + self-demo only, no camera.
  const skipCamera = useCallback(async () => {
    await ensureAudio();
    flowModeRef.current = "unavailable";
    setFlowMode("unavailable");
  }, [ensureAudio]);

  const noWebGL = mode === "none";

  const inputLabel =
    flowMode === "camera"
      ? "webcam · optical flow"
      : flowMode === "denied"
        ? "camera denied · synthetic drift"
        : flowMode === "unavailable"
          ? "no camera · synthetic drift"
          : "idle · synthetic drift";

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <div ref={wrapRef} className="fixed inset-0 z-0">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {noWebGL && (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-background/90 p-6 text-center shadow-lg backdrop-blur-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Veilbreak
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              This piece renders the visionary form constants in WebGL2, and your
              browser could not open a WebGL2 context. Try a recent desktop
              Chrome, Edge, or Firefox to enter the light.
            </p>
          </div>
        </div>
      )}

      {/* header */}
      {!noWebGL && (
        <div className="pointer-events-none fixed left-0 top-0 z-20 p-5 sm:p-7">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            form constants · V1 cortical map
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Veilbreak
          </h1>
          <p className="mt-1 max-w-sm text-base text-muted-foreground">
            Your own movement, seen through the webcam, warps a breakthrough
            mandala &mdash; wave a hand and the tunnel of light blooms and folds.
          </p>
        </div>
      )}

      {/* input / mode caption */}
      {!noWebGL && (
        <div className="pointer-events-none fixed right-5 top-5 z-20 sm:right-7 sm:top-7">
          <span className="rounded-full border border-border bg-background/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
            {inputLabel}
          </span>
        </div>
      )}

      {/* opening overlay */}
      {!noWebGL && !started && (
        <div className="fixed inset-0 z-30 flex items-end justify-center p-6 pb-24 sm:items-center sm:pb-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-background/80 p-6 text-center shadow-lg backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              tap to open the field
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              A concentric-spiral mandala of visual-cortex form constants. Grant
              the camera and your motion warps it in real time; without a camera
              it blooms on its own. Sound joins once unlocked.
            </p>
            <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={enterTheLight}
                className="min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                Enter the light
              </button>
              <button
                onClick={skipCamera}
                className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:w-auto"
              >
                Without camera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* running controls */}
      {!noWebGL && started && (
        <div className="fixed bottom-20 right-5 z-20 flex flex-col items-end gap-2 sm:bottom-7 sm:right-7">
          {flowMode !== "camera" && (
            <button
              onClick={enterTheLight}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start camera
            </button>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>
      )}

      {/* design notes */}
      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The geometry.</span> Klüver&rsquo;s
                four visual form constants &mdash; tunnels, spirals, spokes and
                honeycombs &mdash; are a single stripe/lattice pattern seen through
                the retina&rarr;V1 map, which is a complex logarithm
                (Bressloff&ndash;Cowan). Stripes and a hex lattice are generated in
                cortical <span className="text-foreground">(log&nbsp;r, &theta;)</span>{" "}
                space, then inverse-warped with exp() to the screen, yielding the
                mandala.
              </p>
              <p>
                <span className="text-foreground">Motion drives bloom.</span> The
                webcam frame-difference field gives total motion energy and a
                coarse centroid. Energy raises flow speed, cortical-noise
                amplitude, chromatic aberration and the kaleidoscope fold count,
                so waving a hand refolds the tunnel; the centroid bends its
                vanishing point toward you.
              </p>
              <p>
                <span className="text-foreground">Colour.</span> A ping-pong
                feedback buffer drifts each frame outward and decays it for jewel
                trails, painted through an iridescent thin-film palette with a
                traveling-wave phase sweep &mdash; magenta, gold, violet-green
                oil-slick.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> No fast flashing:
                all change is smooth spatial drift with only a slow sub-3&nbsp;Hz
                luminance breath. Reduced-motion cuts flow speed and damps the
                bloom. All sound runs through a shared master limiter, never
                straight to the speakers.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["11520-veilbreak"]} />
    </main>
  );
}
