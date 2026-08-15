"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13760 · Spectral Smear — reach into the SPECTRUM of one of Karel's recordings
// and smear a single instant of it across time.
//
//   ONE QUESTION
//   What if you could reach into the spectrum of your own recording and smear a
//   single instant of it across time — freeze a chord into an infinite shimmer,
//   then drag your hand through its overtones?
//
//   INPUT   pointer / touch on a scrolling spectrogram of HIS real STFT
//           magnitudes. Drag = scrub the playhead through the piece. Press-and-
//           hold = phase-vocoder FREEZE. Drag while frozen = smear time. A spread
//           slider blurs energy across neighbouring bins into a harmonic wash.
//   OUTPUT  WebGL2 spectrogram (time × frequency, cool ice colormap) that scrolls
//           with the playhead and shimmers on the frozen frame. Canvas2D fallback.
//   VERB    real STFT → magnitude/phase → freeze (hold magnitudes, advance phase
//           by each bin's measured true frequency) → ISTFT overlap-add. All of
//           the sound is resynthesis of his decoded recording's own spectrum.
//
//   REFS  Flanagan & Golden 1966; Dolson 1986 (phase vocoder); Laroche & Dolson
//         1999 (phase-locked resynthesis); the 2026 real-time tactile spectral-
//         performance turn. No neural nets, no oscillators, no generated tones.
//
//   AUDIO Karel's verified catalog ONLY (Welcome Home + Snowflake), every source
//         routed through the shared safeMaster ear-safety bus.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  REAL_TRACKS,
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { SpectralEngine } from "./spectralEngine";
import { SpectrogramView } from "./spectrogramView";

