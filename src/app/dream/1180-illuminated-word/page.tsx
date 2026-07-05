"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { buildScore, DEFAULT_TEXT, type Glyph, type Score } from "./manuscript";
import { isAudioSupported, startEngine, type Engine } from "./audio";

type Status = "idle" | "playing" | "complete" | "unsupported" | "error";

// ----- palette (bright illuminated vellum) -----------------------------------
const PARCH_TOP = "#f6ecce";
const PARCH_BOT = "#e7d3a3";
const INK = "#33261a"; // iron-gall brown-black
const INK_GHOST = "#c3b083"; // not-yet-sung text, faint on the parchment
const GOLD = "#c99a2e";
const GOLD_BRIGHT = "#e7c14e";
const LAPIS = "#274a86";
const VERMILION = "#b3341f";
const VINE = "#5c7a3c";

export default function IlluminatedWordPage() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [status, setStatus] = useState<Status>("idle");
  const [score, setScore] = useState<Score>(() => buildScore(DEFAULT_TEXT));
  const [litCount, setLitCount] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [reduced, setReduced] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number | null>(null);

  // feature detection + reduced-motion (client only)
  useEffect(() => {
    if (!isAudioSupported()) setStatus("unsupported");
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const stopPlayback = useCallback((mode: "reset" | "complete") => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    engineRef.current?.stop();
    engineRef.current = null;
    setCurrentIdx(-1);
    if (mode === "complete") {
      setStatus("complete"); // leave the page fully gilded
    } else {
      setStatus("idle");
      setLitCount(0);
    }
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const begin = useCallback(() => {
    if (status === "unsupported") return;
    // always stop any running instance first
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    engineRef.current?.stop();
    engineRef.current = null;

    const nextScore = buildScore(text.trim() ? text : DEFAULT_TEXT);
    setScore(nextScore);
    setLitCount(0);
    setCurrentIdx(-1);

    const engine = startEngine(nextScore);
    if (!engine) {
      setStatus("error");
      return;
    }
    engineRef.current = engine;
    setStatus("playing");

    const glyphs = nextScore.glyphs;
    const tick = () => {
      const eng = engineRef.current;
      if (!eng) return;
      const elapsed = eng.ctx.currentTime - eng.startTime;

      // glyphs are in start-time order -> lit count is the count with start<=elapsed
      let lit = 0;
      let cur = -1;
      for (let k = 0; k < glyphs.length; k++) {
        if (glyphs[k].start <= elapsed) {
          lit = k + 1;
          if (glyphs[k].kind === "letter" && elapsed - glyphs[k].start < 0.42) cur = k;
        } else break;
      }
      setLitCount(lit);
      setCurrentIdx(cur);

      if (elapsed >= nextScore.totalDuration) {
        setLitCount(glyphs.length);
        stopPlayback("complete");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [status, text, stopPlayback]);

  const isPlaying = status === "playing";
  const progress = score.glyphs.length ? litCount / score.glyphs.length : 0;

  return (
    <main className="min-h-screen w-full bg-[#241a12] px-4 py-8 text-amber-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-amber-100 sm:text-3xl">
            Illuminated Word
          </h1>
          <p className="text-base text-amber-100/90">
            Type any name, line, or short poem and hear it become an illuminated
            hymn — a gospel-book page that sings itself into being, letter by
            gilded letter.
          </p>
        </header>

        <ManuscriptSVG
          score={score}
          litCount={litCount}
          currentIdx={currentIdx}
          progress={progress}
          reduced={reduced}
        />

        <div className="flex flex-col gap-3">
          <label htmlFor="verse" className="text-base font-medium text-amber-100/90">
            Your verse
          </label>
          <textarea
            id="verse"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={220}
            spellCheck={false}
            placeholder={DEFAULT_TEXT}
            className="w-full resize-none rounded-lg border border-amber-200/25 bg-[#f6ecce] px-4 py-3 text-base text-[#33261a] placeholder-[#33261a]/45 shadow-inner outline-none focus:border-amber-300/70"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={isPlaying ? () => stopPlayback("reset") : begin}
              disabled={status === "unsupported"}
              className="rounded-full bg-[#c99a2e] px-6 py-2.5 text-base font-semibold text-[#2a1e10] shadow transition-colors hover:bg-[#e7c14e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlaying ? "Stop" : "Begin"}
            </button>
            <span className="text-base text-amber-100/70" aria-live="polite">
              {statusLabel(status, progress)}
            </span>
          </div>

          {status === "unsupported" && (
            <p className="text-base text-rose-300">
              Web Audio is not available in this browser, so the hymn cannot be
              sung. The manuscript still lays out your text above.
            </p>
          )}
          {status === "error" && (
            <p className="text-base text-rose-300">
              The audio engine could not start. Try tapping Begin again.
            </p>
          )}
        </div>

        <section className="rounded-lg border border-amber-200/15 bg-black/20 p-4 text-base text-amber-100/80">
          <h2 className="mb-1 text-lg font-semibold text-amber-100">How it works</h2>
          <p>
            Each letter is a scale degree of D&nbsp;Dorian over a soft drone.
            Vowels are sustained choir tones, consonants are short plucked
            strikes, spaces are breaths, and a period resolves the phrase onto
            the tonic. Capitals lift an octave and every phrase traces a gentle
            rise-and-resolve arc — so the gilding you see and the notes you hear
            are locked to the same clock.
          </p>
        </section>
      </div>

      <PrototypeNav slugs={[]} />
    </main>
  );
}

function statusLabel(status: Status, progress: number): string {
  switch (status) {
    case "playing":
      return `illuminating… ${Math.round(progress * 100)}%`;
    case "complete":
      return "the page is complete — tap Begin to sing it again";
    case "idle":
      return "tap Begin to hear your verse";
    case "unsupported":
      return "audio unavailable";
    case "error":
      return "audio error";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// The illuminated manuscript, rendered as inline SVG.
// ---------------------------------------------------------------------------
function ManuscriptSVG({
  score,
  litCount,
  currentIdx,
  progress,
  reduced,
}: {
  score: Score;
  litCount: number;
  currentIdx: number;
  progress: number;
  reduced: boolean;
}) {
  const { viewW, viewH, glyphs } = score;

  // decorative marginalia vines that "grow" as the reading progresses
  const vines = useMemo(() => buildVines(viewW, viewH), [viewW, viewH]);
  const DASH = 2400;

  return (
    <div className="overflow-x-auto rounded-xl border border-amber-900/30 shadow-lg">
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        width="100%"
        role="img"
        aria-label="An illuminated manuscript page of your verse"
        style={{ display: "block", background: PARCH_TOP }}
        className={reduced ? "" : "iw-breathe"}
      >
        <defs>
          <linearGradient id="iw-parch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={PARCH_TOP} />
            <stop offset="1" stopColor={PARCH_BOT} />
          </linearGradient>
          <radialGradient id="iw-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={GOLD_BRIGHT} stopOpacity="0.55" />
            <stop offset="1" stopColor={GOLD_BRIGHT} stopOpacity="0" />
          </radialGradient>
          <filter id="iw-vellum" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0 0.15  0 0 0 0.05 0" />
          </filter>
          <filter id="iw-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* parchment ground + grain + ruled border */}
        <rect x="0" y="0" width={viewW} height={viewH} fill="url(#iw-parch)" />
        <rect x="0" y="0" width={viewW} height={viewH} filter="url(#iw-vellum)" />
        <rect
          x="16"
          y="16"
          width={viewW - 32}
          height={viewH - 32}
          fill="none"
          stroke={LAPIS}
          strokeOpacity="0.35"
          strokeWidth="2"
          rx="6"
        />
        <rect
          x="22"
          y="22"
          width={viewW - 44}
          height={viewH - 44}
          fill="none"
          stroke={VERMILION}
          strokeOpacity="0.3"
          strokeWidth="1"
          rx="4"
        />

        {/* growing marginalia vines */}
        {vines.map((v, k) => (
          <g key={`vine-${k}`}>
            <path
              d={v.d}
              fill="none"
              stroke={VINE}
              strokeOpacity="0.75"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray={DASH}
              strokeDashoffset={DASH * (1 - clamp01(progress * 1.05))}
              style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
            />
            {v.leaves.map((lf, li) => {
              const shown = progress >= lf.at;
              return (
                <circle
                  key={`leaf-${k}-${li}`}
                  cx={lf.x}
                  cy={lf.y}
                  r={shown ? lf.r : 0}
                  fill={li % 2 === 0 ? GOLD : VERMILION}
                  opacity={shown ? 0.9 : 0}
                  style={{ transition: "r 0.5s ease-out, opacity 0.5s ease-out" }}
                />
              );
            })}
          </g>
        ))}

        {/* drop-cap decorative block */}
        <DropCapDecoration score={score} lit={litCount > 0} reduced={reduced} />

        {/* the flowing text */}
        {glyphs.map((g) => {
          if (g.kind === "space" || g.kind === "newline") return null;
          if (g.isDropCap) {
            return (
              <text
                key={g.i}
                x={g.x}
                y={g.y}
                fontSize={g.size}
                fontFamily="Georgia, 'Times New Roman', serif"
                fontWeight={700}
                fill={litCount > 0 ? GOLD : INK_GHOST}
                style={{ transition: "fill 0.6s ease-out" }}
              >
                {g.ch.toUpperCase()}
              </text>
            );
          }
          return (
            <FlowGlyph
              key={g.i}
              g={g}
              lit={g.i < litCount}
              current={g.i === currentIdx}
              reduced={reduced}
            />
          );
        })}
      </svg>

      <style>{`
        .iw-breathe { animation: iw-breathe 7s ease-in-out infinite; }
        @keyframes iw-breathe {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.04); }
        }
        @keyframes iw-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.8; }
        }
        @media (prefers-reduced-motion: reduce) {
          .iw-breathe { animation: none; }
        }
      `}</style>
    </div>
  );
}

function FlowGlyph({
  g,
  lit,
  current,
  reduced,
}: {
  g: Glyph;
  lit: boolean;
  current: boolean;
  reduced: boolean;
}) {
  const fill = !lit ? INK_GHOST : g.isVowel ? GOLD : g.kind === "punct" ? VERMILION : INK;
  return (
    <g>
      {current && (
        <circle
          cx={g.x + g.size * 0.28}
          cy={g.y - g.size * 0.28}
          r={g.size * 0.9}
          fill="url(#iw-glow)"
          style={
            reduced
              ? { opacity: 0.5 }
              : { animation: "iw-pulse 1.4s ease-in-out infinite" }
          }
        />
      )}
      <text
        x={g.x}
        y={g.y}
        fontSize={g.size}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight={g.isUpper ? 700 : 400}
        fill={fill}
        style={{ transition: "fill 0.55s ease-out" }}
      >
        {g.ch}
      </text>
    </g>
  );
}

// Gold-leaf frame + vine/knotwork flourish behind the drop cap.
function DropCapDecoration({
  score,
  lit,
  reduced,
}: {
  score: Score;
  lit: boolean;
  reduced: boolean;
}) {
  const cap = score.glyphs.find((g) => g.isDropCap);
  if (!cap) return null;
  const size = cap.size;
  const bx = cap.x - 8;
  const by = cap.y - size * 0.82;
  const bw = size * 0.9;
  const bh = size * 1.05;
  return (
    <g opacity={lit ? 1 : 0.5} style={{ transition: "opacity 0.6s ease-out" }}>
      {/* lapis panel */}
      <rect x={bx} y={by} width={bw} height={bh} rx="6" fill={LAPIS} opacity="0.92" />
      <rect
        x={bx + 4}
        y={by + 4}
        width={bw - 8}
        height={bh - 8}
        rx="4"
        fill="none"
        stroke={GOLD_BRIGHT}
        strokeWidth="2"
      />
      {/* knotwork tendrils */}
      <path
        d={`M ${bx + bw} ${by + 10}
            c 22 -6 34 14 20 30
            c -10 12 8 26 22 16`}
        fill="none"
        stroke={VINE}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d={`M ${bx - 2} ${by + bh - 8}
            c -18 6 -26 -12 -12 -24`}
        fill="none"
        stroke={GOLD}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle
        cx={bx + bw + 30}
        cy={by + 56}
        r="4.5"
        fill={VERMILION}
        style={reduced ? undefined : { animation: "iw-pulse 3s ease-in-out infinite" }}
      />
    </g>
  );
}

// deterministic decorative vines down the two margins
function buildVines(w: number, h: number) {
  const leftX = 30;
  const rightX = w - 30;
  const top = 90;
  const bottom = h - 40;
  const wave = (x0: number, dir: number) => {
    let d = `M ${x0} ${bottom}`;
    const leaves: { x: number; y: number; r: number; at: number }[] = [];
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const y = bottom - t * (bottom - top);
      const x = x0 + Math.sin(t * Math.PI * 2.2) * 12 * dir;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      leaves.push({ x: x + 8 * dir, y, r: 4.5, at: 1 - t });
    }
    return { d, leaves };
  };
  return [wave(leftX, 1), wave(rightX, -1)];
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
