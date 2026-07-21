"use client";

// 2108-remap-field — "Re·map".
//
// THE QUESTION: what if ego-dissolution were rendered not as geometry but as the
// DESYNCHRONISATION of the self's internal map — ~40 living territories whose
// borders diffuse and dissolve into one boundless plasma, then slowly
// re-crystallise into a DIFFERENT map? You return re-organised, not restored.
//
// Grounding: Siegel, Nichols, Dosenbach et al., "Psilocybin desynchronizes the
// human brain", Nature 2024. The piece makes it literal: a parcellation of the
// self that loses its boundaries and re-forms with new ones.
//
// Visuals: WebGL2 fragment shader (render.ts) computes the parcellation
// per-pixel; a single `coherence` scalar melts the borders. Audio: a bank of 20
// drone voices (audio.ts), one per territory, gliding to unison at the floor.
// Arc: an autonomous ~5-min four-phase clock (arc.ts) you can steer with the
// keyboard. Runs fully on its own from load with zero input.

import { useCallback, useEffect, useRef, useState } from "react";
import { createArc, type Arc, type PhaseName } from "./arc";
import { createFieldRenderer, type FieldRenderer } from "./render";
import { VoiceBank } from "./audio";

type AudioPhase = "idle" | "running" | "error";

interface Display {
  phase: PhaseName;
  progress: number;
  coherence: number;
  cycle: number;
  bias: number;
}

const PHASE_BLURB: Record<PhaseName, string> = {
  Bounded: "~40 distinct territories, crisp borders, distinct voices.",
  Desync: "borders begin to diffuse; the voices detune and merge.",
  Boundless: "no borders — one boundless plasma, one unified drone.",
  Return: "re-crystallising — the seeds have moved, the map is new.",
};

