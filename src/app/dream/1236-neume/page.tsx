"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PlaybackEngine,
  fetchPianoBuffer,
  renderFallbackBuffer,
  type SourceKind,
} from "./audio";
import { transcribe } from "./transcribe";
import {
  buildParchment,
  drawManuscript,
  layout,
  penScroll,
  PAGE_W,
  PAGE_H,
  type Layout,
} from "./neume";

type Phase = "idle" | "listening" | "live" | "error";

function fmt(t: number): string {
  if (!Number.isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const EMPTY_LAYOUT: Layout = { glyphs: [], lineCount: 1, refDegree: 0 };

export default function NeumePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [subMsg, setSubMsg] = useState<string>("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [source, setSource] = useState<SourceKind | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const parchmentRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<Layout>(EMPTY_LAYOUT);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const dprRef = useRef<number>(1);
  const seekingRef = useRef<boolean>(false);

  // ── draw one frame (safe to call anytime; used for the empty stave too) ──
  const paint = useCallback((posSec: number) => {
    const canvas = canvasRef.current;
    const parchment = parchmentRef.current;
    if (!canvas || !parchment) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const lay = layoutRef.current;
    const scroll = penScroll(lay, posSec);
    drawManuscript(g, parchment, lay, posSec, scroll, dprRef.current);
  }, []);

  // ── set up the canvas + parchment once, paint the empty ruled stave ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    dprRef.current = dpr;
    canvas.width = Math.floor(PAGE_W * dpr);
    canvas.height = Math.floor(PAGE_H * dpr);
    parchmentRef.current = buildParchment(PAGE_W, PAGE_H);
    paint(0);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [paint]);

  // ── animation loop ──
  const startLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const frame = () => {
      const engine = engineRef.current;
      if (engine) {
        const p = engine.position();
        if (!seekingRef.current) setPos(p);
        paint(p);
        if (!engine.isPlaying()) setPlaying(false);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [paint]);

  // ── primary action: fetch/decode → transcribe → play ──
  const handlePlayRecording = useCallback(async () => {
    if (phase === "listening") return;
    setErrMsg(null);
    setPhase("listening");
    setSubMsg("waking the scriptorium…");

    let engine: PlaybackEngine;
    try {
      engine = new PlaybackEngine();
    } catch {
      setPhase("error");
      setErrMsg("This browser blocked the Web Audio API, so the chant cannot sound.");
      return;
    }
    engine.onEnd = () => setPlaying(false);
    engineRef.current = engine;

    // 1. try Karel's real recording, else the offline fallback tone
    setSubMsg("listening for the recording…");
    let buffer = await fetchPianoBuffer(engine.ctx);
    let kind: SourceKind = "recording";
    if (!buffer) {
      kind = "fallback";
      try {
        buffer = await renderFallbackBuffer(engine.ctx.sampleRate);
      } catch {
        setPhase("error");
        setErrMsg("Could not render any audio to notate.");
        return;
      }
    }
    setSource(kind);

    // 2. copy the melody out as neumes
    setSubMsg("copying the melody into neumes…");
    // yield a frame so the sub-message paints before the (brief) blocking analysis
    await new Promise((r) => setTimeout(r, 30));
    try {
      const tr = transcribe(buffer);
      layoutRef.current = tr.figures.length > 0 ? layout(tr) : EMPTY_LAYOUT;
    } catch {
      layoutRef.current = EMPTY_LAYOUT;
    }

    // 3. play + ink in time
    engine.load(buffer);
    setDuration(engine.duration);
    setPhase("live");
    startLoop();
    await engine.play();
    setPlaying(true);
  }, [phase, startLoop]);

  const togglePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPlaying()) {
      engine.pause();
      setPlaying(false);
    } else {
      await engine.play();
      setPlaying(true);
    }
  }, []);

  const onSeekInput = useCallback(
    (v: number) => {
      seekingRef.current = true;
      setPos(v);
      paint(v);
    },
    [paint],
  );

  const onSeekCommit = useCallback(async (v: number) => {
    const engine = engineRef.current;
    if (engine) await engine.seek(v);
    seekingRef.current = false;
    if (engine) setPlaying(engine.isPlaying());
  }, []);

  return (
    <main className="min-h-screen w-full bg-[#e7d9b6] text-amber-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-amber-950 sm:text-4xl">
              Antiphonary
            </h1>
            <Link
              href="/dream"
              className="text-base text-amber-900/80 underline underline-offset-4 hover:text-amber-950"
            >
              ← all prototypes
            </Link>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-amber-950/90">
            A real piano recording notates itself as medieval plainchant — the melody&apos;s rise
            and fall inking square neumes onto a four-line stave, an illuminated manuscript
            writing itself as it plays.
          </p>
        </header>

        {/* the manuscript page */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-900/30 shadow-[0_10px_40px_-12px_rgba(90,60,20,0.5)]">
          <canvas
            ref={canvasRef}
            className="block w-full"
            style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}`, background: "#efe4c6" }}
          />
          {phase === "idle" && (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-8">
              <span className="rounded-full bg-amber-950/10 px-4 py-2 text-base text-amber-950/80">
                the ruled stave awaits its chant
              </span>
            </div>
          )}
          {phase === "listening" && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#efe4c6]/60 backdrop-blur-[1px]">
              <span className="rounded-full bg-amber-950/85 px-5 py-2.5 text-base font-medium text-amber-50">
                {subMsg}
              </span>
            </div>
          )}
        </div>

        {/* transport */}
        <div className="flex flex-col gap-4">
          {phase !== "live" ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePlayRecording}
                disabled={phase === "listening"}
                className="min-h-[44px] rounded-full bg-amber-900 px-6 py-2.5 text-base font-semibold text-amber-50 shadow-sm transition hover:bg-amber-800 disabled:opacity-60"
              >
                {phase === "listening" ? "Copying…" : "Play the recording"}
              </button>
              {phase === "error" && errMsg && (
                <span className="text-base font-medium text-rose-700">{errMsg}</span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={togglePlay}
                className="min-h-[44px] min-w-[44px] rounded-full bg-amber-900 px-6 py-2.5 text-base font-semibold text-amber-50 shadow-sm transition hover:bg-amber-800"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <div className="flex flex-1 items-center gap-3">
                <span className="w-12 text-right text-base tabular-nums text-amber-950/80">
                  {fmt(pos)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.01, duration)}
                  step={0.01}
                  value={pos}
                  onChange={(e) => onSeekInput(Number(e.target.value))}
                  onPointerUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
                  onKeyUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-amber-900/25 accent-amber-800"
                  aria-label="Seek through the chant"
                />
                <span className="w-12 text-base tabular-nums text-amber-950/80">
                  {fmt(duration)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {source && (
              <span className="rounded-full border border-amber-900/30 bg-amber-100/60 px-3 py-1 text-sm font-medium text-amber-950">
                source: {source === "recording" ? "Karel's piano" : "fallback tone"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="text-base text-amber-900 underline underline-offset-4 hover:text-amber-950"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
          </div>

          {showNotes && (
            <div className="max-w-2xl rounded-2xl border border-amber-900/25 bg-amber-100/50 p-5 text-base leading-relaxed text-amber-950/90">
              <p className="mb-3">
                After you press play, the whole recording is decoded and analysed offline:{" "}
                <strong>spectral-flux onset detection</strong> finds each note attack, and{" "}
                <strong>YIN pitch detection</strong> (de Cheveigné &amp; Kawahara, 2002) reads the
                pitch just after each onset. Consecutive notes are grouped into neume figures by the
                sign of their pitch steps — a rising pair becomes a <em>pes</em>, a falling pair a{" "}
                <em>clivis</em>, a falling run a <em>climacus</em> of diamonds.
              </p>
              <p>
                Neumes encode <em>contour</em>, not exact rhythm — historically true of Western
                square notation (Guido d&apos;Arezzo), and forgiving of the small errors any browser
                pitch detector makes. If the network recording is unavailable, a gentle
                offline-synthesised piano phrase is notated instead, so the page is never silent and
                never blank. The stave is hand-rolled — no notation library. See README.md for the
                full note.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
