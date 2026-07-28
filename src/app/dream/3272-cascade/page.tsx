"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BAR_COUNT,
  BAR_MARGIN,
  BAR_TOP,
  BAR_BOTTOM,
  FIELD_H,
  GAP_FRAC,
  HALF_THICK,
  type Backend,
  type DeflectorState,
} from "./sim";
import { CascadeAudio } from "./audio";
import { WebGPUBackend } from "./webgpu-backend";
import { WebGLBackend } from "./webgl-backend";
import { README_TEXT } from "./readme-text";

const VW = 1000;
const VH = VW * FIELD_H; // 1600

const DEFAULT_DEFLECTORS: DeflectorState[] = [
  { cx: 0.5, cy: 0.42, angle: 0.32, halfLen: 0.15 },
  { cx: 0.33, cy: 0.72, angle: -0.38, halfLen: 0.13 },
  { cx: 0.67, cy: 0.82, angle: 0.38, halfLen: 0.13 },
  { cx: 0.5, cy: 1.06, angle: -0.12, halfLen: 0.16 },
];

type Phase = "idle" | "running" | "dead";
type Drag =
  | { kind: "move"; index: number; offx: number; offy: number }
  | { kind: "rotate"; index: number }
  | { kind: "emitter" };

function segDist(
  lx: number,
  ly: number,
  d: DeflectorState,
): { dist: number; t: number } {
  const dirx = Math.cos(d.angle);
  const diry = Math.sin(d.angle);
  const rel = [lx - d.cx, ly - d.cy];
  let t = rel[0] * dirx + rel[1] * diry;
  if (t < -d.halfLen) t = -d.halfLen;
  else if (t > d.halfLen) t = d.halfLen;
  const clx = d.cx + dirx * t;
  const cly = d.cy + diry * t;
  return { dist: Math.hypot(lx - clx, ly - cly), t };
}

