"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";
import { PartialHarp, bucketOf, mulberry32, renderDemoBuffer, type Partial } from "./engine";

/*
 * 10904 · PARTIAL HARP
 *
 * See the individual harmonic threads inside a sound — and pull one out to
 * silence just that overtone. A live McAulay–Quatieri sinusoidal model tracks
 * the gliding partials of the source; a matched oscillator bank re-synthesizes
 * them. Each thread scrolls left across the canvas (x = time, y = log-frequency,
 * brightness = amplitude). Click a thread to MUTE that partial; shift-click to
 * SOLO it. Because you hear the resynthesis, muting truly subtracts the overtone.
 */

// SSR-safe reduced-motion check, inlined to keep the folder self-contained.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const HISTORY_MS = 6000; // must match the engine's history window

type Phase = "idle" | "playing";

export default function PartialHarpPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const harpRef = useRef<PartialHarp | null>(null);
  const rafRef = useRef<number>(0);
  const reducedRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const pointerRef = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false });
  const hoverIdRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [trackCount, setTrackCount] = useState(0);
  const [mutedCount, setMutedCount] = useState(0);
  const [soloOn, setSoloOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── frequency ↔ y mapping (log scale) ──────────────────────────────────────
  const yOf = useCallback((freq: number, h: number, fMin: number, fMax: number) => {
    const lo = Math.log2(fMin);
    const hi = Math.log2(fMax);
    const norm = (Math.log2(Math.max(fMin, Math.min(fMax, freq))) - lo) / (hi - lo);
    return h * (1 - norm);
  }, []);

  // ── the render loop ─────────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const harp = harpRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !harp || !ctx) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }

    const now = performance.now();
    const tracks = harp.analyze(now);
    const { w, h } = sizeRef.current;
    const reduced = reducedRef.current;
    const fMin = harp.fMin;
    const fMax = harp.fMax;

    // hover hit-test: nearest thread to the pointer
    const ptr = pointerRef.current;
    let hoverId: number | null = null;
    if (ptr.inside) {
      let bestD = 16; // px
      for (const t of tracks) {
        // find the history sample nearest the pointer's x, compare y
        let px = -1;
        let bd = Infinity;
        for (const pt of t.history) {
          const x = w - ((now - pt.t) / HISTORY_MS) * w;
          const d = Math.abs(x - ptr.x);
          if (d < bd) {
            bd = d;
            px = x;
          }
        }
        if (px < 0) continue;
        const y = yOf(t.freq, h, fMin, fMax);
        const dy = Math.abs(y - ptr.y);
        if (dy < bestD && bd < 60) {
          bestD = dy;
          hoverId = t.id;
        }
      }
    }
    hoverIdRef.current = hoverId;

    // ── paint ──
    // near-black ground with a gentle trailing wash (no full-field flashing)
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, w, h);

    // octave gridlines
    ctx.lineWidth = 1;
    for (let f = 55; f <= fMax; f *= 2) {
      if (f < fMin) continue;
      const y = yOf(f, h, fMin, fMax);
      ctx.strokeStyle = "rgba(150,140,200,0.08)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const t of tracks) {
      if (t.history.length < 2) continue;
      const hovered = t.id === hoverId;
      const bloom = Math.min(1, t.age / 12); // newly-born threads bloom in
      const a = Math.max(0, Math.min(1, t.amp * 3.2));

      // violet (fresh / quiet) → gold (loud), on near-black
      const hue = 275 - 230 * Math.min(1, t.amp * 3.5);
      const light = 45 + 30 * a;
      const baseAlpha = (0.15 + 0.8 * a) * bloom * (reduced ? 0.85 : 1);

      if (t.silenced) {
        // muted / solo-excluded: a faint dashed ghost so you can still find it
        ctx.strokeStyle = `hsla(${hue}, 30%, 60%, ${0.16 * bloom})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 6]);
        ctx.shadowBlur = 0;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = `hsla(${hue}, 90%, ${light}%, ${baseAlpha})`;
        ctx.lineWidth = (hovered ? 3.5 : 1) + a * 4.5;
        ctx.shadowColor = `hsla(${hue}, 95%, ${light + 8}%, ${reduced ? 0.4 : 0.9})`;
        ctx.shadowBlur = reduced ? 4 : 6 + a * 12;
      }

      ctx.beginPath();
      let started = false;
      for (const pt of t.history) {
        const x = w - ((now - pt.t) / HISTORY_MS) * w;
        if (x < -4) continue;
        const y = yOf(pt.freq, h, fMin, fMax);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // bright head at the live (right) edge
      if (!t.silenced) {
        const y = yOf(t.freq, h, fMin, fMax);
        ctx.shadowBlur = reduced ? 6 : 10 + a * 14;
        ctx.fillStyle = `hsla(${hue}, 95%, ${light + 12}%, ${baseAlpha})`;
        ctx.beginPath();
        ctx.arc(w - 1, y, (hovered ? 3.5 : 1.5) + a * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (hovered) {
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        const y = yOf(t.freq, h, fMin, fMax);
        ctx.fillStyle = "rgba(240,235,255,0.92)";
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.textAlign = "right";
        const label = `${Math.round(t.freq)} Hz${t.silenced ? " · muted" : ""}`;
        ctx.fillText(label, w - 10, Math.max(14, y - 10));
      }
    }
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    // pointer crosshair guide
    if (ptr.inside) {
      ctx.strokeStyle = "rgba(210,200,255,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ptr.y);
      ctx.lineTo(w, ptr.y);
      ctx.stroke();
    }

    // cheap HUD counters (throttled state updates)
    setTrackCount(tracks.length);
    setMutedCount(harp.mutedBuckets.size);

    rafRef.current = requestAnimationFrame(runFrame);
  }, [yOf]);

  // ── canvas sizing ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const c = canvas.getContext("2d");
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── mount: build the audio graph, start the seeded demo, run analysis ─────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();

    const AC: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      setError("Web Audio is not available in this browser.");
      return;
    }
    const ctx = new AC();
    ctxRef.current = ctx;
    const master = createSafeMaster(ctx);
    master.setGain(0); // silent until the first user gesture
    masterRef.current = master;
    const harp = new PartialHarp(ctx, master);
    harpRef.current = harp;

    // seeded demo phrase drives the analyzer immediately — self-demos headless
    const prng = mulberry32(0x10904);
    harp.setBuffer(renderDemoBuffer(ctx, prng));

    // best-effort resume so visuals animate even before a gesture (headless / permissive)
    ctx.resume().catch(() => {});

    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      harpRef.current?.teardown();
      masterRef.current?.disconnect();
      const c = ctxRef.current;
      ctxRef.current = null;
      harpRef.current = null;
      masterRef.current = null;
      if (c && c.state !== "closed") c.close().catch(() => {});
    };
  }, [runFrame]);

  const startAudio = useCallback(async () => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    try {
      await ctx.resume();
      master.setGain(0.9);
      setPhase("playing");
      setError(null);
    } catch {
      setError("Could not start audio. Try interacting with the page again.");
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      const ctx = ctxRef.current;
      const harp = harpRef.current;
      if (!ctx || !harp) return;
      setError(null);
      try {
        const arr = await file.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        harp.setBuffer(buf);
        await startAudio();
      } catch {
        setError("Could not decode that audio file. Try a WAV, MP3, or OGG.");
      }
    },
    [startAudio],
  );

  const loadDemo = useCallback(async () => {
    const ctx = ctxRef.current;
    const harp = harpRef.current;
    if (!ctx || !harp) return;
    harp.setBuffer(renderDemoBuffer(ctx, mulberry32(0x10904)));
    await startAudio();
  }, [startAudio]);

  // ── pointer interaction: click = mute, shift-click = solo ─────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, inside: true };
  }, []);

  const onPointerLeave = useCallback(() => {
    pointerRef.current = { ...pointerRef.current, inside: false };
  }, []);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const harp = harpRef.current;
      if (!harp) return;
      const id = hoverIdRef.current;
      const track = id != null ? harp.tracks.find((t) => t.id === id) : null;
      const bucket = track ? track.bucket : null;
      if (bucket == null) return;
      if (e.shiftKey) {
        harp.soloBucketToggle(bucket);
        setSoloOn(harp.soloBucket !== null);
      } else {
        harp.toggleMuteBucket(bucket);
      }
      // resume on this gesture too, in case Start was never pressed
      if (phase === "idle") void startAudio();
    },
    [phase, startAudio],
  );

  const resetSelection = useCallback(() => {
    harpRef.current?.clearSelection();
    setSoloOn(false);
    setMutedCount(0);
  }, []);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            10904 · sinusoidal partial tracking
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Partial Harp</h1>
          <p className="text-base text-muted-foreground">
            See the individual harmonic threads inside a sound — then pull one out to silence just that overtone.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={loadDemo}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {phase === "playing" ? "Restart phrase" : "Start · play built-in phrase"}
          </button>

          <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground flex items-center">
            Drop / choose an audio file
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </label>

          <button
            type="button"
            onClick={resetSelection}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear mutes / solo
          </button>

          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div
          className="relative overflow-hidden rounded-md border border-border"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
        >
          <canvas
            ref={canvasRef}
            className="block h-[62vh] w-full touch-none"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onClick={onCanvasClick}
          />
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{trackCount} live partials</span>
            <span>
              {mutedCount} muted{soloOn ? " · solo on" : ""}
            </span>
          </div>
          {phase === "idle" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              threads are already tracking · press Start to hear the resynthesis
            </div>
          )}
        </div>

        <p className="text-base text-muted-foreground">
          x = time · y = log-frequency · brightness = that partial&apos;s amplitude. Hover a glowing thread, then{" "}
          <span className="text-foreground">click to mute</span> that overtone or{" "}
          <span className="text-foreground">shift-click to solo</span> it. You hear the re-synthesized partials, so a
          muted thread is truly gone from the sound.
        </p>

        {showNotes && (
          <section className="flex flex-col gap-3 rounded-md border border-border bg-background/60 p-5 text-base text-muted-foreground">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Design notes</h2>
            <p>
              This is a live <span className="text-foreground">McAulay–Quatieri sinusoidal model</span> (1986). Every
              frame a 4096-point FFT is peak-picked (parabolic-interpolated for sub-bin frequency accuracy); those peaks
              are matched to the previous frame&apos;s partial tracks by nearest log-frequency. Unmatched tracks die and
              fade; loud unmatched peaks are born. A bank of oscillators re-synthesizes the tracks, so muting a thread
              subtracts exactly one overtone from what you hear — the harmonic anatomy of a sound, made playable.
            </p>
          </section>
        )}
      </div>

      <PrototypeNav slugs={["10904-partialharp"]} />
    </main>
  );
}
