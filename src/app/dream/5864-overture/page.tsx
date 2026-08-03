"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ensemble, type EnsembleState } from "./synth";
import { GLRenderer } from "./render";
import { Canvas2DRenderer } from "./canvas2d";
import { bakeJourney, DEFAULT_SEED, DURATION_S } from "./demo";
import { ACTS } from "./arc";
import { hashSeed } from "./rng";

interface RendererAdapter {
  setCurve: (b: ReturnType<typeof bakeJourney>) => void;
  resize: (w: number, h: number, dpr: number) => void;
  render: (pos01: number, live: number, timeSec: number) => void;
  dispose: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function OverturePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ensembleRef = useRef<Ensemble | null>(null);
  const rendererRef = useRef<RendererAdapter | null>(null);
  const seedRef = useRef<number>(DEFAULT_SEED);
  const draggingRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"webgl" | "canvas">("webgl");
  const [showNotes, setShowNotes] = useState(false);
  const [ui, setUi] = useState<EnsembleState | null>(null);

  // ── one-time setup: ensemble, renderer, draw loop ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ensemble = new Ensemble(seedRef.current);
    ensembleRef.current = ensemble;
    const baked = bakeJourney(seedRef.current);

    // Prefer raw WebGL2; degrade to Canvas2D if unavailable.
    let adapter: RendererAdapter;
    try {
      const gl = new GLRenderer(canvas, seedRef.current);
      gl.setCurve(baked);
      adapter = {
        setCurve: (b) => gl.setCurve(b),
        resize: (w, h, d) => gl.resize(w, h, d),
        render: (p, l, t) => gl.draw({ pos01: p, live: l, time: t }),
        dispose: () => gl.dispose(),
      };
      setMode("webgl");
    } catch {
      const c2d = new Canvas2DRenderer(canvas);
      c2d.setCurve(baked);
      adapter = {
        setCurve: (b) => c2d.setCurve(b),
        resize: (w, h, d) => c2d.resize(w, h, d),
        render: (p, l) => c2d.draw({ pos01: p, live: l }),
        dispose: () => c2d.dispose(),
      };
      setMode("canvas");
    }
    rendererRef.current = adapter;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      adapter.resize(r.width, r.height, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let lastUi = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      const st = ensemble.getState();
      adapter.render(st.pos01, st.tensionLive, t);
      // throttle React updates to ~12fps
      if (t - lastUi > 0.08) {
        lastUi = t;
        setUi(st);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      adapter.dispose();
      ensemble.dispose();
    };
    // Intentionally run once: the renderer/ensemble are long-lived and
    // re-seeding is handled imperatively below.
  }, []);

  const runBegin = useCallback(async () => {
    const e = ensembleRef.current;
    if (!e) return;
    await e.start();
    setStarted(true);
    setPlaying(true);
  }, []);

  const runToggle = useCallback(async () => {
    const e = ensembleRef.current;
    if (!e) return;
    if (e.isPlaying) {
      e.pause();
      setPlaying(false);
    } else {
      await e.start();
      setPlaying(true);
    }
  }, []);

  const runReseed = useCallback(() => {
    const e = ensembleRef.current;
    const r = rendererRef.current;
    if (!e || !r) return;
    const next = hashSeed(seedRef.current, 0x9e37) >>> 0;
    seedRef.current = next;
    e.reseed(next);
    r.setCurve(bakeJourney(next));
  }, []);

  const seekFromClientX = useCallback((clientX: number) => {
    const wrap = wrapRef.current;
    const e = ensembleRef.current;
    if (!wrap || !e) return;
    const rect = wrap.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    e.seek(pos);
  }, []);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent) => {
      draggingRef.current = true;
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      seekFromClientX(ev.clientX);
    },
    [seekFromClientX]
  );
  const onPointerMove = useCallback(
    (ev: React.PointerEvent) => {
      if (draggingRef.current) seekFromClientX(ev.clientX);
    },
    [seekFromClientX]
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const tensionPct = ui ? Math.round(ui.tensionLive * 100) : 0;
  const targetPct = ui ? Math.round(ui.tensionTarget * 100) : 0;

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background text-foreground">
      {/* landscape canvas + scrub surface */}
      <div
        ref={wrapRef}
        className="absolute inset-0 cursor-crosshair touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* top strip: title + notes */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Overture · a cinematic journey
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            A 6-minute Freytag arc, driven by musical tension
          </h1>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* act labels along the bottom of the graph band */}
      <div className="pointer-events-none absolute inset-x-0 bottom-28 hidden select-none px-1 sm:block">
        <div className="relative h-4">
          {ACTS.map((a) => {
            const mid = (a.start + a.end) / 2;
            const activeAct = ui?.actName === a.name;
            return (
              <span
                key={a.id}
                style={{ left: `${mid * 100}%` }}
                className={`absolute -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  activeAct ? "text-primary" : "text-muted-foreground/70"
                }`}
              >
                {a.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* begin overlay */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background/40 px-6 text-center backdrop-blur-[2px]">
          <div className="max-w-md">
            <p className="text-base text-muted-foreground">
              A generative ensemble plays a full dramatic arc — exposition,
              inciting incident, rising action, climax, and resolution — so
              minute five feels earned by minute one.
            </p>
          </div>
          <button
            onClick={runBegin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin the journey
          </button>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            or tap the timeline to explore first
          </p>
        </div>
      )}

      {/* bottom control + readout bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
        <div className="pointer-events-auto mx-auto flex max-w-4xl flex-col gap-3 rounded-md border border-border bg-card/70 p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {ui?.actName ?? "Exposition"}
            </span>
            <span className="text-sm text-muted-foreground">
              tension{" "}
              <span className="text-foreground">{tensionPct}%</span>
              <span className="text-muted-foreground/60"> / target {targetPct}%</span>
            </span>
            <span className="text-sm text-muted-foreground">
              tempo <span className="text-foreground">{ui?.tempoBpm ?? 0}</span> bpm
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              harmony <span className="text-foreground">{ui?.chordName ?? "—"}</span>
            </span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {formatTime((ui?.pos01 ?? 0) * DURATION_S)} / {formatTime(DURATION_S)}
            </span>
          </div>

          <p className="text-sm text-foreground/90">{ui?.description ?? "sparse felt-piano over a still tonic — the calm before"}</p>

          {/* tension meter */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${tensionPct}%` }}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runToggle}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {playing ? "Pause" : started ? "Play" : "Begin"}
            </button>
            <button
              onClick={runReseed}
              className="min-h-[44px] rounded-md border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              New journey
            </button>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {mode === "webgl" ? "webgl2" : "canvas2d fallback"} · drag timeline to seek
            </span>
          </div>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-md border border-border bg-card p-6 text-sm text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3">
              This piece asks: what if a Resonance session were a 6-minute
              generative journey with a genuine cinematic dramatic arc, driven
              by a quantitative model of musical tension?
            </p>
            <h3 className="mt-4 font-semibold text-foreground">The arc</h3>
            <p className="mt-1">
              Gustav Freytag&apos;s pyramid (1863): exposition → inciting
              incident → rising action → climax → falling action → dénouement.
              A control-point curve encodes the demanded tension at every moment.
            </p>
            <h3 className="mt-4 font-semibold text-foreground">The tension model</h3>
            <p className="mt-1">
              A hand-rolled version of Morwaread Farbood&apos;s parametric model
              of musical tension (Music Perception, 2012): tension is a weighted
              blend of loudness, pitch height, harmonic tension, onset density
              and tempo. It runs both ways — the Freytag target chooses the
              register, dynamics, harmony, density and tempo needed to hit it,
              and the realised parameters are read back as the live tension that
              rides the curve.
            </p>
            <h3 className="mt-4 font-semibold text-foreground">Controls</h3>
            <p className="mt-1">
              Begin / Play / Pause. Drag or tap the landscape to seek anywhere in
              the arc. &ldquo;New journey&rdquo; re-seeds a fresh deterministic
              render. Everything is synthesised (Web Audio) and drawn in raw
              WebGL2; a Canvas2D timeline is the fallback.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
