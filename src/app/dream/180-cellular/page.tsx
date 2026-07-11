"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Grid constants ─────────────────────────────────────────────────────────────
const ROWS = 16;
const COLS = 64;
type Grid = boolean[][];

// ── Pure helpers (no "use" prefix — not hooks) ─────────────────────────────────

function emptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => new Array<boolean>(COLS).fill(false));
}

function randomGrid(density = 0.2): Grid {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => Math.random() < density)
  );
}

function stepLife(g: Grid): Grid {
  const next = emptyGrid();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc]) n++;
        }
      }
      next[r][c] = g[r][c] ? n === 2 || n === 3 : n === 3;
    }
  }
  return next;
}

function colFreq(col: number): number {
  // C2 (65.41 Hz) to C5 (523.25 Hz), log-spaced across 64 columns
  return 65.41 * Math.pow(523.25 / 65.41, col / (COLS - 1));
}

function colHue(col: number): number {
  // violet (270°) at col 0 → red/rose (0°) at col 63, matching 1-live palette
  return Math.round(270 * (1 - col / (COLS - 1)));
}

function parsePattern(str: string): [number, number][] {
  const cells: [number, number][] = [];
  str.split("\n").forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === "#") cells.push([r, c]);
    });
  });
  return cells;
}

function stampPattern(g: Grid, pattern: [number, number][], or: number, oc: number): Grid {
  const next = g.map((row) => [...row]);
  pattern.forEach(([dr, dc]) => {
    const r = or + dr;
    const c = oc + dc;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) next[r][c] = true;
  });
  return next;
}

// ── Classic Life patterns ──────────────────────────────────────────────────────

const GLIDER = parsePattern(".#.\n..#\n###");

const ACORN = parsePattern(".#.....\n...#...\n##..###");

const RPENTOMINO = parsePattern(".##\n##.\n.#.");

const PULSAR = parsePattern(
  [
    "..###...###..",
    ".............",
    "#....#.#....#",
    "#....#.#....#",
    "#....#.#....#",
    "..###...###..",
    ".............",
    "..###...###..",
    "#....#.#....#",
    "#....#.#....#",
    "#....#.#....#",
    ".............",
    "..###...###..",
  ].join("\n")
);

// ── Audio ──────────────────────────────────────────────────────────────────────

function fireNotes(ctx: AudioContext, dest: AudioNode, activeCols: Set<number>) {
  if (activeCols.size === 0) return;
  // 1/√n perceptual normalization keeps perceived loudness roughly constant
  const gain = Math.min(0.18, 0.6 / Math.sqrt(activeCols.size));
  const now = ctx.currentTime;
  activeCols.forEach((c) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = colFreq(c);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(env);
    env.connect(dest);
    osc.start(now);
    osc.stop(now + 0.26);
  });
}

// ── Canvas rendering ───────────────────────────────────────────────────────────

