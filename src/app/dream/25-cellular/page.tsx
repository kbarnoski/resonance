"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Grid dimensions ───────────────────────────────────────────────────────────

const COLS = 64;
const ROWS = 16;

// ── Pitch mapping: C2 (MIDI 36) → C5 (MIDI 72) across 64 columns ─────────────

function colToFreq(col: number): number {
  const midi = 36 + (col / (COLS - 1)) * 36;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToHue(freq: number): number {
  const semitones = 12 * Math.log2(freq / 440);
  return ((semitones * 5 + 3600) % 360);
}

// ── Conway's Life step (toroidal) ─────────────────────────────────────────────

function stepLife(g: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          n += g[((r + dr + ROWS) % ROWS) * COLS + ((c + dc + COLS) % COLS)];
        }
      const alive = g[r * COLS + c];
      next[r * COLS + c] = ((alive && (n === 2 || n === 3)) || (!alive && n === 3)) ? 1 : 0;
    }
  }
  return next;
}

function randomGrid(density = 0.2): Uint8Array<ArrayBuffer> {
  const g = new Uint8Array(ROWS * COLS);
  for (let i = 0; i < g.length; i++) g[i] = Math.random() < density ? 1 : 0;
  return g;
}

// ── Preset patterns (row/col offsets from center) ─────────────────────────────

type Pattern = ReadonlyArray<readonly [number, number]>;

function applyPreset(pat: Pattern): Uint8Array<ArrayBuffer> {
  const g = new Uint8Array(ROWS * COLS);
  const cr = Math.floor(ROWS / 2);
  const cc = Math.floor(COLS / 2);
  for (const [dr, dc] of pat) {
    const r = (cr + dr + ROWS) % ROWS;
    const c = (cc + dc + COLS) % COLS;
    g[r * COLS + c] = 1;
  }
  return g;
}

// Classic glider — translates diagonally, creates repeating 4-note melodic cell
const GLIDER: Pattern = [[0,1],[1,2],[2,0],[2,1],[2,2]];

// Pulsar — period-3 oscillator, strict rhythmic loop
const PULSAR: Pattern = [
  [-6,-4],[-6,-3],[-6,-2],[-6,2],[-6,3],[-6,4],
  [-4,-6],[-4,-1],[-4,1],[-4,6],[-3,-6],[-3,-1],[-3,1],[-3,6],
  [-2,-6],[-2,-1],[-2,1],[-2,6],[-1,-4],[-1,-3],[-1,-2],[-1,2],[-1,3],[-1,4],
  [1,-4],[1,-3],[1,-2],[1,2],[1,3],[1,4],
  [2,-6],[2,-1],[2,1],[2,6],[3,-6],[3,-1],[3,1],[3,6],[4,-6],[4,-1],[4,1],[4,6],
  [6,-4],[6,-3],[6,-2],[6,2],[6,3],[6,4],
];

// Acorn — 7-cell methuselah, stabilizes after 5206 generations
const ACORN: Pattern = [[0,1],[1,3],[2,0],[2,1],[2,4],[2,5],[2,6]];

// R-pentomino — 5-cell methuselah, grows chaotically for 1103 generations
const R_PENT: Pattern = [[0,1],[0,2],[1,0],[1,1],[2,1]];

const PRESETS: Array<[string, Pattern]> = [
  ["Glider", GLIDER],
  ["Pulsar", PULSAR],
  ["Acorn", ACORN],
  ["R-pent", R_PENT],
];

// ── Audio ─────────────────────────────────────────────────────────────────────

