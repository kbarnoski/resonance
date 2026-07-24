"use client";

// ════════════════════════════════════════════════════════════════════════════
// 2538-driver — "What if a techno machine never played the same bar twice — a
// generative club engine that composes an endless, evolving arrangement in real
// time, rhythm-first, and can sound genuinely dangerous?"
//
// A rhythm-first generative club engine. A seeded arrangement state machine
// (engine.ts, mulberry32(0x2538)) walks a multi-minute arc — intro → build →
// drop → breakdown → build → drop … — mutating its 909/303-style pattern bank
// every bar so it never repeats. The acid line is allowed to clash; timbre and
// rhythm are the substrate, not pretty harmony. Output is a hand-rolled WebGL2
// equalizer city (gl.ts); the keyboard is the performance surface. On load the
// visual is already animating the silent, deterministic arrangement so a still
// screenshot reads as a machine mid-composition; audio starts on first gesture.
//
// Refs: arXiv:2605.21874 (EDM-inspired real-time monitoring sonification, 2026);
// Eno/Koan generative lineage; Roland TR-909 / TB-303.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Arrangement,
  VOICES,
  type VoiceEvent,
  type VoiceName,
  type EngineSnapshot,
} from "./engine";
import { DriverSynth } from "./synth";
import { Renderer, hasWebGL2, type Uniforms } from "./gl";

type GlState = "unknown" | "ok" | "fallback";

interface VizHit {
  t: number;
  vel: number;
}
interface Viz {
  hit: Record<VoiceName, VizHit>;
}
interface PendingViz {
  ctxTime: number;
  events: VoiceEvent[];
}

const TAU_MS: Record<VoiceName, number> = {
  kick: 160,
  sub: 420,
  clap: 150,
  chat: 55,
  ohat: 240,
  acid: 200,
};

const VOICE_LABEL: Record<VoiceName, string> = {
  kick: "kick",
  sub: "sub",
  clap: "clap",
  chat: "c.hat",
  ohat: "o.hat",
  acid: "acid",
};

const PHASE_LABEL: Record<EngineSnapshot["phase"], string> = {
  intro: "intro",
  build: "build",
  drop: "drop",
  breakdown: "breakdown",
};

type Action =
  | "energyUp"
  | "energyDown"
  | "fill"
  | "drop"
  | "break"
  | "acid"
  | `mute:${VoiceName}`;

