"use client";

/**
 * 353-collapse-score — Wave Function Collapse musical composition
 *
 * A lattice of 8×16 cells (rows = voice layers, cols = beat slots). Each cell
 * starts in superposition (all D-Dorian scale degrees possible). The WFC
 * solver runs step-by-step: pick lowest-entropy cell → collapse to a
 * weighted-random tile → propagate arc-consistency to neighbours. You watch
 * constraints ripple outward as cells decide their notes. A sweeping playhead
 * plays collapsed notes via a warm FM-pad + bell synth. When the grid fills,
 * it re-seeds and continues.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createGrid,
  createSolver,
  mulberry32,
  TILES,
  NUM_TILES,
  ROWS,
  COLS,
  type WFCGrid,
  type CollapseEvent,
} from "./wfc";
import { createAudioEngine, type AudioEngine } from "./audio";

// ── Constants ──────────────────────────────────────────────────────────────────

const PLAYHEAD_INTERVAL_MS = 300; // ms per beat column
const SOLVE_SPEEDS = [
  { label: "Slow",   ms: 150 },
  { label: "Normal", ms: 55  },
  { label: "Fast",   ms: 15  },
] as const;

const TOTAL_CELLS = ROWS * COLS;

// ── Visual helpers ─────────────────────────────────────────────────────────────

/** Superposition background — dim, cooler for more candidates, warmer for fewer */
function superpositionBg(count: number): string {
  const ratio = 1 - (count - 1) / (NUM_TILES - 1);
  const l = 12 + ratio * 16;
  const s = 15 + ratio * 25;
  return `hsl(255 ${s}% ${l}%)`;
}

/** Collapsed cell background */
function collapsedBg(hue: number): string {
  return `hsl(${hue} 62% 50%)`;
}

/** Constrained glow colour */
function constrainedGlow(hue: number): string {
  return `hsl(${hue} 88% 68%)`;
}

// ── Cell visual state ──────────────────────────────────────────────────────────

type CellStatus = "superposition" | "constrained" | "collapsed" | "playing";

interface VisCell {
  status: CellStatus;
  candidateCount: number;
  tileId: number | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CollapseScore() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [started, setStarted]         = useState(false);
  const [seed, setSeed]               = useState<number>(() => (Math.random() * 0xffffffff) >>> 0);
  const [solveSpeedMs, setSolveSpeedMs] = useState(55);
  const [paused, setPaused]           = useState(false);
  const [playCol, setPlayCol]         = useState(-1);
  const [collapsedCount, setCollapsedCount] = useState(0);

  // ── Mutable refs (no re-render) ───────────────────────────────────────────
  const audioRef      = useRef<AudioEngine | null>(null);
  const gridRef       = useRef<WFCGrid | null>(null);
  const solverRef     = useRef<(() => CollapseEvent | null) | null>(null);
  const visCellsRef   = useRef<VisCell[]>([]);
  const solveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef     = useRef(false);
  const speedRef      = useRef(55);
  const playColRef    = useRef(-1);
  const collapsedRef  = useRef(0);
  const seedRef       = useRef(seed);

