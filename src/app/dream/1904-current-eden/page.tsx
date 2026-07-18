"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1904-current-eden
// "What if you could conduct a living ecology like a river — dragging currents
//  of wind through a field of evolving organisms so that every collision between
//  species is a chord you caused?"
//
// A multi-kernel Flow-Lenia continuous cellular automaton (mass-conserving) runs
// on the GPU in RGBA16F ping-pong textures. Three dye-tagged species seed into
// separate home clusters. You paint a velocity/current field with pointer/touch;
// it is added to the CA's transport flow and herds species into ENCOUNTERS.
// Cross-species overlap drives a modal drone that modulates (Phrygian / Lydian /
// Dorian, with a biting Hijaz colour on strong collisions). Without conducting,
// overlap collapses to ~0 and the piece thins to a lone drone — dead without a
// human. A deterministic autopilot keeps the screen alive but only ever produces
// weak encounters; the real music is yours.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createSim, EdenSim, type PointerBrush, type SimMetrics } from "./sim";
import { EdenAudio, type AudioState } from "./audio";
import { README } from "./readme-text";

const PAGE_STYLE: React.CSSProperties = {
  ["--background" as string]: "oklch(0.97 0.01 90)",
  ["--foreground" as string]: "oklch(0.22 0.03 60)",
  ["--muted-foreground" as string]: "oklch(0.45 0.03 60)",
  ["--border" as string]: "oklch(0.85 0.02 80)",
  ["--primary" as string]: "oklch(0.45 0.14 32)", // madder, warm
  ["--primary-foreground" as string]: "oklch(0.98 0.01 90)",
  ["--accent" as string]: "oklch(0.92 0.03 80)",
  ["--accent-foreground" as string]: "oklch(0.22 0.03 60)",
  ["--destructive" as string]: "oklch(0.55 0.20 25)",
};

const SPECIES = [
  { name: "madder", swatch: "#9e2116" },
  { name: "saffron", swatch: "#db9a29" },
  { name: "indigo", swatch: "#2c356b" },
];

const MODE_LABEL: Record<string, string> = {
  phrygian: "Phrygian",
  lydian: "Lydian",
  dorian: "Dorian",
  hijaz: "Hijaz",
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function CurrentEdenPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<EdenSim | null>(null);
  const audioRef = useRef<EdenAudio | null>(null);
  const rafRef = useRef<number>(0);

  // pointer state, read by the loop
  const pointerRef = useRef({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, active: false, lastFrame: -999 });
  const frameRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<{ m: SimMetrics; a: AudioState | null; conducting: boolean }>({
    m: { mass: [0, 0, 0], encounter: 0, complexity: 0, lead: 0 },
    a: null,
    conducting: false,
  });

  // ── init GL + render loop (visual runs before audio; audio waits for gesture) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const init = createSim(canvas);
    if (!init.ok) {
      setGlError(init.reason);
      window.removeEventListener("resize", resize);
      return;
    }
    simRef.current = init.sim;

    const reduced = prefersReducedMotion();
    const motion = reduced ? 0.4 : 1.0;
    const autoRnd = mulberry32(0x1904a0d0);
    const phase = [autoRnd() * 6.28, autoRnd() * 6.28, autoRnd() * 6.28];

    const loop = () => {
      const sim = simRef.current;
      if (!sim) return;
      const f = frameRef.current;
      const p = pointerRef.current;

      const brush: PointerBrush = { active: false, x: 0.5, y: 0.5, vx: 0, vy: 0 };
      const userActive = p.active && f - p.lastFrame < 8;
      if (userActive) {
        // strong human conducting
        brush.active = true;
        brush.x = p.x;
        brush.y = p.y;
        brush.vx = (p.x - p.px) * 3.2;
        brush.vy = (p.y - p.py) * 3.2;
        p.px = p.x;
        p.py = p.y;
      } else {
        // deterministic gentle autopilot: a slow drift that only grazes species,
        // producing weak, occasional encounters — never the real music.
        const t = f * 0.0016;
        brush.active = true;
        brush.x = 0.5 + 0.32 * Math.sin(t + phase[0]);
        brush.y = 0.5 + 0.32 * Math.cos(t * 0.83 + phase[1]);
        brush.vx = 0.00035 * Math.cos(t + phase[0]);
        brush.vy = 0.00035 * Math.sin(t * 1.21 + phase[2]);
      }

      const refreshed = sim.step(brush, motion);
      if (refreshed) {
        const audio = audioRef.current;
        if (audio) {
          try {
            audio.update(sim.metrics);
          } catch {
            /* audio node errors must not kill the visual */
          }
        }
        if (f % 12 === 0) {
          setReadout({
            m: sim.metrics,
            a: audio ? audio.state : null,
            conducting: userActive,
          });
        }
      }
      frameRef.current = f + 1;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      simRef.current?.dispose();
      simRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    setStarted(true);
    if (audioRef.current) {
      await audioRef.current.resume();
      return;
    }
    try {
      const audio = new EdenAudio();
      await audio.resume();
      audioRef.current = audio;
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "Audio could not start.");
    }
  }, []);

  // ── pointer → current field ────────────────────────────────────────────────
  const toUV = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: 1 - (e.clientY - rect.top) / rect.height, // GL y-up
    };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toUV(e);
    const p = pointerRef.current;
    p.x = p.px = x;
    p.y = p.py = y;
    p.active = true;
    p.lastFrame = frameRef.current;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointerRef.current;
    if (!p.active) return;
    const { x, y } = toUV(e);
    p.x = x;
    p.y = y;
    p.lastFrame = frameRef.current;
  };
  const endPointer = () => {
    pointerRef.current.active = false;
  };

  const { m, a, conducting } = readout;
  const totalMass = m.mass[0] + m.mass[1] + m.mass[2] + 1e-5;

  return (
    <main
      style={PAGE_STYLE}
      className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      />

      {/* header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-1 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Current Eden</h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Drag to pull currents of wind through a field of evolving organisms — every collision
          between species is a chord you caused.
        </p>
      </div>

      {/* live readout */}
      <div className="pointer-events-none absolute left-5 bottom-5 flex flex-col gap-2 sm:left-7 sm:bottom-7">
        <div className="flex items-center gap-3">
          {SPECIES.map((s, i) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: s.swatch, opacity: m.lead === i ? 1 : 0.55 }}
              />
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {s.name} {Math.round((m.mass[i] / totalMass) * 100)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            encounter {(m.encounter * 100).toFixed(1)}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            mode {a ? MODE_LABEL[a.modeName] ?? a.modeName : "—"}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {conducting ? "conducting" : "autopilot"}
          </span>
        </div>
      </div>

      {/* start overlay */}
      {!started && !glError && (
        <div className="absolute inset-0 flex items-end justify-center p-8 sm:items-center">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background/70 p-6 backdrop-blur-sm">
            <p className="max-w-sm text-center text-base text-muted-foreground">
              The field is alive but idle — a lone drone. Begin, then drag to conduct the wind and
              force the species to meet.
            </p>
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* errors */}
      {glError && (
        <div className="absolute inset-x-0 top-1/3 mx-auto max-w-md px-6">
          <p className="text-base text-destructive">{glError}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The audio bed can still play — press Begin.
          </p>
          {!started && (
            <button
              onClick={begin}
              className="mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin (audio only)
            </button>
          )}
        </div>
      )}
      {audioError && (
        <p className="absolute bottom-20 left-5 text-sm text-destructive sm:left-7">{audioError}</p>
      )}

      {/* design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-7 sm:top-7"
      >
        Design notes
      </button>
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