type Phase = "idle" | "decoding" | "analyzing";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default function SpectralSmearPage() {
  // audio / render refs
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<SpectralEngine | null>(null);
  const viewRef = useRef<SpectrogramView | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  // view / interaction refs
  const offsetRef = useRef(0);
  const spanRef = useRef(0.12);
  const smearFracRef = useRef(0);
  const smearBaseRef = useRef(0);
  const frozenRef = useRef(false);
  const latchedRef = useRef(false);
  const frozenGlideRef = useRef(0);
  const spreadRef = useRef(0);
  const gainRef = useRef(0.82);
  const reducedMotionRef = useRef(false);

  // gesture refs
  const holdTimerRef = useRef<number | null>(null);
  const movedFarRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartFracRef = useRef(0);

  // demo refs
  const demoActiveRef = useRef(false);
  const demoStartRef = useRef<number | null>(null);
  const demoFreezeFracRef = useRef(0);

  // react state
  const [selectedId, setSelectedId] = useState<string>(
    WELCOME_HOME_TRACKS[0].id,
  );
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [latched, setLatched] = useState(false);
  const [spread, setSpread] = useState(0);
  const [gain, setGain] = useState(0.82);
  const [demoActive, setDemoActive] = useState(false);
  const [renderKind, setRenderKind] = useState<"webgl" | "canvas2d" | null>(
    null,
  );

  const title =
    REAL_TRACKS.find((t) => t.id === selectedId)?.title ?? "Welcome Home";

  // ── reduced-motion + canvas sizing ─────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = () => (reducedMotionRef.current = mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth || 640;
      const h = Math.round(w * 0.52);
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      c.style.height = `${h}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const cancelDemo = useCallback(() => {
    if (!demoActiveRef.current) return;
    demoActiveRef.current = false;
    setDemoActive(false);
    // hand control back: drop the demo's freeze latch (the gesture governs now)
    latchedRef.current = false;
    setLatched(false);
  }, []);

  // ── the render + scheduler loop ────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const loop = (t: number) => {
      const engine = engineRef.current;
      const view = viewRef.current;
      if (engine) engine.pump();

      // seeded self-demo: scroll, then lock into a frozen shimmer
      if (demoActiveRef.current && engine) {
        if (demoStartRef.current == null) demoStartRef.current = t;
        const el = (t - demoStartRef.current) / 1000;
        if (el < 1.1) {
          engine.scrubTo(0.12 + el * 0.1);
        } else if (!engine.frozen) {
          engine.freeze();
          demoFreezeFracRef.current = engine.playFrac;
          smearFracRef.current = engine.playFrac;
          latchedRef.current = true;
          setLatched(true);
          frozenRef.current = true;
          setFrozen(true);
        } else {
          const s = Math.min(0.4, (el - 1.1) * 0.14);
          spreadRef.current = s;
          engine.setSpread(s);
          setSpread(s);
          if (!reducedMotionRef.current) {
            const sm = clamp01(
              demoFreezeFracRef.current + Math.sin((el - 1.1) * 0.7) * 0.012,
            );
            smearFracRef.current = sm;
            engine.setSmearTarget(sm);
          }
        }
      }

      // smooth the viewport offset toward the (frozen or live) playhead
      const target = frozenRef.current
        ? smearFracRef.current
        : engine
          ? engine.playFrac
          : 0;
      offsetRef.current += (target - offsetRef.current) * 0.2;

      const gGoal = frozenRef.current ? 1 : 0;
      frozenGlideRef.current += (gGoal - frozenGlideRef.current) * 0.14;

      if (view) {
        view.draw({
          offset: offsetRef.current,
          span: spanRef.current,
          frozen: frozenGlideRef.current,
          spread: spreadRef.current,
          time: t / 1000,
          motion: reducedMotionRef.current ? 0 : 1,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    rafRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // ── build engine + spectrogram for a track ─────────────────────────────────
  const buildForTrack = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !safe || !canvas) return;

    setPhase("decoding");
    setProgress(0);
    const { buffer } = await loadRealTrackBuffer(ctx, id);

    const engine = new SpectralEngine(ctx, safe.input, buffer);
    setPhase("analyzing");
    const spec = await engine.buildSpectrogram((f) => setProgress(f));
    spanRef.current = spec.spanFrac;

    viewRef.current?.dispose();
    const view = SpectrogramView.create(canvas, spec);
    viewRef.current = view;
    setRenderKind(view.kind);

    engineRef.current?.stop();
    engineRef.current = engine;
    offsetRef.current = engine.playFrac;
    smearFracRef.current = engine.playFrac;
    engine.setSpread(spreadRef.current);
    engine.start();
    setPhase("idle");
  }, []);

  // ── start: first gesture → AudioContext, safeMaster, engine, demo ──────────
  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtor();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      safe.setGain(gainRef.current);
      ctxRef.current = ctx;
      safeRef.current = safe;

      await buildForTrack(selectedId);

      // arm the seeded self-demo, then let the loop take over
      frozenRef.current = false;
      latchedRef.current = false;
      demoActiveRef.current = true;
      demoStartRef.current = null;
      setDemoActive(true);
      setFrozen(false);
      setLatched(false);
      setStarted(true);
    } catch {
      setError(
        "Couldn't load Karel's recording. Check your connection and try again.",
      );
      const c = ctxRef.current;
      safeRef.current?.disconnect();
      if (c && c.state !== "closed") void c.close();
      ctxRef.current = null;
      safeRef.current = null;
    } finally {
      setStarting(false);
    }
  }, [starting, selectedId, buildForTrack]);

  // ── track switch (after start) ─────────────────────────────────────────────
  const onSelectTrack = useCallback(
    async (id: string) => {
      setSelectedId(id);
      if (!started) return;
      cancelDemo();
      setLoadingTrack(true);
      setError(null);
      frozenRef.current = false;
      setFrozen(false);
      latchedRef.current = false;
      setLatched(false);
      try {
        await buildForTrack(id);
      } catch {
        setError("Couldn't load that recording. Try another track.");
      } finally {
        setLoadingTrack(false);
      }
    },
    [started, buildForTrack, cancelDemo],
  );

  // ── freeze helpers ─────────────────────────────────────────────────────────
  const doFreeze = useCallback(() => {
    const e = engineRef.current;
    if (!e || e.frozen) return;
    e.freeze();
    smearFracRef.current = e.playFrac;
    frozenRef.current = true;
    setFrozen(true);
  }, []);

  const doRelease = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.release();
    frozenRef.current = false;
    setFrozen(false);
  }, []);

  const toggleLatch = useCallback(() => {
    cancelDemo();
    const e = engineRef.current;
    if (!e) return;
    const next = !latchedRef.current;
    latchedRef.current = next;
    setLatched(next);
    if (next) doFreeze();
    else doRelease();
  }, [cancelDemo, doFreeze, doRelease]);

  // ── pointer gestures on the spectrogram ────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const engine = engineRef.current;
      if (!engine) return;
      e.preventDefault();
      cancelDemo();
      canvasRef.current?.setPointerCapture(e.pointerId);
      dragStartXRef.current = e.clientX;
      dragStartFracRef.current = engine.playFrac;
      smearBaseRef.current = smearFracRef.current;
      movedFarRef.current = false;
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        if (!movedFarRef.current) doFreeze();
      }, 160);
    },
    [cancelDemo, doFreeze],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - dragStartXRef.current) / Math.max(1, rect.width);
    if (engine.frozen) {
      const target = clamp01(smearBaseRef.current + dx * spanRef.current);
      smearFracRef.current = target;
      engine.setSmearTarget(target);
    } else {
      engine.scrubTo(clamp01(dragStartFracRef.current + dx * spanRef.current));
      if (Math.abs(e.clientX - dragStartXRef.current) > 8) {
        movedFarRef.current = true;
        if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      }
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
      engineRef.current?.stopSmear();
      if (engineRef.current?.frozen && !latchedRef.current) doRelease();
    },
    [doRelease],
  );

  // ── controls ───────────────────────────────────────────────────────────────
  const applySpread = useCallback((v: number) => {
    setSpread(v);
    spreadRef.current = v;
    engineRef.current?.setSpread(v);
  }, []);

  const applyGain = useCallback((v: number) => {
    setGain(v);
    gainRef.current = v;
    safeRef.current?.setGain(v);
  }, []);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      engineRef.current?.stop();
      viewRef.current?.dispose();
      safeRef.current?.disconnect();
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
    };
  }, []);

  const busy = starting || loadingTrack;
  const modeLabel = !started
    ? "Waiting to begin"
    : frozen
      ? latched
        ? "Frozen (latched) — drag to smear time"
        : "Frozen — release to resume"
      : "Playing — drag to scrub, hold to freeze";

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-8 sm:px-10">
        <header className="max-w-2xl">
          <Link
            href="/dream"
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            ← all prototypes
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Spectral Smear
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Reach into the spectrum of one of Karel&apos;s recordings and smear a
            single instant across time — freeze a chord into an endless shimmer,
            then drag your hand through its overtones.
          </p>
        </header>

        {/* ── the spectrogram stage ── */}
        <div className="relative overflow-hidden rounded-lg border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none select-none"
            style={{ cursor: started ? "ew-resize" : "default" }}
            onPointerDown={started ? onPointerDown : undefined}
            onPointerMove={started ? onPointerMove : undefined}
            onPointerUp={started ? onPointerUp : undefined}
            onPointerCancel={started ? onPointerUp : undefined}
            aria-label="Scrolling spectrogram of Karel's recording — drag to scrub, hold to freeze"
          />

          {/* auto-demo badge */}
          {demoActive && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-border bg-background/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
              auto — hold to freeze
            </div>
          )}

          {/* render-mode / frozen badges */}
          {started && (
            <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
              {frozen && (
                <span className="rounded-full border border-primary/50 bg-primary/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                  frozen
                </span>
              )}
              {renderKind === "canvas2d" && (
                <span className="rounded-full border border-border bg-background/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
                  canvas2d
                </span>
              )}
            </div>
          )}

          {/* pre-start / loading overlay */}
          {(!started || busy) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center backdrop-blur-sm">
              {!started && !busy && (
                <>
                  <button
                    type="button"
                    onClick={() => void start()}
                    className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Enter the spectrum
                  </button>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Loads one of Karel&apos;s real recordings, computes its
                    spectrogram, then hands you its frozen overtones.
                  </p>
                </>
              )}
              {busy && (
                <div className="w-full max-w-xs">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {phase === "decoding"
                      ? "Decoding his recording…"
                      : phase === "analyzing"
                        ? "Computing the spectrogram…"
                        : "Loading…"}
                  </p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150"
                      style={{
                        width: `${Math.round(
                          (phase === "analyzing" ? progress : 0.05) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="text-base text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* ── status ── */}
        <p className="text-sm text-muted-foreground">
          {started ? (
            <>
              <span className="text-foreground">{modeLabel}.</span> Every sound is
              resynthesised from the spectrum of{" "}
              <span className="text-foreground">{title}</span> — his own overtones,
              held and smeared.
            </>
          ) : (
            "Drag horizontally to scrub through his piece; press and hold to freeze a single instant into a shimmering pad; drag while frozen to smear time."
          )}
        </p>

        {/* ── controls ── */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* track */}
          <section className="space-y-2">
            <label
              htmlFor="ss-track"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              His recording {loadingTrack && "· loading…"}
            </label>
            <select
              id="ss-track"
              value={selectedId}
              onChange={(e) => void onSelectTrack(e.target.value)}
              disabled={busy}
              className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-60"
            >
              {REAL_TRACKS.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.title}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              The whole spectrogram and every frozen frame come from this take.
            </p>
          </section>

          {/* freeze latch */}
          <section className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Freeze
            </p>
            <button
              type="button"
              onClick={toggleLatch}
              disabled={!started}
              className={
                latched
                  ? "min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  : "min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              }
            >
              {latched ? "Release the shimmer" : "Latch freeze (hands-free)"}
            </button>
            <p className="text-sm text-muted-foreground">
              Or press and hold the spectrogram for a momentary freeze.
            </p>
          </section>

          {/* spectral spread */}
          <section className="space-y-2">
            <label
              htmlFor="ss-spread"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Spectral spread
            </label>
            <input
              id="ss-spread"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={spread}
              onChange={(e) => applySpread(Number(e.target.value))}
              disabled={!started}
              className="w-full accent-primary"
            />
            <p className="text-sm text-muted-foreground">
              Blurs energy across neighbouring bins — from a crisp frozen chord to
              a wide harmonic wash of his overtones.
            </p>
          </section>

          {/* output level */}
          <section className="space-y-2">
            <label
              htmlFor="ss-gain"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Output level
            </label>
            <input
              id="ss-gain"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={gain}
              onChange={(e) => applyGain(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-sm text-muted-foreground">
              Routed through the shared ear-safety master bus.
            </p>
          </section>
        </div>
      </div>

      {/* ── design notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if you
                could reach into the spectrum of your own recording and smear a
                single instant of it across time — freeze a chord into an infinite
                shimmer, then drag your hand through its overtones?
              </p>
              <p>
                <span className="text-foreground">The instrument.</span> On load we
                run a real short-time Fourier transform over his decoded recording
                (2048-sample Hann frames, 4× overlap) and paint the magnitudes as a
                scrolling spectrogram on a WebGL2 quad — a data render of his own
                sound, not a generated field. Dragging scrubs the analysis
                playhead; you hear his piece resynthesised by inverse-STFT
                overlap-add.
              </p>
              <p>
                <span className="text-foreground">The freeze.</span> Press and hold
                and we capture one frame&apos;s magnitudes, then keep advancing each
                frequency bin&apos;s phase by its measured true increment (the
                expected bin phase plus the principal-value deviation between two
                analysis frames). Magnitudes held, phase marching — a single instant
                sustains forever as a shimmer. This is the classic phase-vocoder
                freeze (Flanagan &amp; Golden 1966; Dolson 1986; phase-locking after
                Laroche &amp; Dolson 1999).
              </p>
              <p>
                <span className="text-foreground">Smear &amp; spread.</span> Dragging
                while frozen retargets the freeze position and crossfades the held
                magnitudes toward that frame — time smears. The spread control box-
                blurs the magnitudes across neighbouring bins, opening a crisp chord
                into a wide harmonic wash.
              </p>
              <p>
                <span className="text-foreground">Honest tradeoffs.</span> Both modes
                share one overlap-add stream normalised by the accumulated window
                energy, so crossings never click. In play mode the frame is analysis-
                and synthesis-windowed (effectively Hann²) which is exact under that
                normalisation; the freeze applies only the synthesis window, a slight
                gain difference that is inaudible on a sustained pad. A tiny seeded
                phase jitter is added during freeze to keep it from ringing metallic
                — a deliberate, documented approximation of a perfect vocoder.
              </p>
              <p>
                <span className="text-foreground">Robustness.</span> WebGL2 absent →
                a Canvas2D spectrogram fallback draws the same viewport via ImageData.
                Reduced-motion stills the shimmer. No strobe: the scroll and freeze
                are smooth luminance. All rendering, textures and audio nodes are torn
                down on unmount.
              </p>
              <p>
                <span className="text-foreground">Audio.</span> Karel&apos;s verified
                catalog only (Welcome Home + Snowflake), every source routed through
                the shared safeMaster bus. No synth tones, no oscillators, no neural
                nets — only resynthesis of his own spectrum.
              </p>
              <p className="pt-1 font-mono text-xs text-muted-foreground/80">
                state:shimmer · pole:freeze↔smear · vibe:ice-cathedral
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["13760-spectralsmear"]} />
    </main>
  );
}
