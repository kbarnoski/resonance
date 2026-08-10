"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FORM_LABEL } from "../_shared/visionary/logpolar";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { createGeometryVoices, type GeometryVoices } from "./audio";
import { createCpuStage } from "./cpu";
import {
  blendHue,
  computePhases,
  CORNERS,
  cursorWeights,
  dominant,
  FORM_CONSTANTS,
  FREQ,
  keyToDegree,
  midiToDegree,
  mulberry32,
  SEED,
  type Stage,
  type Weights,
} from "./field";
import { createGpuStage } from "./gpu";

type Backend = "pending" | "gpu" | "cpu";

// where each corner sits on the minimap (x right, y up)
const CORNER_POS: Record<string, { x: number; y: number }> = {
  tunnel: { x: 0, y: 0 },
  spoke: { x: 1, y: 0 },
  spiral: { x: 0, y: 1 },
  honeycomb: { x: 1, y: 1 },
};

const MOVE_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);

// seeded auto-demo path params (deterministic; drives the pre-interaction drift)
const DEMO = (() => {
  const r = mulberry32(SEED);
  return {
    f1: 0.5 + r() * 0.5,
    f2: 0.4 + r() * 0.5,
    p1: r() * Math.PI * 2,
    p2: r() * Math.PI * 2,
  };
})();

