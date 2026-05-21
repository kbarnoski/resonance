"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SZ = 560;
const N_LISS = 900;   // parametric points per Lissajous frame
const N_MIC  = 2048;  // max time-domain segments for phase portrait

const RATIOS = [
  { a: 1, b: 1, name: "1:1  unison"  },
  { a: 1, b: 2, name: "1:2  octave"  },
  { a: 2, b: 3, name: "2:3  fifth"   },
  { a: 3, b: 4, name: "3:4  fourth"  },
  { a: 3, b: 5, name: "3:5  sixth"   },
  { a: 4, b: 5, name: "4:5  M3rd"    },
  { a: 5, b: 6, name: "5:6  m3rd"    },
];
const SECS_PER = 5; // seconds per ratio in auto-cycle

// 36 stroke colours (one per 10° hue bucket) — pre-built to avoid per-frame alloc
const BUCKET_COL = Array.from(
  { length: 36 },
  (_, i) => `hsla(${i * 10},85%,65%,0.7)`,
);

// ── Render helper ─────────────────────────────────────────────────────────────

/**
 * Paint a 2D trajectory as line segments coloured by direction angle.
 * Segments are batched into 36 Path2D buckets (one per 10° hue band) so only
 * 36 stroke() calls are needed regardless of N.
 */
