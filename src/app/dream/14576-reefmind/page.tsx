"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { Field, SIM } from "./field";
import { MixEngine } from "./audio";

type Phase = "idle" | "running" | "error";

// Warmup RD iterations so a living pattern greets the first frame.
const WARMUP_STEPS = 700;
const STEPS_PER_FRAME = 6;
const READ_EVERY = 3; // frames between field→mix readbacks

export default function ReefmindPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [loaded, setLoaded] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<Field | null>(null);
  const engineRef = useRef<MixEngine | null>(null);
  const animRef = useRef(0);
  const startMsRef = useRef(0);
  const frameRef = useRef(0);
  const lastAutoSeedRef = useRef(0);
  const lastMicSeedRef = useRef(0);
  const micOnRef = useRef(false);

  const {
    start: micStart,
    stop: micStop,
    getFrame: micFrame,
    error: micError,
  } = useMicAnalyser({ smoothing: 0.85, gain: 1.6, onsetThreshold: 1.7 });

  const titlesRef = useRef<string[]>([]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    micStop();
    micOnRef.current = false;
    engineRef.current?.dispose();
    engineRef.current = null;
    fieldRef.current?.dispose();
    fieldRef.current = null;
  }, [micStop]);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the drawing buffer to the element.
    canvas.width = Math.max(2, canvas.clientWidth);
    canvas.height = Math.max(2, canvas.clientHeight);

    // 1) Field first — if WebGL2 / float textures are missing, bail gracefully.
    let field: Field;
    try {
      field = new Field(canvas);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "The membrane could not start.");
      setPhase("error");
      return;
    }
    fieldRef.current = field;

    // 2) Audio context resumed inside this user gesture.
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    try {
      await ctx.resume();
    } catch {
      /* some browsers resume lazily */
    }
    const engine = new MixEngine(ctx);
    engineRef.current = engine;
    titlesRef.current = engine.titles;
    void engine.load();

    // 3) Warm the chemistry so patterns are already alive on frame one.
    field.step(WARMUP_STEPS, 0);

    setPhase("running");
    startMsRef.current = performance.now();
    frameRef.current = 0;

    const tick = (now: number) => {
      const f = fieldRef.current;
      const eng = engineRef.current;
      if (!f || !eng) return;
      const t = (now - startMsRef.current) / 1000;

      f.step(STEPS_PER_FRAME, t);

      // Autonomous, boundless: drop a fresh perturbation every ~7s so the
      // membrane never settles into a dead steady state.
      if (t - lastAutoSeedRef.current > 7) {
        lastAutoSeedRef.current = t;
        f.inject([
          {
            x: Math.random() * SIM,
            y: Math.random() * SIM,
            r: 6 + Math.random() * 6,
          },
        ]);
      }

      // Optional mic-secondary: RMS seeds gentle ripples. CONTROL ONLY — the mic
      // is never routed to audio output.
      if (micOnRef.current) {
        const fr = micFrame();
        if (fr && fr.amplitude > 0.12 && t - lastMicSeedRef.current > 0.4) {
          lastMicSeedRef.current = t;
          const n = fr.amplitude > 0.4 ? 2 : 1;
          const pts = Array.from({ length: n }, () => ({
            x: Math.random() * SIM,
            y: Math.random() * SIM,
            r: 4 + fr.amplitude * 14,
          }));
          f.inject(pts);
        }
      }

      // Field → mix (throttled readback).
      if (frameRef.current % READ_EVERY === 0) {
        eng.update(f.readSummaries());
      }

      f.draw();

      // Light-touch UI refresh (~4×/s).
      if (frameRef.current % 15 === 0) {
        setLevels(eng.levels);
        setLoaded(eng.loadedCount);
      }

      frameRef.current++;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [phase, micFrame]);

  const toggleMic = useCallback(async () => {
    if (micOnRef.current) {
      micStop();
      micOnRef.current = false;
      setMicOn(false);
      return;
    }
    await micStart();
    micOnRef.current = true;
    setMicOn(true);
  }, [micStart, micStop]);

  // Full teardown on unmount.
  useEffect(() => () => stopAll(), [stopAll]);

  // Keep the drawing buffer matched to the element while running.
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = Math.max(2, c.clientWidth);
      c.height = Math.max(2, c.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  const titles = titlesRef.current;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* The membrane */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#050a0c" }}
        aria-label="Reaction-diffusion membrane"
      />

      {/* Idle / start overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border border-border bg-popover/85 p-8 backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              reefmind
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              A living chemical membrane that arranges itself. Sixteen competing
              species — one per recording in Karel&apos;s catalog — grow, spot,
              stripe and dissolve across a Gray-Scott reaction-diffusion field.
              Where a species blooms and coheres, its track surges: louder,
              brighter, panned to the bloom&apos;s centre. Where the chemistry
              consumes it, the track thins toward silence. It runs itself.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Everything you hear is Karel&apos;s real piano. Nothing is
              synthesized — the field only conducts the mix.
            </p>

            {phase === "error" ? (
              <p className="mt-5 text-base text-destructive">
                {errorMsg} This experience needs WebGL2 with float textures.
              </p>
            ) : (
              <button
                type="button"
                onClick={begin}
                className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            )}
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="pointer-events-auto max-w-md rounded-lg border border-border bg-popover/80 p-4 backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              reefmind
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              {loaded} / {titles.length} voices awake · the reaction-diffusion
              field is arranging the mix.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMic}
                className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {micOn ? "Mic ripples on" : "Enable mic ripples"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAll();
                  setPhase("idle");
                  setLevels([]);
                }}
                className="min-h-[44px] rounded-md border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Stop
              </button>
            </div>
            {micOn && micError && (
              <p className="mt-2 text-base text-destructive">{micError}</p>
            )}
            {micOn && !micError && (
              <p className="mt-2 text-base text-muted-foreground">
                Sound in the room seeds ripples in the chemistry — control only,
                never mixed into what you hear.
              </p>
            )}
          </div>

          {/* Species legend — bloom = loudness */}
          <div className="pointer-events-auto w-full max-w-xs rounded-lg border border-border bg-popover/80 p-3 backdrop-blur-md sm:w-64">
            <p className="mb-2 text-base text-muted-foreground">
              16 species · bloom drives the voice
            </p>
            <ul className="grid grid-cols-1 gap-1">
              {titles.map((title, i) => {
                const lv = levels[i] ?? 0;
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-sm text-muted-foreground">
                      {title}
                    </span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-sm bg-muted/40">
                      <span
                        className="absolute inset-y-0 left-0 rounded-sm"
                        style={{
                          width: `${Math.round(lv * 100)}%`,
                          background:
                            "linear-gradient(90deg, #007088, #47f2fa)",
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14576-reefmind"]} />
    </main>
  );
}