export default function FormCanonPage() {
  const [backend, setBackend] = useState<Backend>("pending");
  const [audioOn, setAudioOn] = useState(false);
  const [midiOn, setMidiOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [disp, setDisp] = useState({ cx: 0.5, cy: 0.5, dom: 0 });

  const reduce = useMemo(() => prefersReducedMotion(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stageRef = useRef<Stage | null>(null);
  const voicesRef = useRef<GeometryVoices | null>(null);
  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const midiRef = useRef<MIDIAccess | null>(null);

  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const pressedRef = useRef<Set<string>>(new Set());
  const energyRef = useRef(0);
  const startRef = useRef(0);
  const lastRef = useRef(0);
  const lastUserRef = useRef(-100);
  const dispThrottleRef = useRef(0);

  const triggerNote = useCallback(
    (degree: number, velocity: number) => {
      const c = cursorRef.current;
      const w = cursorWeights(c.x, c.y);
      voicesRef.current?.trigger(w, degree, velocity, reduce);
      energyRef.current = 1;
      lastUserRef.current = (performance.now() - startRef.current) / 1000;
    },
    [reduce],
  );

  // ── boot the render backend + run the frame loop ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const sizeSurface = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      stageRef.current?.resize(w, h);
    };

    const ro = new ResizeObserver(sizeSurface);
    ro.observe(container);
    roRef.current = ro;

    const boot = async () => {
      if (navigator.gpu) {
        try {
          const s = await createGpuStage(canvas);
          if (cancelled) {
            s.destroy();
            return;
          }
          stageRef.current = s;
          sizeSurface();
          setBackend("gpu");
          return;
        } catch {
          /* fall through to CPU */
        }
      }
      if (cancelled) return;
      try {
        const s = createCpuStage(canvas);
        stageRef.current = s;
        sizeSurface();
        setBackend("cpu");
      } catch {
        /* nothing we can do; the page still shows copy */
      }
    };
    void boot();

    startRef.current = performance.now();
    lastRef.current = startRef.current;

    const loop = (now: number) => {
      const t = (now - startRef.current) / 1000;
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (dt > 0.1) dt = 0.1;

      const idle = t - lastUserRef.current;
      const cur = cursorRef.current;

      // seeded no-audio auto-demo: drift the cursor through the geometry space
      // before (and after long idle) any interaction, so a muted phone
      // immediately sees the field morph between all four constants.
      if (idle > 1.2) {
        cur.x = 0.5 + 0.42 * Math.sin(t * DEMO.f1 + DEMO.p1);
        cur.y = 0.5 + 0.42 * Math.sin(t * DEMO.f2 + DEMO.p2);
      } else {
        // integrate held movement keys
        const speed = 0.55 * dt;
        const p = pressedRef.current;
        if (p.has("a") || p.has("arrowleft")) cur.x -= speed;
        if (p.has("d") || p.has("arrowright")) cur.x += speed;
        if (p.has("w") || p.has("arrowup")) cur.y += speed;
        if (p.has("s") || p.has("arrowdown")) cur.y -= speed;
        cur.x = Math.min(1, Math.max(0, cur.x));
        cur.y = Math.min(1, Math.max(0, cur.y));
      }

      const w: Weights = cursorWeights(cur.x, cur.y);
      const phases = computePhases(t, reduce);
      const brightAmp = reduce ? 0.03 : 0.07;
      const bright = 0.9 + brightAmp * Math.sin(t * 0.3);

      stageRef.current?.render({
        w,
        freq: FREQ,
        phases,
        time: t,
        bright,
        hueBase: blendHue(w),
        sat: 0.72,
      });

      // energy decays between triggers → pads breathe, never a flat drone
      energyRef.current *= Math.exp(-dt / 1.4);
      voicesRef.current?.setWeights(w, energyRef.current, reduce);

      dispThrottleRef.current += dt;
      if (dispThrottleRef.current > 0.12) {
        dispThrottleRef.current = 0;
        setDisp({ cx: cur.x, cy: cur.y, dom: dominant(w) });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      roRef.current = null;
      stageRef.current?.destroy();
      stageRef.current = null;
    };
  }, [reduce]);

  // ── keyboard: WASD/arrows steer · number keys 1–4 jump to a corner ·
  //    other letters trigger notes ─────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.has(k)) {
        e.preventDefault();
        pressedRef.current.add(k);
        lastUserRef.current = (performance.now() - startRef.current) / 1000;
        return;
      }
      if (e.repeat) return;
      if (k >= "1" && k <= "4") {
        e.preventDefault();
        const corner = CORNERS[Number(k) - 1];
        cursorRef.current.x = CORNER_POS[corner.name].x;
        cursorRef.current.y = CORNER_POS[corner.name].y;
        triggerNote(keyToDegree(k.charCodeAt(0)), 0.95);
        return;
      }
      if (/^[a-z]$/.test(k)) {
        e.preventDefault();
        triggerNote(keyToDegree(k.charCodeAt(0)), 0.9);
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.has(k)) pressedRef.current.delete(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [triggerNote]);

  // ── audio + MIDI teardown on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      voicesRef.current?.stop();
      voicesRef.current = null;
      const acc = midiRef.current;
      if (acc) {
        acc.inputs.forEach((inp) => {
          inp.onmidimessage = null;
        });
        midiRef.current = null;
      }
    };
  }, []);

  const startAudio = useCallback(async () => {
    if (voicesRef.current) return;
    try {
      voicesRef.current = await createGeometryVoices();
      setAudioOn(true);
      // sound the AV idea immediately on the primary action
      const c = cursorRef.current;
      voicesRef.current.trigger(cursorWeights(c.x, c.y), 0, 0.8, reduce);
      energyRef.current = 1;

      // optional Web MIDI — keyboard remains the guaranteed path
      if (typeof navigator.requestMIDIAccess === "function") {
        try {
          const access = await navigator.requestMIDIAccess();
          midiRef.current = access;
          access.inputs.forEach((inp) => {
            inp.onmidimessage = (ev: MIDIMessageEvent) => {
              const data = ev.data;
              if (!data || data.length < 3) return;
              const status = data[0] & 0xf0;
              const note = data[1];
              const vel = data[2];
              if (status === 0x90 && vel > 0) {
                triggerNote(midiToDegree(note), Math.min(1, vel / 110));
              }
            };
          });
          if (access.inputs.size > 0) setMidiOn(true);
        } catch {
          /* MIDI unavailable — keyboard still works */
        }
      }
    } catch {
      /* audio unavailable — the field keeps morphing silently */
    }
  }, [reduce, triggerNote]);

  const stopAudio = useCallback(() => {
    voicesRef.current?.stop();
    voicesRef.current = null;
    setAudioOn(false);
    setMidiOn(false);
    const acc = midiRef.current;
    if (acc) {
      acc.inputs.forEach((inp) => {
        inp.onmidimessage = null;
      });
      midiRef.current = null;
    }
  }, []);

  // click/drag the stage to steer as a pointer fallback (keyboard is the point)
  const steerFromPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 && e.type !== "pointerdown") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    cursorRef.current.x = Math.min(1, Math.max(0, x));
    cursorRef.current.y = Math.min(1, Math.max(0, y));
    lastUserRef.current = (performance.now() - startRef.current) / 1000;
  }, []);

  const w = cursorWeights(disp.cx, disp.cy);
  const domName = FORM_CONSTANTS[disp.dom];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-5 py-10">
      <PrototypeNav slugs={["9416-formcanon"]} />

      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          9416 · Form Canon
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Form Canon
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Play the taxonomy of visionary geometry. Klüver&apos;s four form
          constants — tunnel, spoke, spiral, honeycomb — sit at the corners of one
          continuous 2D space; steer a cursor through it and the field is a live
          blend of all four log-polar geometries, each corner singing its own
          generative voice. Slow drift only, never a strobe.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {audioOn ? (
          <button
            onClick={stopAudio}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop sound
          </button>
        ) : (
          <button
            onClick={startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start sound
          </button>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
        <span className="rounded-md border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {FORM_LABEL[domName]}
        </span>
        {midiOn ? (
          <span className="rounded-md border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            MIDI in
          </span>
        ) : null}
      </div>

      {backend === "cpu" ? (
        <p className="text-sm text-destructive">
          WebGPU unavailable — running the Canvas2D fallback. Same log-polar math
          at reduced resolution; the field still morphs and the voices still sing.
        </p>
      ) : null}

      {/* ── the stage ─────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        onPointerDown={steerFromPointer}
        onPointerMove={steerFromPointer}
        className="relative h-[440px] w-full cursor-crosshair touch-none overflow-hidden rounded-lg border border-border"
        style={{ background: "#050510" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>log-polar form-constant blend</span>
          <span>{backend === "gpu" ? "webgpu" : backend === "cpu" ? "canvas2d" : "…"}</span>
        </div>

        {/* geometry-space minimap */}
        <div className="pointer-events-none absolute bottom-3 right-3 h-28 w-28 rounded-md border border-border bg-background/70 backdrop-blur-sm">
          {CORNERS.map((c) => {
            const pos = CORNER_POS[c.name];
            return (
              <span
                key={c.name}
                className="absolute font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground"
                style={{
                  left: pos.x === 0 ? "4px" : undefined,
                  right: pos.x === 1 ? "4px" : undefined,
                  top: pos.y === 1 ? "4px" : undefined,
                  bottom: pos.y === 0 ? "4px" : undefined,
                }}
              >
                {c.name.slice(0, 4)}
              </span>
            );
          })}
          <span
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary))]"
            style={{
              left: `${disp.cx * 100}%`,
              top: `${(1 - disp.cy) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* ── voice crossfade meter ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FORM_CONSTANTS.map((name, i) => (
          <div
            key={name}
            className="rounded-md border border-border bg-background/60 p-3"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-base font-semibold tracking-tight">
                {name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {Math.round(w[i] * 100)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.round(w[i] * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        WASD / arrows steer · keys 1–4 jump to a corner · any letter triggers a
        note across the active voices · Web MIDI optional
      </p>

      {showNotes ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight">
              What if you could play the taxonomy of visionary geometry?
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Klüver&apos;s four &ldquo;form constants&rdquo; are the empirical
              taxonomy of flicker- and bright-light-induced entoptic geometry —
              tunnels, spokes, spirals and honeycombs — recently CV-mapped at
              scale from thousands of stroboscopic hallucinations (bioRxiv
              2026.02.18.705710). They arise because the retina→V1 map is a
              complex logarithm: plane-wave cortical activity, seen through the
              inverse log-polar warp, becomes exactly these shapes
              (Bressloff–Cowan–Golubitsky–Thomas 2002; Klüver 1926).
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Here the four constants are the corners of one continuous 2D space.
              A cursor you steer with the keyboard has bilinear weights over the
              corners, and the rendered field is the weighted blend of the four
              log-polar form-constant fields — a WebGPU fragment shader (Canvas2D
              fallback) animated only by slow phase and luminance drift, never a
              strobe. Each corner also owns a generative voice — tunnel&apos;s
              spacious fifths, spoke&apos;s stark octaves, spiral&apos;s rising
              arpeggio, honeycomb&apos;s clustered bells — and the voices
              crossfade with the same weights, so morphing the geometry morphs the
              music. Every prior lab piece rendered one constant reacting to
              sound; this makes the whole taxonomy a navigable instrument.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
