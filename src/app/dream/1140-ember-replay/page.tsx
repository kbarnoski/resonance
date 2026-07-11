"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Ember Replay — a psychedelic hallucination as TOP-DOWN REPLAY of a learned
// world, drug-free, using Karel's real recorded piano as the world.
//
// A 2026 eLife computational study modelled classical psychedelics as shifting
// perception away from bottom-up sensory inference toward a generative REPLAY of
// a learned visual world — so hallucination looks less like noise and more like
// recombined wake-time memory. This piece LEARNS a real recording into a
// vocabulary of captured grains, then REPLAYS those actual grains recombined,
// each bloom a warm-ember mote in a slowly-breathing constellation, over a warm
// just-intonation drone.  (Refik Anadol — memory as living pigment · Brian Eno —
// generative systems music.)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeGrains,
  loadFile,
  loadTrackById,
  makeReplayEngine,
  mulberry32,
  renderDemoBuffer,
  type ReplayEngine,
  type ReplayEvent,
} from "./audio";

type Phase = "idle" | "loading" | "live" | "error";

interface Mote {
  x: number; // normalized 0..1 home position
  y: number;
  born: number; // performance.now seconds
  life: number; // seconds
  size: number;
  warm: number; // 0..1 → deep rust → pale ember
  bright: number; // peak alpha
}

