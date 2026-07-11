"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mulberry32,
  renderWord,
  seedFromLabel,
  VerbalOracleEngine,
  type WordRecipe,
} from "./voice";
import { WORDS } from "./words";

// The Verbal Transformation Effect onset window (Warren 1958): most listeners
// begin to hear the fixed word morph somewhere in roughly this span.
const ONSET_START = 15; // s
const ONSET_END = 40; // s
const TIMELINE_MAX = 70; // s — full width of the little perception timeline

const INK = "#2b2622";
const INK_SOFT = "rgba(43, 38, 34, 0.55)";
const CREAM = "#f4efe6";

type Phase = "idle" | "running";
type Mark = { t: number; kind: "user" | "ghost" };

/** Deterministic illustrative marks placed in the onset zone, so a cold glance
 *  at the timeline reads as populated before the visitor has done anything.
 *  Seeded per word — labelled as illustration, never presented as data. */
function makeGhostMarks(recipe: WordRecipe): Mark[] {
  const rand = mulberry32(seedFromLabel(recipe.label) ^ 0x1125);
  const out: Mark[] = [];
  const span = ONSET_END - ONSET_START;
  for (let i = 0; i < 3; i++) {
    out.push({ t: ONSET_START + rand() * span, kind: "ghost" });
  }
  return out.sort((a, b) => a.t - b.t);
}

