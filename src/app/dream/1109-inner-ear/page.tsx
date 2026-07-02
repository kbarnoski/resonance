"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InnerEarEngine, Reveal } from "./audio";
import { drawFrame, CalibState } from "./renderer";
import { MODES, ModeId } from "./illusions";

type Phase = "idle" | "running" | "unsupported";

function audioSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "AudioContext" in window ||
    "webkitAudioContext" in (window as unknown as Record<string, unknown>)
  );
}

const DICHOTIC = new Set<ModeId>(["octave", "scale"]);

export default function InnerEarPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<ModeId>("octave");
  const [reveal, setReveal] = useState<Reveal>("both");
  const [swapped, setSwapped] = useState(false);
  const [answers, setAnswers] = useState<(null | "up" | "down")[]>(
    Array(12).fill(null),
  );
  const [current, setCurrent] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const engineRef = useRef<InnerEarEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<ModeId>(mode);
  const calibRef = useRef<CalibState>({ answers, current });
  const lastInteractionRef = useRef<number>(Date.now());

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    calibRef.current = { answers, current };
  }, [answers, current]);

  const touch = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  const start = useCallback(() => {
    if (!audioSupported()) {
      setPhase("unsupported");
      return;
    }
    touch();
    const engine = new InnerEarEngine();
    engineRef.current = engine;
    engine.setMode(modeRef.current);
    engine.start().catch(() => setPhase("unsupported"));
    setPhase("running");
  }, [touch]);

  const stop = useCallback(() => {
    touch();
    engineRef.current?.stop();
    engineRef.current = null;
    setPhase("idle");
  }, [touch]);

  const changeMode = useCallback(
    (m: ModeId, isUser: boolean) => {
      if (isUser) touch();
      setMode(m);
      setReveal("both");
      setSwapped(false);
      const eng = engineRef.current;
      if (!eng) return;
      eng.setMode(m);
      eng.setReveal("both");
      eng.setSwapped(false);
      if (m === "calibration") eng.playCalibrationPair(calibRef.current.current);
    },
    [touch],
  );

  const applyReveal = useCallback(
    (r: Reveal) => {
      touch();
      setReveal(r);
      engineRef.current?.setReveal(r);
    },
    [touch],
  );

  const toggleSwap = useCallback(() => {
    touch();
    setSwapped((s) => {
      const next = !s;
      engineRef.current?.setSwapped(next);
      return next;
    });
  }, [touch]);

  const answerCalib = useCallback(
    (ans: "up" | "down") => {
      touch();
      const cur = calibRef.current.current;
      if (cur >= 12) return;
      setAnswers((prev) => {
        const n = [...prev];
        n[cur] = ans;
        return n;
      });
      const next = cur + 1;
      setCurrent(next);
      if (next < 12) engineRef.current?.playCalibrationPair(next);
    },
    [touch],
  );

  const resetCalib = useCallback(() => {
    touch();
    setAnswers(Array(12).fill(null));
    setCurrent(0);
    engineRef.current?.playCalibrationPair(0);
  }, [touch]);

  // Render loop.
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (canvas && engine) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = rect.width;
        const H = rect.height;
        if (W > 0 && H > 0) {
          const pw = Math.round(W * dpr);
          const ph = Math.round(H * dpr);
          if (canvas.width !== pw) canvas.width = pw;
          if (canvas.height !== ph) canvas.height = ph;
          const g = canvas.getContext("2d");
          if (g) {
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawFrame(g, W, H, engine, modeRef.current, calibRef.current);
          }
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Autonomous advance + calibration idle replay.
  useEffect(() => {
    if (phase !== "running") return;
    const order: ModeId[] = ["octave", "scale", "tritone", "zwicker"];
    const id = setInterval(() => {
      const idle = Date.now() - lastInteractionRef.current;
      const m = modeRef.current;
      if (m === "calibration") {
        const c = calibRef.current;
        if (c.current < 12 && idle > 5000)
          engineRef.current?.playCalibrationPair(c.current);
        return;
      }
      if (idle > 14000) {
        const idx = order.indexOf(m);
        changeMode(order[(idx + 1) % order.length], false);
      }
    }, 2500);
    return () => clearInterval(id);
  }, [phase, changeMode]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const activeMeta = MODES.find((m) => m.id === mode)!;
  const isDichotic = DICHOTIC.has(mode);
  const running = phase === "running";

  const navBtn = (m: (typeof MODES)[number]) => {
    const on = m.id === mode;
    return (
      <button
        key={m.id}
        onClick={() => changeMode(m.id, true)}
        disabled={!running}
        className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors disabled:opacity-40 ${
          on
            ? "border-neutral-800 bg-neutral-900 text-white"
            : "border-neutral-300 bg-white/70 text-neutral-800 hover:bg-white"
        }`}
      >
        <span className="block leading-tight">{m.title}</span>
        <span
          className={`block text-[11px] font-normal ${
            on ? "text-white/70" : "text-neutral-500"
          }`}
        >
          {m.year}
        </span>
      </button>
    );
  };

  const ctlBtn =
    "min-h-[44px] rounded-lg border border-neutral-300 bg-white/70 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-white disabled:opacity-40 transition-colors";
  const ctlOn = "border-neutral-800 bg-neutral-900 text-white hover:bg-neutral-900";

  return (
    <main className="min-h-screen bg-[#efe8db] px-4 py-6 text-neutral-800 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4">
          <p className="text-[13px] font-semibold uppercase tracking-widest text-neutral-500">
            Resonance · Dream Lab · 1109
          </p>
          <h1 className="font-serif text-3xl font-bold text-neutral-900 sm:text-4xl">
            Inner Ear
          </h1>
          <p className="mt-1 max-w-2xl text-base text-neutral-700">
            A small museum of the sounds your brain manufactures — a cabinet of
            auditory illusions after Diana Deutsch, plus the Zwicker phantom tone
            you hear in silence. The sound is the exhibit; the diagram is the
            placard.
          </p>
        </header>

        {/* Headphones advisory */}
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500 bg-amber-300/80 px-4 py-3 text-neutral-900 shadow-sm">
          <span className="text-2xl leading-none">🎧</span>
          <p className="text-[15px] font-semibold">
            Headphones required. These illusions depend on each ear hearing a
            different signal. On speakers, most of them collapse.
          </p>
        </div>

        {/* Gallery nav */}
        <nav className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {MODES.map(navBtn)}
        </nav>

        {/* Active description */}
        <p className="mb-3 min-h-[3rem] text-[15px] leading-snug text-neutral-700">
          {activeMeta.blurb}
        </p>

        {/* Canvas */}
        <div className="overflow-hidden rounded-xl border border-neutral-300 shadow-sm">
          {phase === "unsupported" ? (
            <div className="flex h-[420px] items-center justify-center bg-[#f4efe6] px-8 text-center">
              <p className="text-base text-neutral-700">
                Your browser does not expose the Web Audio API, so these
                illusions cannot play here. Try a current desktop Chrome, Safari,
                or Firefox — with headphones.
              </p>
            </div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="block h-[420px] w-full bg-[#f4efe6] sm:h-[500px]"
              />
              {!running && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#f4efe6]/85">
                  <button
                    onClick={start}
                    className="min-h-[44px] rounded-full bg-neutral-900 px-8 py-3 text-lg font-semibold text-white shadow-lg hover:bg-neutral-800"
                  >
                    ▶ Start the exhibit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={running ? stop : start}
            disabled={phase === "unsupported"}
            className={`${ctlBtn} ${running ? ctlOn : ""}`}
          >
            {running ? "⏸ Stop" : "▶ Start"}
          </button>

          {isDichotic && (
            <>
              <div className="ml-1 flex overflow-hidden rounded-lg border border-neutral-300">
                {(
                  [
                    ["both", "Reveal both"],
                    ["left", "Left only"],
                    ["right", "Right only"],
                  ] as [Reveal, string][]
                ).map(([r, label]) => (
                  <button
                    key={r}
                    onClick={() => applyReveal(r)}
                    disabled={!running}
                    className={`min-h-[44px] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                      reveal === r
                        ? "bg-neutral-900 text-white"
                        : "bg-white/70 text-neutral-800 hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleSwap}
                disabled={!running}
                className={`${ctlBtn} ${swapped ? ctlOn : ""}`}
              >
                ⇄ Swap ears{swapped ? " (on)" : ""}
              </button>
            </>
          )}

          {mode === "calibration" && running && (
            <div className="flex flex-wrap items-center gap-2">
              {current < 12 ? (
                <>
                  <span className="text-sm text-neutral-600">
                    Pair {current + 1} of 12 — the second tone sounded:
                  </span>
                  <button
                    onClick={() => answerCalib("up")}
                    className={`${ctlBtn} border-emerald-600 text-emerald-800`}
                  >
                    Higher ↑
                  </button>
                  <button
                    onClick={() => answerCalib("down")}
                    className={`${ctlBtn} border-orange-600 text-orange-800`}
                  >
                    Lower ↓
                  </button>
                  <button
                    onClick={() => engineRef.current?.playCalibrationPair(current)}
                    className={ctlBtn}
                  >
                    ↻ Replay
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-neutral-700">
                    Template complete — that circle is yours.
                  </span>
                  <button onClick={resetCalib} className={ctlBtn}>
                    ↻ Measure again
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Legend + caveat for dichotic modes */}
        {isDichotic && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px] text-neutral-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#2f5da8]" />
              Left ear (signal)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#b0413a]" />
              Right ear (signal)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#6a4ba0]" />
              What you probably hear
            </span>
          </div>
        )}

        {/* Design notes */}
        <details
          className="mt-6 rounded-xl border border-neutral-300 bg-white/50 px-4 py-3"
          open={showNotes}
          onToggle={(e) => setShowNotes((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer select-none text-[15px] font-semibold text-neutral-800">
            Read the design notes
          </summary>
          <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-neutral-700">
            <p>
              <strong>The trick.</strong> One <code>ChannelMerger(2)</code> feeds
              the two stereo channels from a left-bus and a right-bus gain, via a
              gentle limiter to protect your ears. Dichotic tones (octave, scale)
              route to exactly one bus; diotic tones (tritone, Zwicker) route to
              both. Every note gets a raised-cosine attack and release so nothing
              clicks. “Left only” ramps the right channel to silence in ~150 ms —
              collapsing the phantom so you hear the raw physical stream. That
              collapse is the built-in <em>aha</em>.
            </p>
            <p>
              <strong>Why the sound is manufactured in you.</strong> In the octave
              and scale illusions the melody you hear is present in{" "}
              <em>neither</em> channel — your brain reassembles it by grouping
              pitch and location. In the tritone paradox the octave is
              deliberately ambiguous, so “up vs down” is decided by your own
              perceptual template, not the signal. In the Zwicker tone your
              auditory system fills the spectral hole with a pitch that was never
              played.
            </p>
            <p className="text-neutral-600">
              <strong>Honest caveat:</strong> the “what you hear” lane is the
              typical right-hander model — a prediction, not a measurement. And
              this build is <em>unverified on real hardware in the sandbox</em>;
              it needs headphones and human ears to confirm. References: Deutsch
              (1974/1975/1986; <em>Musical Illusions and Phantom Words</em>,
              Oxford 2019), Shepard (1964), Zwicker (1964) and the 2025 Zwicker-tone
              phantom-perception study (Imaging Neuroscience, MIT Press).
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}
