"use client";

/**
 * 7480 — Einstein
 * ───────────────
 * What if a piece of music tiled the plane like the 2023 "einstein" aperiodic
 * monotile — ONE shape, laid down forever, that never once repeats — so the
 * melody it sounds unfolds endlessly and never loops back on itself?
 *
 * The tiling is a faithful port of Craig Kaplan's Spectre substitution system
 * (Smith, Myers, Kaplan & Goodman-Strauss, 2023). A playhead walks the tiles in
 * substitution order; each tile's orientation picks a just-intonation pitch.
 * Because the tiling is aperiodic, the melody has no period. See README.md.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  buildTiling,
  spiralOrder,
  type FinalTile,
  type TilingResult,
} from "./tiling";
import { buildAudioEngine, type EinsteinAudio } from "./audio";

const DEPTH = 3; // 559 Spectre tiles — hundreds, all 12 orientations, smooth.
const POOL = 34; // playhead trail length (overlay path pool).
const ARC_SECONDS = 150; // long-form arc: ~2.5 min from bright to deep.

type Traversal = "substitution" | "sweep";

function isMystic(label: string): boolean {
  return label.startsWith("Gamma");
}

function fillFor(t: FinalTile): string {
  const mystic = isMystic(t.label);
  const hue = 250 + (t.orient - 6) * 2.4; // indigo→violet band
  const sat = mystic ? 58 : 34 + (t.orient % 3) * 6;
  const light = (mystic ? 24 : 11) + (t.orient % 5) * 2.4;
  return `hsl(${hue.toFixed(1)} ${sat}% ${light.toFixed(1)}%)`;
}

function strokeFor(t: FinalTile): string {
  const hue = 258 + (t.orient - 6) * 2.4;
  return `hsl(${hue.toFixed(1)} 50% ${26 + (t.orient % 5) * 2}%)`;
}

// ── Static scene: 559 tile paths + a playhead overlay pool. Mounted once. ──────
const Scene = memo(function Scene({
  tiling,
  cameraRef,
  poolRefs,
}: {
  tiling: TilingResult;
  cameraRef: React.RefObject<SVGGElement | null>;
  poolRefs: React.MutableRefObject<(SVGPathElement | null)[]>;
}) {
  return (
    <g ref={cameraRef}>
      {tiling.tiles.map((t, i) => (
        <path
          key={i}
          d={t.d}
          fill={fillFor(t)}
          stroke={strokeFor(t)}
          strokeWidth={0.06}
          strokeLinejoin="round"
        />
      ))}
      <g filter="url(#glow)">
        {Array.from({ length: POOL }).map((_, i) => (
          <path
            key={`p${i}`}
            ref={(el) => {
              poolRefs.current[i] = el;
            }}
            d=""
            fill="hsl(266 92% 78%)"
            stroke="hsl(280 100% 92%)"
            strokeWidth={0.09}
            strokeLinejoin="round"
            opacity={0}
          />
        ))}
      </g>
    </g>
  );
});

interface Sim {
  raf: number;
  order: FinalTile[];
  index: number;
  lastTick: number;
  startTime: number;
  paused: boolean;
  history: FinalTile[];
  cam: { x: number; y: number; z: number; rot: number };
  focus: { x: number; y: number; z: number; until: number } | null;
}

export default function EinsteinPage() {
  const tiling = useMemo<TilingResult>(() => buildTiling(DEPTH, "Delta"), []);
  const centroid = useMemo(() => {
    let x = 0;
    let y = 0;
    for (const t of tiling.tiles) {
      x += t.cx;
      y += t.cy;
    }
    return { x: x / tiling.tiles.length, y: y / tiling.tiles.length };
  }, [tiling]);

  const { minX, minY, maxX, maxY } = tiling.bounds;
  const padX = (maxX - minX) * 0.04;
  const padY = (maxY - minY) * 0.04;
  const vb = {
    x: minX - padX,
    y: minY - padY,
    w: maxX - minX + 2 * padX,
    h: maxY - minY + 2 * padY,
  };
  const vbCx = vb.x + vb.w / 2;
  const vbCy = vb.y + vb.h / 2;
  const halfW = (maxX - minX) / 2;

  const svgRef = useRef<SVGSVGElement>(null);
  const cameraRef = useRef<SVGGElement | null>(null);
  const poolRefs = useRef<(SVGPathElement | null)[]>([]);
  const simRef = useRef<Sim | null>(null);
  const audioRef = useRef<EinsteinAudio | null>(null);

  const [audioOn, setAudioOn] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [traversal, setTraversal] = useState<Traversal>("substitution");
  const [info, setInfo] = useState<{ n: number; label: string; orient: number }>(
    { n: 0, label: "-", orient: 0 },
  );
  const [elapsed, setElapsed] = useState(0);

  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }, []);

  // Keep the traversal order in sync without restarting the whole sim.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.order =
      traversal === "sweep" ? spiralOrder(tiling.tiles) : tiling.tiles;
    sim.index = 0;
  }, [traversal, tiling]);

  // ── The animation + traversal loop. Visuals autostart (silent). ─────────────
  useEffect(() => {
    const sim: Sim = {
      raf: 0,
      order: tiling.tiles,
      index: 0,
      lastTick: performance.now(),
      startTime: performance.now(),
      paused: false,
      history: [],
      cam: { x: centroid.x, y: centroid.y, z: 1.6, rot: 0 },
      focus: null,
    };
    simRef.current = sim;

    let infoThrottle = 0;

    function frame(now: number) {
      sim.raf = requestAnimationFrame(frame);
      const camG = cameraRef.current;
      if (!camG) return;

      const secs = (now - sim.startTime) / 1000;
      const phase = Math.min(1, secs / ARC_SECONDS);
      const reduced = reducedMotion.current;

      // Advance the playhead on the (arc-slowed) tempo.
      if (!sim.paused && sim.order.length > 0) {
        const tps = 2.6 - 1.55 * phase; // tiles/sec: 2.6 → ~1.05
        const msPerTile = 1000 / Math.max(0.4, tps);
        if (now - sim.lastTick >= msPerTile) {
          sim.lastTick = now;
          const tile = sim.order[sim.index % sim.order.length];
          sim.index++;

          sim.history.unshift(tile);
          if (sim.history.length > POOL) sim.history.pop();

          const audio = audioRef.current;
          if (audio) {
            const pan = Math.max(
              -1,
              Math.min(1, ((tile.cx - centroid.x) / (halfW || 1)) * 0.85),
            );
            audio.trigger(tile.orient, pan, isMystic(tile.label), phase);
            audio.setArc(phase);
          }

          // Paint the trail overlay from history.
          for (let k = 0; k < POOL; k++) {
            const el = poolRefs.current[k];
            if (!el) continue;
            const h = sim.history[k];
            if (!h) {
              el.setAttribute("opacity", "0");
              continue;
            }
            el.setAttribute("d", h.d);
            const age = k / POOL;
            el.setAttribute("opacity", (Math.pow(1 - age, 2.2) * 0.95).toFixed(3));
          }

          if (infoThrottle++ % 3 === 0) {
            setInfo({
              n: sim.index,
              label: tile.label,
              orient: tile.orient,
            });
            setElapsed(secs);
          }
        }
      }

      // Camera: dreamy drift that loosely follows the active tile; user clicks
      // pull focus to a region and zoom in.
      const active = sim.history[0];
      let tx: number;
      let ty: number;
      let tz: number;
      let trot: number;
      if (reduced) {
        tx = centroid.x;
        ty = centroid.y;
        tz = 1.35;
        trot = 0;
      } else {
        const driftX = centroid.x + Math.cos(secs * 0.05) * vb.w * 0.16;
        const driftY = centroid.y + Math.sin(secs * 0.037) * vb.h * 0.16;
        tz = 1.75 + Math.sin(secs * 0.06) * 0.32;
        trot = Math.sin(secs * 0.021) * 3.5;
        if (active) {
          tx = driftX * 0.6 + active.cx * 0.4;
          ty = driftY * 0.6 + active.cy * 0.4;
        } else {
          tx = driftX;
          ty = driftY;
        }
      }
      if (sim.focus && now / 1000 < sim.focus.until) {
        tx = sim.focus.x;
        ty = sim.focus.y;
        tz = sim.focus.z;
      }

      const ease = reduced ? 0.012 : 0.022;
      sim.cam.x += (tx - sim.cam.x) * ease;
      sim.cam.y += (ty - sim.cam.y) * ease;
      sim.cam.z += (tz - sim.cam.z) * ease;
      sim.cam.rot += (trot - sim.cam.rot) * ease;

      camG.setAttribute(
        "transform",
        `translate(${vbCx.toFixed(3)} ${vbCy.toFixed(3)}) ` +
          `rotate(${sim.cam.rot.toFixed(3)}) ` +
          `scale(${sim.cam.z.toFixed(4)}) ` +
          `translate(${(-sim.cam.x).toFixed(3)} ${(-sim.cam.y).toFixed(3)})`,
      );
    }

    sim.raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(sim.raf);
  }, [tiling, centroid, halfW, vb.w, vb.h, vbCx, vbCy]);

  // Teardown audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleBegin = useCallback(() => {
    if (audioRef.current) return;
    try {
      audioRef.current = buildAudioEngine();
      setAudioOn(true);
    } catch {
      setNoAudio(true);
    }
  }, []);

  const togglePause = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.paused = !sim.paused;
    setPaused(sim.paused);
    if (sim.paused) audioRef.current?.suspend();
    else audioRef.current?.resume();
  }, []);

  const cycleTraversal = useCallback(() => {
    setTraversal((m) => (m === "substitution" ? "sweep" : "substitution"));
  }, []);

  // Click/tap: re-center + zoom into the region under the pointer.
  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const sim = simRef.current;
      const camG = cameraRef.current;
      const svg = svgRef.current;
      if (!sim || !camG || !svg) return;
      const ctm = camG.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const world = pt.matrixTransform(ctm.inverse());
      // nearest tile centroid
      let best: FinalTile | null = null;
      let bestD = Infinity;
      for (const t of tiling.tiles) {
        const d = (t.cx - world.x) ** 2 + (t.cy - world.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      if (best) {
        sim.focus = {
          x: best.cx,
          y: best.cy,
          z: 3.4,
          until: performance.now() / 1000 + 7,
        };
      }
    },
    [tiling],
  );

  // Keyboard: space = pause, arrows = traversal mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        cycleTraversal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, cycleTraversal]);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60)
    .toString()
    .padStart(2, "0");

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid slice"
        onPointerDown={handlePointer}
        aria-label="Spectre aperiodic monotile tiling with a musical playhead"
      >
        <defs>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="0.35" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <Scene tiling={tiling} cameraRef={cameraRef} poolRefs={poolRefs} />
      </svg>

      {/* Vignette (screen-space, above the art) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Title */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Einstein
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            aperiodic monotile · spectre substitution · a melody that never loops
          </p>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* Begin overlay */}
      {!audioOn && !noAudio && (
        <div className="absolute inset-0 flex items-end justify-center pb-24">
          <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-border bg-background/70 px-6 py-5 text-center backdrop-blur-sm">
            <p className="max-w-sm text-base text-muted-foreground">
              The plane is already unfolding. Press begin to hear it — one voice
              per tile, a pitch per orientation, a stream with no period.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* Control strip (after Begin, or if no audio) */}
      {(audioOn || noAudio) && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/70 px-2 py-1.5 backdrop-blur-md">
            <button
              onClick={togglePause}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={cycleTraversal}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {traversal === "substitution" ? "Order: substitution" : "Order: sweep"}
            </button>
            <span className="px-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground tabular-nums">
              {mm}:{ss} · {info.label} · o{info.orient} · #{info.n}
            </span>
          </div>
        </div>
      )}

      {noAudio && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2">
          <p className="text-sm text-destructive">
            Web Audio unavailable — the tiling unfolds silently.
          </p>
        </div>
      )}

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Einstein
              </h2>
              <Link
                href="/dream/7480-einstein/README.md"
                target="_blank"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                README
              </Link>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The tiling is real.</span> This
                is a faithful port of Craig Kaplan&apos;s Spectre substitution
                system — the 2023 &quot;einstein&quot; aperiodic monotile of
                Smith, Myers, Kaplan &amp; Goodman-Strauss. Nine metatiles inflate
                by fixed affine rules; after three inflations, {tiling.tiles.length}{" "}
                copies of the single Spectre shape are emitted. No periodic tiling
                by this shape exists — so nothing you see or hear ever exactly
                returns.
              </p>
              <p>
                <span className="text-foreground">The melody.</span> A playhead
                walks the tiles in substitution order. Each Spectre&apos;s
                orientation (one of twelve, in 30° steps) chooses a just-intonation
                major-pentatonic pitch across two octaves. Because the orientation
                stream is aperiodic, the resulting melody has no period: it is
                neither random nor looping — endless unfolding that never comes
                back.
              </p>
              <p>
                <span className="text-foreground">The arc.</span> Over ~2.5
                minutes the tempo slows, releases lengthen, the register sinks, a
                fifth-drone swells and the reverb opens — minute three sounds
                nothing like second zero. Click any region to fall into it; space
                pauses; arrows change the traversal.
              </p>
              <p className="text-xs text-muted-foreground/80">
                Smith, Myers, Kaplan &amp; Goodman-Strauss, &quot;An aperiodic
                monotile&quot; and &quot;A chiral aperiodic monotile&quot; (2023);
                cf. arXiv:2502.06926 (2025). The lab&apos;s 837-quasicrystal is a
                Penrose P3 (two rhombs); this is a single einstein tile.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
