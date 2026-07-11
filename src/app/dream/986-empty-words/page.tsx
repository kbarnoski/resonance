"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { compose, MODES, type Composition, type ModeName, type NoteEvent } from "./composer";
import { TextMusicEngine } from "./audio-engine";
import { ManuscriptGL, type GlyphBox, type LayoutResult } from "./manuscript-gl";
import { drawCanvas2DManuscript, type Canvas2DLayout } from "./manuscript-2d";
import { DEFAULT_TEXT } from "./default-text";

type RenderMode = "webgl2" | "canvas2d" | "none";

const MODE_ORDER: ModeName[] = ["dorian", "aeolian", "ionian", "lydian"];

export default function EmptyWordsPage() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [mode, setMode] = useState<ModeName>("dorian");
  const [bpm, setBpm] = useState(84);
  const [playing, setPlaying] = useState(false);
  const [renderMode, setRenderMode] = useState<RenderMode>("webgl2");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [readout, setReadout] = useState<NoteEvent | null>(null);
  const [gestured, setGestured] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<ManuscriptGL | null>(null);
  const c2dLayoutRef = useRef<Canvas2DLayout | null>(null);
  const engineRef = useRef<TextMusicEngine | null>(null);
  const compRef = useRef<Composition | null>(null);
  const rafRef = useRef<number>(0);

  // animation state shared with rAF
  const stateRef = useRef({
    playing: false,
    scrollUv: 0, // current vertical scroll in viewport units
    targetScrollUv: 0,
    glowBox: null as GlyphBox | null,
    glowIntensity: 0,
    layout: { boxes: [], docHeightUv: 1 } as LayoutResult,
    renderMode: "webgl2" as RenderMode,
    text: DEFAULT_TEXT,
    activeTokenIndex: -1,
  });

  // ── (re)compose whenever text or mode changes ──────────────────────────────
  useEffect(() => {
    compRef.current = compose(text, mode);
    stateRef.current.text = text;
  }, [text, mode]);

  // ── set up the renderer once, on mount ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let gl: ManuscriptGL | null = null;
    let usedMode: RenderMode = "webgl2";
    try {
      gl = new ManuscriptGL(canvas);
      glRef.current = gl;
    } catch {
      gl = null;
      glRef.current = null;
      usedMode = "canvas2d";
    }
    if (disposed) return;
    setRenderMode(usedMode);
    stateRef.current.renderMode = usedMode;

    const applyLayout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const tokens = compose(stateRef.current.text, mode).tokens;
      if (gl) {
        gl.resize(rect.width, rect.height, dpr);
        const layout = gl.setText(tokens, rect.width, rect.height);
        stateRef.current.layout = layout;
      } else {
        // canvas2d: size the backing buffer directly
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        c2dLayoutRef.current = { tokens, dpr, cssW: rect.width, cssH: rect.height };
        // approximate doc height for scroll via the 2D drawer's measurement
        const measured = drawCanvas2DManuscript(canvas, c2dLayoutRef.current, 0, -1, 0, 0, true);
        stateRef.current.layout = { boxes: measured.boxes, docHeightUv: measured.docHeightUv };
      }
    };
    applyLayout();

    const onResize = () => applyLayout();
    window.addEventListener("resize", onResize);

    // rAF render loop — runs always (manuscript animates before audio)
    let lastTokenScrollIndex = -1;
    const startT = performance.now();
    const loop = () => {
      const s = stateRef.current;
      const t = (performance.now() - startT) / 1000;

      // when a new token is active, retarget the scroll so it stays in view
      if (s.activeTokenIndex !== lastTokenScrollIndex && s.activeTokenIndex >= 0) {
        lastTokenScrollIndex = s.activeTokenIndex;
        const box = s.layout.boxes.find((b) => b.tokenIndex === s.activeTokenIndex);
        if (box) {
          s.glowBox = box;
          // keep the singing line ~40% down the viewport
          const docH = s.layout.docHeightUv;
          const desired = box.cy * docH - 0.4; // in viewport units
          s.targetScrollUv = Math.max(0, Math.min(desired, Math.max(0, docH - 1)));
        }
      }

      // idle gentle drift when not playing so a silent glance still moves
      if (!s.playing) {
        const docH = s.layout.docHeightUv;
        if (docH > 1) {
          s.targetScrollUv = (Math.sin(t * 0.12) * 0.5 + 0.5) * (docH - 1);
        }
        s.glowIntensity += (0 - s.glowIntensity) * 0.05;
      } else {
        s.glowIntensity += (1 - s.glowIntensity) * 0.12;
      }

      // ease scroll
      s.scrollUv += (s.targetScrollUv - s.scrollUv) * 0.06;

      if (s.renderMode === "webgl2" && gl) {
        gl.draw(t, s.scrollUv, s.glowBox, s.glowIntensity);
      } else if (s.renderMode === "canvas2d" && c2dLayoutRef.current) {
        drawCanvas2DManuscript(
          canvas,
          c2dLayoutRef.current,
          t,
          s.activeTokenIndex,
          s.scrollUv,
          s.glowIntensity,
          false,
        );
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      gl?.dispose();
      glRef.current = null;
    };
  }, [mode]);

  // ── relayout glyphs when text changes (renderer already mounted) ───────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tokens = compose(text, mode).tokens;
    if (glRef.current) {
      const layout = glRef.current.setText(tokens, rect.width, rect.height);
      stateRef.current.layout = layout;
    } else if (c2dLayoutRef.current) {
      c2dLayoutRef.current.tokens = tokens;
      const measured = drawCanvas2DManuscript(canvas, c2dLayoutRef.current, 0, -1, 0, 0, true);
      stateRef.current.layout = { boxes: measured.boxes, docHeightUv: measured.docHeightUv };
    }
    stateRef.current.activeTokenIndex = -1;
  }, [text, mode]);

  // ── audio control ──────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    engineRef.current?.stop();
    setPlaying(false);
    stateRef.current.playing = false;
    stateRef.current.activeTokenIndex = -1;
  }, []);

  const startAudio = useCallback(async () => {
    setAudioError(null);
    setGestured(true);
    const comp = compose(text, mode);
    compRef.current = comp;
    try {
      // dispose any prior engine and make a fresh one (clean schedule)
      if (engineRef.current) await engineRef.current.dispose();
      const engine = new TextMusicEngine();
      engineRef.current = engine;
      engine.onNote = (ev) => {
        setReadout(ev);
        stateRef.current.activeTokenIndex = ev.tokenIndex;
      };
      engine.onEnd = () => {
        setPlaying(false);
        stateRef.current.playing = false;
      };
      await engine.start(comp, bpm);
      setPlaying(true);
      stateRef.current.playing = true;
    } catch (err) {
      setAudioError(
        "Audio could not start: " + (err instanceof Error ? err.message : String(err)),
      );
      setPlaying(false);
      stateRef.current.playing = false;
    }
  }, [text, mode, bpm]);

  // live tempo change while playing
  useEffect(() => {
    engineRef.current?.setTempo(bpm);
  }, [bpm]);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const noteCount = compRef.current?.events.filter((e) => !e.isRest).length ?? 0;

  return (
    <main className="min-h-screen w-full bg-[#111010] text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* header */}
        <header className="mb-4">
          <Link
            href="/dream"
            className="text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            ← dream lab
          </Link>
          <h1 className="mt-2 font-semibold text-3xl sm:text-4xl text-foreground">Empty Words</h1>
          <p className="mt-1 text-base text-muted-foreground max-w-2xl">
            Paste a poem or an email and a transparent engine{" "}
            <span className="text-violet-300/95">composes</span> it — every note carries the
            letter, syllable or mark that caused it. Same text, same piece, every time.
          </p>
        </header>

        {/* manuscript canvas */}
        <div className="relative rounded-lg overflow-hidden border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="block w-full"
            style={{ height: "44vh", minHeight: 280 }}
          />
          {renderMode === "none" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <p className="text-violet-300 text-base">
                Neither WebGL2 nor Canvas2D is available in this browser, so the manuscript can’t
                render. Audio will still work.
              </p>
            </div>
          )}
          {!gestured && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-center">
              <span className="inline-block rounded-full bg-black/55 px-4 py-2 text-base text-foreground backdrop-blur">
                Press{" "}
                <span className="text-violet-300/95">▶ Sing the text</span> to hear it composed
              </span>
            </div>
          )}
        </div>

        {/* live "why" readout */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 min-h-[44px] rounded-md bg-muted px-4 py-2.5 border border-border">
          <span className="text-base text-muted-foreground">now singing:</span>
          {readout ? (
            <>
              <span className="font-semibold text-2xl text-foreground">
                {readout.glyph === " " ? "␣" : readout.glyph}
              </span>
              <span className="text-base text-violet-300">{readout.reason}</span>
              {!readout.isRest && (
                <span className="text-base text-muted-foreground">
                  · {readout.articulation} · vel {Math.round(readout.velocity * 100)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-base text-muted-foreground">
              the running cause of each note appears here as it sounds
            </span>
          )}
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!playing ? (
            <button
              onClick={startAudio}
              className="min-h-[44px] px-4 py-2.5 rounded-md bg-violet-300/90 text-black font-medium text-base hover:bg-violet-300 transition-colors"
            >
              ▶ Sing the text
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="min-h-[44px] px-4 py-2.5 rounded-md bg-muted text-foreground text-base hover:bg-accent transition-colors"
            >
              ■ Stop
            </button>
          )}

          {/* mode selector */}
          <div className="flex items-center gap-1 rounded-md bg-muted border border-border p-1">
            {MODE_ORDER.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`min-h-[44px] px-3 py-2 rounded text-base transition-colors ${
                  mode === m
                    ? "bg-violet-300/20 text-violet-200"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>

          {/* tempo */}
          <label className="flex items-center gap-2 text-base text-muted-foreground">
            <span>tempo</span>
            <input
              type="range"
              min={48}
              max={132}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="accent-violet-300"
            />
            <span className="tabular-nums text-foreground w-14">{bpm} bpm</span>
          </label>

          <span className="text-base text-muted-foreground ml-auto">
            {noteCount} notes · {renderMode === "webgl2" ? "WebGL2" : renderMode === "canvas2d" ? "Canvas2D" : "no GPU"}
          </span>
        </div>

        {audioError && <p className="mt-3 text-base text-violet-300">{audioError}</p>}

        {/* the input */}
        <div className="mt-5">
          <label className="block text-base text-muted-foreground mb-2" htmlFor="ew-text">
            the text to set to music
          </label>
          <textarea
            id="ew-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={6}
            className="w-full rounded-md bg-muted border border-border px-4 py-3 text-base text-foreground leading-relaxed font-semibold resize-y focus:outline-none focus:border-violet-300/50"
            placeholder="Paste a poem, an email, anything…"
          />
          <p className="mt-2 text-base text-muted-foreground">
            Vowels pick scale degrees; capitals get louder; commas breathe; periods cadence to the
            tonic; <span className="text-muted-foreground">!</span> and{" "}
            <span className="text-muted-foreground">?</span> leap to tension; new lines lift the register.
          </p>
        </div>
      </div>
    </main>
  );
}
