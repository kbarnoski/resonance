"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14336 · tidalstrata — a ~10-minute geological drift. Three or four of Karel's
// real recordings are held as simultaneous STRATA, slowly spectrally reshaped
// and swapped, so the piece is a single evolving landmass that remembers every
// layer it has passed through. The lab's first long-form flagship; the
// spectral-layer engine (no grains).
//
//   ONE QUESTION — What if your whole catalog became a slow geological drift:
//   a single evolving landmass, remembering every layer it has passed through?
//
//   ENGINE  Two timescales. A SLOW form scaffold (a Markov-ish walk over which
//           tracks are foregrounded, a rising/falling sea level, migrating
//           spectral prisms) moves every ~30–75 s. A FAST per-frame process
//           glides every gain and filter so the mass is liquid and never clicks.
//           MEMORY: retired strata leave faint residues that can resurface.
//   INPUT   Autonomous (it plays itself) + light keyboard nudges.
//   OUTPUT  An accreting Canvas2D geological cross-section (earthy sediment).
//
//   References: arXiv:2603.21282 (Fusing Memory and Attention — LSTM local
//   continuity + Transformer global structure → hybrid slow/fast engine);
//   arXiv:2603.00576 (SSM global scaffold + local refinement); Brian Eno's
//   generative long-form lineage (Reflection).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { REAL_TRACKS } from "../_shared/welcomeHome";
import {
  StrataEngine,
  TOTAL_SECONDS,
  seaArc,
  type MemoryEntry,
} from "./strata";
import { SedimentRecord, drawScene, type RenderState } from "./render";

