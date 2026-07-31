"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4360 · Cymatic
//
//   ONE QUESTION — What does a pitch look like?
//
//   A driven Chladni plate. A square plate is excited at a chosen frequency; the
//   plate displacement is a superposition of square-plate eigenmodes
//   Φ_mn = cos(mπx)cos(nπy) ± cos(nπx)cos(mπy), each weighted by a Lorentzian
//   resonance response peaked at its natural frequency. Thousands of "sand"
//   particles do a damped Newton descent onto the nodal set A(p)=0 (with a jitter
//   proportional to local displacement — sand bounces off the antinodes), so the
//   cloud collapses onto the exact geometric figure of the pitch. Drag the drive
//   frequency and the figure reorganises live into the next mode while the plate
//   audibly sings that tone.
//
//   INPUT  pointer (drag horizontally to sweep the drive) + keyboard
//          (A S D F G H J K jump to 8 named modes, Space agitates) + a slider.
//   OUTPUT WebGPU compute-shader particle sim (N≈100k, additive violet points),
//          with a REQUIRED Canvas2D fallback (~4k) when navigator.gpu is absent.
//   REF    Ernst Chladni, Entdeckungen über die Theorie des Klanges (1787) — the
//          sand-figure experiments; cf. Hans Jenny, Cymatics (1967).  See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeRng, makeWeights, MODES, FREQ_MIN, FREQ_MAX } from "./modes";
import { makeGpuBackend, type Backend } from "./gpu";
import { makeCpuBackend } from "./cpu";
import { PlateAudio } from "./audio";

const AUTO_SEQ = [0, 1, 2, 3, 2, 1]; // named-mode indices the demo sweeps through
const AUTO_HOLD = 3.2; // seconds each demo target is held (glide is continuous)

