"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Spectral Scrub — reach into Karel's real recorded piano and physically scrub,
// freeze, and time-stretch it through a WebGL2 spectral field you sculpt with
// your hands. Granular resynthesis (pitch-preserving time-scale modification,
// after the phase vocoder — Flanagan & Golden, 1966) drives a live scrolling
// spectrogram shader rendered as drifting pigment (Refik Anadol).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EngineHandle,
  RATES,
  ScrubMode,
  loadFile,
  loadTrackById,
  makeElementEngine,
  makeGranularEngine,
  renderDemoBuffer,
} from "./audio";
import {
  SpectralField,
  drawFallbackSpectrogram,
  hasWebGL2,
} from "./shader";

const FIELD_BINS = 512; // = analyser.frequencyBinCount (fftSize 1024)

type Phase = "idle" | "loading" | "live" | "error";
type RateName = "freeze" | "slow" | "play" | "reverse";

function renderWaveStrip(
  cvs: HTMLCanvasElement | null,
  engine: EngineHandle | null,
  pos: number,
) {
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  if (!ctx) return;
  const w = cvs.width;
  const h = cvs.height;
  ctx.clearRect(0, 0, w, h);
  const peaks = engine?.peaks;
  if (peaks && peaks.length > 0) {
    const n = peaks.length / 2;
    ctx.fillStyle = "rgba(120,190,255,0.32)";
    for (let i = 0; i < n; i++) {
      const min = peaks[i * 2];
      const max = peaks[i * 2 + 1];
      const x = (i / n) * w;
      const y1 = h / 2 - max * (h / 2) * 0.92;
      const y2 = h / 2 - min * (h / 2) * 0.92;
      ctx.fillRect(x, y1, Math.max(1, w / n), Math.max(1, y2 - y1));
    }
  } else {
    ctx.fillStyle = "rgba(120,190,255,0.12)";
    ctx.fillRect(0, h / 2 - 1, w, 2);
  }
  const px = pos * w;
  ctx.fillStyle = "rgba(180,240,255,0.95)";
  ctx.fillRect(px - 1, 0, 2, h);
  ctx.fillStyle = "rgba(180,240,255,0.25)";
  ctx.fillRect(px - 5, 0, 10, h);
}

