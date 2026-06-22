"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FREQ_BINS,
  ROWS,
  TIME_COLS,
  attachMic,
  applyColumnToBank,
  captureColumn,
  disposeEngine,
  makeEngine,
  rampMaster,
  startDemoSound,
  type EngineHandles,
  type SourceKind,
} from "./audio";
import {
  applyBrush,
  applySmear,
  applyTimeBlur,
  copyBuffer,
  drawSpectrogram,
  makeBuffer,
  rollIn,
} from "./render";

type Tool = "smear" | "raise" | "lower";

export default function SpectralLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const engRef = useRef<EngineHandles | null>(null);

  // matrices
  const rollingRef = useRef<Float32Array[]>(makeBuffer());
  const frozenRef = useRef<Float32Array[]>(makeBuffer());
  const colScratchRef = useRef<Float32Array>(new Float32Array(ROWS));
  const byteScratchRef = useRef<Uint8Array<ArrayBuffer>>(
    new Uint8Array(FREQ_BINS)
  );

  // demo-spectrogram synthesis time (so canvas is never blank before start)
  const demoTRef = useRef(0);

  // pointer/edit state held in refs (read inside rAF)
  const frozenStateRef = useRef(false);
  const scrubRef = useRef(0); // 0..TIME_COLS-1
  const loopRef = useRef(true);
  const stretchRef = useRef(0); // 0..1
  const toolRef = useRef<Tool>("raise");
  const brushRadiusRef = useRef(10);
  const pointerRef = useRef<{
    down: boolean;
    col: number;
    row: number;
    prevCol: number;
  } | null>(null);
  const brushRingRef = useRef<{ x: number; y: number; r: number } | null>(null);

  // ── React UI state ──
  const [started, setStarted] = useState(false);
  const [source, setSource] = useState<SourceKind | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [tool, setTool] = useState<Tool>("raise");
  const [loop, setLoop] = useState(true);
  const [stretch, setStretch] = useState(0);
  const [brushRadius, setBrushRadius] = useState(10);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [canvasOk, setCanvasOk] = useState(true);

  // keep refs in sync with UI
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);
  useEffect(() => {
    stretchRef.current = stretch;
  }, [stretch]);
  useEffect(() => {
    brushRadiusRef.current = brushRadius;
  }, [brushRadius]);
  useEffect(() => {
    frozenStateRef.current = frozen;
  }, [frozen]);

  // ── synthesize an evolving demo spectrogram column (visual only, pre-start)
  const makeDemoVisualColumn = useCallback((t: number, out: Float32Array) => {
    out.fill(0);
    const partials = [10, 22, 30, 44, 60, 78, 96];
    for (let i = 0; i < partials.length; i++) {
      const base = partials[i];
      const pres = 0.5 + 0.5 * Math.sin(t * (0.5 + i * 0.13) + i);
      if (pres < 0.35) continue;
      const center = base + 6 * Math.sin(t * (0.2 + i * 0.05));
      for (let r = 0; r < ROWS; r++) {
        const d = r - center;
        out[r] += pres * Math.exp(-(d * d) / 8);
      }
    }
    // airy noise band sweeping
    const nb = 70 + 30 * Math.sin(t * 0.3);
    for (let r = 0; r < ROWS; r++) {
      const d = r - nb;
      out[r] += 0.25 * Math.random() * Math.exp(-(d * d) / 200);
    }
    for (let r = 0; r < ROWS; r++) out[r] = Math.min(1, out[r]);
  }, []);

  // ── main render + audio loop ──
  const frame = useCallback(() => {
    const canvas = canvasRef.current;
    const eng = engRef.current;
    const rolling = rollingRef.current;
    const frozenBuf = frozenRef.current;
    const isFrozen = frozenStateRef.current;

    // advance the buffer
    if (!isFrozen) {
      const col = colScratchRef.current;
      if (eng && started) {
        captureColumn(eng.analyser, byteScratchRef.current, col);
      } else {
        // pre-start / no-engine: animate demo spectrogram so canvas is alive
        demoTRef.current += 0.05;
        makeDemoVisualColumn(demoTRef.current, col);
      }
      rollIn(rolling, col);
    } else {
      // frozen: apply per-frame time-blur (freeze-stretch)
      if (stretchRef.current > 0) {
        applyTimeBlur(frozenBuf, stretchRef.current);
      }
      // advance scrub head
      const speed = 0.9;
      scrubRef.current += speed;
      if (scrubRef.current >= TIME_COLS) {
        scrubRef.current = loopRef.current ? 0 : TIME_COLS - 1;
      }
    }

    // resynth from the column under the scrub head (only when frozen + audio)
    if (eng && started && isFrozen) {
      const sc = Math.max(0, Math.min(TIME_COLS - 1, Math.floor(scrubRef.current)));
      const gateOpen =
        !loopRef.current || scrubRef.current < TIME_COLS - 1;
      applyColumnToBank(eng, frozenBuf[sc], 1, gateOpen);
    } else if (eng && started) {
      // not frozen: keep bank silent, listen-through is the analyser source
      applyColumnToBank(eng, colScratchRef.current, 0, false);
    }

    // draw
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const buf = isFrozen ? frozenBuf : rolling;
        drawSpectrogram(ctx, buf, canvas.width, canvas.height, {
          scrubCol: isFrozen ? scrubRef.current : -1,
          frozen: isFrozen,
          brush: brushRingRef.current,
          loop: loopRef.current,
        });
      }
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [started, makeDemoVisualColumn]);

  // start the rAF loop once on mount; check canvas support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCanvasOk(false);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [frame]);

  // teardown engine on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (engRef.current) {
        disposeEngine(engRef.current);
        engRef.current = null;
      }
    };
  }, []);

  // ── start with mic ──
  const startMic = useCallback(async () => {
    setAudioError(null);
    setNotice(null);
    try {
      const eng = makeEngine();
      await eng.ctx.resume();
      engRef.current = eng;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        attachMic(eng, stream);
        rampMaster(eng, 0.9);
        setSource("mic");
        setStarted(true);
      } catch {
        setNotice(
          "Microphone unavailable or denied — use the demo sound to drive the same pipeline."
        );
        // keep engine; user can press demo
        rampMaster(eng, 0.9);
      }
    } catch {
      setAudioError("Audio engine could not start. Visuals keep running.");
    }
  }, []);

  // ── start with demo sound ──
  const startDemo = useCallback(async () => {
    setAudioError(null);
    try {
      let eng = engRef.current;
      if (!eng) {
        eng = makeEngine();
        engRef.current = eng;
      }
      await eng.ctx.resume();
      if (eng.demoStop) eng.demoStop();
      startDemoSound(eng);
      rampMaster(eng, 0.9);
      setSource("demo");
      setNotice(null);
      setStarted(true);
    } catch {
      setAudioError("Audio engine could not start. Visuals keep running.");
    }
  }, []);

  // ── freeze / unfreeze ──
  const doFreeze = useCallback(() => {
    copyBuffer(rollingRef.current, frozenRef.current);
    scrubRef.current = 0;
    setFrozen(true);
  }, []);
  const doUnfreeze = useCallback(() => {
    setFrozen(false);
  }, []);

  // ── pointer → matrix coordinates ──
  const eventToCell = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const col = Math.max(0, Math.min(TIME_COLS - 1, fx * (TIME_COLS - 1)));
    // canvas y is flipped (top = high freq)
    const row = Math.max(0, Math.min(ROWS - 1, (1 - fy) * (ROWS - 1)));
    return { col, row };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!frozenStateRef.current) return;
      const cell = eventToCell(e);
      if (!cell) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerRef.current = {
        down: true,
        col: cell.col,
        row: cell.row,
        prevCol: cell.col,
      };
      // single tap edits immediately
      const r = brushRadiusRef.current;
      if (toolRef.current === "raise") applyBrush(frozenRef.current, cell.col, cell.row, r, 0.18);
      else if (toolRef.current === "lower") applyBrush(frozenRef.current, cell.col, cell.row, r, -0.22);
      brushRingRef.current = { x: cell.col, y: cell.row, r };
    },
    [eventToCell]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cell = eventToCell(e);
      if (!cell) return;
      brushRingRef.current = { x: cell.col, y: cell.row, r: brushRadiusRef.current };
      const p = pointerRef.current;
      if (!p || !p.down || !frozenStateRef.current) return;
      const r = brushRadiusRef.current;
      const tool = toolRef.current;
      if (tool === "raise") {
        applyBrush(frozenRef.current, cell.col, cell.row, r, 0.12);
      } else if (tool === "lower") {
        applyBrush(frozenRef.current, cell.col, cell.row, r, -0.16);
      } else {
        const dir = cell.col - p.prevCol;
        if (dir !== 0) applySmear(frozenRef.current, cell.col, cell.row, r, dir);
      }
      p.col = cell.col;
      p.row = cell.row;
      p.prevCol = cell.col;
    },
    [eventToCell]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerRef.current) pointerRef.current.down = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    []
  );

  const onPointerLeave = useCallback(() => {
    brushRingRef.current = null;
  }, []);

  const toolBtn = (t: Tool, label: string, accent: string) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      className={`min-h-[44px] rounded-md px-4 py-2.5 text-base font-medium transition-colors ${
        tool === t
          ? `bg-white/10 ${accent} ring-1 ring-white/20`
          : "text-white/75 hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="min-h-screen bg-[#04050a] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <h1 className="font-serif text-2xl text-white/95 sm:text-3xl">
            Spectral Loom
          </h1>
          <p className="mt-2 text-base text-white/75">
            Freeze your live sound as a spectrogram image, then paint the
            picture — smear it, brush energy in and out — and hear the picture
            you painted.
          </p>
        </header>

        {/* canvas */}
        <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
          <canvas
            ref={canvasRef}
            width={TIME_COLS * 4}
            height={ROWS * 4}
            className="block w-full touch-none"
            style={{ aspectRatio: `${TIME_COLS} / ${ROWS}`, imageRendering: "pixelated" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
          {!canvasOk && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-base text-rose-300">
              Canvas2D is unavailable in this browser — the spectral instrument
              needs it to render.
            </div>
          )}
          {!frozen && started && (
            <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white/70">
              LIVE · {source === "mic" ? "mic" : "demo"} — make a sound, then ❄ Freeze
            </div>
          )}
          {frozen && (
            <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 font-mono text-xs text-violet-300">
              FROZEN · paint the image — scrub head re-synthesizes it
            </div>
          )}
        </div>

        {/* notices */}
        {notice && (
          <p className="mt-3 text-base text-rose-300">{notice}</p>
        )}
        {audioError && (
          <p className="mt-2 text-base text-rose-300">{audioError}</p>
        )}

        {/* controls */}
        {!started ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={startMic}
              className="min-h-[44px] rounded-md bg-violet-500/90 px-4 py-2.5 text-base font-semibold text-white shadow hover:bg-violet-500"
            >
              Start mic
            </button>
            <button
              type="button"
              onClick={startDemo}
              className="min-h-[44px] rounded-md border border-white/15 px-4 py-2.5 text-base font-medium text-white/85 hover:bg-white/[0.06]"
            >
              Use demo sound
            </button>
            <span className="text-base text-white/55">
              The canvas is already alive — audio is gesture-gated.
            </span>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* freeze / scrub row */}
            <div className="flex flex-wrap items-center gap-3">
              {!frozen ? (
                <button
                  type="button"
                  onClick={doFreeze}
                  className="min-h-[44px] rounded-md bg-cyan-500/90 px-4 py-2.5 text-base font-semibold text-black hover:bg-cyan-400"
                >
                  ❄ Freeze
                </button>
              ) : (
                <button
                  type="button"
                  onClick={doUnfreeze}
                  className="min-h-[44px] rounded-md border border-white/15 px-4 py-2.5 text-base font-medium text-white/85 hover:bg-white/[0.06]"
                >
                  ↺ Back to live
                </button>
              )}
              <button
                type="button"
                onClick={() => setLoop((v) => !v)}
                disabled={!frozen}
                className={`min-h-[44px] rounded-md px-4 py-2.5 text-base font-medium transition-colors disabled:opacity-40 ${
                  loop
                    ? "bg-white/10 text-emerald-300/95 ring-1 ring-white/20"
                    : "text-white/75 hover:bg-white/[0.06]"
                }`}
              >
                {loop ? "Loop: on" : "Loop: off"}
              </button>
              {source === "mic" && (
                <button
                  type="button"
                  onClick={startDemo}
                  className="min-h-[44px] rounded-md border border-white/10 px-4 py-2.5 text-base text-white/65 hover:bg-white/[0.06]"
                >
                  Switch to demo sound
                </button>
              )}
            </div>

            {/* tools */}
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-[0.18em] text-white/55">
                Brush (paint the frozen image)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {toolBtn("raise", "Raise +", "text-emerald-300/95")}
                {toolBtn("lower", "Lower −", "text-amber-300/95")}
                {toolBtn("smear", "Smear ↔", "text-violet-300")}
                <label className="ml-2 flex items-center gap-2 text-base text-white/75">
                  Size
                  <input
                    type="range"
                    min={3}
                    max={28}
                    value={brushRadius}
                    onChange={(e) => setBrushRadius(Number(e.target.value))}
                    className="accent-violet-400"
                  />
                </label>
              </div>
            </div>

            {/* freeze-stretch slider */}
            <label className="flex items-center gap-3 text-base text-white/75">
              <span className="min-w-[8.5rem]">Freeze-stretch</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(stretch * 100)}
                onChange={(e) => setStretch(Number(e.target.value) / 100)}
                disabled={!frozen}
                className="flex-1 accent-cyan-400 disabled:opacity-40"
              />
              <span className="w-12 text-right font-mono text-sm text-white/55">
                {Math.round(stretch * 100)}%
              </span>
            </label>

            <p className="text-base text-white/55">
              {frozen
                ? "Drag on the image to paint. The bright scrub line sweeps the frozen frame and an additive bank sings the column under it."
                : "Make a sound — sing, hum, whistle, clap — then press ❄ Freeze to hold the picture and paint it."}
            </p>
          </div>
        )}

        {/* design notes */}
        <details className="mt-6 text-sm text-white/55">
          <summary className="cursor-pointer text-white/70 hover:text-white/90">
            Read the design notes
          </summary>
          <p className="mt-2 leading-relaxed">
            Spectral Loom treats the spectrogram as an editable magnitude image
            (after J.-F. Charles, &ldquo;A Tutorial on Spectral Sound Processing,&rdquo;
            CMJ 32:3, 2008) and resynthesizes it with a capped additive
            oscillator bank. Aesthetic kinship: Ryoji Ikeda&rsquo;s clinical
            data-spectral visuals. Full notes in this prototype&rsquo;s README.
          </p>
        </details>
      </div>
    </main>
  );
}
