"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ReverieEngine, type MoodKey, type Snapshot } from "./audio";
import { Scene } from "./scene";

type Phase = "idle" | "running" | "done" | "error";

const MOOD_OPTIONS: { key: MoodKey; label: string; blurb: string }[] = [
  { key: "noir", label: "Noir", blurb: "cold, minor, unresolved" },
  { key: "wonder", label: "Wonder", blurb: "bright, lydian, lifting" },
  { key: "dread", label: "Dread", blurb: "dark, phrygian, pressing" },
  { key: "elegy", label: "Elegy", blurb: "warm, dorian, mournful" },
];

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<ReverieEngine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const readoutRafRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mood, setMood] = useState<MoodKey>("noir");
  const [readout, setReadout] = useState<Snapshot | null>(null);

  const teardown = useCallback(() => {
    cancelAnimationFrame(readoutRafRef.current);
    sceneRef.current?.stop();
    engineRef.current?.stop();
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    ctxRef.current = null;
    engineRef.current = null;
    sceneRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const start = useCallback(() => {
    if (phase === "running") return;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      const engine = new ReverieEngine(ctx, mood);
      engine.setMuted(muted);
      engine.onFinished = () => setPhase("done");
      engineRef.current = engine;

      const canvas = canvasRef.current;
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (canvas) {
        try {
          const scene = new Scene(engine, canvas, reduced);
          sceneRef.current = scene;
          scene.start();
        } catch {
          // Canvas2D unavailable — audio still runs
        }
      }

      ctx.resume().catch(() => {});
      engine.start();
      setPhase("running");

      const tick = () => {
        const snap = engineRef.current?.snapshot();
        if (snap) setReadout(snap);
        readoutRafRef.current = requestAnimationFrame(tick);
      };
      readoutRafRef.current = requestAnimationFrame(tick);
    } catch {
      setPhase("error");
    }
  }, [phase, mood, muted]);

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
    setReadout(null);
  }, [teardown]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          1824 · reverie
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Reverie — a score to an unseen film
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          A generative narrative engine that walks the classic dramatic arc —
          establishing, inciting incident, rising action, climax, falling action,
          resolution. The hard part is the seams: a rule-based director renders a
          musical bridge between every act.
        </p>
      </div>

      {/* notes button */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute right-5 top-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-7 sm:top-7"
      >
        Design notes
      </button>

      {/* idle / start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-border bg-background/75 p-8 backdrop-blur-md">
            <p className="text-center text-base text-muted-foreground">
              Headphones or speakers up. Pick a mood, then press once — the whole
              two-and-a-half-minute arc plays itself. No further input needed.
            </p>
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                mood seed
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MOOD_OPTIONS.map((m) => {
                  const active = m.key === mood;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMood(m.key)}
                      aria-pressed={active}
                      className={
                        active
                          ? "min-h-[44px] rounded-md border border-primary bg-primary/15 px-4 text-left text-sm text-foreground transition-colors"
                          : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      }
                    >
                      <span className="block font-medium">{m.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {m.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Roll the reel
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-lg border border-destructive/40 bg-background/80 p-6 text-center">
            <p className="text-base text-destructive">
              Web Audio is unavailable in this browser.
            </p>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background/75 p-8 backdrop-blur-md">
            <p className="text-base text-muted-foreground">
              End of reel. The arc has resolved.
            </p>
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Roll it again
            </button>
          </div>
        </div>
      )}

      {/* live transport */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-32 z-10 flex justify-center px-5">
          <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-md">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                now
              </span>
              <span className="text-base font-semibold tracking-tight text-primary">
                {readout?.actLabel ?? "—"}
              </span>
              {readout?.bridgeKind && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  ↯ {readout.bridgeKind} bridge
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">The what-if:</span> a cinematic
                journey engine — a generative score to a film that isn&apos;t there.
                Instead of Resonance&apos;s psychedelic arc or an EDM build-and-drop,
                this one moves through{" "}
                <span className="text-foreground">Freytag&apos;s pyramid</span>:
                establishing → inciting incident → rising action → climax → falling
                action → resolution, driven by one continuous dramatic tension curve.
              </p>
              <p>
                <span className="text-foreground">The hard problem is the seams.</span>{" "}
                Following{" "}
                <span className="text-foreground">JenBridge</span> (Yu, Yao, Chen,
                Wang — arXiv:2606.01703) and its &ldquo;adaptive transition
                mechanism&rdquo; with a director agent that picks how to bridge each
                narrative shift, a lightweight rule-based{" "}
                <span className="text-foreground">director</span> inspects the tension
                delta at every act boundary and renders a generative musical bridge —{" "}
                <span className="text-foreground">swell</span> (crescendo riser),{" "}
                <span className="text-foreground">suspended</span> (a withheld sus
                chord before the climax),{" "}
                <span className="text-foreground">ritardando</span> (a slowing,
                decaying descent), or{" "}
                <span className="text-foreground">pivot</span> (a borrowed chord that
                reframes the key). No LLM, no API calls — the rule is the tension curve
                itself.
              </p>
              <p>
                A short <span className="text-foreground">leitmotif</span> is stated
                softly in Act 1, returns transformed at the climax (up an octave, brass
                orchestration), and settles slow and low at the resolution — same
                intervals, different voicing.
              </p>
              <p>
                <span className="text-foreground">On screen</span>, a letterboxed
                frame shows an abstract drifting field over a horizon that lifts with
                tension; a chapter title card fades in at each act. The bottom ribbon
                plots Freytag&apos;s structure directly: act blocks, the bridge seams,
                the tension envelope, and a moving playhead.
              </p>
              <p>
                <span className="text-foreground">Mood seed</span> (noir / wonder /
                dread / elegy) shifts the scale, orchestration, and palette. Everything
                is synthesized (Web Audio, no samples) and deterministic — mulberry32
                seeded 0x1824, no wall-clock, no Math.random.
              </p>
              <p className="text-sm">
                All audio routes through a compressor and a master gain capped at 0.16.
                Luminance changes are slow — no strobe, no flashing — and
                reduced-motion is honored.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1824-reverie"]} />
    </main>
  );
}