export default function CascadePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backendKind, setBackendKind] = useState<"webgpu" | "webgl" | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [deflectors, setDeflectors] = useState<DeflectorState[]>(
    () => DEFAULT_DEFLECTORS.map((d) => ({ ...d })),
  );
  const [emitterX, setEmitterX] = useState(0.5);
  const [flow, setFlow] = useState(0.55);
  const [selected, setSelected] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(SVGRectElement | null)[]>([]);

  const deflectorsRef = useRef(deflectors);
  const emitterXRef = useRef(emitterX);
  const flowRef = useRef(flow);
  const dragRef = useRef<Drag | null>(null);
  const audioRef = useRef<CascadeAudio | null>(null);
  const backendRef = useRef<Backend | null>(null);
  const rafRef = useRef(0);
  const flashRef = useRef(new Float32Array(BAR_COUNT));

  useEffect(() => {
    deflectorsRef.current = deflectors;
  }, [deflectors]);
  useEffect(() => {
    emitterXRef.current = emitterX;
  }, [emitterX]);
  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  // ── main loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let last = performance.now();

    async function boot(cv: HTMLCanvasElement) {
      let backend: Backend | null = null;
      if (typeof navigator !== "undefined" && navigator.gpu) {
        try {
          backend = await WebGPUBackend.create(cv);
        } catch {
          backend = null;
        }
      }
      if (!backend) {
        try {
          backend = new WebGLBackend(cv);
        } catch {
          backend = null;
        }
      }
      if (cancelled) {
        backend?.dispose();
        return;
      }
      if (!backend) {
        setPhase("dead");
        return;
      }
      backendRef.current = backend;
      setBackendKind(backend.kind);

      const frame = (now: number) => {
        if (cancelled) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const b = backendRef.current;
        if (b) {
          b.frame(dt, {
            deflectors: deflectorsRef.current,
            emitterX: emitterXRef.current,
            flow: flowRef.current,
          });
          const flash = flashRef.current;
          const audio = audioRef.current;
          for (let j = 0; j < BAR_COUNT; j++) {
            const d = b.hits[j];
            if (d > 0) {
              b.hits[j] = 0;
              flash[j] = 1;
              audio?.trigger(j, Math.min(1, 0.45 + d * 0.12));
            } else {
              flash[j] *= 0.86;
            }
            const rect = barRefs.current[j];
            if (rect) rect.style.opacity = flash[j].toFixed(3);
          }
        }
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    }

    boot(canvas);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      backendRef.current?.dispose();
      backendRef.current = null;
    };
  }, [phase]);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // ── interaction ────────────────────────────────────────────────────────
  const toLogical = useCallback((clientX: number, clientY: number) => {
    const el = fieldRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = ((clientY - r.top) / r.height) * FIELD_H;
    return { x, y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const { x, y } = toLogical(e.clientX, e.clientY);
      // emitter grip first
      if (Math.hypot(x - emitterXRef.current, y - 0.04) < 0.06) {
        dragRef.current = { kind: "emitter" };
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        return;
      }
      // topmost deflector under the pointer
      const defs = deflectorsRef.current;
      let best = -1;
      let bestDist = 0.05;
      let bestT = 0;
      for (let i = defs.length - 1; i >= 0; i--) {
        const { dist, t } = segDist(x, y, defs[i]);
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
          bestT = t;
        }
      }
      if (best >= 0) {
        const d = defs[best];
        if (Math.abs(bestT) > d.halfLen * 0.55) {
          dragRef.current = { kind: "rotate", index: best };
        } else {
          dragRef.current = { kind: "move", index: best, offx: x - d.cx, offy: y - d.cy };
        }
        setSelected(best);
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      }
    },
    [toLogical],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { x, y } = toLogical(e.clientX, e.clientY);
      if (drag.kind === "emitter") {
        const nx = Math.min(0.97, Math.max(0.03, x));
        emitterXRef.current = nx;
        setEmitterX(nx);
        return;
      }
      setDeflectors((prev) => {
        const next = prev.map((d) => ({ ...d }));
        const d = next[drag.index];
        if (!d) return prev;
        if (drag.kind === "move") {
          d.cx = Math.min(0.94, Math.max(0.06, x - drag.offx));
          d.cy = Math.min(BAR_TOP - 0.08, Math.max(0.12, y - drag.offy));
        } else {
          d.angle = Math.atan2(y - d.cy, x - d.cx);
        }
        return next;
      });
    },
    [toLogical],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    }
    dragRef.current = null;
    setSelected(null);
  }, []);

  // ── controls ───────────────────────────────────────────────────────────
  async function handleStart() {
    if (!audioRef.current) audioRef.current = new CascadeAudio();
    await audioRef.current.start();
    setPhase("running");
  }

  function handleReset() {
    const d = DEFAULT_DEFLECTORS.map((x) => ({ ...x }));
    deflectorsRef.current = d;
    setDeflectors(d);
    emitterXRef.current = 0.5;
    setEmitterX(0.5);
  }

  // ── derived SVG geometry ───────────────────────────────────────────────
  const span = 1 - 2 * BAR_MARGIN;
  const cellW = span / BAR_COUNT;
  const gap = GAP_FRAC * cellW;

  return (
    <div className="relative flex min-h-[calc(100vh-3rem)] w-full flex-col items-center bg-background px-4 pb-16 pt-4">
      {/* header row */}
      <div className="flex w-full max-w-2xl items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Cascade
          </h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            Steer a waterfall of physics particles onto a row of tuned bars — a
            browser marble machine you compose by aiming the flow.
          </p>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* play-field */}
      {phase !== "idle" && (
        <div
          ref={fieldRef}
          className="relative mt-4 w-full overflow-hidden rounded-lg border border-border bg-black"
          style={{ maxWidth: "min(48vh, 90vw)", aspectRatio: "10 / 16" }}
        >
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {/* emitter nozzle + grip */}
            <g>
              <path
                d={`M ${emitterX * VW - 26} 4 L ${emitterX * VW + 26} 4 L ${emitterX * VW} 40 Z`}
                className="fill-primary/70"
              />
              <circle
                cx={emitterX * VW}
                cy={46}
                r={26}
                className="fill-primary/25 stroke-primary"
                strokeWidth={3}
                style={{ cursor: "ew-resize" }}
              />
            </g>

            {/* deflectors */}
            {deflectors.map((d, i) => {
              const deg = (d.angle * 180) / Math.PI;
              const half = d.halfLen * VW;
              const th = HALF_THICK * VW;
              const active = selected === i;
              return (
                <g
                  key={i}
                  transform={`translate(${d.cx * VW} ${d.cy * VW}) rotate(${deg})`}
                  style={{ cursor: "grab" }}
                >
                  <rect
                    x={-half}
                    y={-th}
                    width={half * 2}
                    height={th * 2}
                    rx={th}
                    className={active ? "fill-primary" : "fill-foreground/85"}
                  />
                  <circle cx={-half} cy={0} r={th * 1.3} className="fill-primary/80" />
                  <circle cx={half} cy={0} r={th * 1.3} className="fill-primary/80" />
                </g>
              );
            })}

            {/* bar row */}
            {Array.from({ length: BAR_COUNT }, (_, j) => {
              const bx = (BAR_MARGIN + j * cellW + gap / 2) * VW;
              const bw = (cellW - gap) * VW;
              const by = BAR_TOP * VW;
              const bh = (BAR_BOTTOM - BAR_TOP) * VW + 26;
              return (
                <g key={j}>
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={8}
                    className="fill-muted stroke-border"
                    strokeWidth={2}
                  />
                  <rect
                    ref={(el) => {
                      barRefs.current[j] = el;
                    }}
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={8}
                    className="fill-primary"
                    style={{ opacity: 0 }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* idle hero */}
      {phase === "idle" && (
        <div className="mt-10 flex max-w-md flex-col items-center gap-5 text-center">
          <p className="text-base leading-relaxed text-muted-foreground">
            Particles fall under gravity from the emitter at the top. Tilt the
            angled deflectors to divert the stream onto nine tuned bars — grab a
            deflector&rsquo;s middle to move it, an end to rotate. Aim for a
            groove; over-drive the emitter and it turns to a wash.
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            WebGPU compute · audio-visual
          </p>
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start the machine
          </button>
        </div>
      )}

      {/* running controls */}
      {phase === "running" && (
        <div className="mt-4 flex w-full max-w-2xl flex-col items-center gap-3">
          <div className="flex w-full max-w-md items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Flow
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={flow}
              onChange={(e) => setFlow(parseFloat(e.target.value))}
              className="h-1 flex-1 cursor-pointer"
              style={{ accentColor: "var(--primary)" }}
              aria-label="Emitter flow rate"
            />
            <button
              onClick={handleReset}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Reset
            </button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Drag a deflector&rsquo;s middle to move, an end to rotate. Slide the
            emitter grip along the top.
          </p>
          {backendKind === "webgl" && (
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              running CPU fallback — WebGPU unavailable
            </p>
          )}
          {backendKind === "webgpu" && (
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground/70">
              WebGPU compute · 30k particles
            </p>
          )}
        </div>
      )}

      {/* dead state */}
      {phase === "dead" && (
        <div className="mt-10 max-w-md text-center">
          <p className="text-base text-destructive">
            3D is unavailable in this browser.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Cascade needs WebGPU or WebGL to run its particle simulation. Try a
            recent Chrome, Edge, or Safari.
          </p>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