export default function SpectralScrubPage() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const fieldRef = useRef<SpectralField | null>(null);
  const rafRef = useRef<number | null>(null);
  const specRef = useRef<Uint8Array>(new Uint8Array(FIELD_BINS));
  const interactRef = useRef({ pos: 0.15, sculpt: 0.62 });
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const draggingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [audioOk, setAudioOk] = useState(true);
  const [modeLabel, setModeLabel] = useState<string>("");
  const [engineMode, setEngineMode] = useState<ScrubMode | null>(null);
  const [rateName, setRateName] = useState<RateName>("play");
  const [trackId, setTrackId] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [hint, setHint] = useState(true);

  // ── one shared render loop (runs idle + live) ──────────────────────────────
  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    startTimeRef.current = performance.now();
    const spec = specRef.current;

    const frame = () => {
      const t = (performance.now() - startTimeRef.current) / 1000;
      const engine = engineRef.current;
      let level = 0;
      let pos = interactRef.current.pos;

      if (engine) {
        engine.readSpectrum(spec);
        level = engine.getLevel();
        if (!draggingRef.current) pos = engine.getPos();
        interactRef.current.pos = pos;
      } else {
        // idle: a gentle drifting hump so the field is alive before load
        for (let i = 0; i < FIELD_BINS; i++) {
          const f = i / FIELD_BINS;
          const hump =
            Math.exp(-Math.pow((f - 0.12 - 0.05 * Math.sin(t * 0.4)) * 6.0, 2)) *
            (0.5 + 0.5 * Math.sin(t * 0.9 + f * 20));
          const shimmer = 0.12 * Math.exp(-f * 3.0) * (0.5 + 0.5 * Math.sin(t * 2.3 + f * 40));
          spec[i] = Math.min(255, Math.max(0, (hump * 0.7 + shimmer) * 210));
        }
        level = 0.12;
        pos = 0.5 + 0.4 * Math.sin(t * 0.25);
      }

      const field = fieldRef.current;
      if (field) {
        field.push(spec);
        field.render({
          time: t,
          level,
          sculpt: interactRef.current.sculpt,
          pos,
        });
      } else if (fbCanvasRef.current) {
        drawFallbackSpectrogram(fbCanvasRef.current, spec, level);
      }

      renderWaveStrip(waveCanvasRef.current, engineRef.current, pos);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── sizing ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.floor(wrap.clientHeight * dpr));
      if (fieldRef.current) fieldRef.current.resize(w, h);
      if (fbCanvasRef.current) {
        fbCanvasRef.current.width = w;
        fbCanvasRef.current.height = h;
      }
      const wc = waveCanvasRef.current;
      if (wc) {
        wc.width = Math.floor(wc.clientWidth * dpr);
        wc.height = Math.floor(wc.clientHeight * dpr);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── init field + idle loop on mount ─────────────────────────────────────────
  useEffect(() => {
    const ok = hasWebGL2();
    setWebglOk(ok);
    if (ok && glCanvasRef.current) {
      try {
        fieldRef.current = new SpectralField(glCanvasRef.current, FIELD_BINS);
      } catch {
        setWebglOk(false);
      }
    }
    // size then start the shared loop (idle visuals immediately)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wrap = wrapRef.current;
    if (wrap && fieldRef.current) {
      fieldRef.current.resize(
        Math.floor(wrap.clientWidth * dpr),
        Math.floor(wrap.clientHeight * dpr),
      );
    }
    startLoop();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      engineRef.current?.stop();
      engineRef.current = null;
      fieldRef.current?.dispose();
      fieldRef.current = null;
      const el = audioElRef.current;
      if (el) {
        el.pause();
        el.remove();
        audioElRef.current = null;
      }
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => ctx.close().catch(() => {}), 400);
      }
    };
  }, [startLoop]);

  // ── audio context helper ─────────────────────────────────────────────────────
  const ensureCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const AC: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    if (!AC) {
      setAudioOk(false);
      return null;
    }
    const ctx = new AC();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  const swapEngine = useCallback((engine: EngineHandle, label: string) => {
    engineRef.current?.stop();
    engineRef.current = engine;
    setEngineMode(engine.mode);
    setModeLabel(label);
    engine.setSculpt(interactRef.current.sculpt);
    engine.setRate(RATES.play);
    setRateName("play");
    engine.start();
    setPhase("live");
    setErrorMsg(null);
  }, []);

  // ── loaders ─────────────────────────────────────────────────────────────────
  const runDemo = useCallback(async () => {
    const ctx = ensureCtx();
    if (!ctx) return;
    await ctx.resume().catch(() => {});
    setPhase("loading");
    try {
      const buf = await renderDemoBuffer(ctx.sampleRate);
      swapEngine(
        makeGranularEngine(ctx, buf),
        "synth demo · placeholder — load a real track for the real thing",
      );
    } catch {
      setPhase("error");
      setErrorMsg("Could not render the demo phrase.");
    }
  }, [ensureCtx, swapEngine]);

  const runLoadId = useCallback(async () => {
    const id = trackId.trim();
    if (!id) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    await ctx.resume().catch(() => {});
    setPhase("loading");
    setErrorMsg(null);
    try {
      const result = await loadTrackById(ctx, id);
      if ("buffer" in result) {
        swapEngine(
          makeGranularEngine(ctx, result.buffer),
          "Path recording · granular scrub + freeze",
        );
      } else {
        // CORS/codec fallback: stream via <audio>. Scrub works; no freeze.
        const el = document.createElement("audio");
        el.crossOrigin = "anonymous";
        el.src = result.url;
        el.loop = true;
        el.style.display = "none";
        document.body.appendChild(el);
        audioElRef.current = el;
        await new Promise<void>((res) => {
          const done = () => res();
          el.addEventListener("loadedmetadata", done, { once: true });
          el.addEventListener("error", done, { once: true });
          setTimeout(done, 4000);
        });
        swapEngine(
          makeElementEngine(ctx, el),
          "Path recording · streamed (granular freeze unavailable for this source)",
        );
      }
    } catch (err) {
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to load recording.");
    }
  }, [trackId, ensureCtx, swapEngine]);

  const runFile = useCallback(
    async (file: File) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      await ctx.resume().catch(() => {});
      setPhase("loading");
      setErrorMsg(null);
      try {
        const buf = await loadFile(ctx, file);
        swapEngine(
          makeGranularEngine(ctx, buf),
          `${file.name} · granular scrub + freeze`,
        );
      } catch {
        setPhase("error");
        setErrorMsg("Could not decode that file. Try a wav / mp3 / m4a.");
      }
    },
    [ensureCtx, swapEngine],
  );

  // ── rate buttons ─────────────────────────────────────────────────────────────
  const setRate = useCallback((name: RateName) => {
    engineRef.current?.setRate(RATES[name]);
    setRateName(name);
  }, []);

  // ── drag: x = scrub time, y = sculpt tone ────────────────────────────────────
  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    const sculpt = 1 - y; // up = brighter
    interactRef.current.pos = x;
    interactRef.current.sculpt = sculpt;
    engineRef.current?.setPos(x);
    engineRef.current?.setSculpt(sculpt);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!engineRef.current) return;
      setHint(false);
      draggingRef.current = true;
      engineRef.current.setDragging(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    engineRef.current?.setDragging(false);
  }, []);

  // waveform-strip scrub (x only)
  const applyWave = useCallback((clientX: number) => {
    const cvs = waveCanvasRef.current;
    if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    interactRef.current.pos = x;
    engineRef.current?.setPos(x);
  }, []);
  const onPointerDownWave = useCallback(
    (e: React.PointerEvent) => {
      if (!engineRef.current) return;
      setHint(false);
      draggingRef.current = true;
      engineRef.current.setDragging(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      applyWave(e.clientX);
    },
    [applyWave],
  );
  const onPointerMoveWave = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      applyWave(e.clientX);
    },
    [applyWave],
  );
  const onPointerUpWave = useCallback(() => {
    draggingRef.current = false;
    engineRef.current?.setDragging(false);
  }, []);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const live = phase === "live";
  const rateBtns: { name: RateName; label: string }[] = [
    { name: "reverse", label: "◀ Reverse" },
    { name: "freeze", label: "❄ Freeze" },
    { name: "slow", label: "◑ Slow" },
    { name: "play", label: "▶ Play" },
  ];

  return (
    <div
      ref={wrapRef}
      className="relative h-[100dvh] w-full touch-none select-none overflow-hidden bg-black"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* hero spectral field */}
      {webglOk ? (
        <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <canvas ref={fbCanvasRef} className="absolute inset-0 h-full w-full" />
      )}

      {/* top: title + status */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="max-w-xl">
          <h1 className="font-semibold text-2xl leading-tight text-foreground sm:text-3xl">
            Spectral Scrub
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Reach into Karel&rsquo;s real piano and drag it through time —
            scrub, freeze, and stretch a recording into a playable spectral field.
          </p>
          {modeLabel && (
            <p className="mt-1.5 text-base text-violet-300">{modeLabel}</p>
          )}
          {errorMsg && (
            <p className="mt-1.5 text-base text-violet-300">{errorMsg}</p>
          )}
          {!webglOk && (
            <p className="mt-1.5 text-base text-violet-300">
              WebGL2 unavailable — showing a Canvas2D spectrogram fallback.
            </p>
          )}
          {!audioOk && (
            <p className="mt-1.5 text-base text-violet-300">
              Web Audio is unavailable in this browser.
            </p>
          )}
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowNotes((s) => !s)}
          className="pointer-events-auto min-h-[44px] shrink-0 rounded-full border border-border bg-black/50 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* center drag hint */}
      {live && hint && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="rounded-2xl bg-black/40 px-5 py-3 text-center font-semibold text-xl text-foreground backdrop-blur-sm">
            drag anywhere
            <span className="mt-1 block text-base font-sans text-muted-foreground">
              ← → scrub &amp; stretch time · ↑ ↓ sculpt the spectrum
            </span>
          </p>
        </div>
      )}

      {/* bottom control deck */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-5">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-2xl border border-border bg-black/60 p-3 backdrop-blur-md sm:p-4">
          {!live ? (
            <div
              className="flex flex-col gap-3"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="text-base text-muted-foreground">
                Load a real Welcome Home piano track, drop your own audio, or
                start the placeholder demo.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runLoadId();
                  }}
                  placeholder="Paste a Path recording id"
                  className="min-h-[44px] flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-violet-300/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void runLoadId()}
                  disabled={phase === "loading" || !trackId.trim()}
                  className="min-h-[44px] rounded-xl bg-violet-400/90 px-4 py-2.5 text-base font-medium text-black transition-colors hover:bg-violet-300 disabled:opacity-40"
                >
                  Load track
                </button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="min-h-[44px] flex-1 cursor-pointer rounded-xl border border-border bg-muted px-4 py-2.5 text-center text-base text-foreground transition-colors hover:border-violet-300/60">
                  Drop / choose an audio file
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void runFile(f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void runDemo()}
                  disabled={phase === "loading"}
                  className="min-h-[44px] rounded-xl border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:border-border disabled:opacity-40"
                >
                  {phase === "loading" ? "Loading…" : "Play demo"}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col gap-3"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* waveform scrub strip */}
              <div
                className="relative h-16 w-full cursor-ew-resize rounded-xl border border-border bg-muted"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDownWave(e);
                }}
                onPointerMove={onPointerMoveWave}
                onPointerUp={onPointerUpWave}
                onPointerCancel={onPointerUpWave}
              >
                <canvas
                  ref={waveCanvasRef}
                  className="absolute inset-0 h-full w-full"
                />
                <span className="pointer-events-none absolute left-2 top-1.5 text-sm text-muted-foreground">
                  {engineMode === "element"
                    ? "drag to scrub (streamed)"
                    : "drag the waveform to scrub"}
                </span>
              </div>
              {/* transport */}
              <div className="flex flex-wrap gap-2">
                {rateBtns.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => setRate(b.name)}
                    disabled={engineMode === "element" && b.name === "reverse"}
                    className={`min-h-[44px] flex-1 rounded-xl px-4 py-2.5 text-base font-medium transition-colors ${
                      rateName === b.name
                        ? "bg-violet-400/90 text-black"
                        : "border border-border bg-muted text-foreground hover:border-border"
                    } disabled:opacity-30`}
                  >
                    {b.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    engineRef.current?.stop();
                    engineRef.current = null;
                    setEngineMode(null);
                    setModeLabel("");
                    setPhase("idle");
                  }}
                  className="min-h-[44px] rounded-xl border border-border bg-muted px-4 py-2.5 text-base text-muted-foreground transition-colors hover:text-foreground"
                >
                  Load another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div
          className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onPointerDown={(e) => {
            e.stopPropagation();
            setShowNotes(false);
          }}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#070b16] p-6 text-foreground"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-2xl text-foreground">Design notes</h2>
            <p className="mt-3 text-base text-foreground">
              The hero visual is a WebGL2 fragment shader sampling a live
              scrolling spectrogram of the audio, rendered as drifting pigment —
              Refik Anadol&rsquo;s &ldquo;data as pigment&rdquo; spectral field
              in deep-ocean cool → electric cyan/violet.
            </p>
            <p className="mt-3 text-base text-foreground">
              The instrument is a granular resynthesis engine: dozens of short,
              Hann-windowed grains fire from a moving read head. Moving that head
              slowly — or freezing it — time-stretches the recording without
              changing pitch, the pitch-preserving idea behind the phase vocoder
              (Flanagan &amp; Golden, 1966).
            </p>
            <p className="mt-3 text-base text-foreground">
              Drag horizontally to scrub and stretch time; drag vertically to
              sculpt tone (a filter cutoff the shader mirrors as a glowing band).
              Freeze holds the read head so the piano dissolves into a shimmering
              chord you can hold in your hand.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Three source tiers: a Path recording id, your own dropped file, or
              a built-in synth placeholder. Cross-origin recordings that
              can&rsquo;t be decoded stream through an &lt;audio&gt; element
              (scrub still works; granular freeze does not).
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