export default function VerbalOraclePage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<VerbalOracleEngine | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const peaksRef = useRef<Array<[number, number]>>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const beginCtxTimeRef = useRef<number>(0);
  const wordIdxRef = useRef<number>(0);
  const renderTokenRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  const [supported, setSupported] = useState<boolean>(true);
  const [ready, setReady] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [wordIdx, setWordIdx] = useState<number>(0);
  const [rateHz, setRateHz] = useState<number>(2);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const recipe = WORDS[wordIdx];
  const ghosts = useMemo(() => makeGhostMarks(recipe), [recipe]);

  // ---- compute downsampled waveform peaks for the companion sketch ----
  const computePeaks = useCallback((buf: AudioBuffer) => {
    const data = buf.getChannelData(0);
    const cols = 260;
    const step = Math.max(1, Math.floor(data.length / cols));
    const peaks: Array<[number, number]> = [];
    for (let c = 0; c < cols; c++) {
      let lo = 0;
      let hi = 0;
      const start = c * step;
      for (let i = 0; i < step && start + i < data.length; i++) {
        const v = data[start + i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      peaks.push([lo, hi]);
    }
    peaksRef.current = peaks;
  }, []);

  // ---- render the current word into a fresh click-free buffer ----
  const renderCurrent = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const token = ++renderTokenRef.current;
    setReady(false);
    try {
      const buf = await renderWord(ctx, WORDS[wordIdxRef.current]);
      if (!mountedRef.current || token !== renderTokenRef.current) return;
      bufferRef.current = buf;
      computePeaks(buf);
      engineRef.current?.setBuffer(buf);
      setReady(true);
    } catch {
      if (mountedRef.current) setNotice("Could not synthesize the word.");
    }
  }, [computePeaks]);

  // ---- mount: create the (suspended) context + engine, prime the buffer,
  //      and run the canvas loop. Teardown fully on unmount. ----
  useEffect(() => {
    mountedRef.current = true;
    const AC: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC || typeof OfflineAudioContext === "undefined") {
      setSupported(false);
      return;
    }

    const ctx = new AC();
    ctxRef.current = ctx;
    const engine = new VerbalOracleEngine(ctx);
    engineRef.current = engine;
    engine.setRate(2);
    void renderCurrent();

    const draw = () => {
      drawCompanion(
        canvasRef.current,
        ctx,
        engineRef.current,
        peaksRef.current,
        WORDS[wordIdxRef.current].label,
      );
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      engine.dispose();
      engineRef.current = null;
      bufferRef.current = null;
      void ctx.close().catch(() => {});
      ctxRef.current = null;
    };
    // renderCurrent is stable (memoized); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- word change: re-render + (if running) restart the loop cleanly ----
  const selectWord = useCallback(
    (idx: number) => {
      if (idx === wordIdxRef.current) return;
      wordIdxRef.current = idx;
      setWordIdx(idx);
      setMarks([]);
      const engine = engineRef.current;
      const wasRunning = engine?.running ?? false;
      engine?.stop();
      void renderCurrent().then(() => {
        if (wasRunning && engineRef.current && ctxRef.current) {
          beginCtxTimeRef.current = ctxRef.current.currentTime;
          engineRef.current.start();
        }
      });
    },
    [renderCurrent],
  );

  const begin = useCallback(async () => {
    const ctx = ctxRef.current;
    const engine = engineRef.current;
    if (!ctx || !engine) return;
    try {
      await ctx.resume();
    } catch {
      setNotice("The browser blocked audio playback.");
      return;
    }
    if (!bufferRef.current) await renderCurrent();
    if (!engineRef.current) return;
    beginCtxTimeRef.current = ctx.currentTime;
    engineRef.current.start();
    setPhase("running");
    setNotice(null);
  }, [renderCurrent]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setPhase("idle");
  }, []);

  const onRate = useCallback((hz: number) => {
    setRateHz(hz);
    engineRef.current?.setRate(hz);
  }, []);

  const markNow = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || phase !== "running") return;
    const t = ctx.currentTime - beginCtxTimeRef.current;
    const mark: Mark = { t, kind: "user" };
    setMarks((m) => [...m, mark].slice(-24));
  }, [phase]);

  if (!supported) {
    return (
      <main
        className="min-h-screen w-full px-6 py-16"
        style={{ background: CREAM, color: INK }}
      >
        <div className="mx-auto max-w-xl">
          <h1 className="font-serif text-3xl">The Verbal Oracle</h1>
          <p className="mt-4 text-base text-violet-600">
            This piece needs the Web Audio API, which your browser does not seem
            to support. Try a recent desktop Chrome, Firefox, or Safari with
            headphones.
          </p>
        </div>
      </main>
    );
  }

  const allMarks = [...ghosts, ...marks];

  return (
    <main
      className="min-h-screen w-full px-6 py-14"
      style={{ background: CREAM, color: INK }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
            The Verbal Oracle
          </h1>
          <p className="max-w-prose text-base" style={{ color: INK_SOFT }}>
            One spoken word, looped exactly — put on headphones and listen. After
            twenty-odd seconds your own brain begins to rewrite it into words
            that were never said. Nothing in the sound changes; the change is
            yours. (Warren&rsquo;s <em>Verbal Transformation Effect</em>, 1958.)
          </p>
        </header>

        {/* companion sketch */}
        <canvas
          ref={canvasRef}
          className="w-full rounded-md"
          style={{ aspectRatio: "16 / 7", background: "#efe7d8" }}
        />

        {/* primary controls */}
        <div className="flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              type="button"
              onClick={begin}
              disabled={!ready}
              className="min-h-[44px] rounded-full px-6 py-2.5 text-base font-medium text-foreground transition-opacity disabled:opacity-40"
              style={{ background: INK }}
            >
              {ready ? "Begin" : "Preparing voice…"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-full border px-6 py-2.5 text-base font-medium transition-colors"
              style={{ borderColor: INK, color: INK }}
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={markNow}
            disabled={phase !== "running"}
            className="min-h-[44px] rounded-full border px-5 py-2.5 text-base font-medium transition-opacity disabled:opacity-30"
            style={{ borderColor: INK, color: INK }}
          >
            Mark what you hear now
          </button>
        </div>

        {notice && (
          <p className="text-base font-medium text-violet-600">{notice}</p>
        )}

        {/* word picker */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" style={{ color: INK_SOFT }}>
            The word
          </span>
          <div className="flex flex-wrap gap-2">
            {WORDS.map((w, i) => (
              <button
                key={w.label}
                type="button"
                onClick={() => selectWord(i)}
                className="min-h-[44px] rounded-full border px-5 py-2.5 text-base transition-colors"
                style={{
                  borderColor: INK,
                  background: i === wordIdx ? INK : "transparent",
                  color: i === wordIdx ? CREAM : INK,
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
          <p className="text-sm" style={{ color: INK_SOFT }}>
            Listeners of &ldquo;{recipe.label}&rdquo; often report drifting into:{" "}
            <em>{recipe.alternates.join(", ")}</em>. (Illustrative — your own
            percepts may differ.)
          </p>
        </div>

        {/* loop rate */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="rate"
            className="text-sm font-medium"
            style={{ color: INK_SOFT }}
          >
            Repetition rate — {rateHz.toFixed(1)} per second
          </label>
          <input
            id="rate"
            type="range"
            min={1.2}
            max={3}
            step={0.1}
            value={rateHz}
            onChange={(e) => onRate(parseFloat(e.target.value))}
            className="w-full max-w-sm accent-[#2b2622]"
          />
        </div>

        {/* perception timeline */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" style={{ color: INK_SOFT }}>
            Perception log — the shaded band is the ~15–40 s onset zone
          </span>
          <Timeline marks={allMarks} />
          <p className="text-sm" style={{ color: INK_SOFT }}>
            Hollow marks are a seeded ghost listener (illustration). Filled marks
            are yours — press &ldquo;mark what you hear now&rdquo; the moment the
            word slips into something else.
          </p>
        </div>
      </div>
    </main>
  );
}

/** The perception timeline: a thin ruled line, a shaded onset window, and the
 *  marks. Pure SVG so it stays crisp and cheap. */
function Timeline({ marks }: { marks: Mark[] }) {
  const W = 640;
  const H = 64;
  const pad = 10;
  const x = (t: number) =>
    pad + (Math.min(t, TIMELINE_MAX) / TIMELINE_MAX) * (W - pad * 2);
  const baseY = H - 20;
  const onsetX0 = x(ONSET_START);
  const onsetX1 = x(ONSET_END);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxWidth: "100%" }}
      role="img"
      aria-label="Perception timeline"
    >
      <rect
        x={onsetX0}
        y={8}
        width={onsetX1 - onsetX0}
        height={H - 16}
        fill="rgba(43,38,34,0.08)"
        rx={4}
      />
      <line
        x1={pad}
        y1={baseY}
        x2={W - pad}
        y2={baseY}
        stroke={INK_SOFT}
        strokeWidth={1}
      />
      {[0, 15, 30, 45, 60].map((s) => (
        <g key={s}>
          <line
            x1={x(s)}
            y1={baseY - 3}
            x2={x(s)}
            y2={baseY + 3}
            stroke={INK_SOFT}
            strokeWidth={1}
          />
          <text
            x={x(s)}
            y={baseY + 15}
            fontSize={10}
            fill={INK_SOFT}
            textAnchor="middle"
          >
            {s}s
          </text>
        </g>
      ))}
      {marks.map((m, i) =>
        m.kind === "ghost" ? (
          <circle
            key={`g${i}`}
            cx={x(m.t)}
            cy={baseY - 14}
            r={5}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={1.5}
          />
        ) : (
          <circle
            key={`u${i}`}
            cx={x(m.t)}
            cy={baseY - 14}
            r={5}
            fill={INK}
          />
        ),
      )}
    </svg>
  );
}

/** The restrained ink-on-cream companion: the current word breathing at
 *  centre, a loop-pulse ring that flashes softly each repetition, and a thin
 *  waveform of the actual buffer with a moving playhead. */
function drawCompanion(
  canvas: HTMLCanvasElement | null,
  ctx: AudioContext,
  engine: VerbalOracleEngine | null,
  peaks: Array<[number, number]>,
  label: string,
) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = parent.clientWidth;
  const cssH = cssW * (7 / 16);
  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = W / dpr;
  const h = H / dpr;

  g.clearRect(0, 0, w, h);
  g.fillStyle = "#efe7d8";
  g.fillRect(0, 0, w, h);

  const now = ctx.currentTime;
  const loopStart = engine ? engine.currentLoopStart(now) : null;
  const dur = engine ? engine.bufferDuration : 0;
  let phase = 0; // 0..1 within the buffer's sounding span
  let sounding = false;
  if (loopStart !== null && dur > 0) {
    const dt = now - loopStart;
    if (dt >= 0 && dt <= dur) {
      phase = dt / dur;
      sounding = true;
    }
  }

  const cx = w / 2;
  const cy = h * 0.44;

  // loop-pulse ring: bright at the attack, fading across the syllable
  const flash = sounding ? Math.pow(1 - phase, 1.6) : 0;
  const ringR = h * 0.26 + flash * h * 0.05;
  g.beginPath();
  g.arc(cx, cy, ringR, 0, Math.PI * 2);
  g.strokeStyle = `rgba(43,38,34,${0.12 + flash * 0.5})`;
  g.lineWidth = 1 + flash * 1.5;
  g.stroke();

  // breathing word glyph
  const breath = 1 + Math.sin(now * 1.1) * 0.02 + flash * 0.03;
  g.save();
  g.translate(cx, cy);
  g.scale(breath, breath);
  g.fillStyle = INK;
  g.font = `italic ${Math.round(h * 0.2)}px Georgia, 'Times New Roman', serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.globalAlpha = 0.9;
  g.fillText(label, 0, 0);
  g.restore();
  g.globalAlpha = 1;

  // thin waveform with playhead near the bottom
  if (peaks.length > 0) {
    const wfTop = h * 0.78;
    const wfMid = h * 0.86;
    const wfH = h * 0.13;
    const left = w * 0.12;
    const right = w * 0.88;
    const span = right - left;
    g.strokeStyle = INK_SOFT;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < peaks.length; i++) {
      const px = left + (i / (peaks.length - 1)) * span;
      const [lo, hi] = peaks[i];
      g.moveTo(px, wfMid + lo * wfH);
      g.lineTo(px, wfMid + hi * wfH);
    }
    g.stroke();
    if (sounding) {
      const phx = left + phase * span;
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(phx, wfTop);
      g.lineTo(phx, wfMid + wfH);
      g.stroke();
    }
  }
}
