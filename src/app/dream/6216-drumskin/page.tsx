"use client";

// 6216-drumskin — "Drumskin".
// The screen is a real, tuned drumhead. A 2-D finite-difference wave equation
// (the discrete membrane, solved on the GPU in waveGPU.ts / a Canvas2D fallback
// in waveCPU.ts) is the instrument: strike or stroke it with all ten fingers
// and the ripples spreading, reflecting off the rim and interfering ARE what
// you see. The sound is TAPPED from the same physics — each strike rings a bank
// of modal resonators tuned to the Bessel-zero modal ratios of a circular
// membrane (audio.ts), voiced like a tuned tongue drum so drumming around the
// head plays a melody. This is a practical digital-waveguide-mesh drum after
// Julius O. Smith III (CCRMA, Stanford). It plays itself gently on load from a
// seeded pattern (selfplay.ts); your touch takes over on top. See README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { WaveGPU, type Touch } from "./waveGPU";
import { WaveCPU } from "./waveCPU";
import { ModalDrum, TUNINGS, type Tuning } from "./audio";
import { SelfPlay } from "./selfplay";

interface Solver {
  step(touches: Touch[]): void;
  render(glow: number): void;
  readEnergy(): number;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
}

interface Pointer {
  texX: number;
  texY: number;
  discX: number;
  discY: number;
  lastX: number;
  lastY: number;
  rub: number;
  pending: number; // pending strike strength for the next frame
  lastRub: number; // last time (s) a rub voice fired
}

const STEPS_PER_FRAME = 2;