// Warm-ember palette: deep rust → amber → gold → pale ember. `warm` 0..1.
function emberColor(warm: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [120, 38, 14], // deep rust
    [196, 84, 24], // amber
    [236, 148, 52], // gold
    [255, 214, 150], // pale ember
  ];
  const t = Math.min(0.999, Math.max(0, warm)) * (stops.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export default function EmberReplayPage() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<ReplayEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const motesRef = useRef<Mote[]>([]);
  const homesRef = useRef<{ x: number; y: number }[]>([]);
  const trailRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const levelRef = useRef(0);
  const startedAtRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioOk, setAudioOk] = useState(true);
  const [modeLabel, setModeLabel] = useState("");
  const [grainCount, setGrainCount] = useState(0);
  const [trackId, setTrackId] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const [density, setDensity] = useState(0.45);
  const [drift, setDrift] = useState(0.35);
  const [register, setRegister] = useState(0.5);
  const [bloom, setBloom] = useState(0.6);

  // ── constellation home positions for a vocabulary of N grains ───────────────
  const layoutHomes = useCallback((n: number) => {
    const rng = mulberry32(0x51ede5 ^ n);
    const homes: { x: number; y: number }[] = [];
    const count = Math.max(1, n);
    for (let i = 0; i < count; i++) {
      // a loose golden-angle spiral so recurring grains bloom in a stable place
      const a = i * 2.399963 + rng() * 0.5;
      const rad = 0.12 + 0.36 * Math.sqrt((i + 0.5) / count) + (rng() - 0.5) * 0.05;
      homes.push({
        x: 0.5 + Math.cos(a) * rad * 0.82,
        y: 0.5 + Math.sin(a) * rad,
      });
    }
    homesRef.current = homes;
  }, []);

  // ── the shared render loop (idle embers + live blooms) ──────────────────────
  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    startedAtRef.current = performance.now();
    const idleRng = mulberry32(0xbeef01);
    const idleSeeds = Array.from({ length: 30 }, () => ({
      bx: idleRng(),
      by: idleRng(),
      ph: idleRng() * Math.PI * 2,
      sp: 0.05 + idleRng() * 0.12,
      warm: 0.2 + idleRng() * 0.5,
    }));

    const frame = () => {
      const cvs = canvasRef.current;
      const g = cvs?.getContext("2d");
      if (!cvs || !g) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const w = cvs.width;
      const h = cvs.height;
      const now = performance.now() / 1000;
      const t = now - startedAtRef.current / 1000;
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.16); // slow luminance breathing

      // warm near-black ground, with a persistence fade for ember trails
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(10, 7, 5, 0.16)";
      g.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const rot = t * 0.012; // very slow drift/rotation
      const scale = Math.min(w, h);
      const level = levelRef.current;

      g.globalCompositeOperation = "lighter";

      const engine = engineRef.current;
      if (!engine) {
        // idle: a constellation of gently drifting embers, alive before audio
        for (const s of idleSeeds) {
          const px =
            (s.bx - 0.5 + 0.06 * Math.sin(t * s.sp + s.ph)) * scale * 0.9 + cx;
          const py =
            (s.by - 0.5 + 0.06 * Math.cos(t * s.sp * 0.8 + s.ph)) * scale * 0.9 + cy;
          const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.6 + s.ph));
          const rad = scale * 0.02 * (0.7 + 0.6 * pulse);
          drawEmber(g, px, py, rad, emberColor(s.warm), 0.16 * pulse * (0.5 + 0.5 * breathe));
        }
      } else {
        // live blooms
        const homes = homesRef.current;

        // faint replay-path threads between recent blooms (recombination trail)
        const trail = trailRef.current;
        if (trail.length > 1) {
          for (let i = 1; i < trail.length; i++) {
            const a = trail[i - 1];
            const b = trail[i];
            const age = now - b.t;
            const alpha = Math.max(0, 0.10 * (1 - age / 6));
            if (alpha <= 0) continue;
            const ra = rotate(a.x - 0.5, a.y - 0.5, rot);
            const rb = rotate(b.x - 0.5, b.y - 0.5, rot);
            g.strokeStyle = `rgba(210, 128, 52, ${alpha})`;
            g.lineWidth = Math.max(1, scale * 0.0016);
            g.beginPath();
            g.moveTo(cx + ra.x * scale, cy + ra.y * scale);
            g.lineTo(cx + rb.x * scale, cy + rb.y * scale);
            g.stroke();
          }
        }

        // dim resting nodes so the learned world's shape is always visible
        for (const home of homes) {
          const rp = rotate(home.x - 0.5, home.y - 0.5, rot);
          const px = cx + rp.x * scale;
          const py = cy + rp.y * scale;
          drawEmber(
            g,
            px,
            py,
            scale * 0.006,
            [150, 70, 30],
            0.06 * (0.5 + 0.5 * breathe),
          );
        }

        // active motes bloom & fade
        const motes = motesRef.current;
        for (let i = motes.length - 1; i >= 0; i--) {
          const m = motes[i];
          const age = now - m.born;
          if (age > m.life) {
            motes.splice(i, 1);
            continue;
          }
          const u = age / m.life;
          // smooth bloom-in then decay (no strobe)
          const env = Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.8;
          const rp = rotate(m.x - 0.5, m.y - 0.5, rot);
          const px = cx + rp.x * scale;
          const py = cy + rp.y * scale;
          const rad = scale * m.size * (0.5 + 0.9 * env) * (1 + 0.25 * level);
          drawEmber(
            g,
            px,
            py,
            rad,
            emberColor(m.warm),
            m.bright * env * (0.55 + 0.45 * breathe),
          );
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── sizing ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cvs = canvasRef.current;
      if (cvs) {
        cvs.width = Math.max(1, Math.floor(wrap.clientWidth * dpr));
        cvs.height = Math.max(1, Math.floor(wrap.clientHeight * dpr));
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

  // ── mount: idle constellation immediately; auto-play the demo fallback ───────
  useEffect(() => {
    layoutHomes(1);
    startLoop();
    // Auto-play the deterministic demo so the piece is alive (not silent) on
    // cold mount even headless — but only if a context can be created and
    // resumed (autoplay policy may defer resume until a gesture).
    const kick = window.setTimeout(() => {
      void runDemo();
    }, 350);
    return () => {
      window.clearTimeout(kick);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      engineRef.current?.stop();
      engineRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => ctx.close().catch(() => {}), 400);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutHomes, startLoop]);

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

  const swapEngine = useCallback(
    (engine: ReplayEngine, label: string) => {
      engineRef.current?.stop();
      motesRef.current = [];
      trailRef.current = [];
      layoutHomes(engine.grainCount);
      engine.setDensity(density);
      engine.setDrift(drift);
      engine.setRegister(register);
      engine.setBloom(bloom);
      engine.onGrain((e: ReplayEvent) => {
        const homes = homesRef.current;
        const home = homes[e.grainIndex] ?? { x: 0.5, y: 0.5 };
        const rng = mulberry32((e.grainIndex + 1) * 2654435761 + Math.round(e.rate * 1000));
        const jx = (rng() - 0.5) * 0.05;
        const jy = (rng() - 0.5) * 0.05;
        // warm axis: brightness + a touch of energy → deep rust → pale ember
        const warm = Math.min(1, e.brightness * 0.7 + e.energy * 0.4);
        motesRef.current.push({
          x: home.x + jx,
          y: home.y + jy,
          born: performance.now() / 1000,
          life: 2.6 + e.gain * 3.4,
          size: 0.018 + e.energy * 0.05,
          warm,
          bright: 0.28 + e.gain * 0.5,
        });
        if (motesRef.current.length > 160) motesRef.current.shift();
        const tr = trailRef.current;
        tr.push({ x: home.x + jx, y: home.y + jy, t: performance.now() / 1000 });
        if (tr.length > 14) tr.shift();
        levelRef.current = engineRef.current?.getLevel() ?? 0;
      });
      engineRef.current = engine;
      setGrainCount(engine.grainCount);
      setModeLabel(label);
      engine.start();
      setPhase("live");
      setErrorMsg(null);
    },
    [density, drift, register, bloom, layoutHomes],
  );

  // ── loaders ───────────────────────────────────────────────────────────────────
  const runDemo = useCallback(
    async () => {
      if (engineRef.current) return; // already alive
      const ctx = ensureCtx();
      if (!ctx) return;
      await ctx.resume().catch(() => {});
      setPhase("loading");
      try {
        const buf = await renderDemoBuffer(ctx.sampleRate);
        const grains = analyzeGrains(buf);
        swapEngine(
          makeReplayEngine(ctx, buf, grains),
          "synth-demo memory · placeholder — load a real track",
        );
      } catch {
        setPhase("error");
        setErrorMsg("Could not render the demo world.");
      }
    },
    [ensureCtx, swapEngine],
  );

  const runLoadId = useCallback(async () => {
    const id = trackId.trim();
    if (!id) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    await ctx.resume().catch(() => {});
    setPhase("loading");
    setErrorMsg(null);
    try {
      const buf = await loadTrackById(ctx, id);
      const grains = analyzeGrains(buf);
      swapEngine(
        makeReplayEngine(ctx, buf, grains),
        `Path recording · ${grains.length} grains learned & replayed`,
      );
    } catch (err) {
      // degrade gracefully: keep the demo alive, show a rose notice
      setErrorMsg(err instanceof Error ? err.message : "Failed to load recording.");
      if (!engineRef.current) {
        setPhase("idle");
        void runDemo();
      } else {
        setPhase("live");
      }
    }
  }, [trackId, ensureCtx, swapEngine, runDemo]);

  const runFile = useCallback(
    async (file: File) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      await ctx.resume().catch(() => {});
      setPhase("loading");
      setErrorMsg(null);
      try {
        const buf = await loadFile(ctx, file);
        const grains = analyzeGrains(buf);
        swapEngine(
          makeReplayEngine(ctx, buf, grains),
          `${file.name} · ${grains.length} grains learned & replayed`,
        );
      } catch {
        setErrorMsg("Could not decode that file. Try a wav / mp3 / m4a.");
        if (!engineRef.current) setPhase("idle");
        else setPhase("live");
      }
    },
    [ensureCtx, swapEngine],
  );

  // ── steer controls push straight into the live engine ───────────────────────
  const onDensity = useCallback((v: number) => {
    setDensity(v);
    engineRef.current?.setDensity(v);
  }, []);
  const onDrift = useCallback((v: number) => {
    setDrift(v);
    engineRef.current?.setDrift(v);
  }, []);
  const onRegister = useCallback((v: number) => {
    setRegister(v);
    engineRef.current?.setRegister(v);
  }, []);
  const onBloom = useCallback((v: number) => {
    setBloom(v);
    engineRef.current?.setBloom(v);
  }, []);

  const live = phase === "live";

  const sliders: { label: string; value: number; on: (v: number) => void; hint: string }[] = [
    { label: "Replay density", value: density, on: onDensity, hint: "how often memory re-blooms" },
    { label: "Drift / mutation", value: drift, on: onDrift, hint: "how far the walk wanders" },
    { label: "Register", value: register, on: onRegister, hint: "low → high grains" },
    { label: "Bloom", value: bloom, on: onBloom, hint: "loudness of each ember" },
  ];

  return (
    <div
      ref={wrapRef}
      className="relative h-[100dvh] w-full select-none overflow-hidden"
      style={{ background: "#0a0705" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top: title + status */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="max-w-xl">
          <h1 className="font-semibold text-2xl leading-tight text-foreground sm:text-3xl">
            Ember Replay
          </h1>
          <p className="mt-1 text-base text-foreground">
            A hallucination is not noise — it is the mind replaying a learned
            world. Here that world is Karel&rsquo;s real piano, learned into
            grains and replayed as drifting memory.
          </p>
          {modeLabel && <p className="mt-1.5 text-base text-violet-300/90">{modeLabel}</p>}
          {errorMsg && <p className="mt-1.5 text-base text-violet-300">{errorMsg}</p>}
          {!audioOk && (
            <p className="mt-1.5 text-base text-violet-300">
              Web Audio is unavailable — the constellation still breathes, silently.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="pointer-events-auto min-h-[44px] shrink-0 rounded-full border border-violet-200/20 bg-black/50 px-4 py-2.5 text-base text-foreground backdrop-blur-md transition-colors hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* bottom control deck */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-5">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-2xl border border-violet-200/10 bg-black/60 p-3 backdrop-blur-md sm:p-4">
          <div className="flex flex-col gap-3">
            {/* source row */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runLoadId();
                }}
                placeholder="Paste a Path recording id to learn a real track"
                className="min-h-[44px] flex-1 rounded-xl border border-violet-200/15 bg-muted px-4 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-violet-300/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void runLoadId()}
                disabled={phase === "loading" || !trackId.trim()}
                className="min-h-[44px] rounded-xl bg-violet-400/90 px-4 py-2.5 text-base font-medium text-black transition-colors hover:bg-violet-300 disabled:opacity-40"
              >
                Learn track
              </button>
              <label className="min-h-[44px] cursor-pointer rounded-xl border border-violet-200/15 bg-muted px-4 py-2.5 text-center text-base text-foreground transition-colors hover:border-violet-300/60">
                Drop a file
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
            </div>

            {/* steer sliders */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sliders.map((s) => (
                <label key={s.label} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between text-base text-foreground">
                    <span>{s.label}</span>
                    <span className="text-sm text-muted-foreground">{s.hint}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={s.value}
                    onChange={(e) => s.on(parseFloat(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-violet-200/15 accent-violet-400"
                  />
                </label>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              {live
                ? `Replaying ${grainCount} captured grains of the real recording, recombined — the audio you hear is Karel's piano re-sequenced, not synthesised notes.`
                : phase === "loading"
                  ? "Learning the world…"
                  : "Loading a warm demo world so the field is never silent."}
            </p>
          </div>
        </div>
      </div>

      {/* design notes */}
      {showNotes && (
        <div
          className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl border border-violet-200/10 p-6 text-foreground"
            style={{ background: "#120a06" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-2xl text-foreground">Design notes</h2>
            <p className="mt-3 text-base text-foreground">
              A 2026 <span className="text-violet-300/90">eLife</span> computational
              study modelled classical psychedelics as shifting perception from
              bottom-up sensory inference toward a top-down generative{" "}
              <em>replay of a learned world</em> — hallucination as recombined
              wake-time memory rather than random noise. This piece is a drug-free
              embodiment of that model.
            </p>
            <p className="mt-3 text-base text-foreground">
              <strong>Learn.</strong> The real recording is analysed into a small
              vocabulary of grains: onset detection captures a short slice of the
              actual audio plus a rough pitch, brightness and energy for each.
            </p>
            <p className="mt-3 text-base text-foreground">
              <strong>Replay.</strong> A look-ahead scheduler walks that
              vocabulary as memory — mostly stepping to a grain like the last one
              (smooth recall), sometimes jumping (mutation) — and plays the actual
              captured grains, gently overlapping and detuned. It never hard-loops.
              A warm just-intonation drone bed sits underneath.
            </p>
            <p className="mt-3 text-base text-foreground">
              Each replayed grain blooms a warm-ember mote in a constellation whose
              home positions are fixed per grain, so a recurring memory re-blooms
              in the same place — memory as living pigment (Refik Anadol), a
              generative system that evolves without repeating (Brian Eno).
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Three source tiers: a Path recording id, your own dropped file, or a
              deterministic offline-rendered demo so the world is never empty. All
              randomness is a seeded mulberry32 PRNG — the same seed dreams the
              same dream.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-xl bg-violet-400/20 px-4 py-2.5 text-base text-foreground transition-colors hover:bg-violet-400/30"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── canvas helpers ───────────────────────────────────────────────────────────
function rotate(x: number, y: number, a: number): { x: number; y: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

function drawEmber(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rgb: [number, number, number],
  alpha: number,
) {
  if (alpha <= 0.002 || r <= 0) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`);
  grad.addColorStop(0.4, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha * 0.45})`);
  grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