  // Cell DOM refs for direct mutation (avoids per-cell setState)
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Apply visual data to a DOM cell ───────────────────────────────────────
  const applyCell = useCallback((idx: number, vis: VisCell) => {
    const el = cellRefs.current[idx];
    if (!el) return;

    const labelEl = el.querySelector<HTMLSpanElement>(".lbl");
    const countEl = el.querySelector<HTMLSpanElement>(".cnt");

    if (vis.status === "collapsed" || vis.status === "playing") {
      const hue = TILES[vis.tileId!].hue;
      const isPlaying = vis.status === "playing";
      el.style.background = collapsedBg(hue);
      el.style.opacity    = "1";
      el.style.transform  = isPlaying ? "scale(1.06)" : "scale(1)";
      el.style.boxShadow  = isPlaying
        ? `0 0 12px 4px hsl(${hue} 88% 68%)`
        : "none";
      el.style.zIndex     = isPlaying ? "2" : "1";
      if (labelEl) { labelEl.textContent = TILES[vis.tileId!].label; labelEl.style.opacity = "1"; }
      if (countEl) countEl.style.opacity = "0";
    } else if (vis.status === "constrained") {
      // Short flash of reduced candidates
      const hue = vis.tileId !== null ? TILES[vis.tileId].hue : 260;
      el.style.background = superpositionBg(vis.candidateCount);
      el.style.opacity    = "1";
      el.style.transform  = "scale(1)";
      el.style.boxShadow  = `0 0 5px 2px ${constrainedGlow(hue)}`;
      el.style.zIndex     = "1";
      if (labelEl) { labelEl.textContent = ""; labelEl.style.opacity = "0"; }
      if (countEl) { countEl.textContent = String(vis.candidateCount); countEl.style.opacity = "0.75"; }
    } else {
      // superposition
      el.style.background = superpositionBg(vis.candidateCount);
      el.style.opacity    = "0.5";
      el.style.transform  = "scale(1)";
      el.style.boxShadow  = "none";
      el.style.zIndex     = "1";
      if (labelEl) { labelEl.textContent = ""; labelEl.style.opacity = "0"; }
      if (countEl) { countEl.textContent = String(vis.candidateCount); countEl.style.opacity = "0.4"; }
    }
  }, []);

  // ── Bootstrap a fresh grid ────────────────────────────────────────────────
  const bootGrid = useCallback((s: number) => {
    if (solveTimer.current) clearTimeout(solveTimer.current);
    if (playTimer.current)  clearTimeout(playTimer.current);

    const rng  = mulberry32(s);
    const grid = createGrid(ROWS, COLS);
    gridRef.current  = grid;
    solverRef.current = createSolver(grid, rng);

    const vis: VisCell[] = Array.from({ length: TOTAL_CELLS }, () => ({
      status: "superposition",
      candidateCount: NUM_TILES,
      tileId: null,
    }));
    visCellsRef.current = vis;
    for (let i = 0; i < TOTAL_CELLS; i++) applyCell(i, vis[i]);

    playColRef.current   = -1;
    collapsedRef.current = 0;
    setPlayCol(-1);
    setCollapsedCount(0);
  }, [applyCell]);

