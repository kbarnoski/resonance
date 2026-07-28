"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { TightropeScene } from "./scene";
import { TightropeSynth } from "./synth";
import { WalkerBalance, FALL_LEAN, type WalkerState } from "./physics";
import { analyzeNote, KEY_TO_MIDI, type NoteAnalysis } from "./harmony";

type Status = "idle" | "playing" | "fallen" | "won";

const LEGEND: { keys: string; label: string }[] = [
  { keys: "Z X C V B N M", label: "in-key notes (C major) — steady him" },
  { keys: "S D  ·  G H J", label: "the sharps between — a little tension" },
  { keys: "Q W E R T Y U", label: "the octave above" },
  { keys: "5  ·  G", label: "F♯ / the tritone — real danger" },
];

/** 2-D fallback meter drawn when WebGL is unavailable. */
function draw2DFallback(
  cv: HTMLCanvasElement,
  s: WalkerState,
): void {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#06070d";
  ctx.fillRect(0, 0, w, h);

  const midY = h * 0.62;
  const startX = w * 0.12;
  const endX = w * 0.88;
  const x = startX + (endX - startX) * s.progress;

  // wire
  const tension = s.wobble;
  ctx.strokeStyle = `rgb(${Math.round(142 + tension * 40)}, ${Math.round(
    160 - tension * 90,
  )}, ${Math.round(200 - tension * 80)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, midY);
  ctx.lineTo(endX, midY);
  ctx.stroke();

  // far platform glow
  ctx.fillStyle = `rgba(58,111,90,${0.3 + s.progress * 0.6})`;
  ctx.fillRect(endX, midY - 10, 24, 20);

  // walker (leaning line + pole)
  const drop = s.fallen ? 90 : 0;
  const lean = s.lean + (s.fallen ? Math.sign(s.lean || 1) * 1.2 : 0);
  ctx.save();
  ctx.translate(x, midY + drop);
  ctx.rotate(-lean);
  ctx.strokeStyle = "#e8e4de";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -44);
  ctx.stroke();
  ctx.fillStyle = "#e8e4de";
  ctx.beginPath();
  ctx.arc(0, -52, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#9a86f0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-46, -30);
  ctx.lineTo(46, -30);
  ctx.stroke();
  ctx.restore();
}

export default function TightropePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<TightropeScene | null>(null);
  const synthRef = useRef<TightropeSynth | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const walkerRef = useRef<WalkerBalance | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const prevMidiRef = useRef<number | null>(null);
  const statusRef = useRef<Status>("idle");

  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const balanceDotRef = useRef<HTMLDivElement | null>(null);
  const distanceRef = useRef<HTMLSpanElement | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [lastNote, setLastNote] = useState<NoteAnalysis | null>(null);

  const setBoth = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    synthRef.current?.stop();
    synthRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 1600);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const updateMeters = useCallback((s: WalkerState) => {
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${Math.round(s.progress * 100)}%`;
    }
    if (distanceRef.current) {
      distanceRef.current.textContent = `${Math.round((1 - s.progress) * 100)}%`;
    }
    if (balanceDotRef.current) {
      const frac = Math.max(-1, Math.min(1, s.lean / FALL_LEAN));
      balanceDotRef.current.style.transform = `translateX(${frac * 48}px)`;
      const danger = Math.min(1, s.wobble);
      balanceDotRef.current.style.backgroundColor =
        danger > 0.6 ? "var(--destructive)" : "var(--primary)";
    }
  }, []);

  const drive = useCallback(() => {
    const now = performance.now();
    let dt = (now - lastRef.current) / 1000;
    lastRef.current = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    const walker = walkerRef.current;
    if (walker) {
      walker.step(dt);
      const snap = walker.snapshot();
      synthRef.current?.setWobble(snap.wobble);
      if (sceneRef.current) sceneRef.current.render(snap, dt);
      else if (canvasRef.current) draw2DFallback(canvasRef.current, snap);
      updateMeters(snap);

      if (snap.fallen && statusRef.current === "playing") {
        synthRef.current?.collapse();
        setBoth("fallen");
      } else if (snap.won && statusRef.current === "playing") {
        setBoth("won");
      }
    }
    rafRef.current = requestAnimationFrame(drive);
  }, [setBoth, updateMeters]);

  const begin = useCallback(async () => {
    if (statusRef.current !== "idle") return;
    const container = containerRef.current;
    if (!container) return;

    // Visuals (WebGL may be unavailable → 2-D fallback, sound still plays).
    try {
      sceneRef.current = new TightropeScene(container);
      setWebglOk(true);
    } catch {
      sceneRef.current = null;
      setWebglOk(false);
    }

    // Audio.
    try {
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      ctxRef.current = ctx;
      synthRef.current = new TightropeSynth(ctx);
    } catch {
      /* no audio — the balance game still runs silently */
    }

    walkerRef.current = new WalkerBalance();
    prevMidiRef.current = null;
    setLastNote(null);
    lastRef.current = performance.now();
    setBoth("playing");
    rafRef.current = requestAnimationFrame(drive);
  }, [drive, setBoth]);

  const restart = useCallback(() => {
    walkerRef.current?.reset();
    synthRef.current?.reset();
    sceneRef.current?.resetVisual();
    prevMidiRef.current = null;
    setLastNote(null);
    setBoth("playing");
  }, [setBoth]);

  // Keyboard instrument.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const midi = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midi === undefined) return;
      e.preventDefault();
      if (statusRef.current !== "playing") return;
      const note = analyzeNote(midi, prevMidiRef.current);
      prevMidiRef.current = midi;
      walkerRef.current?.applyNote(note);
      synthRef.current?.pluck(midi, note.tension);
      setLastNote(note);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the renderer sized to the window.
  useEffect(() => {
    const onResize = () => {
      sceneRef.current?.resize();
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.clientWidth;
        canvasRef.current.height = canvasRef.current.clientHeight;
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const started = status !== "idle";

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#06070d] text-foreground">
      {/* three.js canvas mounts here */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* 2-D fallback surface (only used when WebGL is unavailable) */}
      {started && !webglOk && (
        <canvas
          ref={(el) => {
            canvasRef.current = el;
            if (el) {
              el.width = el.clientWidth;
              el.height = el.clientHeight;
            }
          }}
          className="absolute inset-0 h-full w-full"
        />
      )}

      {/* Vignette for legibility */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(6,7,13,0.7)_100%)]" />

      {/* ── Idle / start ─────────────────────────────────────────────────── */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-lg border border-border bg-background/70 p-8 backdrop-blur-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Resonance · dream lab
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Tightrope
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A melody with stakes. Every note you play is measured against the
              sounding key — a consonant, in-key choice steadies the walker and
              strides him toward the far platform; a jarring, out-of-key note
              shoves his balance. Play badly and he falls.
            </p>

            <button
              type="button"
              onClick={begin}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>

            <div className="mt-6 space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Keys
              </p>
              {LEGEND.map((row) => (
                <div key={row.keys} className="flex items-baseline gap-3 text-sm">
                  <span className="min-w-[9.5rem] font-mono text-foreground">
                    {row.keys}
                  </span>
                  <span className="text-muted-foreground">{row.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Running HUD ──────────────────────────────────────────────────── */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Tightrope</h1>
              {!webglOk && (
                <p className="mt-1 max-w-sm text-base text-destructive">
                  WebGL is unavailable, so the 3-D circus can&apos;t render — the
                  instrument still plays against a 2-D balance meter.
                </p>
              )}
            </div>

            {/* Last note read-out */}
            <div className="min-w-[10rem] text-right">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Last note
              </p>
              {lastNote ? (
                <>
                  <p className="text-2xl font-semibold tracking-tight">
                    {lastNote.name}
                  </p>
                  <p
                    className={
                      lastNote.tension > 0.6
                        ? "text-sm text-destructive"
                        : lastNote.isChordTone
                          ? "text-sm text-primary"
                          : "text-sm text-muted-foreground"
                    }
                  >
                    {lastNote.isChordTone
                      ? "chord tone · steady"
                      : lastNote.isDiatonic
                        ? "in key · mild"
                        : "chromatic · danger"}{" "}
                    · tension {Math.round(lastNote.tension * 100)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">play a note…</p>
              )}
            </div>
          </div>

          {/* Meters */}
          <div className="flex flex-wrap items-center gap-6">
            {/* Progress / distance to safety */}
            <div className="min-w-[16rem] flex-1">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Progress to safety
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  <span ref={distanceRef}>100%</span> to go
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  ref={progressFillRef}
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: "0%" }}
                />
              </div>
            </div>

            {/* Balance */}
            <div className="min-w-[10rem]">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Balance
              </span>
              <div className="relative mt-1.5 h-1.5 w-[112px] rounded-full bg-border">
                <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-muted-foreground/60" />
                <div
                  ref={balanceDotRef}
                  className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                  style={{ transform: "translateX(0px)" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fallen / won overlay ─────────────────────────────────────────── */}
      {(status === "fallen" || status === "won") && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-md rounded-lg border border-border bg-background/80 p-8 text-center backdrop-blur-md">
            <h2 className="text-2xl font-semibold tracking-tight">
              {status === "won" ? "Crossed." : "He fell."}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {status === "won"
                ? "You kept the tension low and musical all the way across."
                : "A run of dissonance tipped him past the edge. The music collapsed to silence."}
            </p>
            <button
              type="button"
              onClick={restart}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {status === "won" ? "Walk again" : "Try again"}
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["3360-tightrope"]} />
    </main>
  );
}
