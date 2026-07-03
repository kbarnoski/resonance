"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  applyPointer,
  makeConductorState,
  sourceLabel,
  stepConductor,
  type ConductorState,
} from "./conductor";
import { makeConductorAudio, type ConductorAudio } from "./audio";
import {
  drawFrame,
  makeRenderState,
  pushTrail,
  spawnBloom,
  type RenderState,
} from "./render";

type Phase = "idle" | "running";

interface Readout {
  bpm: number;
  register: number;
  energy: number;
  source: "you conducting" | "ghost conductor";
}

export default function ConductorVeilPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    bpm: 66,
    register: 0,
    energy: 0,
    source: "ghost conductor",
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<ConductorState | null>(null);
  const renderRef = useRef<RenderState | null>(null);
  const audioRef = useRef<ConductorAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastMsRef = useRef<number>(0);
  const readoutMsRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    sizeRef.current = { w, h };
  }, []);

  const handlePointer = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    applyPointer(state, nx, ny, performance.now());
  }, []);

  // ── the animation loop ──
  const loop = useCallback(() => {
    const state = stateRef.current;
    const rs = renderRef.current;
    const canvas = canvasRef.current;
    const now = performance.now();
    let dt = (now - lastMsRef.current) / 1000;
    lastMsRef.current = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 1 / 60;

    if (state && rs && canvas) {
      const ev = stepConductor(state, dt, now);

      audioRef.current?.update({
        register: state.register,
        brightness: state.brightness,
        energy: state.energy,
      });
      if (ev.downbeat) {
        audioRef.current?.downbeat(state.energy);
        spawnBloom(rs, state.x, state.y, 0.5 + state.energy * 0.5);
      }

      pushTrail(rs, state.x, state.y);

      const ctx = canvas.getContext("2d");
      const { w, h } = sizeRef.current;
      if (ctx && w > 0) {
        drawFrame(
          rs,
          ctx,
          w,
          h,
          {
            x: state.x,
            y: state.y,
            energy: state.energy,
            brightness: state.brightness,
            register: state.register,
            beatPhase: ev.phase,
          },
          dt,
          reducedRef.current,
        );
      }

      // Throttle the React readout to ~6/s.
      if (now - readoutMsRef.current > 160) {
        readoutMsRef.current = now;
        setReadout({
          bpm: Math.round(state.bpm),
          register: state.register,
          energy: state.energy,
          source: sourceLabel(state.source) as Readout["source"],
        });
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Mount: build state, size the canvas, start the visual loop (silent).
  useEffect(() => {
    stateRef.current = makeConductorState();
    renderRef.current = makeRenderState();

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener("change", onMq);

    resize();
    window.addEventListener("resize", resize);

    const canvas = canvasRef.current;
    canvas?.addEventListener("pointermove", handlePointer);
    canvas?.addEventListener("pointerdown", handlePointer);

    lastMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      mq.removeEventListener("change", onMq);
      canvas?.removeEventListener("pointermove", handlePointer);
      canvas?.removeEventListener("pointerdown", handlePointer);
      audioRef.current?.stop();
      audioRef.current = null;
      acRef.current?.close().catch(() => {});
      acRef.current = null;
    };
  }, [resize, handlePointer, loop]);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio unavailable");
      const ctx = new Ctor();
      await ctx.resume();
      const audio = makeConductorAudio(ctx);
      audio.begin();
      acRef.current = ctx;
      audioRef.current = audio;
      setError(null);
      setPhase("running");
    } catch {
      setError(
        "Audio could not start in this browser — the visual ensemble keeps conducting silently.",
      );
      setPhase("running");
    }
  }, [phase]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[hsl(300,40%,8%)] text-white">
      <PrototypeNav slugs={["1123-conductor-veil"]} />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-hidden="true"
      />

      {/* Header + controls float over the canvas. */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-5 sm:p-8">
        <header className="pointer-events-auto max-w-2xl">
          <h1
            className="text-3xl font-medium tracking-tight text-white sm:text-4xl"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Conductor&rsquo;s Veil
          </h1>
          <p className="mt-2 text-base text-white/75">
            Conduct an unseen ensemble with one continuous baton gesture — a
            warm string-and-pad choir answers your hand in real time.
          </p>
          <p className="mt-1 text-base text-amber-200/90">
            Move your hand — up-down strokes set the tempo, height sets the
            register, energy sets the dynamics.
          </p>

          {error && (
            <p className="mt-3 max-w-md text-base text-rose-300">{error}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {phase === "idle" ? (
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-full bg-amber-400/95 px-6 py-2.5 text-base font-medium text-[hsl(300,45%,12%)] shadow-lg transition-colors hover:bg-amber-300"
              >
                Take the baton
              </button>
            ) : (
              <span className="min-h-[44px] rounded-full border border-white/20 bg-black/30 px-4 py-2.5 text-base text-white/85 backdrop-blur-sm">
                Ensemble live — conduct anywhere on the field
              </span>
            )}
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2.5 text-base text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              {notesOpen ? "Hide notes" : "About"}
            </button>
          </div>

          {notesOpen && (
            <div className="mt-4 max-w-md rounded-2xl border border-white/15 bg-black/40 p-4 text-base text-white/75 backdrop-blur-sm">
              <p>
                The baton&rsquo;s downward strokes are read for their low
                point — a vertical-velocity reversal marks each downbeat, and
                the interval between downbeats drives a smoothed tempo. Every
                chord is drawn from one just-intonation major scale over a warm
                A2 root, so there are no wrong notes. When you stop moving, a
                deterministic ghost conductor keeps the ensemble alive.
              </p>
            </div>
          )}
        </header>

        {/* Live readout. */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-6 gap-y-2 text-base">
          <Stat label="tempo" value={`${readout.bpm} BPM`} />
          <Stat
            label="register"
            value={`+${(readout.register).toFixed(2)} oct`}
          />
          <Stat
            label="dynamics"
            value={`${Math.round(readout.energy * 100)}%`}
          />
          <span className="flex items-center gap-2 text-white/75">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor:
                  readout.source === "you conducting"
                    ? "hsl(44, 100%, 62%)"
                    : "hsl(282, 70%, 66%)",
              }}
            />
            {readout.source}
          </span>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-xs uppercase tracking-[0.16em] text-white/60">
        {label}
      </span>
      <span className="text-base font-medium text-white/95 tabular-nums">
        {value}
      </span>
    </span>
  );
}