export default function RemapFieldPage() {
  const [audioPhase, setAudioPhase] = useState<AudioPhase>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [audioMsg, setAudioMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [display, setDisplay] = useState<Display>({
    phase: "Bounded",
    progress: 0,
    coherence: 0.9,
    cycle: 0,
    bias: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const arcRef = useRef<Arc | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const bankRef = useRef<VoiceBank | null>(null);
  const appliedAudioSeedRef = useRef<number>(Number.NaN);

  // ── Renderer init — the field is alive immediately on mount, no input ──────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = createFieldRenderer(canvas);
      setWebglOk(true);
    } catch {
      setWebglOk(false);
      rendererRef.current = null;
    }
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── The arc + render/audio loop — autonomous from load ─────────────────────
  useEffect(() => {
    const arc = createArc(2108);
    arcRef.current = arc;
    let raf = 0;
    let lastUi = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nowSec = performance.now() / 1000;
      const st = arc.step(nowSec);

      rendererRef.current?.render({
        seeds: st.seeds,
        coherence: st.coherence,
        timeSec: nowSec,
      });

      const bank = bankRef.current;
      if (bank) {
        // Swap in the next map's pitch set while at the floor (silent because
        // the voices are already unison), so they glide OUT to the NEW map.
        if (
          st.progress > 0.48 &&
          st.progress < 0.6 &&
          appliedAudioSeedRef.current !== st.nextMapSeed
        ) {
          bank.setMap(st.nextMapSeed, st.seedsNext);
          appliedAudioSeedRef.current = st.nextMapSeed;
        }
        bank.update(st.coherence, nowSec);
      }

      // Throttle the on-screen readout to ~8 Hz.
      if (nowSec - lastUi > 0.12) {
        lastUi = nowSec;
        setDisplay({
          phase: st.phase,
          progress: st.progress,
          coherence: st.coherence,
          cycle: st.cycle,
          bias: st.bias,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Keyboard depth-steer ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const arc = arcRef.current;
      if (!arc) return;
      if (e.key === "ArrowUp" || e.key === "]") {
        e.preventDefault();
        arc.steer(-0.12); // deeper — bias coherence down toward dissolution
      } else if (e.key === "ArrowDown" || e.key === "[") {
        e.preventDefault();
        arc.steer(0.12); // shallower — bias coherence up toward a bounded map
      } else if (e.key === " ") {
        e.preventDefault();
        arc.release(); // let go — hand control back to the autonomous arc
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const bank = bankRef.current;
      const ctx = ctxRef.current;
      bankRef.current = null;
      ctxRef.current = null;
      if (bank) {
        const tail = bank.dispose(0.5);
        window.setTimeout(() => {
          if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
        }, tail * 1000 + 120);
      } else if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
    };
  }, []);

  // ── Begin: arm audio inside the user gesture ───────────────────────────────
  const begin = useCallback(async () => {
    if (audioPhase === "running") return;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      setAudioPhase("error");
      setAudioMsg("Web Audio API is unavailable — visuals continue on their own.");
      return;
    }
    try {
      const ctx = ctxRef.current ?? new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const bank = new VoiceBank(ctx);
      const arc = arcRef.current;
      const st = arc?.step(performance.now() / 1000);
      if (st) {
        bank.setMap(st.mapSeed, st.seedsCurrent);
        appliedAudioSeedRef.current = st.mapSeed;
      }
      bankRef.current = bank;
      setAudioPhase("running");
      setAudioMsg(null);
    } catch (e) {
      setAudioPhase("error");
      setAudioMsg("Audio failed: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [audioPhase]);

  const biasLabel =
    display.bias > 0.02 ? "steering shallower" : display.bias < -0.02 ? "steering deeper" : "autonomous";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Re·map — a dissolving and re-crystallising map of the self"
      />

      {/* Design-notes corner toggle */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* Hero + controls */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="pointer-events-auto max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · 2108
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Re·map
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            A map of the self as ~40 living territories. Its borders diffuse and
            dissolve into one boundless field, then re-crystallise into a
            different map — you return re-organised, not restored.
          </p>

          {!webglOk && (
            <p className="mt-3 text-base text-destructive">
              WebGL2 is unavailable in this browser, so the field cannot render.
              The audio arc still plays if you press Begin.
            </p>
          )}
          {audioPhase === "error" && audioMsg && (
            <p className="mt-3 text-base text-destructive">{audioMsg}</p>
          )}
        </header>

        {/* Begin */}
        <section className="pointer-events-auto flex flex-col items-start gap-3">
          {audioPhase !== "running" && (
            <button
              onClick={() => void begin()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          )}
          <p className="max-w-md text-sm text-muted-foreground">
            The arc runs on its own. Steer with{" "}
            <span className="text-foreground">↑</span> /{" "}
            <span className="text-foreground">]</span> to go deeper,{" "}
            <span className="text-foreground">↓</span> /{" "}
            <span className="text-foreground">[</span> to stay shallower, and{" "}
            <span className="text-foreground">Space</span> to let go.
          </p>
        </section>

        {/* Phase readout + progress */}
        <footer className="pointer-events-auto flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Phase
            </span>
            <span className="text-base text-foreground">{display.phase}</span>
            <span className="text-sm text-muted-foreground">
              {PHASE_BLURB[display.phase]}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
            <span>cycle {display.cycle + 1}</span>
            <span>coherence {display.coherence.toFixed(2)}</span>
            <span>{biasLabel}</span>
          </div>
          {/* Thin cycle-progress indication */}
          <div className="h-1 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.round(display.progress * 100)}%` }}
            />
          </div>
        </footer>
      </div>

      {/* Design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Re·map — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The self is drawn as a parcellation: ~40 territories, each a
                colour and a drone voice. A single scalar,{" "}
                <span className="text-foreground">coherence</span>, runs the
                whole arc. When it is high the borders are crisp; as it falls, a
                WebGL2 shader blends every pixel toward a distance-weighted
                average of all territories, so the borders melt into one plasma.
              </p>
              <p>
                On the return, the seed points have MOVED and the hues have
                re-rolled — a deterministic PRNG keyed to an integer that
                increments each cycle — so you re-crystallise into a genuinely
                different map. The voices glide to unison at the floor, then out
                to a new pitch set.
              </p>
              <p>
                Grounding: Siegel, Nichols, Dosenbach et al.,{" "}
                <span className="text-foreground">
                  &ldquo;Psilocybin desynchronizes the human brain&rdquo;
                </span>
                , Nature 2024 — ego-dissolution as desynchronisation that
                dissolves the distinctions between networks, with re-organisation
                that persists for weeks.
              </p>
              <p>
                Phases: Bounded → Desync → Boundless floor → Re-crystallise. The
                arc is autonomous; ↑/] go deeper, ↓/[ stay shallower, Space lets
                go. All luminance changes are slow drifts — no strobe.
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
    </main>
  );
}
