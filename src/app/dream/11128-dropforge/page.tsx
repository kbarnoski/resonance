"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { DropArc, type SectionName } from "./arc";
import { makeDropForgeAudio, type DropForgeAudio } from "./synth";
import { makeScheduler, type Scheduler } from "./scheduler";

const SEED = 0x11128;
const RINGS = [0, 1, 2, 3, 4, 5];
const BAR_COUNT = 28;
// each bar gets a fixed height profile (an arch) so the field reads as a shape;
// the live motion comes from the global tension / kick / level variables.
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => ({
  i,
  m: 0.4 + 0.6 * Math.sin((Math.PI * i) / (BAR_COUNT - 1)),
}));

type Phase = "idle" | "running";

interface Readout {
  section: SectionName;
  bpm: number;
  pass: number;
  tension: number; // 0..1
  energy: number; // 0..1 (slider)
}

const SECTION_LABEL: Record<SectionName, string> = {
  intro: "INTRO",
  build: "BUILD — coiling",
  break: "BREAK — hold your breath",
  drop: "THE DROP",
  sustain: "SUSTAIN — groove",
  decay: "DECAY",
};

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export default function Page() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [energyPct, setEnergyPct] = useState(50);
  const [shockKey, setShockKey] = useState(0);
  const [readout, setReadout] = useState<Readout>({
    section: "intro",
    bpm: 126,
    pass: 0,
    tension: 0,
    energy: 0.5,
  });

  const stageRef = useRef<HTMLDivElement | null>(null);

  // engine state — kept out of React render
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const audioRef = useRef<DropForgeAudio | null>(null);
  const arcRef = useRef<DropArc | null>(null);
  const schedRef = useRef<Scheduler | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  // smoothed visual state
  const tDispRef = useRef(0.08);
  const lvlRef = useRef(0);
  const kickEnvRef = useRef(0);
  const dropFlashRef = useRef(0);
  const driftRef = useRef(0);
  const readoutClockRef = useRef(0);

  const teardown = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    schedRef.current?.stop();
    schedRef.current = null;
    audioRef.current?.dispose();
    audioRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    arcRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
  }, []);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    return () => teardown();
  }, [teardown]);

  const frame = useCallback(() => {
    if (!runningRef.current) return;
    const arc = arcRef.current;
    const master = masterRef.current;
    const stage = stageRef.current;
    const reduced = reducedRef.current;

    if (arc && master && stage) {
      // ── analyser: RMS + low-band energy ────────────────────────────────────
      const an = master.analyser;
      const td = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(td);
      let sum = 0;
      for (let i = 0; i < td.length; i++) {
        const v = (td[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.min(1, Math.sqrt(sum / td.length) * 2.6);

      const fd = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(fd);
      let low = 0;
      for (let i = 1; i <= 6; i++) low += fd[i];
      const lowNorm = Math.min(1, low / (6 * 210));

      // ── tension: rise fast, fall slow (the drop should HIT) ────────────────
      const target = arc.biasedTarget;
      const k = target > tDispRef.current ? 0.14 : 0.045;
      tDispRef.current += (target - tDispRef.current) * k;
      const t = tDispRef.current;

      // ── level + kick pump (strobe-safe: gentle, eased, ≤ kick rate ~2 Hz) ──
      if (reduced) {
        lvlRef.current += (t * 0.3 - lvlRef.current) * 0.05;
        kickEnvRef.current = 0;
      } else {
        lvlRef.current += (rms - lvlRef.current) * 0.2;
        kickEnvRef.current = Math.max(kickEnvRef.current * 0.9, lowNorm);
      }

      dropFlashRef.current *= 0.965;
      driftRef.current += (reduced ? 0.04 : 0.05 + t * 0.5);

      const bloom = Math.min(
        1,
        t * 0.5 + dropFlashRef.current * 0.5 + kickEnvRef.current * 0.15,
      );
      const hue = 272 + t * 30; // violet → magenta, never leaving the band

      const s = stage.style;
      s.setProperty("--t", t.toFixed(4));
      s.setProperty("--lvl", lvlRef.current.toFixed(4));
      s.setProperty("--kick", kickEnvRef.current.toFixed(4));
      s.setProperty("--bloom", bloom.toFixed(4));
      s.setProperty("--drift", driftRef.current.toFixed(2));
      s.setProperty("--hue", hue.toFixed(1));

      // ── throttled readout (~6 Hz) ──────────────────────────────────────────
      readoutClockRef.current += 1;
      if (readoutClockRef.current % 10 === 0) {
        setReadout({
          section: arc.section,
          bpm: arc.params.bpm,
          pass: arc.pass,
          tension: t,
          energy: arc.energyBias,
        });
      }
    }

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
        : undefined;
    if (!Ctor) return;

    const ctx = new Ctor();
    await ctx.resume().catch(() => {});
    const master = createSafeMaster(ctx, { gain: 0.8 });
    const audio = makeDropForgeAudio(ctx, master);
    const arc = new DropArc(SEED);
    arc.energyBias = energyPct / 100;
    arc.onDrop = () => {
      dropFlashRef.current = 1;
      if (!reducedRef.current) setShockKey((v) => v + 1);
    };
    const sched = makeScheduler(ctx, arc, audio);

    ctxRef.current = ctx;
    masterRef.current = master;
    audioRef.current = audio;
    arcRef.current = arc;
    schedRef.current = sched;

    runningRef.current = true;
    setPhase("running");
    sched.start();
    rafRef.current = requestAnimationFrame(frame);
  }, [energyPct, frame]);

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
    tDispRef.current = 0.08;
    lvlRef.current = 0;
    kickEnvRef.current = 0;
    dropFlashRef.current = 0;
  }, [teardown]);

  const onEnergy = useCallback((v: number) => {
    setEnergyPct(v);
    if (arcRef.current) arcRef.current.energyBias = v / 100;
  }, []);

  const forceDrop = useCallback(() => {
    arcRef.current?.forceDrop();
  }, []);

  const canForce = phase === "running" && readout.section === "build";

  return (
    <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden bg-background">
      {/* ── the CSS/DOM compositor: everything below is layered divs ── */}
      <div ref={stageRef} className="df-stage" aria-hidden>
        <div className="df-bg" />
        <div className="df-rings">
          {RINGS.map((i) => (
            <div
              key={i}
              className="df-ring"
              style={{ "--i": i } as CSSProperties}
            />
          ))}
        </div>
        <div className="df-bloom" />
        {shockKey > 0 && <div key={shockKey} className="df-shock" />}
        <div className="df-bars">
          {BARS.map((b) => (
            <span
              key={b.i}
              className="df-bar"
              style={{ "--m": b.m.toFixed(3) } as CSSProperties}
            />
          ))}
        </div>
        <div className="df-vignette" />
      </div>

      {/* ── chrome ── */}
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-5 px-5 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dropforge
          </h1>
          <p className="text-base text-muted-foreground">
            An autonomous EDM build-and-drop engine — tension coils through the
            build, the break holds its breath, and the drop is earned. It self-runs
            and evolves; every pass mutates the key, groove and lead.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={forceDrop}
            disabled={!canForce}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Force the drop
          </button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-4 backdrop-blur-sm">
          <label
            htmlFor="df-energy"
            className="flex items-center justify-between text-sm text-muted-foreground"
          >
            <span>Energy</span>
            <span className="font-mono text-xs text-foreground">{energyPct}%</span>
          </label>
          <input
            id="df-energy"
            type="range"
            min={0}
            max={100}
            value={energyPct}
            onChange={(e) => onEnergy(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-md bg-accent accent-primary"
          />
          <p className="text-xs text-muted-foreground/80">
            Biases how hot the whole arc runs. &ldquo;Force the drop&rdquo; is armed
            only while the engine is building.
          </p>
        </div>

        {/* live readout */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
          <span>
            <span className="text-muted-foreground/60">SECTION </span>
            <span className="text-foreground">{SECTION_LABEL[readout.section]}</span>
          </span>
          <span>
            <span className="text-muted-foreground/60">BPM </span>
            <span className="text-foreground">{readout.bpm}</span>
          </span>
          <span>
            <span className="text-muted-foreground/60">PASS </span>
            <span className="text-foreground">{readout.pass}</span>
          </span>
          <span>
            <span className="text-muted-foreground/60">TENSION </span>
            <span className="text-foreground">
              {Math.round(readout.tension * 100)}%
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {showNotes ? "Hide" : "Design notes"}
        </button>
        {showNotes && (
          <div className="max-w-prose rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground backdrop-blur-sm">
            <p>
              A state machine cycles intro → build → break → drop → sustain → decay,
              looping back to the build with mutated parameters (seeded mulberry32,
              seed 0x11128) so it evolves rather than repeats. A ~25 ms look-ahead
              scheduler walks 16th notes against the audio clock; each kick ducks a
              sidechain bus for the classic EDM pump. The visuals are pure CSS/DOM:
              layered divs driven by a handful of custom properties updated per
              frame — no canvas, no WebGL.
            </p>
            <p className="mt-2">
              Strobe-safe by construction: energy reads through smooth luminance
              swells, scale and blur, never a flash. The kick pump is a soft,
              eased envelope near ~2 Hz, and{" "}
              <code className="text-foreground">prefers-reduced-motion</code> drops
              it entirely, leaving only slow gradient drift.
            </p>
          </div>
        )}
      </div>

      <style>{STAGE_CSS}</style>
    </div>
  );
}

const STAGE_CSS = `
.df-stage {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  --t: 0.08;
  --lvl: 0;
  --kick: 0;
  --bloom: 0.04;
  --drift: 0;
  --hue: 275;
  background: #000;
  pointer-events: none;
}
.df-bg {
  position: absolute;
  inset: -10%;
  background:
    radial-gradient(120% 95% at 50% 40%,
      hsl(var(--hue) 92% calc(6% + var(--t) * 20% + var(--bloom) * 26%)) 0%,
      hsl(calc(var(--hue) - 18) 85% 5%) 52%,
      #000 100%);
  transition: background 90ms linear;
}
.df-rings {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.df-ring {
  position: absolute;
  width: 46vmin;
  height: 46vmin;
  border-radius: 50%;
  border: 2px solid hsl(var(--hue) 100% 72% / calc(0.1 + var(--t) * 0.55));
  box-shadow:
    0 0 calc(8px + var(--bloom) * 60px) hsl(var(--hue) 100% 65% / calc(0.15 + var(--t) * 0.5)),
    inset 0 0 calc(6px + var(--bloom) * 40px) hsl(calc(var(--hue) + 20) 100% 70% / calc(0.1 + var(--t) * 0.4));
  opacity: calc(0.12 + var(--t) * 0.55);
  transform:
    rotate(calc(var(--drift) * 1deg * (1 + var(--i) * 0.22)))
    scale(calc(0.42 + (1 - var(--t)) * 0.55 + var(--i) * 0.13 + var(--kick) * 0.06));
  filter: blur(calc((1 - var(--t)) * 1.5px));
  will-change: transform, opacity;
}
.df-bloom {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 70vmin;
  height: 70vmin;
  border-radius: 50%;
  background: radial-gradient(circle at center,
    hsl(var(--hue) 100% 92% / 0.9) 0%,
    hsl(var(--hue) 100% 68% / 0.5) 22%,
    transparent 62%);
  mix-blend-mode: screen;
  filter: blur(calc(14px + var(--bloom) * 26px));
  opacity: calc(var(--bloom) * 0.85);
  transform: scale(calc(0.6 + var(--bloom) * 0.8));
  transition: opacity 80ms linear;
  will-change: opacity, transform;
}
.df-shock {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 30vmin;
  height: 30vmin;
  border-radius: 50%;
  border: 3px solid hsl(300 100% 75% / 0.9);
  box-shadow: 0 0 40px hsl(300 100% 70% / 0.7);
  mix-blend-mode: screen;
  opacity: 0;
  animation: df-shockwave 1100ms cubic-bezier(0.16, 0.7, 0.3, 1) 1;
}
@keyframes df-shockwave {
  0% { transform: scale(0.2); opacity: 0.85; }
  100% { transform: scale(6); opacity: 0; }
}
.df-bars {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 42%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.5vw;
  padding: 0 4vw;
  opacity: calc(0.25 + var(--t) * 0.6);
}
.df-bar {
  flex: 1 1 0;
  max-width: 2.2vw;
  height: 100%;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(to top,
    hsl(var(--hue) 90% 55% / 0.15),
    hsl(calc(var(--hue) + 18) 100% 70% / 0.9));
  transform-origin: bottom;
  transform: scaleY(calc(
    (0.08 + var(--t) * 0.55 + var(--kick) * 1.3 + var(--lvl) * 0.7) * var(--m)
    + 0.04
  ));
  filter: blur(calc((1 - var(--t)) * 0.6px));
  will-change: transform;
}
.df-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(130% 100% at 50% 45%, transparent 45%, #000 100%);
}
@media (prefers-reduced-motion: reduce) {
  .df-bg { transition: background 400ms linear; }
  .df-bloom { transition: opacity 400ms linear; }
  .df-shock { animation: none; display: none; }
  .df-ring, .df-bar { will-change: auto; }
}
`;