export default function CymaticPage() {
  const [backendKind, setBackendKind] = useState<"webgpu" | "cpu" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [freqUi, setFreqUi] = useState(98);
  const [domUi, setDomUi] = useState(0);
  const [strengthUi, setStrengthUi] = useState(0);
  const [autoUi, setAutoUi] = useState(true);
  const [agitateUi, setAgitateUi] = useState(false);
  const [soundLocked, setSoundLocked] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backendRef = useRef<Backend | null>(null);
  const audioRef = useRef<PlateAudio | null>(null);
  const rafRef = useRef(0);

  const freqRef = useRef(98); // eased actual drive frequency
  const targetRef = useRef(98); // goal frequency (autopilot / key / slider set this)
  const autoRef = useRef(true);
  const agitateRef = useRef(false);
  const reducedRef = useRef(false);

  const startTsRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartFreqRef = useRef(98);

  // single mount effect: audio + backend init, rAF loop, and all input handlers
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.offsetWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.offsetHeight * dpr));
    };
    sizeCanvas();

    let disposed = false;

    // ── audio (created up front; unlocks on the first gesture) ────────────────
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const audio = new PlateAudio(ctx);
      audio.start();
      audioRef.current = audio;
      // best-effort resume; will still be suspended pre-gesture in most browsers
      audio.resume().then(() => {
        if (!disposed) setSoundLocked(audioRef.current?.suspended() ?? true);
      });
      setSoundLocked(audio.suspended());
    } catch {
      setError("Web Audio is unavailable — the plate is silent, but still draws.");
    }

    // ── backend: WebGPU primary, Canvas2D fallback ────────────────────────────
    const initBackend = async () => {
      const rng = makeRng(0x4360);
      let backend: Backend;
      try {
        backend = await makeGpuBackend(canvas, rng);
      } catch {
        try {
          backend = makeCpuBackend(canvas, makeRng(0x4360));
        } catch {
          setError("Neither WebGPU nor Canvas2D could start on this device.");
          return;
        }
      }
      if (disposed) {
        backend.destroy();
        return;
      }
      backendRef.current = backend;
      setBackendKind(backend.kind);
    };
    void initBackend();

    // ── main loop ─────────────────────────────────────────────────────────────
    let hud = 0;
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (startTsRef.current == null) startTsRef.current = ts;
      const elapsed = (ts - startTsRef.current) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTsRef.current) / 1000));
      lastTsRef.current = ts;

      // autopilot: glide through the demo sequence until a gesture takes over
      if (autoRef.current) {
        const idx = Math.floor(elapsed / AUTO_HOLD) % AUTO_SEQ.length;
        targetRef.current = MODES[AUTO_SEQ[idx]].fk;
      }
      // ease actual frequency toward the target (continuous sweep)
      freqRef.current += (targetRef.current - freqRef.current) * Math.min(1, dt * 5);

      const be = backendRef.current;
      if (be) {
        const wm = makeWeights(freqRef.current);
        const W = canvas.width;
        const H = canvas.height;
        const s = 0.9 * Math.min(W, H);
        const scaleX = s / W;
        const scaleY = s / H;
        const baseJit = reducedRef.current ? 0.006 : 0.014;
        const jitter = agitateRef.current ? 0.16 : baseJit;
        const rate = agitateRef.current ? 0.0 : 0.55;
        be.step({ weights: wm.w, jitter, rate, time: elapsed, scaleX, scaleY });

        const audio = audioRef.current;
        if (audio) audio.update(freqRef.current, wm.strength);

        hud += 1;
        if (hud % 8 === 0) {
          setFreqUi(freqRef.current);
          setDomUi(wm.dominant);
          setStrengthUi(wm.strength);
          setAutoUi(autoRef.current);
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── the first gesture unlocks audio + hands control to the visitor ────────
    const unlockAudio = () => {
      const audio = audioRef.current;
      if (audio) audio.resume().then(() => setSoundLocked(audio.suspended()));
    };

    // ── pointer: horizontal drag sweeps the drive frequency ───────────────────
    const onPointerDown = (e: PointerEvent) => {
      unlockAudio();
      draggingRef.current = true;
      autoRef.current = false;
      setAutoUi(false);
      dragStartXRef.current = e.clientX;
      dragStartFreqRef.current = freqRef.current;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartXRef.current;
      const span = Math.max(240, canvas.offsetWidth * 0.8);
      const f =
        dragStartFreqRef.current + (dx / span) * (FREQ_MAX - FREQ_MIN);
      const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, f));
      targetRef.current = clamped;
      freqRef.current = clamped;
    };
    const onPointerUp = (e: PointerEvent) => {
      draggingRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
    };

    // ── keyboard: A S D F G H J K jump modes, Space agitates ──────────────────
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mi = MODES.findIndex((m) => m.key === k);
      if (mi >= 0) {
        e.preventDefault();
        unlockAudio();
        autoRef.current = false;
        setAutoUi(false);
        targetRef.current = MODES[mi].fk;
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        unlockAudio();
        agitateRef.current = !agitateRef.current;
        setAgitateUi(agitateRef.current);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", sizeCanvas);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", sizeCanvas);
      if (backendRef.current) {
        backendRef.current.destroy();
        backendRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
    };
  }, []);

  // slider handler (kept out of the effect so it can read/write refs directly)
  const onSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    autoRef.current = false;
    setAutoUi(false);
    targetRef.current = v;
    freqRef.current = v;
    setFreqUi(v);
    const audio = audioRef.current;
    if (audio) audio.resume().then(() => setSoundLocked(audio.suspended()));
  };

  const mode = MODES[domUi] ?? MODES[0];
  const strengthPct = Math.round(strengthUi * 100);

  return (
    <div className="relative h-screen w-full touch-none overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-ew-resize" />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Cymatic
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            What does a pitch look like? A driven Chladni plate: sand migrates off
            the vibrating antinodes and settles onto the standing-wave nodal lines,
            drawing the exact figure of the tone you hear. Drag to sweep the pitch.
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
      </div>

      {/* Controls / HUD */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {backendKind === "webgpu"
              ? "GPU · webgpu compute"
              : backendKind === "cpu"
                ? "CPU · canvas2d fallback"
                : "initialising…"}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {Math.round(freqUi)} Hz · {mode.label}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {mode.note} · resonance {strengthPct}%
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {autoUi ? "autopilot" : "you"}
            {agitateUi ? " · agitating" : ""}
          </span>
          {backendKind === "cpu" && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">
              WebGPU unavailable — Canvas fallback
            </span>
          )}
        </div>

        {/* Frequency slider (touch-draggable) */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={FREQ_MIN}
            max={FREQ_MAX}
            step={1}
            value={Math.round(freqUi)}
            onChange={onSlider}
            aria-label="drive frequency"
            className="h-11 w-full max-w-md accent-primary"
          />
          <div className="flex-1" />
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span className="text-foreground">drag</span> sweep pitch ·{" "}
          <span className="text-foreground">A S D F G H J K</span> jump modes ·{" "}
          <span className="text-foreground">space</span> agitate
          {soundLocked && (
            <span className="text-primary"> · tap or drag to enable sound</span>
          )}
        </p>

        {error && <p className="max-w-lg text-sm text-destructive">{error}</p>}
      </div>

      {/* Design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              What does a pitch look like?
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Ernst Chladni (1787) bowed metal plates dusted with sand and found
                that each pitch drove the sand into a distinct geometric figure —
                the visible signature of a standing wave. This is that experiment,
                simulated.
              </p>
              <p>
                The plate displacement is modelled as a superposition of square-plate
                eigenmodes Φ<sub>mn</sub> = cos(mπx)cos(nπy) ± cos(nπx)cos(mπy). Each
                mode&apos;s weight is a Lorentzian resonance response peaked at its
                natural frequency, so the drive frequency selects which modes ring.
                Every &quot;sand&quot; particle does a damped Newton descent onto the
                nodal set A(p)=0, plus a jitter proportional to local displacement
                (sand bounces where the plate moves most) — the cloud collapses onto
                the nodal figure, and reorganises as you sweep the pitch.
              </p>
              <p>
                Sound is synthesised, not analysed: a fundamental at the drive
                frequency plus a few inharmonic plate partials, brightening and
                swelling as the drive nears a resonance.
              </p>
              <p className="text-xs">
                WebGPU compute path integrates ≈100k particles; a Canvas2D path
                (≈4k) runs the identical model when WebGPU is absent. Ref: E. Chladni,
                Entdeckungen über die Theorie des Klanges (1787); H. Jenny, Cymatics
                (1967).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