function renderCanvas(
  canvas: HTMLCanvasElement,
  grid: Grid,
  activeCols: Set<number>,
  flashAlpha: number
) {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return;
  const W = canvas.width;
  const H = canvas.height;
  const cw = W / COLS;
  const rh = H / ROWS;
  const radius = Math.min(cw, rh) * 0.38;

  // Background
  ctx2d.globalCompositeOperation = "source-over";
  ctx2d.fillStyle = "#06060f";
  ctx2d.fillRect(0, 0, W, H);

  // Column flash on tick
  if (flashAlpha > 0.02) {
    activeCols.forEach((c) => {
      const hue = colHue(c);
      ctx2d.fillStyle = `hsla(${hue},80%,55%,${(flashAlpha * 0.11).toFixed(3)})`;
      ctx2d.fillRect(c * cw, 0, cw, H);
    });
  }

  // Grid lines
  ctx2d.strokeStyle = "rgba(255,255,255,0.05)";
  ctx2d.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx2d.beginPath();
    ctx2d.moveTo(c * cw, 0);
    ctx2d.lineTo(c * cw, H);
    ctx2d.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx2d.beginPath();
    ctx2d.moveTo(0, r * rh);
    ctx2d.lineTo(W, r * rh);
    ctx2d.stroke();
  }

  // Alive cells — screen compositing for glow
  ctx2d.globalCompositeOperation = "screen";
  ctx2d.shadowBlur = 8;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!grid[r][c]) continue;
      const x = c * cw + cw / 2;
      const y = r * rh + rh / 2;
      const hue = colHue(c);
      ctx2d.shadowColor = `hsl(${hue},90%,65%)`;
      ctx2d.fillStyle = `hsla(${hue},85%,68%,0.85)`;
      ctx2d.beginPath();
      ctx2d.arc(x, y, radius, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }
  ctx2d.shadowBlur = 0;
  ctx2d.globalCompositeOperation = "source-over";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CellularPage() {
  const [paused, setPaused] = useState(false);
  const [bpm, setBpm] = useState(72);
  const [gen, setGen] = useState(0);
  const [voices, setVoices] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destNodeRef = useRef<AudioNode | null>(null);
  const gridRef = useRef<Grid>(randomGrid());
  const pausedRef = useRef(false);
  const bpmRef = useRef(72);
  const genCountRef = useRef(0);
  const flashRef = useRef<{ cols: Set<number>; alpha: number }>({ cols: new Set(), alpha: 0 });
  const tickIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number>(0);
  const pointerDownRef = useRef(false);
  const drawValueRef = useRef(true);

  // Sync mutable refs with state so the timer closure always reads current values
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  // Create AudioContext + compressor on first user gesture
  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 8;
      comp.connect(ctx.destination);
      audioCtxRef.current = ctx;
      destNodeRef.current = comp;
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
  };

  // Life tick loop (setInterval-style via recursive setTimeout)
  useEffect(() => {
    const tick = () => {
      const interval = (60 / bpmRef.current) * 1000;

      if (!pausedRef.current) {
        const next = stepLife(gridRef.current);
        gridRef.current = next;
        genCountRef.current += 1;

        // Find columns with at least one live cell
        const activeCols = new Set<number>();
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            if (next[r][c]) { activeCols.add(c); break; }
          }
        }

        // Fire notes
        if (audioCtxRef.current && destNodeRef.current && activeCols.size > 0) {
          fireNotes(audioCtxRef.current, destNodeRef.current, activeCols);
        }

        flashRef.current = { cols: activeCols, alpha: 1 };
        setGen(genCountRef.current);
        setVoices(activeCols.size);
      }

      tickIdRef.current = setTimeout(tick, interval);
    };

    tickIdRef.current = setTimeout(tick, (60 / bpmRef.current) * 1000);
    return () => { if (tickIdRef.current) clearTimeout(tickIdRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas RAF draw loop + ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applySize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(canvas);

    const loop = () => {
      const f = flashRef.current;
      renderCanvas(canvas, gridRef.current, f.cols, f.alpha);
      if (f.alpha > 0.01) flashRef.current = { cols: f.cols, alpha: f.alpha * 0.84 };
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  // Pointer interaction — click/drag to draw or erase cells
  const getCellFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - rect.left) / rect.width) * COLS)));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)));
    return { row, col };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ensureAudio();
    pointerDownRef.current = true;
    const { row, col } = getCellFromPointer(e);
    drawValueRef.current = !gridRef.current[row][col];
    const next = gridRef.current.map((r) => [...r]);
    next[row][col] = drawValueRef.current;
    gridRef.current = next;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerDownRef.current) return;
    const { row, col } = getCellFromPointer(e);
    if (gridRef.current[row][col] === drawValueRef.current) return;
    const next = gridRef.current.map((r) => [...r]);
    next[row][col] = drawValueRef.current;
    gridRef.current = next;
  };

  const handlePointerUp = () => { pointerDownRef.current = false; };

  // Preset loader
  const applyPreset = (name: string) => {
    ensureAudio();
    let g = emptyGrid();
    if (name === "glider") g = stampPattern(g, GLIDER, 3, 2);
    else if (name === "pulsar") g = stampPattern(g, PULSAR, 2, 25);
    else if (name === "acorn") g = stampPattern(g, ACORN, 7, 28);
    else if (name === "rpent") g = stampPattern(g, RPENTOMINO, 7, 31);
    gridRef.current = g;
    genCountRef.current = 0;
    setGen(0);
    setVoices(0);
  };

  return (
    <div className="relative w-screen h-screen bg-[#06060f] overflow-hidden select-none">

      {/* Full-screen interactive canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Title overlay (below dream header) */}
      <div className="absolute top-16 left-4 z-10 pointer-events-none">
        <h1 className="text-2xl font-mono font-bold text-foreground">Cellular</h1>
        <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
          Conway Life · columns are pitches · evolution composes
        </p>
      </div>

      {/* Gen + voice counter (top-right) */}
      <div className="absolute top-16 right-4 z-10 pointer-events-none text-right">
        <p className="text-xs text-muted-foreground font-mono">gen {gen}</p>
        <p className="text-xs text-muted-foreground font-mono">{voices} voices</p>
      </div>

      {/* Controls (bottom bar) */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3 flex flex-wrap items-center gap-2 bg-[#06060f]/80 backdrop-blur-sm border-t border-border">

        <button
          onClick={() => { ensureAudio(); setPaused((p) => !p); }}
          className="min-h-[44px] px-4 py-2.5 rounded bg-violet-500/20 text-violet-300 text-base font-mono hover:bg-violet-500/30 transition-colors"
        >
          {paused ? "▶ Play" : "⏸ Pause"}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">BPM</span>
          <input
            type="range"
            min={40}
            max={120}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-20 accent-violet-400"
          />
          <span className="text-base text-muted-foreground font-mono w-7 text-right tabular-nums">{bpm}</span>
        </div>

        <span className="hidden sm:block text-muted-foreground/70 font-mono">|</span>

        {(["glider", "pulsar", "acorn", "rpent"] as const).map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="min-h-[44px] px-3 py-2 rounded bg-muted text-muted-foreground text-sm font-mono hover:bg-accent transition-colors"
          >
            {name === "rpent" ? "R-pent" : name.charAt(0).toUpperCase() + name.slice(1)}
          </button>
        ))}

        <button
          onClick={() => {
            ensureAudio();
            gridRef.current = randomGrid();
            genCountRef.current = 0;
            setGen(0);
            setVoices(0);
          }}
          className="min-h-[44px] px-3 py-2 rounded bg-violet-500/10 text-violet-300/95 text-sm font-mono hover:bg-violet-500/20 transition-colors"
        >
          Random
        </button>

        <button
          onClick={() => {
            gridRef.current = emptyGrid();
            genCountRef.current = 0;
            setGen(0);
            setVoices(0);
          }}
          className="min-h-[44px] px-3 py-2 rounded bg-muted text-muted-foreground text-sm font-mono hover:bg-accent transition-colors"
        >
          Clear
        </button>

        <Link
          href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/180-cellular/README.md"
          target="_blank"
          className="ml-auto text-xs text-muted-foreground/70 font-mono hover:text-muted-foreground transition-colors"
        >
          design notes ↗
        </Link>
      </div>
    </div>
  );
}
