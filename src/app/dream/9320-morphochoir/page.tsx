"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { createChoir, type Choir } from "./audio";
import { createCpuField } from "./cpu";
import {
  type Field,
  keyToPos,
  mulberry32,
  PROBE_COUNT,
  REGIMES,
  SEED,
} from "./field";
import { createGpuField } from "./gpu";

type Backend = "pending" | "gpu" | "cpu";

export default function MorphochoirPage() {
  const [backend, setBackend] = useState<Backend>("pending");
  const [audioOn, setAudioOn] = useState(false);
  const [regime, setRegime] = useState(0);
  const [lit, setLit] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const reduce = useMemo(() => prefersReducedMotion(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fieldRef = useRef<Field | null>(null);
  const choirRef = useRef<Choir | null>(null);
  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const startRef = useRef(0);
  const lastRef = useRef(0);
  const regimeCycleRef = useRef(0);
  const demoRef = useRef(mulberry32(SEED ^ 0x1d));
  const nextSeedRef = useRef(0.4);
  const nextRegimeRef = useRef(9);
  const lastUserActionRef = useRef(-100);
  const litThrottleRef = useRef(0);

  // change regime through one path so the UI, field, and demo stay in sync
  const changeRegime = useCallback((index: number) => {
    const n = ((index % REGIMES.length) + REGIMES.length) % REGIMES.length;
    fieldRef.current?.setRegime(n);
    setRegime(n);
  }, []);

  // ── boot the field backend + run the frame loop ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const sizeSurface = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      fieldRef.current?.resize(w, h);
    };

    const ro = new ResizeObserver(sizeSurface);
    ro.observe(container);
    roRef.current = ro;

    const boot = async () => {
      if (navigator.gpu) {
        try {
          const f = await createGpuField(canvas);
          if (cancelled) {
            f.destroy();
            return;
          }
          fieldRef.current = f;
          sizeSurface();
          setBackend("gpu");
          return;
        } catch {
          /* fall through to CPU */
        }
      }
      if (cancelled) return;
      try {
        const f = createCpuField(canvas);
        fieldRef.current = f;
        sizeSurface();
        setBackend("cpu");
      } catch {
        /* nothing we can do; the page still shows copy */
      }
    };
    void boot();

    startRef.current = performance.now();
    lastRef.current = startRef.current;

    const loop = (now: number) => {
      const t = (now - startRef.current) / 1000;
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (dt > 0.1) dt = 0.1;

      const field = fieldRef.current;
      if (field) {
        // deterministic auto-demo: seed the field and cycle regimes with no
        // audio, so a muted phone sees the pattern forming within ~1s. Pauses
        // its seeding briefly whenever the player is actively pressing keys.
        const rnd = demoRef.current;
        if (t > nextSeedRef.current) {
          if (t - lastUserActionRef.current > 2.5) {
            const x = 0.2 + rnd() * 0.6;
            const y = 0.2 + rnd() * 0.6;
            field.addSeed(x, y, 0.85);
          }
          nextSeedRef.current = t + 0.45 + rnd() * 0.5;
        }
        if (t > nextRegimeRef.current) {
          // only auto-cycle morphology while the player is hands-off
          if (t - lastUserActionRef.current > 15) {
            regimeCycleRef.current = (regimeCycleRef.current + 1) % REGIMES.length;
            changeRegime(regimeCycleRef.current);
          }
          nextRegimeRef.current = t + 9 + rnd() * 3;
        }

        field.step(dt, t, reduce);

        const choir = choirRef.current;
        if (choir) {
          choir.update(field.probes(), reduce);
          litThrottleRef.current += dt;
          if (litThrottleRef.current > 0.2) {
            litThrottleRef.current = 0;
            setLit(choir.litCount());
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      roRef.current = null;
      fieldRef.current?.destroy();
      fieldRef.current = null;
    };
  }, [reduce, changeRegime]);

  // ── keyboard: letters seed reactant, number keys switch regime ─────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k >= "1" && k <= "4") {
        e.preventDefault();
        regimeCycleRef.current = Number(k) - 1;
        changeRegime(regimeCycleRef.current);
        lastUserActionRef.current = (performance.now() - startRef.current) / 1000;
        return;
      }
      if (/^[a-zA-Z]$/.test(k)) {
        e.preventDefault();
        const [x, y] = keyToPos(k.toLowerCase().charCodeAt(0));
        fieldRef.current?.addSeed(x, y, 0.95);
        lastUserActionRef.current = (performance.now() - startRef.current) / 1000;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeRegime]);

  // ── audio teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      choirRef.current?.stop();
      choirRef.current = null;
    };
  }, []);

  const startAudio = useCallback(async () => {
    if (choirRef.current) return;
    try {
      choirRef.current = await createChoir();
      setAudioOn(true);
    } catch {
      /* audio unavailable — the field keeps running silently */
    }
  }, []);

  const stopAudio = useCallback(() => {
    choirRef.current?.stop();
    choirRef.current = null;
    setAudioOn(false);
    setLit(0);
  }, []);

  // click the stage as a mouse fallback for seeding (keyboard is the point)
  const onStageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    fieldRef.current?.addSeed(x, y, 0.95);
    lastUserActionRef.current = (performance.now() - startRef.current) / 1000;
  }, []);

  const r = REGIMES[regime];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-5 py-10">
      <PrototypeNav slugs={["9320-morphochoir"]} />

      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          9320 · Morphochoir
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Morphochoir
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          A living Gray-Scott reaction-diffusion field you seed and play like a
          choir. Press letter keys to drop reactant; the field self-organizes
          into Turing patterns while eight fixed probes on a ring listen to the
          morphogenesis and gate eight warm voices. As spots grow into worms
          into a labyrinth, the chord audibly breathes and re-voices — the
          morphology <em>is</em> the music.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {audioOn ? (
          <button
            onClick={stopAudio}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop sound
          </button>
        ) : (
          <button
            onClick={startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start sound
          </button>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
        {audioOn ? (
          <span className="rounded-md border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {lit} / {PROBE_COUNT} voices lit
          </span>
        ) : null}
      </div>

      {backend === "cpu" ? (
        <p className="text-sm text-destructive">
          WebGPU unavailable — running the coarse CPU field instead. Same
          equations, smaller grid; the choir still listens and sings.
        </p>
      ) : null}

      {/* ── the stage ─────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        onClick={onStageClick}
        className="relative h-[440px] w-full cursor-crosshair overflow-hidden rounded-lg border border-border"
        style={{ background: "#080503" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>{r.name.toLowerCase()} · f {r.feed.toFixed(4)} · k {r.kill.toFixed(4)}</span>
          <span>{r.blurb}</span>
        </div>
      </div>

      {/* ── regime selector (number keys 1–4) ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {REGIMES.map((reg, i) => (
          <button
            key={reg.key}
            onClick={() => {
              regimeCycleRef.current = i;
              changeRegime(i);
              lastUserActionRef.current =
                (performance.now() - startRef.current) / 1000;
            }}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              i === regime
                ? "border-border bg-accent text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <span className="font-mono text-xs">{reg.key}</span> · {reg.name}
          </button>
        ))}
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        letter keys seed reactant · number keys 1–4 switch regime · eight ring
        probes gate a pentatonic choir
      </p>

      {showNotes ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight">
              What if morphogenesis were a chord you could seed?
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              The field is a Gray-Scott two-chemical reaction-diffusion system
              simulated on WebGPU compute shaders: a ping-pong pair of
              rgba16float storage textures stepped ten times a frame with a
              nine-point Laplacian and wrapping boundaries. Pressing a letter
              injects a small disk of reactant V; the reaction then does the
              rest, self-organizing into Turing patterns. Four feed/kill
              regimes — mitosis spots, coral worms, a labyrinth, and drifting
              solitons — sit at four labelled points on Pearson&apos;s map of the
              parameter plane, each a visibly and audibly different morphology.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A second compute pass reads eight fixed probes on a ring, sampling
              local concentration and gradient, and hands those to eight
              note-gated voices tuned to a fixed pentatonic scale. A voice sounds
              only while its probe is lit by the growing pattern and fades to
              silence otherwise — no held drone — so the chord re-voices as the
              morphology sweeps across the ring. In the lineage of Alan
              Turing&apos;s 1952 <em>Chemical Basis of Morphogenesis</em> and
              John Pearson&apos;s 1993 <em>Complex Patterns in a Simple System</em>,
              read as a browser GPU feedback loop.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