function playNote(actx: AudioContext, freq: number, pk: number): void {
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(pk, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.2);
  osc.connect(env).connect(actx.destination);
  osc.start();
  osc.stop(actx.currentTime + 0.2);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CellularPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef   = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(ROWS * COLS));
  const actxRef   = useRef<AudioContext | null>(null);
  const animRef   = useRef(0);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef  = useRef(new Float32Array(COLS));
  const runRef    = useRef(false);
  const bpmRef    = useRef(80);
  const genRef    = useRef(0);
  const dragRef   = useRef<0 | 1>(1);
  const lastIdxRef = useRef(-1);
  const tickFnRef = useRef<() => void>(() => {});

  const [bpm, setBpm] = useState(80);
  const [running, setRunning] = useState(false);
  const [genCount, setGenCount] = useState(0);
  const [pop, setPop] = useState(0);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { runRef.current = running; }, [running]);

  // Tick logic stored in a ref so it's always fresh; updated each render.
  // No deps array → runs after every render; all state via refs (no stale closures).
  useEffect(() => {
    tickFnRef.current = () => {
      if (!runRef.current) return;

      gridRef.current = stepLife(gridRef.current);
      genRef.current += 1;
      setGenCount(genRef.current);

      const colCounts = new Uint8Array(COLS);
      let totalPop = 0;
      let activeCols = 0;
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) colCounts[c] += gridRef.current[r * COLS + c];
        totalPop += colCounts[c];
        if (colCounts[c] > 0) activeCols++;
      }
      setPop(totalPop);

      if (actxRef.current) {
        const volScale = activeCols > 0 ? Math.min(1, 6 / activeCols) : 1;
        for (let c = 0; c < COLS; c++) {
          if (!colCounts[c]) continue;
          const gain = Math.min(0.09, (0.025 + colCounts[c] * 0.012) * volScale);
          playNote(actxRef.current, colToFreq(c), gain);
          flashRef.current[c] = 1.0;
        }
      }

      timerRef.current = setTimeout(() => tickFnRef.current(), 60_000 / bpmRef.current);
    };
  });

  // Canvas rendering loop — runs once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = 1;
    let W = 0;
    let H = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      if (!W || !H) { animRef.current = requestAnimationFrame(draw); return; }

      const cw = W / COLS;
      const ch = H / ROWS;

      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      // Column flash stripes (behind cells)
      for (let c = 0; c < COLS; c++) {
        const f = flashRef.current[c];
        if (f < 0.02) continue;
        const hue = freqToHue(colToFreq(c));
        ctx.fillStyle = `hsla(${hue},85%,65%,${f * 0.07})`;
        ctx.fillRect(c * cw, 0, cw, H);
      }

      // Live cells as radial glow dots
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!gridRef.current[r * COLS + c]) continue;
          const x = (c + 0.5) * cw;
          const y = (r + 0.5) * ch;
          const hue = freqToHue(colToFreq(c));
          const f = flashRef.current[c];
          const rad = Math.min(cw, ch) * 0.58;
          const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
          grd.addColorStop(0,   `hsla(${hue},90%,90%,${0.5 + f * 0.5})`);
          grd.addColorStop(0.5, `hsla(${hue},80%,58%,${0.18 + f * 0.18})`);
          grd.addColorStop(1,   "transparent");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = "source-over";
      for (let c = 0; c < COLS; c++) flashRef.current[c] *= 0.78;

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Cleanup timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Replace the grid and re-sync the ticker
  const applyGrid = useCallback((g: Uint8Array<ArrayBuffer>) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    gridRef.current = g;
    genRef.current = 0;
    flashRef.current.fill(0);
    setGenCount(0);
    let p = 0;
    for (let i = 0; i < g.length; i++) p += g[i];
    setPop(p);
    if (runRef.current) timerRef.current = setTimeout(() => tickFnRef.current(), 60_000 / bpmRef.current);
  }, []);

  function handleStart(): void {
    if (!actxRef.current) {
      type WkAudio = { webkitAudioContext: typeof AudioContext };
      const Ctor: typeof AudioContext =
        window.AudioContext || (window as unknown as WkAudio).webkitAudioContext;
      actxRef.current = new Ctor();
    }
    setRunning(true);
    runRef.current = true;
    timerRef.current = setTimeout(() => tickFnRef.current(), 60_000 / bpmRef.current);
  }

  function handlePause(): void {
    setRunning(false);
    runRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }

  function getCellAt(e: React.MouseEvent<HTMLCanvasElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>): void {
    const idx = getCellAt(e);
    if (idx === -1) return;
    dragRef.current = gridRef.current[idx] ? 0 : 1;
    gridRef.current[idx] = dragRef.current;
    lastIdxRef.current = idx;
    let p = 0;
    for (let i = 0; i < gridRef.current.length; i++) p += gridRef.current[i];
    setPop(p);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (e.buttons === 0) return;
    const idx = getCellAt(e);
    if (idx === -1 || idx === lastIdxRef.current) return;
    gridRef.current[idx] = dragRef.current;
    lastIdxRef.current = idx;
  }

  const btn = (color: string, border: string): React.CSSProperties => ({
    background: "#0a0a0a", border: `1px solid ${border}`, color,
    padding: "4px 10px", borderRadius: "3px", fontSize: "0.68rem",
    fontFamily: "monospace", cursor: "pointer",
  });

  return (
    <div style={{
      background: "#000", height: "100vh", color: "#fff",
      fontFamily: "monospace", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid #111",
        display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flexShrink: 0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "0.9rem", letterSpacing: "0.12em", color: "#ccc" }}>
            CELLULAR
          </h1>
          <p style={{ margin: 0, fontSize: "0.62rem", color: "#444" }}>
            Conway&rsquo;s Life — living cells trigger pitched notes &middot; click/drag to edit
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "0.62rem", color: "#2a2a2a" }}>
            gen {genCount} · {pop} cells
          </span>
          {!running
            ? <button onClick={handleStart} style={btn("#4ade80", "#22553366")}>▶ Start</button>
            : <button onClick={handlePause} style={btn("#f87171", "#55222266")}>⏸ Pause</button>
          }
        </div>
      </div>

      {/* Grid canvas */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, cursor: "crosshair", display: "block", width: "100%", touchAction: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      />

      {/* Controls */}
      <div style={{
        padding: "8px 16px", borderTop: "1px solid #111",
        display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", flexShrink: 0,
      }}>
        <label style={{ fontSize: "0.68rem", color: "#555", display: "flex", gap: "6px", alignItems: "center" }}>
          BPM {bpm}
          <input
            type="range" min={40} max={120} value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            style={{ width: "70px", accentColor: "#444" }}
          />
        </label>
        <span style={{ color: "#1e1e1e", fontSize: "0.65rem" }}>|</span>
        {PRESETS.map(([name, pat]) => (
          <button
            key={name}
            onClick={() => applyGrid(applyPreset(pat))}
            style={btn("#7070cc", "#2244aa44")}
          >
            {name}
          </button>
        ))}
        <button onClick={() => applyGrid(randomGrid())} style={btn("#888", "#33333366")}>
          Random
        </button>
        <button onClick={() => applyGrid(new Uint8Array(ROWS * COLS))} style={btn("#444", "#22222266")}>
          Clear
        </button>
        <span style={{ fontSize: "0.58rem", color: "#1a1a1a", marginLeft: "auto" }}>
          C2 → C5
        </span>
        <Link href="/dream" style={{ fontSize: "0.62rem", color: "#333", textDecoration: "none" }}>
          ← dream
        </Link>
        <Link href="README.md" style={{ fontSize: "0.62rem", color: "#2a2a2a", textDecoration: "none" }}>
          notes
        </Link>
      </div>
    </div>
  );
}