export default function DrumskinPage() {
  const [backend, setBackend] = useState<"webgl2" | "canvas2d" | "error">("webgl2");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tuningId, setTuningId] = useState<string>(TUNINGS[1].id);
  const [awake, setAwake] = useState(false); // audio unlocked?

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const solverRef = useRef<Solver | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const drumRef = useRef<ModalDrum | null>(null);
  const tuningRef = useRef<Tuning>(TUNINGS[1]);
  const awakeRef = useRef(false);

  const pointersRef = useRef<Map<number, Pointer>>(new Map());
  const selfPlayRef = useRef<SelfPlay | null>(null);
  const rafRef = useRef(0);
  const startPerfRef = useRef(0);
  const glowRef = useRef(1);

  // ── Audio wakes on the first user gesture (autoplay policy). Visuals self-
  // play regardless, so the untouched phone is already alive on screen.
  const ensureAudio = useCallback(() => {
    if (awakeRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const drum = new ModalDrum(ctx, tuningRef.current);
      drum.start();
      ctxRef.current = ctx;
      drumRef.current = drum;
      awakeRef.current = true;
      setAwake(true);
      void ctx.resume().catch(() => {});
    } catch {
      // Audio unavailable — visuals continue silently.
      setNotice("Audio is unavailable in this browser; the membrane still runs.");
    }
  }, []);

  // ── Set up the solver + render loop. Runs once; visuals start immediately.
  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    const cpuCanvas = cpuCanvasRef.current;
    if (!glCanvas || !cpuCanvas) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    glowRef.current = reduced ? 0.6 : 1.0;
    selfPlayRef.current = new SelfPlay(!!reduced);

    let solver: Solver | null = null;
    let active: HTMLCanvasElement;
    try {
      solver = new WaveGPU(glCanvas);
      active = glCanvas;
      cpuCanvas.style.display = "none";
      setBackend("webgl2");
    } catch {
      try {
        solver = new WaveCPU(cpuCanvas);
        active = cpuCanvas;
        glCanvas.style.display = "none";
        setBackend("canvas2d");
        setNotice("WebGL2 float rendering is unavailable — running the Canvas2D membrane.");
      } catch {
        setBackend("error");
        setNotice("This browser can't run the drum's canvas.");
        return;
      }
    }
    solverRef.current = solver;
    activeCanvasRef.current = active!;

    const applyResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      solver!.resize(window.innerWidth, window.innerHeight, dpr);
    };
    applyResize();
    window.addEventListener("resize", applyResize);

    startPerfRef.current = performance.now();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const s = solverRef.current;
      if (!s) return;
      const drum = drumRef.current;
      const running = !!ctxRef.current && ctxRef.current.state === "running";
      const nowS = (performance.now() - startPerfRef.current) / 1000;

      // Assemble this frame's impulses (self-play + live pointers).
      const injections: Touch[] = [];

      const sp = selfPlayRef.current;
      if (sp) {
        for (const e of sp.poll(nowS)) {
          injections.push({
            x: e.nx * 0.5 + 0.5,
            y: e.ny * 0.5 + 0.5,
            strength: e.strength * 1.3,
            radius: 0.02,
          });
          if (running && drum) drum.strike(e.nx, e.ny, e.strength);
        }
      }

      for (const p of pointersRef.current.values()) {
        if (p.pending > 0) {
          injections.push({
            x: p.texX,
            y: p.texY,
            strength: p.pending * 1.7,
            radius: 0.024,
          });
          p.pending = 0;
        } else if (p.rub > 0.02) {
          // A stroke: softer, moving friction excitation.
          injections.push({
            x: p.texX,
            y: p.texY,
            strength: Math.min(0.9, p.rub) * 0.8,
            radius: 0.032,
          });
          if (running && drum && nowS - p.lastRub > 0.09) {
            drum.strike(p.discX, p.discY, Math.min(0.45, p.rub * 1.4));
            p.lastRub = nowS;
          }
          p.rub *= 0.55;
        }
      }

      // Fixed-timestep physics; inject only on the first substep.
      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        s.step(i === 0 ? injections : EMPTY);
      }

      const energy = s.readEnergy();
      if (running && drum) drum.setEnergy(energy);
      s.render(glowRef.current);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applyResize);
      solverRef.current?.dispose();
      solverRef.current = null;
      drumRef.current?.stop();
      drumRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  // ── Pointer coordinate mapping into the centred circular head.
  const mapPointer = (e: React.PointerEvent) => {
    const canvas = activeCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const uvx = (e.clientX - rect.left) / rect.width;
    const uvy = (e.clientY - rect.top) / rect.height;
    const min = Math.min(rect.width, rect.height);
    const ax = rect.width / min;
    const ay = rect.height / min;
    const cx = (uvx - 0.5) * ax; // -0.5..0.5 within the disc
    const cy = (uvy - 0.5) * ay;
    return {
      texX: cx + 0.5,
      texY: cy + 0.5,
      discX: cx * 2,
      discY: cy * 2,
      inside: cx * cx + cy * cy <= 0.25,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    ensureAudio();
    setAwake(true);
    const m = mapPointer(e);
    if (!m || !m.inside) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pressure = e.pressure > 0 ? e.pressure : 0.55;
    const strength = 0.42 + pressure * 0.58;
    pointersRef.current.set(e.pointerId, {
      texX: m.texX,
      texY: m.texY,
      discX: m.discX,
      discY: m.discY,
      lastX: m.texX,
      lastY: m.texY,
      rub: 0,
      pending: strength,
      lastRub: 0,
    });
    const drum = drumRef.current;
    if (drum && ctxRef.current?.state === "running") drum.strike(m.discX, m.discY, strength);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    const m = mapPointer(e);
    if (!m) return;
    const d = Math.hypot(m.texX - p.lastX, m.texY - p.lastY);
    p.texX = m.texX;
    p.texY = m.texY;
    p.discX = m.discX;
    p.discY = m.discY;
    p.lastX = m.texX;
    p.lastY = m.texY;
    p.rub = Math.min(1, p.rub + d * 9); // drag speed -> friction excitation
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
  };

  const selectTuning = (t: Tuning) => {
    setTuningId(t.id);
    tuningRef.current = t;
    drumRef.current?.setTuning(t);
  };

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* The membrane. Two canvases: WebGL2 primary, Canvas2D fallback. */}
      <canvas
        ref={glCanvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: backend === "canvas2d" ? "none" : "block" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      />
      <canvas
        ref={cpuCanvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: backend === "canvas2d" ? "block" : "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      />

      {/* ── Chrome overlay. Pointer-events pass through to the drum by default. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl space-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · dream lab
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Drumskin</h1>
          <p className="text-base text-muted-foreground">
            A tuned drumhead simulated as a real vibrating membrane. Strike and stroke it with
            every finger — the ripples you see are the sound you hear.
          </p>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="pointer-events-auto space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Tuning
            </p>
            <div className="flex gap-2">
              {TUNINGS.map((t) => {
                const on = t.id === tuningId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTuning(t)}
                    className={
                      on
                        ? "min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-3">
            {!awake && (
              <button
                type="button"
                onClick={ensureAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Tap the drum
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        </div>
      </div>

      {/* Idle invitation, fades once touched. */}
      {!awake && backend !== "error" && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
          <p className="rounded-md bg-background/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
            Touch the skin — all ten fingers
          </p>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2">
          <p className="rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
            {notice}
          </p>
        </div>
      )}

      {backend === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-destructive">
            This browser can&apos;t run the drum. It needs a modern canvas.
          </p>
        </div>
      )}

      {/* ── Design notes modal. */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The screen is a circular drumhead solved as a 2-D finite-difference wave
                equation:{" "}
                <span className="font-mono text-xs">
                  u&apos; = 2u − uₚ + c²∇²u − d(u − uₚ)
                </span>
                . Every cell is integrated each frame on the GPU (WebGL2, two RG32F textures
                ping-ponging current and previous height); the rim is a fixed boundary, so waves
                reflect and multiple fingers interfere and beat for free.
              </p>
              <p>
                The sound is tapped from the same physics. Each strike rings a bank of modal
                resonators tuned to the modal ratios of an ideal circular membrane — the ratios of
                the zeros of the Bessel functions Jₘ, the inharmonic voice of a real drum. Where
                you strike shapes the modal mix (centre booms the low modes, the rim rings the
                highs); angle around the head walks a scale so drumming plays a melody.
              </p>
              <p>
                After Julius O. Smith III&apos;s digital-waveguide-mesh / 2-D physical modeling
                (CCRMA, Stanford): the membrane is a genuine wave simulation and the audio is
                derived from its modal structure, not a separate synthesizer.
              </p>
              <p>
                It plays itself on load from a seeded pattern so it&apos;s alive before you touch
                it. Master gain is held under 0.18 through a limiter, and the field is hard-clamped
                so the feedback of many fingers can never blow up.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const EMPTY: Touch[] = [];