function emptyViz(): Viz {
  const hit = {} as Record<VoiceName, VizHit>;
  for (const v of VOICES) hit[v] = { t: -1e9, vel: 0 };
  return { hit };
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fallbackBarsRef = useRef<Partial<Record<VoiceName, HTMLDivElement>>>({});

  const engineRef = useRef<Arrangement | null>(null);
  const synthRef = useRef<DriverSynth | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const rafRef = useRef<number>(0);
  const schedulerRef = useRef<number>(0);
  const nextNoteRef = useRef<number>(0);
  const demoAccRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);
  const vizRef = useRef<Viz>(emptyViz());
  const pendingVizRef = useRef<PendingViz[]>([]);

  const [glState, setGlState] = useState<GlState>("unknown");
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<EngineSnapshot | null>(null);

  const refreshHud = useCallback(() => {
    const e = engineRef.current;
    if (e) setHud(e.getSnapshot());
  }, []);

  const handleAction = useCallback(
    (a: Action) => {
      const e = engineRef.current;
      if (!e) return;
      if (a === "energyUp") e.nudgeEnergy(0.08);
      else if (a === "energyDown") e.nudgeEnergy(-0.08);
      else if (a === "fill") e.triggerFill();
      else if (a === "drop") e.forceDrop();
      else if (a === "break") e.forceBreak();
      else if (a === "acid") e.toggleAcid();
      else if (a.startsWith("mute:")) e.toggleMute(a.slice(5) as VoiceName);
      refreshHud();
    },
    [refreshHud],
  );

  const startAudio = useCallback(() => {
    if (startedRef.current) return;
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctxRef.current = ctx;
    const synth = new DriverSynth(ctx);
    synthRef.current = synth;
    void ctx.resume();
    nextNoteRef.current = ctx.currentTime + 0.1;
    pendingVizRef.current = [];
    startedRef.current = true;
    setStarted(true);

    const scheduler = () => {
      const engine = engineRef.current;
      const c = ctxRef.current;
      const s = synthRef.current;
      if (!engine || !c || !s) return;
      const stepDur = 60 / engine.bpm / 4;
      const barSec = 60 / engine.bpm;
      while (nextNoteRef.current < c.currentTime + 0.12) {
        const t = nextNoteRef.current;
        const r = engine.tick();
        const snap = engine.getSnapshot();
        for (const ev of r.events) {
          if (ev.voice === "acid") {
            s.acid(t, ev, engine.acidFreq(ev.midi), snap.cutoff);
          } else {
            s.perc(ev.voice, t, ev.velocity);
          }
        }
        if (r.riser) s.riser(t, barSec * 0.92);
        pendingVizRef.current.push({ ctxTime: t, events: r.events });
        nextNoteRef.current += stepDur;
      }
    };
    schedulerRef.current = window.setInterval(scheduler, 25);
  }, []);

  // Feed one tick's events into the visual envelope tracker.
  const applyEvents = useCallback((events: VoiceEvent[], nowMs: number) => {
    const viz = vizRef.current;
    for (const ev of events) viz.hit[ev.voice] = { t: nowMs, vel: ev.velocity };
  }, []);

  const renderVisual = useCallback((nowMs: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const snap = engine.getSnapshot();
    const viz = vizRef.current;
    const env = (v: VoiceName): number => {
      const h = viz.hit[v];
      const dt = nowMs - h.t;
      if (dt < 0) return 0;
      return h.vel * Math.exp(-dt / TAU_MS[v]);
    };
    const u: Uniforms = {
      time: nowMs / 1000,
      energy: snap.energy,
      tension: snap.tension,
      cutoff: snap.cutoff,
      kick: env("kick"),
      sub: env("sub"),
      clap: env("clap"),
      chat: env("chat"),
      ohat: env("ohat"),
      acid: env("acid"),
      step: snap.step,
    };
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (renderer && canvas) {
      renderer.render(u, canvas.width, canvas.height);
    } else {
      const bars = fallbackBarsRef.current;
      for (const v of VOICES) {
        const el = bars[v];
        if (el) {
          const active = snap.active[v] ? 1 : 0.25;
          el.style.height = `${Math.min(100, (8 + env(v) * 92) * active)}%`;
        }
      }
    }
  }, []);

  // Mount: build engine + renderer, run the (silent) auto-demo loop, wire
  // keyboard + resize. Everything torn down on unmount.
  useEffect(() => {
    engineRef.current = new Arrangement(0x2538, 128);
    refreshHud();

    const canvas = canvasRef.current;
    if (canvas && hasWebGL2()) {
      try {
        rendererRef.current = new Renderer(canvas);
        setGlState("ok");
      } catch {
        rendererRef.current = null;
        setGlState("fallback");
      }
    } else {
      setGlState("fallback");
    }

    const resize = () => {
      const c = canvasRef.current;
      const stage = stageRef.current;
      if (!c || !stage) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.floor(stage.clientWidth * dpr));
      c.height = Math.max(1, Math.floor(stage.clientHeight * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    lastFrameRef.current = performance.now();
    const frame = () => {
      const now = performance.now();
      const engine = engineRef.current;
      if (engine) {
        if (!startedRef.current) {
          const stepDur = 60 / engine.bpm / 4;
          demoAccRef.current += (now - lastFrameRef.current) / 1000;
          lastFrameRef.current = now;
          let guard = 0;
          while (demoAccRef.current >= stepDur && guard < 8) {
            demoAccRef.current -= stepDur;
            guard++;
            const r = engine.tick();
            applyEvents(r.events, now);
          }
        } else {
          lastFrameRef.current = now;
          const c = ctxRef.current;
          const q = pendingVizRef.current;
          if (c) {
            while (q.length && q[0].ctxTime <= c.currentTime) {
              const item = q.shift();
              if (item) applyEvents(item.events, now);
            }
          }
        }
      }
      renderVisual(now);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    const hudTimer = window.setInterval(refreshHud, 100);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.code !== "ArrowUp" && e.code !== "ArrowDown") return;
      if (!startedRef.current) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          startAudio();
        }
        return;
      }
      switch (e.code) {
        case "Space":
          e.preventDefault();
          handleAction("fill");
          break;
        case "ArrowUp":
          e.preventDefault();
          handleAction("energyUp");
          break;
        case "ArrowDown":
          e.preventDefault();
          handleAction("energyDown");
          break;
        case "KeyF":
          handleAction("fill");
          break;
        case "KeyD":
          handleAction("drop");
          break;
        case "KeyB":
          handleAction("break");
          break;
        case "KeyA":
          handleAction("acid");
          break;
        case "Digit1":
          handleAction("mute:kick");
          break;
        case "Digit2":
          handleAction("mute:sub");
          break;
        case "Digit3":
          handleAction("mute:clap");
          break;
        case "Digit4":
          handleAction("mute:chat");
          break;
        case "Digit5":
          handleAction("mute:ohat");
          break;
        case "Digit6":
          handleAction("mute:acid");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(schedulerRef.current);
      window.clearInterval(hudTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      synthRef.current?.dispose();
      synthRef.current = null;
      const c = ctxRef.current;
      ctxRef.current = null;
      if (c && c.state !== "closed") void c.close();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      engineRef.current = null;
    };
  }, [applyEvents, handleAction, refreshHud, renderVisual, startAudio]);

  const pct = (n: number) => Math.round(n * 100);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Stage */}
      <div ref={stageRef} className="absolute inset-0">
        {glState !== "fallback" ? (
          <canvas ref={canvasRef} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-end justify-center gap-2 bg-[#050308] px-6 pb-24">
            {VOICES.map((v) => (
              <div
                key={v}
                className="flex h-2/3 w-10 flex-col justify-end"
                aria-hidden
              >
                <div
                  ref={(el) => {
                    if (el) fallbackBarsRef.current[v] = el;
                  }}
                  className="w-full rounded-sm bg-primary/70 transition-[height] duration-75"
                  style={{ height: "8%" }}
                />
                <span className="mt-2 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {VOICE_LABEL[v]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top bar: title + description */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 bg-gradient-to-b from-background/85 to-transparent px-6 pt-6 pb-10">
        <h1 className="text-2xl font-semibold tracking-tight">2538 · driver</h1>
        <p className="max-w-xl text-base text-muted-foreground">
          A generative club engine that composes an endless, evolving techno
          arrangement in real time — rhythm-first, and it never plays the same
          bar twice.
        </p>
        {glState === "fallback" && (
          <p className="text-base text-destructive">
            WebGL2 unavailable — showing a reduced bar-meter fallback.
          </p>
        )}
      </div>

      {/* HUD: arrangement state */}
      {hud && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-primary">{PHASE_LABEL[hud.phase]}</span>
            <span>
              bar {hud.bar} · {hud.phaseBar + 1}/{hud.phaseLen}
            </span>
            <span>{hud.bpm} bpm</span>
            {hud.fillActive && <span className="text-primary">fill</span>}
          </div>
          <MeterRow label="energy" value={pct(hud.energy)} />
          <MeterRow label="tension" value={pct(hud.tension)} />
          <div className="flex flex-wrap gap-2 pt-1">
            {VOICES.map((v) => (
              <span
                key={v}
                className={
                  hud.muted[v]
                    ? "text-destructive/70 line-through"
                    : hud.active[v]
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                }
              >
                {VOICE_LABEL[v]}
              </span>
            ))}
          </div>
          <span className="text-muted-foreground/60">
            {hud.distinctBars} distinct bars · 0 repeats
          </span>
        </div>
      )}

      {/* Keymap */}
      {started && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden flex-col gap-1 text-right font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:flex">
          <span>
            <span className="text-foreground">↑ ↓</span> energy
          </span>
          <span>
            <span className="text-foreground">space / F</span> fill
          </span>
          <span>
            <span className="text-foreground">D</span> drop ·{" "}
            <span className="text-foreground">B</span> breakdown
          </span>
          <span>
            <span className="text-foreground">A</span> acid on/off
          </span>
          <span>
            <span className="text-foreground">1–6</span> mute track
          </span>
        </div>
      )}

      {/* On-screen fallback controls */}
      {started && (
        <div className="absolute inset-x-0 bottom-20 z-10 flex flex-wrap justify-center gap-2 px-4 sm:hidden">
          <SecondaryButton onClick={() => handleAction("energyDown")}>
            energy −
          </SecondaryButton>
          <SecondaryButton onClick={() => handleAction("energyUp")}>
            energy +
          </SecondaryButton>
          <SecondaryButton onClick={() => handleAction("fill")}>
            fill
          </SecondaryButton>
          <SecondaryButton onClick={() => handleAction("drop")}>
            drop
          </SecondaryButton>
          <SecondaryButton onClick={() => handleAction("break")}>
            break
          </SecondaryButton>
          <SecondaryButton onClick={() => handleAction("acid")}>
            acid
          </SecondaryButton>
        </div>
      )}

      {/* Design notes */}
      <div className="absolute right-4 top-6 z-20">
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showNotes ? "close" : "design notes"}
        </button>
        {showNotes && (
          <div className="mt-2 w-72 rounded-md border border-border bg-background/90 p-4 text-sm text-muted-foreground backdrop-blur">
            <p className="mb-2 text-foreground">Arrangement state machine</p>
            <p className="mb-2">
              A seeded controller (mulberry32(0x2538)) walks intro → build → drop
              → breakdown → build … Every bar it re-rolls ghost hits, hat
              density, fills and the acid line, so no bar repeats — the counter
              at lower-left tallies distinct bars.
            </p>
            <p className="mb-2">
              The acid line is deliberately un-snapped: it draws from a pool with
              the b9 and the tritone and is allowed to clash. Rhythm and timbre
              are the substrate, not consonance.
            </p>
            <p>
              Refs: arXiv:2605.21874 (real-time EDM monitoring sonification);
              Eno/Koan generative lineage; Roland TR-909 / TB-303.
            </p>
          </div>
        )}
      </div>

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-background/70 backdrop-blur-sm">
          <p className="max-w-md px-6 text-center text-base text-muted-foreground">
            The machine is already composing in silence. Press start to hear it —
            then drive it from the keyboard.
          </p>
          <button
            type="button"
            onClick={startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            start engine
          </button>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            or press space
          </p>
        </div>
      )}
    </main>
  );
}

function MeterRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16">{label}</span>
      <span className="relative h-1.5 w-32 overflow-hidden rounded-sm bg-muted">
        <span
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-8 text-right text-foreground">{value}</span>
    </div>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
