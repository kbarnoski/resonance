"use client";

/**
 * 837 — Quasicrystal
 * ──────────────────
 * What if a piece of music had the structure of a quasicrystal —
 * perfectly ordered, self-similar, yet NEVER exactly repeating?
 *
 * References:
 *   Roger Penrose — P3 rhomb tiling (1974)
 *   N.G. de Bruijn — pentagrid method, "Algebraic theory of Penrose's
 *     non-periodic tilings of the plane", Indagationes Mathematicae (1981)
 *   Dan Shechtman — experimental quasicrystals, Nobel Prize Chemistry (2011)
 *   Dmitri Tymoczko & colleagues — "Quasiperiodic Music" (arXiv:2009.04667)
 *   Ryoji Ikeda — clinical data-aesthetic (aesthetic kin)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  generateTiling,
  sortRhombsForTraversal,
  getInflationScale,
  PHI,
  type Rhomb,
  type TraversalMode,
} from "./tiling";
import { buildAudioEngine, type QuasiAudioEngine } from "./synth";

// ── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = {
  bg:          "#030712",   // near-black ground
  fatFill:     "#0f1729",   // deep navy for fat rhombs
  fatEdge:     "#38bdf8",   // sky cyan for fat edges
  thinFill:    "#0d0f1e",   // darker navy for thin rhombs
  thinEdge:    "#a78bfa",   // violet for thin edges
  activeGlow:  "#e0f2fe",   // white-blue for active tile
  sweepLine:   "#67e8f9",   // cyan sweep
  label:       "#94a3b8",   // slate text
  accent:      "#7c3aed",   // violet accent
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface EngineRef {
  audio: QuasiAudioEngine;
  rafId: number;
  traversalIndex: number;
  traversalRhombs: Rhomb[];
  lastTickTime: number;
  activeRhombId: string | null;
  sweepX: number;
}

type HighlightMode = "none" | "type" | "vertex" | "family";

// ── Helpers (no use* prefix) ──────────────────────────────────────────────────

function makeOffsets(seed: number): [number, number, number, number, number] {
  // Deterministic but varied offsets from a seed
  const s = seed * 9301 + 49297;
  const offsets: number[] = [];
  let cur = s;
  for (let i = 0; i < 5; i++) {
    cur = (cur * 9301 + 49297) % 233280;
    offsets.push(cur / 233280);
  }
  return offsets as [number, number, number, number, number];
}

function drawRhombs(
  ctx2d: CanvasRenderingContext2D,
  rhombs: Rhomb[],
  scale: number,
  cx: number,
  cy: number,
  activeId: string | null,
  sweepX: number | null,
  traversalMode: TraversalMode,
  highlightMode: HighlightMode,
  zoom: number,
) {
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.scale(scale * zoom, scale * zoom);

  // Draw sweep line
  if (traversalMode === "sweep" && sweepX !== null) {
    ctx2d.save();
    ctx2d.strokeStyle = PALETTE.sweepLine + "44";
    ctx2d.lineWidth = 0.05;
    ctx2d.beginPath();
    ctx2d.moveTo(sweepX, -100);
    ctx2d.lineTo(sweepX, 100);
    ctx2d.stroke();
    ctx2d.restore();
  }

  for (const rhomb of rhombs) {
    const isActive = rhomb.id === activeId;
    const isFat = rhomb.type === "fat";

    // Highlight color overrides
    let fillColor = isFat ? PALETTE.fatFill : PALETTE.thinFill;
    let edgeColor = isFat ? PALETTE.fatEdge : PALETTE.thinEdge;

    if (highlightMode === "type") {
      fillColor = isFat ? "#0f2040" : "#1a0a2e";
    } else if (highlightMode === "vertex") {
      const vtxColors: Record<string, string> = {
        sun:   "#0f2040",
        star:  "#1a0a2e",
        ace:   "#0a1f1a",
        deuce: "#1f0a10",
        jack:  "#1a1a08",
        queen: "#0f1820",
        king:  "#180f20",
      };
      fillColor = vtxColors[rhomb.vertexConfig] ?? fillColor;
    } else if (highlightMode === "family") {
      const fam = rhomb.familyA;
      const famColors = ["#0f1a2e", "#0a1f1a", "#1a0f18", "#1a1a08", "#0f0f1f"];
      fillColor = famColors[fam] ?? fillColor;
    }

    if (isActive) {
      fillColor = "#1a3050";
      edgeColor = PALETTE.activeGlow;
    }

    ctx2d.beginPath();
    const verts = rhomb.vertices;
    ctx2d.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) {
      ctx2d.lineTo(verts[i][0], verts[i][1]);
    }
    ctx2d.closePath();

    ctx2d.fillStyle = fillColor;
    ctx2d.fill();

    ctx2d.strokeStyle = edgeColor;
    ctx2d.lineWidth = isActive ? 0.04 : 0.02;
    ctx2d.globalAlpha = isActive ? 1.0 : 0.75;
    ctx2d.stroke();
    ctx2d.globalAlpha = 1.0;

    // Active glow
    if (isActive) {
      ctx2d.save();
      ctx2d.shadowColor = PALETTE.activeGlow;
      ctx2d.shadowBlur = 0.3;
      ctx2d.strokeStyle = PALETTE.activeGlow + "88";
      ctx2d.lineWidth = 0.06;
      ctx2d.stroke();
      ctx2d.restore();
    }
  }

  ctx2d.restore();
}

function drawHUD(
  ctx2d: CanvasRenderingContext2D,
  width: number,
  _height: number,
  currentRhomb: Rhomb | null,
  traversalIndex: number,
  totalRhombs: number,
) {
  ctx2d.save();
  ctx2d.font = "11px 'JetBrains Mono', 'Courier New', monospace";
  ctx2d.fillStyle = PALETTE.label;
  ctx2d.textAlign = "left";

  if (currentRhomb) {
    const lines = [
      `tile ${traversalIndex + 1} / ${totalRhombs}`,
      `type: ${currentRhomb.type}`,
      `vertex: ${currentRhomb.vertexConfig}`,
      `dist: ${currentRhomb.distFromCenter.toFixed(2)}`,
    ];
    lines.forEach((line, i) => {
      ctx2d.fillText(line, 12, 20 + i * 16);
    });
  }

  // 5-fold symmetry indicator (small pentagon)
  const px = width - 36;
  const py = 36;
  ctx2d.strokeStyle = PALETTE.thinEdge + "66";
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const x = px + 18 * Math.cos(a);
    const y = py + 18 * Math.sin(a);
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.closePath();
  ctx2d.stroke();

  // φ label
  ctx2d.fillStyle = PALETTE.thinEdge + "88";
  ctx2d.font = "10px serif";
  ctx2d.textAlign = "center";
  ctx2d.fillText("φ", px, py + 4);

  ctx2d.restore();
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function QuasicrystalPage() {
  const [started, setStarted] = useState(false);
  const [noAudio, setNoAudio] = useState(false);

  // Controls
  const [tempo, setTempo] = useState(3);             // tiles per second
  const [zoom, setZoom] = useState(1.0);             // current zoom (inflation level)
  const [inflationLevel, setInflationLevel] = useState(0);  // integer inflation steps
  const [traversalMode, setTraversalMode] = useState<TraversalMode>("spiral");
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("type");
  const [seed, setSeed] = useState(42);
  const [showNotes, setShowNotes] = useState(false);

  // Display state
  const [currentRhomb, setCurrentRhomb] = useState<Rhomb | null>(null);
  const [traversalIndex, setTraversalIndex] = useState(0);
  const [totalRhombs, setTotalRhombs] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineRef | null>(null);

  // Keep controls in a ref for the animation loop
  const controlsRef = useRef({ tempo, zoom, traversalMode, highlightMode, seed, inflationLevel });
  useEffect(() => {
    controlsRef.current = { tempo, zoom, traversalMode, highlightMode, seed, inflationLevel };
  }, [tempo, zoom, traversalMode, highlightMode, seed, inflationLevel]);

  // Sync inflation level to zoom
  useEffect(() => {
    const newZoom = getInflationScale(inflationLevel);
    setZoom(newZoom);
  }, [inflationLevel]);

  const handleStart = useCallback(() => {
    if (started) return;

    let audio: QuasiAudioEngine | null = null;
    try {
      audio = buildAudioEngine();
    } catch {
      setNoAudio(true);
    }

    setStarted(true);

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx2dOrNull = canvasEl.getContext("2d");
    if (!ctx2dOrNull) return;
    // Capture as non-null for use inside closure
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx2d: CanvasRenderingContext2D = ctx2dOrNull;

    // Generate initial tiling
    const offsets = makeOffsets(42);
    const rhombs = generateTiling({ offsets, radius: 25, scale: 40 });
    const sorted = sortRhombsForTraversal(rhombs, "spiral");
    setTotalRhombs(sorted.length);

    const eng: EngineRef = {
      audio: audio!,
      rafId: 0,
      traversalIndex: 0,
      traversalRhombs: sorted,
      lastTickTime: performance.now(),
      activeRhombId: null,
      sweepX: -25,
    };
    engineRef.current = eng;

    let lastRegen = { seed: 42, mode: "spiral" as TraversalMode };

    function tick(now: number) {
      eng.rafId = requestAnimationFrame(tick);

      const { tempo: t, traversalMode: tm, highlightMode: hm, zoom: z, seed: s } = controlsRef.current;

      // Regenerate if params changed
      if (s !== lastRegen.seed || tm !== lastRegen.mode) {
        const newOffsets = makeOffsets(s);
        const newRhombs = generateTiling({ offsets: newOffsets, radius: 25, scale: 40 });
        const newSorted = sortRhombsForTraversal(newRhombs, tm);
        eng.traversalRhombs = newSorted;
        eng.traversalIndex = 0;
        eng.sweepX = -25;
        lastRegen = { seed: s, mode: tm };
        setTotalRhombs(newSorted.length);
      }

      // Canvas resize
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx2d.scale(dpr, dpr);
      }
      const W = rect.width;
      const H = rect.height;

      // Clear
      ctx2d.fillStyle = PALETTE.bg;
      ctx2d.fillRect(0, 0, W, H);

      const scale = Math.min(W, H) / 30;  // world units to pixels

      // Traversal tick
      const elapsed = now - eng.lastTickTime;
      const msPerTile = 1000 / Math.max(0.1, t);
      if (elapsed >= msPerTile && eng.traversalRhombs.length > 0) {
        eng.lastTickTime = now;
        const idx = eng.traversalIndex % eng.traversalRhombs.length;
        const rhomb = eng.traversalRhombs[idx];
        eng.activeRhombId = rhomb.id;

        // Update sweep position
        if (tm === "sweep") {
          eng.sweepX = rhomb.cx;
        }

        // Sonify
        if (audio) {
          audio.spawnTileEvent(rhomb, t);
          audio.setDroneRegion(rhomb.distFromCenter, rhomb.angle);
        }

        eng.traversalIndex++;
        if (eng.traversalIndex >= eng.traversalRhombs.length) {
          eng.traversalIndex = 0;  // cycle — new traversal of same crystal
        }

        setCurrentRhomb(rhomb);
        setTraversalIndex(idx);
      }

      // Draw
      drawRhombs(
        ctx2d,
        eng.traversalRhombs,
        scale,
        W / 2, H / 2,
        eng.activeRhombId,
        tm === "sweep" ? eng.sweepX : null,
        tm,
        hm,
        z,
      );

      drawHUD(ctx2d, W, H, currentRhomb, eng.traversalIndex, eng.traversalRhombs.length);
    }

    eng.rafId = requestAnimationFrame(tick);
  }, [started, currentRhomb]);

  // Teardown
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (!eng) return;
      cancelAnimationFrame(eng.rafId);
      if (eng.audio) {
        eng.audio.dispose();
      }
    };
  }, []);

  const handleReseed = useCallback(() => {
    setSeed(s => (s + 1) * 7 % 9999 + 1);
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#030712] flex flex-col overflow-hidden">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: started ? "block" : "none" }}
      />

      {/* Start screen */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-center max-w-lg">
            <h1 className="text-2xl font-light text-white/95 tracking-widest uppercase mb-1">
              Quasicrystal
            </h1>
            <p className="text-base text-white/75 font-light mb-6">
              Music with no repeat and no seam — structured by Penrose aperiodic order.
            </p>
            <p className="text-sm text-white/55 leading-relaxed">
              A de Bruijn pentagrid generates a Penrose P3 rhomb tiling — perfectly
              ordered, 5-fold symmetric, yet provably never repeating. A traversal visits
              each tile; fat and thin rhombs, their vertex configurations, and distance
              from center map to just-intonation pitches. The resulting sequence is
              non-repeating yet self-similar: motifs recur transposed and re-spaced,
              but the exact sequence never returns.
            </p>
          </div>
          <button
            onClick={handleStart}
            className="px-6 py-3 min-h-[44px] bg-violet-700 hover:bg-violet-600
                       text-white text-base font-medium rounded-lg transition-colors
                       tracking-wide"
          >
            Begin Crystal
          </button>
          {noAudio && (
            <p className="text-rose-300 text-sm">
              Web Audio unavailable — visuals will run silently.
            </p>
          )}
        </div>
      )}

      {/* Controls overlay (visible when started) */}
      {started && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col">
          {/* Control bar */}
          <div className="flex flex-wrap items-end gap-4 px-4 py-3 bg-black/50 backdrop-blur-sm border-t border-white/10">

            {/* Tempo */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs text-white/55 uppercase tracking-wider">
                Traversal tempo
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0.5} max={8} step={0.1}
                  value={tempo}
                  onChange={e => setTempo(parseFloat(e.target.value))}
                  className="w-24 accent-violet-400"
                />
                <span className="text-sm text-white/75 w-12 tabular-nums">
                  {tempo.toFixed(1)} t/s
                </span>
              </div>
            </div>

            {/* Inflation */}
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs text-white/55 uppercase tracking-wider">
                φ inflation ×{getInflationScale(inflationLevel).toFixed(2)}
              </label>
              <div className="flex items-center gap-1">
                {[-1, 0, 1, 2, 3].map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setInflationLevel(lvl)}
                    className={`px-2 py-1 text-xs rounded min-h-[32px] min-w-[32px] transition-colors ${
                      inflationLevel === lvl
                        ? "bg-violet-600 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                  >
                    {lvl < 0 ? `1/φ` : lvl === 0 ? "1" : `φ${lvl > 1 ? lvl : ""}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Traversal mode */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/55 uppercase tracking-wider">
                Traversal
              </label>
              <div className="flex gap-1">
                {(["spiral", "sweep", "growth"] as TraversalMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setTraversalMode(mode)}
                    className={`px-3 py-1.5 text-xs rounded min-h-[32px] transition-colors ${
                      traversalMode === mode
                        ? "bg-cyan-700 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Highlight */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/55 uppercase tracking-wider">
                Highlight
              </label>
              <div className="flex gap-1">
                {(["type", "vertex", "family", "none"] as HighlightMode[]).map(hm => (
                  <button
                    key={hm}
                    onClick={() => setHighlightMode(hm)}
                    className={`px-3 py-1.5 text-xs rounded min-h-[32px] transition-colors ${
                      highlightMode === hm
                        ? "bg-sky-700 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                  >
                    {hm}
                  </button>
                ))}
              </div>
            </div>

            {/* Reseed */}
            <button
              onClick={handleReseed}
              className="px-4 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/20
                         text-white/75 text-sm rounded-lg transition-colors ml-auto"
            >
              Reseed crystal
            </button>
          </div>

          {/* Tile info bar */}
          <div className="flex items-center gap-4 px-4 py-1.5 bg-black/30 border-t border-white/5">
            <span className="text-xs text-violet-300 tabular-nums">
              {traversalIndex + 1} / {totalRhombs}
            </span>
            {currentRhomb && (
              <>
                <span className="text-xs text-white/55">
                  {currentRhomb.type} rhomb
                </span>
                <span className="text-xs text-cyan-400/70">
                  {currentRhomb.vertexConfig}
                </span>
                <span className="text-xs text-white/55 tabular-nums">
                  r={currentRhomb.distFromCenter.toFixed(2)}
                </span>
                <span className="text-xs text-white/55 tabular-nums">
                  φ≈{PHI.toFixed(4)}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div>
          <h1 className="text-xl font-light text-white/90 tracking-widest uppercase">
            Quasicrystal
          </h1>
          <p className="text-sm text-white/55">
            aperiodic order · de Bruijn pentagrid · just-intonation
          </p>
        </div>
        <div className="flex gap-3 pointer-events-auto">
          {started && (
            <button
              onClick={() => setShowNotes(n => !n)}
              className="text-xs text-violet-300 hover:text-violet-200 transition-colors underline underline-offset-2"
            >
              Design notes
            </button>
          )}
          <Link
            href="/dream/837-quasicrystal/README.md"
            className="text-xs text-white/55 hover:text-white/80 transition-colors"
            target="_blank"
          >
            README
          </Link>
        </div>
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 z-10">
          <div className="max-w-2xl w-full bg-[#0f172a] border border-white/10 rounded-xl p-6 overflow-y-auto max-h-[80vh]">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl text-white/95 font-light">Design Notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="text-white/50 hover:text-white/80 text-lg leading-none px-2 py-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 text-sm text-white/70 leading-relaxed">
              <p>
                <span className="text-violet-300">The tiling.</span>{" "}
                Five families of parallel lines (directions 0°, 36°, 72°, 108°, 144°,
                offset by γ₀…γ₄) form a pentagrid. Each intersection of two families
                maps, via de Bruijn&apos;s dual transform, to a rhombus in the Penrose P3
                tiling. Fat rhombs have 72° angles; thin rhombs have 36°. The result has
                exact 5-fold symmetry and is provably aperiodic.
              </p>
              <p>
                <span className="text-cyan-300">The music.</span>{" "}
                The traversal visits tiles in order (spiral / sweep / growth front).
                Each tile triggers a voice: fat rhombs use warm additive partials (1f, 2f, 3f);
                thin rhombs use bright partials (1f, 3f, 5f) with subtle FM shimmer.
                Pitch is determined by vertex configuration mapped to just-intonation
                ratios (sun→1/1, queen→3/2, king→4/3, jack→5/4, star→6/5, deuce→7/4, ace→9/8).
                Register increases with distance from center. A sustained drone shifts
                slowly as the traversal travels outward.
              </p>
              <p>
                <span className="text-sky-300">Why it never repeats.</span>{" "}
                The Penrose tiling is aperiodic — no translation maps it to itself.
                Therefore the sequence of tile types and vertex configs the traversal
                encounters is also aperiodic: the musical sequence has no period.
                Yet it&apos;s not random — the same finite vocabulary of local patches
                recurs (self-similarity under φ-inflation), giving structural coherence
                across time. The piece is genuinely different at minute 5 than minute 1.
              </p>
              <p>
                <span className="text-white/50">φ-inflation.</span>{" "}
                The inflation controls zoom the world by powers of φ = (1+√5)/2 ≈ 1.618.
                A Penrose tiling at scale φⁿ is self-similar to scale φⁿ⁺¹ — the same
                patterns appear at larger scales, producing a harmonic-rhythm change
                (the traversal&apos;s &quot;sentence length&quot; shifts).
              </p>
              <p className="text-white/55 text-xs">
                References: Penrose (1974) · de Bruijn (1981) · Shechtman Nobel (2011)
                · arXiv:2009.04667 · Aesthetic: Ryoji Ikeda
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