  // ── WFC solve tick — stored in ref to avoid stale closure ─────────────────
  const solveTickRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    solveTickRef.current = () => {
      if (pausedRef.current) {
        solveTimer.current = setTimeout(() => solveTickRef.current(), 120);
        return;
      }
      const solver = solverRef.current;
      const grid   = gridRef.current;
      if (!solver || !grid) return;

      const ev = solver();
      if (ev) {
        const { collapsed, tileId, constrained, done } = ev;
        const [cr, cc] = collapsed;
        const colIdx   = cr * COLS + cc;
        const vis      = visCellsRef.current;

        vis[colIdx] = { status: "collapsed", candidateCount: 1, tileId };
        applyCell(colIdx, vis[colIdx]);

        for (const [nr, nc] of constrained) {
          const nIdx = nr * COLS + nc;
          if (vis[nIdx].status === "collapsed") continue;
          const cell  = grid.cells[nr][nc];
          const count = cell.kind === "superposition" ? cell.candidates.size : 1;
          vis[nIdx]   = { status: "constrained", candidateCount: count, tileId: null };
          applyCell(nIdx, vis[nIdx]);
        }

        collapsedRef.current += 1;
        setCollapsedCount(collapsedRef.current);

        // Fade constrained cells back to superposition after flash
        const snap = constrained.map(([nr, nc]) => nr * COLS + nc);
        setTimeout(() => {
          for (const nIdx of snap) {
            const v = visCellsRef.current[nIdx];
            if (v.status === "constrained") {
              visCellsRef.current[nIdx] = { ...v, status: "superposition" };
              applyCell(nIdx, visCellsRef.current[nIdx]);
            }
          }
        }, 380);

        if (done) {
          // Auto-reseed after a short breath
          setTimeout(() => {
            const nextSeed = (mulberry32(seedRef.current + (Date.now() & 0xffff))() * 0xffffffff) >>> 0;
            seedRef.current = nextSeed;
            setSeed(nextSeed);
            bootGrid(nextSeed);
            if (!pausedRef.current) solveTimer.current = setTimeout(() => solveTickRef.current(), speedRef.current);
          }, 900);
          return;
        }
      }

      solveTimer.current = setTimeout(() => solveTickRef.current(), speedRef.current);
    };
  }, [applyCell, bootGrid]);

  // ── Playhead tick — stored in ref ─────────────────────────────────────────
  const playTickRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    playTickRef.current = () => {
      if (pausedRef.current) {
        playTimer.current = setTimeout(() => playTickRef.current(), 120);
        return;
      }

      const grid  = gridRef.current;
      const audio = audioRef.current;
      if (!grid) { playTimer.current = setTimeout(() => playTickRef.current(), PLAYHEAD_INTERVAL_MS); return; }

      const col     = (playColRef.current + 1) % COLS;
      const prevCol = (col - 1 + COLS) % COLS;
      playColRef.current = col;
      setPlayCol(col);

      // Clear previous column's playing highlight
      for (let r = 0; r < ROWS; r++) {
        const pIdx = r * COLS + prevCol;
        const v    = visCellsRef.current[pIdx];
        if (v.status === "playing") {
          visCellsRef.current[pIdx] = { ...v, status: "collapsed" };
          applyCell(pIdx, visCellsRef.current[pIdx]);
        }
      }

      // Highlight + play notes in current column
      for (let r = 0; r < ROWS; r++) {
        const cIdx = r * COLS + col;
        const v    = visCellsRef.current[cIdx];
        if (v.status === "collapsed" && v.tileId !== null) {
          visCellsRef.current[cIdx] = { ...v, status: "playing" };
          applyCell(cIdx, visCellsRef.current[cIdx]);
          if (audio) {
            // Higher rows = higher velocity (melody layers louder)
            const vel = 0.38 + ((ROWS - 1 - r) / (ROWS - 1)) * 0.32;
            audio.playNote(TILES[v.tileId].midi, vel);
          }
        }
      }

      playTimer.current = setTimeout(() => playTickRef.current(), PLAYHEAD_INTERVAL_MS);
    };
  }, [applyCell]);

  // ── Begin ─────────────────────────────────────────────────────────────────
  const handleBegin = useCallback(async () => {
    setStarted(true);
    if (!audioRef.current) audioRef.current = createAudioEngine();
    await audioRef.current.resume();

    bootGrid(seedRef.current);
    solveTimer.current = setTimeout(() => solveTickRef.current(), speedRef.current);
    playTimer.current  = setTimeout(() => playTickRef.current(), PLAYHEAD_INTERVAL_MS * 2);
  }, [bootGrid]);

  // ── New seed ──────────────────────────────────────────────────────────────
  const handleNewSeed = useCallback(async () => {
    if (audioRef.current) await audioRef.current.resume();
    const s = (Math.random() * 0xffffffff) >>> 0;
    seedRef.current = s;
    setSeed(s);
    bootGrid(s);
    if (!pausedRef.current) {
      solveTimer.current = setTimeout(() => solveTickRef.current(), speedRef.current);
      playTimer.current  = setTimeout(() => playTickRef.current(), PLAYHEAD_INTERVAL_MS * 2);
    }
  }, [bootGrid]);

  // ── Replay specific seed ──────────────────────────────────────────────────
  const handleReplay = useCallback(async () => {
    if (audioRef.current) await audioRef.current.resume();
    bootGrid(seedRef.current);
    if (!pausedRef.current) {
      solveTimer.current = setTimeout(() => solveTickRef.current(), speedRef.current);
      playTimer.current  = setTimeout(() => playTickRef.current(), PLAYHEAD_INTERVAL_MS * 2);
    }
  }, [bootGrid]);

  // ── Pause / resume ────────────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next && audioRef.current) audioRef.current.resume().catch(() => undefined);
  }, []);

  // ── Speed change ──────────────────────────────────────────────────────────
  const handleSpeed = useCallback((ms: number) => {
    speedRef.current = ms;
    setSolveSpeedMs(ms);
  }, []);

  // ── Seed input ────────────────────────────────────────────────────────────
  const handleSeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v)) {
      const s = v >>> 0;
      seedRef.current = s;
      setSeed(s);
    }
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (solveTimer.current) clearTimeout(solveTimer.current);
      if (playTimer.current)  clearTimeout(playTimer.current);
      audioRef.current?.dispose();
    };
  }, []);

  // Keep seed ref synced
  useEffect(() => { seedRef.current = seed; }, [seed]);

  // Preferes-reduced-motion
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080810] text-white flex flex-col select-none">

      {/* Page header */}
      <div className="px-6 pt-8 pb-3 max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-white/95">
          Collapse Score
        </h1>
        <p className="mt-1 text-base text-white/75 max-w-2xl">
          A self-composing score in D-Dorian driven by Wave Function Collapse.
          Each cell starts in superposition — watch constraints ripple outward
          as the lattice decides its notes.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center gap-5 px-4 pb-10">

        {/* Begin gate */}
        {!started && (
          <div className="flex flex-col items-center gap-4 pt-8">
            <button
              onClick={handleBegin}
              className="min-h-[44px] px-8 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-800 text-white text-base font-semibold transition-colors"
            >
              Begin Composition
            </button>
            <p className="text-white/55 text-base text-center max-w-xs">
              Tap to unlock audio and start the WFC solver.
            </p>
          </div>
        )}

        {/* Lattice grid */}
        <div
          role="img"
          aria-label="WFC musical lattice — 8 rows of voice layers × 16 beat columns"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows:    `repeat(${ROWS}, minmax(0, 1fr))`,
            gap: "3px",
            width: "100%",
            maxWidth: "860px",
          }}
        >
          {Array.from({ length: TOTAL_CELLS }, (_, i) => {
            const col = i % COLS;
            const isPlayCol = started && col === playCol;
            return (
              <div
                key={i}
                ref={(el) => { cellRefs.current[i] = el; }}
                className="relative rounded-[3px] overflow-hidden"
                style={{
                  aspectRatio: "1 / 1",
                  background:  superpositionBg(NUM_TILES),
                  opacity:     started ? 0.5 : 0.2,
                  transition:  prefersReduced
                    ? "background 0.5s"
                    : "background 0.15s ease, opacity 0.18s ease, transform 0.1s ease, box-shadow 0.14s ease",
                  outline:       isPlayCol ? "2px solid rgba(167,139,250,0.35)" : "none",
                  outlineOffset: "-2px",
                }}
              >
                {/* Superposition count */}
                <span
                  className="cnt absolute inset-0 flex items-center justify-center"
                  style={{
                    fontSize:      "9px",
                    fontFamily:    "monospace",
                    color:         "rgba(255,255,255,0.6)",
                    opacity:       0.4,
                    pointerEvents: "none",
                  }}
                >
                  {NUM_TILES}
                </span>
                {/* Collapsed note label */}
                <span
                  className="lbl absolute inset-0 flex items-center justify-center font-mono font-semibold text-white"
                  style={{
                    fontSize:      "10px",
                    opacity:       0,
                    pointerEvents: "none",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Tile legend */}
        <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
          {TILES.slice(0, 7).map((tile) => (
            <div
              key={tile.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded"
              style={{ background: `hsl(${tile.hue} 25% 16%)` }}
            >
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: collapsedBg(tile.hue) }}
              />
              <span
                className="text-white/80 font-mono"
                style={{ fontSize: "11px" }}
              >
                {tile.label.slice(0, 1)}
              </span>
              <span
                className="text-white/55"
                style={{ fontSize: "10px" }}
              >
                deg {tile.degree + 1}
              </span>
            </div>
          ))}
        </div>

        {/* Controls — only after start */}
        {started && (
          <div className="flex flex-col items-center gap-4 w-full max-w-2xl">

            {/* Stats bar */}
            <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-base text-white/55">
              <span>
                collapsed{" "}
                <span className="text-violet-300">{collapsedCount}</span>
                {" / "}
                <span className="text-white/75">{TOTAL_CELLS}</span>
              </span>
              <span className="text-white/25">·</span>
              <span>
                beat{" "}
                <span className="text-emerald-300">{playCol + 1}</span>
                <span className="text-white/40">/{COLS}</span>
              </span>
              <span className="text-white/25">·</span>
              <span>
                seed{" "}
                <span className="text-amber-300" style={{ fontSize: "11px" }}>
                  {seed.toString(16).padStart(8, "0")}
                </span>
              </span>
            </div>

            {/* Primary buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={handlePause}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 active:bg-white/20 text-white text-base transition-colors"
              >
                {paused ? "▶ Resume" : "⏸ Pause"}
              </button>
              <button
                onClick={handleNewSeed}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-violet-700/60 hover:bg-violet-600/70 text-white text-base transition-colors"
              >
                New Seed
              </button>
            </div>

            {/* Seed replay */}
            <div className="flex flex-wrap items-center gap-2 justify-center">
              <label htmlFor="seed-in" className="text-white/55 text-base">
                Replay seed:
              </label>
              <input
                id="seed-in"
                type="number"
                value={seed}
                onChange={handleSeedChange}
                min={0}
                max={4294967295}
                className="min-h-[44px] w-36 bg-white/[0.07] border border-white/20 rounded px-2 py-1 text-white/90 font-mono text-base"
              />
              <button
                onClick={handleReplay}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-base transition-colors"
              >
                Replay
              </button>
            </div>

            {/* Speed buttons */}
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <span className="text-white/55 text-base">Solve speed:</span>
              {SOLVE_SPEEDS.map(({ label, ms }) => (
                <button
                  key={ms}
                  onClick={() => handleSpeed(ms)}
                  className={`min-h-[44px] px-4 py-2.5 rounded-lg text-base transition-colors ${
                    solveSpeedMs === ms
                      ? "bg-violet-600 text-white"
                      : "bg-white/10 text-white/75 hover:bg-white/15"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* How it works card */}
        <div className="max-w-2xl w-full rounded-xl bg-white/[0.04] border border-white/10 px-5 py-4 space-y-2">
          <h2 className="text-base font-semibold text-white/90">How it works</h2>
          <p className="text-base text-white/75 leading-relaxed">
            The lattice starts with all 14 D-Dorian tiles (7 scale degrees ×
            2 octaves) possible in every cell. The WFC loop: find the{" "}
            <span className="text-violet-300">lowest-entropy cell</span> →
            collapse it to a weighted-random note → propagate arc-consistency
            (neighbours lose incompatible candidates, shown as a{" "}
            <span className="text-emerald-300">brief glow</span>). Horizontal
            neighbours must move by ≤ 2 diatonic steps; vertical neighbours
            must share diatonic thirds/fourths/fifths. The{" "}
            <span className="text-amber-300/90">playhead</span> sweeps left→right
            sounding each collapsed cell as the score writes itself in real time.
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            {(
              [
                { label: "superposition", swatch: superpositionBg(7),   op: 0.5, glow: "none" },
                { label: "constrained",   swatch: "hsl(260 88% 68%)",    op: 1,   glow: "none" },
                { label: "collapsed",     swatch: "hsl(270 62% 50%)",    op: 1,   glow: "none" },
                { label: "playing",       swatch: "hsl(270 62% 50%)",    op: 1,   glow: "0 0 8px 3px hsl(270 88% 68%)" },
              ] satisfies { label: string; swatch: string; op: number; glow: string }[]
            ).map(({ label, swatch, op, glow }) => (
              <span key={label} className="flex items-center gap-1.5 text-white/55 text-base">
                <span
                  className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                  style={{
                    background: swatch,
                    opacity:    op,
                    boxShadow:  glow,
                  }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