function paintScope(
  ctx: CanvasRenderingContext2D,
  sz:  number,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  n:  number,
): void {
  const r = sz / 2;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1.5;

  const paths = Array.from({ length: 36 }, () => new Path2D());

  for (let i = 1; i < n; i++) {
    const x0 = (xs[i - 1] + 1) * r;
    const y0 = (1 - ys[i - 1]) * r;  // +Y = up
    const x1 = (xs[i] + 1) * r;
    const y1 = (1 - ys[i]) * r;
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (dx * dx + dy * dy < 0.02) continue;
    const deg = ((Math.atan2(dy, dx) * (180 / Math.PI)) + 180) % 360;
    const b   = Math.floor(deg / 10) % 36;
    paths[b].moveTo(x0, y0);
    paths[b].lineTo(x1, y1);
  }

  for (let b = 0; b < 36; b++) {
    ctx.strokeStyle = BUCKET_COL[b];
    ctx.stroke(paths[b]);
  }
  ctx.globalCompositeOperation = "source-over";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScopePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef   = useRef(0);
  const audioRef  = useRef<{
    ctx:      AudioContext;
    analyser: AnalyserNode;
    timeBuf:  Float32Array;
    stream?:  MediaStream;
  } | null>(null);
  const loopRef = useRef({
    mode:     "idle" as "idle" | "demo" | "mic",
    ratioIdx: 0,
    sec:      0,    // demo auto-cycle clock (seconds)
    delayMs:  20,
    sz:       MAX_SZ,
  });
  const lissX = useRef(new Float32Array(N_LISS));
  const lissY = useRef(new Float32Array(N_LISS));

  const [mode,     setMode]     = useState<"idle" | "demo" | "mic">("idle");
  const [ratioIdx, setRatioIdx] = useState(0);
  const [delayMs,  setDelayMs]  = useState(20);
  const [error,    setError]    = useState<string | null>(null);

  // ── Teardown ─────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    const a = audioRef.current;
    if (a) {
      a.stream?.getTracks().forEach(t => t.stop());
      void a.ctx.close();
      audioRef.current = null;
    }
    loopRef.current.mode = "idle";
    setMode("idle");
  }, []);

  // ── Render loop ───────────────────────────────────────────────────────────────

  const startLoop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      const L  = loopRef.current;
      const sz = L.sz;

      // Slow background fade creates CRT phosphor persistence at slow-moving cusps
      ctx.fillStyle = L.mode === "demo"
        ? "rgba(2,1,16,0.025)"
        : "rgba(2,1,16,0.055)";
      ctx.fillRect(0, 0, sz, sz);

      if (L.mode === "demo") {
        L.sec += 1 / 60;
        const newIdx = Math.floor(
          (L.sec % (SECS_PER * RATIOS.length)) / SECS_PER,
        ) % RATIOS.length;
        if (newIdx !== L.ratioIdx) {
          L.ratioIdx = newIdx;
          setRatioIdx(newIdx);
        }

        const { a, b } = RATIOS[L.ratioIdx];
        // Phase slowly oscillates — figure morphs between open and closed forms
        const phaseOff = Math.PI * 0.5 + Math.sin(L.sec * 0.22) * 0.65;
        const xs = lissX.current;
        const ys = lissY.current;
        for (let i = 0; i < N_LISS; i++) {
          const t = (i / (N_LISS - 1)) * Math.PI * 2 * a;
          xs[i] = Math.sin(t);
          ys[i] = Math.sin(t * (b / a) + phaseOff);
        }
        paintScope(ctx, sz, xs, ys, N_LISS);

      } else if (L.mode === "mic") {
        const audio = audioRef.current;
        if (!audio) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        audio.analyser.getFloatTimeDomainData(audio.timeBuf as any);
        const buf   = audio.timeBuf;
        const delay = Math.round(L.delayMs * audio.ctx.sampleRate / 1000);
        const n     = Math.min(buf.length - delay, N_MIC);
        if (n > 1) {
          paintScope(ctx, sz, buf.subarray(0, n), buf.subarray(delay, delay + n), n);
        }
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Start functions ───────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    stop();
    const L = loopRef.current;
    L.mode = "demo"; L.ratioIdx = 0; L.sec = 0;
    setMode("demo"); setRatioIdx(0); setError(null);
    startLoop();
  }, [stop, startLoop]);

  const startMic = useCallback(async () => {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const actx     = new Ctx();
      const src      = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      const timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      src.connect(analyser);
      audioRef.current = { ctx: actx, analyser, timeBuf, stream };
      loopRef.current.mode = "mic";
      setMode("mic"); setError(null);
      startLoop();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Microphone unavailable. Check permissions.",
      );
    }
  }, [stop, startLoop]);

  // ── Canvas sizing ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = Math.min(window.innerWidth - 32, window.innerHeight - 220, MAX_SZ);
      canvas.width  = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
      canvas.style.width  = `${css}px`;
      canvas.style.height = `${css}px`;
      loopRef.current.sz  = Math.round(css * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => { loopRef.current.delayMs = delayMs; }, [delayMs]);
  useEffect(() => () => stop(), [stop]);

  const ratio = RATIOS[ratioIdx];

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col items-center px-4 pb-6"
      style={{ minHeight: "calc(100vh - 3rem)" }}
    >
      <canvas
        ref={canvasRef}
        className="block mt-4 rounded"
        style={{ background: "#020110" }}
      />

      {/* Idle splash */}
      {mode === "idle" && (
        <div className="flex flex-col items-center text-center mt-10">
          <h1 className="text-2xl md:text-3xl mb-2 tracking-tight">Vectorscope</h1>
          <p className="text-sm text-white/50 max-w-sm mb-8 leading-relaxed">
            Two signals, one against the other. When their frequencies form a musical
            interval, the trace draws a Lissajous figure — the hidden geometry of harmony.
            With mic input, the signal is plotted against its own past: a phase portrait
            of the sound.
          </p>
          <div className="flex gap-4 mb-4">
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Lissajous demo
            </button>
            <button
              onClick={startMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Phase portrait
            </button>
          </div>
          {error && (
            <p className="text-xs text-rose-300/80 mt-1 max-w-sm">{error}</p>
          )}
          <Link
            href="/dream"
            className="mt-8 text-[11px] text-white/30 hover:text-white/60"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* Active controls */}
      {mode !== "idle" && (
        <>
          <div
            className="mt-3 mb-2 text-[11px] tracking-wider"
            style={{ color: "#7ae8ff" }}
          >
            {mode === "demo"
              ? `${ratio.name.toUpperCase()} · LISSAJOUS`
              : `PHASE PORTRAIT · MIC · ${delayMs}ms DELAY`}
          </div>

          {mode === "demo" && (
            <div className="flex flex-wrap gap-2 justify-center mb-3 max-w-lg">
              {RATIOS.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    loopRef.current.ratioIdx = i;
                    loopRef.current.sec = i * SECS_PER;
                    setRatioIdx(i);
                  }}
                  className={`text-[10px] px-2 py-1 rounded border transition ${
                    i === ratioIdx
                      ? "border-cyan-400/60 text-cyan-300 bg-cyan-900/20"
                      : "border-white/10 text-white/35 hover:border-white/30 hover:text-white/60"
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {mode === "mic" && (
            <div className="flex items-center gap-3 mb-3 text-[11px]">
              <span className="text-white/50 tracking-wider">
                DELAY {delayMs}ms
              </span>
              <input
                type="range"
                min="5"
                max="80"
                step="5"
                value={delayMs}
                onChange={e => setDelayMs(+e.target.value)}
                className="w-40 accent-cyan-400"
              />
            </div>
          )}

          <div className="flex items-center gap-4 text-[10px]">
            <button
              onClick={stop}
              className="tracking-wider uppercase text-white/50 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1 rounded transition"
            >
              stop
            </button>
            <Link href="/dream" className="text-white/30 hover:text-white/60">
              ← back
            </Link>
            <a
              href="/dream/20-scope/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-white/20 hover:text-white/50"
            >
              design notes ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