const CANVAS_H = 480;
const DEPOSIT_RATE = 1.05; // px/sec per unit of summed active gain

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Page() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState({ elapsed: 0, active: 0, sea: 1, prism: 0 });
  const [memory, setMemory] = useState<MemoryEntry[]>([]);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<StrataEngine | null>(null);
  const recordRef = useRef<SedimentRecord | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCtxTimeRef = useRef(0);
  const pausedRef = useRef(false);

  // ── render loop (owned for the component lifetime; draws idle bone too) ──────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const g = canvas.getContext("2d");
    if (!g) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 900;
    const cssH = CANVAS_H;
    if (canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!recordRef.current) recordRef.current = new SedimentRecord();
    const record = recordRef.current;
    const engine = engineRef.current;

    const ctxTime = ctxRef.current?.currentTime ?? 0;
    const dt = clamp(ctxTime - lastCtxTimeRef.current, 0, 0.1);
    lastCtxTimeRef.current = ctxTime;

    let state: RenderState;
    if (engine && !pausedRef.current) {
      engine.frame();
      const view = engine.view();
      const elapsed = engine.elapsed;
      const sumGain = view
        .filter((s) => s.phase !== "residue")
        .reduce((a, s) => a + s.gain, 0);
      record.step(dt, sumGain * DEPOSIT_RATE, view, elapsed);
      const seaTarget = clamp(
        Math.round(seaArc(elapsed)) + engine.seaOffsetValue,
        1,
        4,
      );
      state = { active: view, elapsed, total: TOTAL_SECONDS, seaTarget, prismShift: engine.prismShiftValue };
    } else if (engine) {
      // paused — hold the frame, keep drawing the still landmass
      const view = engine.view();
      const seaTarget = clamp(
        Math.round(seaArc(engine.elapsed)) + engine.seaOffsetValue,
        1,
        4,
      );
      state = {
        active: view,
        elapsed: engine.elapsed,
        total: TOTAL_SECONDS,
        seaTarget,
        prismShift: engine.prismShiftValue,
      };
    } else {
      state = { active: [], elapsed: 0, total: TOTAL_SECONDS, seaTarget: 1, prismShift: 0 };
    }

    drawScene(g, record, cssW, cssH, state);
    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [drawFrame]);

  // ── slow HUD / memory poll (1 Hz, no per-frame React churn) ──────────────────
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const view = engine.view();
      const active = view.filter((s) => s.phase !== "residue").length;
      setHud({
        elapsed: engine.elapsed,
        active,
        sea: clamp(Math.round(seaArc(engine.elapsed)) + engine.seaOffsetValue, 1, 4),
        prism: engine.prismShiftValue,
      });
      setMemory(engine.memory().slice(-8).reverse());
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // ── teardown ─────────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
    pausedRef.current = false;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // ── begin the drift ───────────────────────────────────────────────────────────
  const begin = useCallback(async () => {
    if (running || loading) return;
    setError(null);
    setLoading(true);
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) throw new Error("Web Audio is not available in this browser.");
      const ctx = new AudioCtor();
      await ctx.resume();
      ctxRef.current = ctx;
      lastCtxTimeRef.current = ctx.currentTime;

      const master = createSafeMaster(ctx);
      master.setGain(0.85);
      masterRef.current = master;

      const engine = new StrataEngine(ctx, master.input, REAL_TRACKS);
      await engine.begin(); // seeds the first stratum before we hand off
      engineRef.current = engine;

      pausedRef.current = false;
      setPaused(false);
      setRunning(true);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      teardown();
      setError(
        e instanceof Error ? `Could not start: ${e.message}` : "Could not start the drift.",
      );
    }
  }, [running, loading, teardown]);

  const stop = useCallback(() => {
    teardown();
    setRunning(false);
    setPaused(false);
    setMemory([]);
    setHud({ elapsed: 0, active: 0, sea: 1, prism: 0 });
  }, [teardown]);

  const togglePause = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx || !running) return;
    if (pausedRef.current) {
      await ctx.resume();
      lastCtxTimeRef.current = ctx.currentTime;
      pausedRef.current = false;
      setPaused(false);
    } else {
      await ctx.suspend();
      pausedRef.current = true;
      setPaused(true);
    }
  }, [running]);

  // ── keyboard nudges ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          engine.nudgeSea(1);
          break;
        case "ArrowDown":
          e.preventDefault();
          engine.nudgeSea(-1);
          break;
        case "ArrowLeft":
        case "[":
          e.preventDefault();
          engine.nudgePrism(-1); // warmer (lower centers)
          break;
        case "ArrowRight":
        case "]":
          e.preventDefault();
          engine.nudgePrism(1); // cooler (higher centers)
          break;
        case " ":
          e.preventDefault();
          void togglePause();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, togglePause]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 text-foreground">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            14336 · tidalstrata
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            A ten-minute geological drift
          </h1>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="mt-1 shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Read the design notes
        </button>
      </div>

      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        Three or four of Karel&apos;s recordings are held as simultaneous{" "}
        <em>strata</em> — looped, slowly spectrally reshaped, and swapped over ten
        minutes. A slow form scaffold moves the mass every half-minute or so; a
        fast per-frame process keeps it liquid. When a layer fades it leaves a
        faint residue that can resurface minutes later, so the piece remembers
        every layer it has passed through. It plays itself.
      </p>

      {/* controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!running ? (
          <button
            onClick={begin}
            disabled={loading}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Gathering sediment…" : "Begin the drift"}
          </button>
        ) : (
          <>
            <button
              onClick={togglePause}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              End
            </button>
          </>
        )}
      </div>

      {/* status row */}
      {running && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span className="text-primary">
            {fmt(hud.elapsed)} / {fmt(TOTAL_SECONDS)}
          </span>
          <span>strata · {hud.active}</span>
          <span>sea level · {hud.sea}</span>
          <span>
            prism · {hud.prism === 0 ? "neutral" : hud.prism < 0 ? `warm ${hud.prism.toFixed(2)}` : `cool +${hud.prism.toFixed(2)}`}
          </span>
          {paused && <span className="text-destructive">paused</span>}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* the cross-section */}
      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <canvas ref={canvasRef} className="block w-full" style={{ height: CANVAS_H }} />
      </div>

      {/* memory log */}
      {running && memory.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            sediment memory
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {memory.map((m, i) => (
              <li key={`${m.title}-${m.at}-${i}`} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: `hsl(${m.hue}, 46%, 46%)` }}
                  aria-hidden
                />
                <span>
                  {fmt(m.at)} · {m.title}{" "}
                  <span className="text-muted-foreground/60">{m.event}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        {running
          ? "It runs on its own. Nudge it if you like."
          : "Press begin, then let it drift. It needs no further input."}
      </p>
      <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        keys · ↑ ↓ raise / lower the sea level · ← → (or [ ]) shift the prism warm / cool · space pause
      </p>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The question.</strong> What if
                your whole catalog became a ten-minute geological drift — a single
                evolving landmass that remembers every layer it has passed through?
              </p>
              <p>
                <strong className="text-foreground">Two timescales.</strong> A{" "}
                <em>slow</em> form scaffold moves once every ~30–75 s: a Markov-ish
                walk over which recordings are foregrounded as strata, a sea level
                that swells toward the middle and resolves near the end, and a
                spectral prism on each stratum whose center slowly migrates. A{" "}
                <em>fast</em> per-frame process glides every gain and filter so the
                mass is liquid and never clicks.
              </p>
              <p>
                <strong className="text-foreground">Memory.</strong> A retired
                stratum is not stopped — it becomes a faint, heavily lowpassed
                residue that lingers in the background and can be pulled back up
                minutes later. The record you watch accretes downward, so buried
                layers are legible and their return is visible.
              </p>
              <p>
                <strong className="text-foreground">The catalog.</strong> Every
                sound is one of Karel&apos;s real recordings, looped seamlessly and
                shaped only by filter and gain. No oscillators, no synthesis.
              </p>
              <p>
                <strong className="text-foreground">Lineage.</strong>{" "}
                arXiv:2603.21282 (memory + attention → hybrid slow/fast engine),
                arXiv:2603.00576 (global scaffold + local refinement), and Brian
                Eno&apos;s generative long-form lineage (<em>Reflection</em>).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14336-tidalstrata"]} />
    </main>
  );
}
