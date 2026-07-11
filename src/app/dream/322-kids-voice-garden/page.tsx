"use client";

// Voice Garden — kids (4+). Sing or hum and a glowing musical garden GROWS toward
// your voice using a space-colonization algorithm (Runions/Prusinkiewicz 2007).
// Pitch = how HIGH the light appears; loudness = how fast it grows. Blooms pluck
// notes from a slowly drifting D-Lydian chord progression. The garden keeps its
// real age in localStorage, so it's taller and a different colour every visit.
//
// Renderer: inline SVG only, mutated per-frame via refs (no full React re-render
// in the animation loop, no Canvas/WebGL). Audio: Web Audio API only.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VIEW_W,
  VIEW_H,
  SOIL_Y,
  growSeed,
  applyLight,
  applyBudget,
  stepPlant,
  stepBlooms,
  saveGarden,
  loadGarden,
  runOfflineGrowth,
  type Plant,
} from "./garden";
import { createVoice, type VoiceHandle } from "./voice";
import { createAudioEngine, type AudioEngine } from "./audio";

const SESSION_CAP_MS = 13 * 60 * 1000; // ~13 min then drift to lullaby

// hueFor: light placed high in the sky -> brighter; mixes with chord hue at render.
function hueForHeight(baseHue: number, y: number): number {
  const t = 1 - y / SOIL_Y; // 0 ground .. 1 sky
  return Math.round((baseHue + t * 40) % 360);
}

export default function VoiceGardenPage() {
  const [started, setStarted] = useState(false);
  const [micLive, setMicLive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [chordLabel, setChordLabel] = useState("");
  const [lullaby, setLullaby] = useState(false);

  // refs that live across frames (no re-render churn)
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const voiceRef = useRef<VoiceHandle | null>(null);
  const plantsRef = useRef<Plant[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lullabyDoneRef = useRef(false);

  // SVG group we replace contents of via direct DOM (one write/frame, cheap).
  const plantsLayerRef = useRef<SVGGElement | null>(null);
  const lightLayerRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Auto-demo: gentle hands-free light so the page is alive at a glance.
  const autoDemoRef = useRef(true);
  const autoDemoTimerRef = useRef<number>(0);

  const chordIndexRef = useRef(0);
  const drawSceneRef = useRef<() => void>(() => {});

  // ---- helpers used by the sim (stable refs, not hooks) ---------------------
  const noteCounterRef = useRef(0);
  const noteFor = useCallback(() => {
    return noteCounterRef.current++;
  }, []);

  // Place light at viewBox coords for the nearest plant (or seed one).
  const placeLight = useCallback(
    (vx: number, vy: number, energy: number) => {
      const plants = plantsRef.current;
      let target: Plant | null = null;
      let bestDx = Infinity;
      for (const p of plants) {
        const dx = Math.abs(p.seedX - vx);
        if (dx < bestDx) {
          bestDx = dx;
          target = p;
        }
      }
      // If no plant near this column (or none at all), sprout a new seedling.
      if (!target || bestDx > 240) {
        const hue = audioRef.current?.currentHue() ?? 275;
        const seed = growSeed(
          Math.max(60, Math.min(VIEW_W - 60, vx)),
          Date.now(),
          hue,
        );
        plants.push(seed);
        target = seed;
        if (plants.length > 9) plants.shift(); // keep the garden bounded
      }
      applyLight(target, vx, vy, energy);
      applyBudget(target, 14 * (0.6 + energy));
    },
    [],
  );

  // ---- main animation + sim loop -------------------------------------------
  const frame = useCallback(
    (now: number) => {
      const audio = audioRef.current;
      const ctx = ctxRef.current;
      if (!audio || !ctx) return;

      const dt = lastTimeRef.current ? Math.min(0.05, (now - lastTimeRef.current) / 1000) : 0.016;
      lastTimeRef.current = now;

      // Harmonic clock.
      const ci = audio.step(dt);
      if (ci !== chordIndexRef.current) {
        chordIndexRef.current = ci;
      }

      // Session cap -> lullaby drift.
      const sessionMs = Date.now() - startedAtRef.current;
      if (sessionMs > SESSION_CAP_MS && !lullabyDoneRef.current) {
        lullabyDoneRef.current = true;
        audio.lullaby();
        setLullaby(true);
      }
      const calm = sessionMs > SESSION_CAP_MS;

      // VOICE input -> light + budget.
      const voice = voiceRef.current;
      if (voice && voice.isLive()) {
        const vf = voice.getFrame();
        if (vf.voiced && vf.loudness > 0.06 && !calm) {
          autoDemoRef.current = false; // child took over
          // pitch -> height. Map ~110Hz..600Hz to ground..sky (log scale).
          const p = Math.log2(Math.max(110, Math.min(700, vf.pitchHz)) / 110);
          const span = Math.log2(700 / 110);
          const height01 = Math.min(1, p / span);
          const vy = SOIL_Y - height01 * (SOIL_Y - 70);
          // x wanders gently so a held note paints a soft cloud, not a dot.
          const cx = VIEW_W * 0.5 + Math.sin(now * 0.0013) * VIEW_W * 0.28;
          placeLight(cx + (Math.random() - 0.5) * 120, vy + (Math.random() - 0.5) * 80, vf.loudness);
        }
      }

      // AUTO-DEMO: hands-free drifting light so the garden grows on its own
      // until a child sings/taps.
      if (autoDemoRef.current && !calm) {
        autoDemoTimerRef.current -= dt;
        if (autoDemoTimerRef.current <= 0) {
          autoDemoTimerRef.current = 0.45 + Math.random() * 0.5;
          const cx = VIEW_W * (0.25 + Math.random() * 0.5);
          const vy = 120 + Math.random() * (SOIL_Y - 360);
          placeLight(cx, vy, 0.5);
        }
      }

      // GROW: run space-colonization steps on each plant.
      for (const plant of plantsRef.current) {
        const bloomed = stepPlant(
          plant,
          (y) => hueForHeight(plant.baseHue, y),
          noteFor,
        );
        stepBlooms(plant, dt);
        // Play a soft pluck for each newly bloomed tip (current chord).
        for (const ni of bloomed) {
          const node = plant.nodes[ni];
          if (node.played) continue;
          node.played = true;
          const height01 = 1 - node.y / SOIL_Y;
          // higher blooms -> higher chord tone / octave.
          const octave = height01 > 0.66 ? 1 : 0;
          const gain = calm ? 0.18 : 0.32;
          audio.pluck(node.bloomNote, octave, gain);
        }
      }

      drawSceneRef.current();
      rafRef.current = requestAnimationFrame(frame);
    },
    [placeLight, noteFor],
  );

  // ---- SVG draw (one DOM write per frame; not React) ------------------------
  const drawScene = useCallback(() => {
    const layer = plantsLayerRef.current;
    const lights = lightLayerRef.current;
    if (!layer || !lights) return;

    let stems = "";
    let blooms = "";
    for (const p of plantsRef.current) {
      for (const n of p.nodes) {
        if (n.parent < 0) continue;
        const par = p.nodes[n.parent];
        const w = Math.max(1.2, 5 - n.depth * 0.06);
        stems += `<line x1="${par.x.toFixed(1)}" y1="${par.y.toFixed(1)}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" stroke="hsl(${n.hue} 70% 60%)" stroke-width="${w.toFixed(1)}" stroke-linecap="round" opacity="0.92"/>`;
        if (n.bloom > 0) {
          const r = (6 + n.bloom * 8).toFixed(1);
          const hue = (n.hue + 20) % 360;
          blooms += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="hsl(${hue} 90% 72%)" filter="url(#vg-glow)" opacity="${(0.5 + n.bloom * 0.45).toFixed(2)}"/>`;
          blooms += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(Number(r) * 0.45).toFixed(1)}" fill="hsl(${hue} 95% 90%)" opacity="${(0.6 * n.bloom).toFixed(2)}"/>`;
        }
      }
    }
    layer.innerHTML = `<g filter="url(#vg-soft)">${stems}</g>${blooms}`;

    // Light/attractor glints.
    let lite = "";
    for (const p of plantsRef.current) {
      for (const a of p.attractors) {
        const r = (4 + a.energy * 10).toFixed(1);
        lite += `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${r}" fill="hsl(52 100% 80%)" filter="url(#vg-glow)" opacity="${(0.3 + a.energy * 0.5).toFixed(2)}"/>`;
      }
    }
    lights.innerHTML = lite;
  }, []);

  // keep the raf loop pointing at the latest drawScene without re-creating frame
  useEffect(() => {
    drawSceneRef.current = drawScene;
  }, [drawScene]);

  // ---- pointer / touch fallback --------------------------------------------
  const onSky = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const vx = ((clientX - rect.left) / rect.width) * VIEW_W;
      const vy = ((clientY - rect.top) / rect.height) * VIEW_H;
      if (vy > SOIL_Y) return; // tapped the soil, ignore
      autoDemoRef.current = false;
      // a tap drops a small cluster of light (≥64px area handled by big SVG)
      placeLight(vx, vy, 0.75);
      placeLight(vx + 30, vy - 20, 0.6);
      placeLight(vx - 25, vy + 15, 0.55);
    },
    [placeLight],
  );

  // ---- start (must be inside a user gesture for iOS) ------------------------
  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);
    startedAtRef.current = Date.now();

    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    ctxRef.current = ctx;

    const audio = createAudioEngine(ctx);
    audioRef.current = audio;
    audio.startDrone();

    // Load persisted garden + apply real wall-clock offline growth.
    const { plants, offlineMin } = loadGarden();
    if (plants.length) {
      runOfflineGrowth(
        plants,
        (y) => hueForHeight(plants[0].baseHue, y),
        () => noteCounterRef.current++,
      );
      plantsRef.current = plants;
      if (offlineMin > 2) autoDemoRef.current = false; // a grown garden greets you
    } else {
      // fresh visitor: drop a first seed so something's there immediately.
      plantsRef.current = [growSeed(VIEW_W * 0.5, Date.now(), audio.currentHue())];
    }

    // Try mic (analysis only). Falls back to touch on denial.
    const voice = createVoice();
    voiceRef.current = voice;
    try {
      await voice.start(ctx);
      setMicLive(true);
      setMicError(null);
      autoDemoRef.current = false; // child can drive with voice
    } catch (e) {
      setMicLive(false);
      setMicError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone is off — tap the sky to plant light instead!"
          : "No microphone here — tap the sky to plant light instead!",
      );
      autoDemoRef.current = true; // keep it alive hands-free
    }

    // periodic save with wall-clock timestamps
    saveTimerRef.current = setInterval(() => saveGarden(plantsRef.current), 5000);

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);
  }, [started, frame]);

  // chord label tick (light React state, ~1/s, NOT in the raf loop)
  useEffect(() => {
    if (!started) return;
    const labels = ["I · D", "ii · Em", "vi · Bm", "IV · home"];
    const id = setInterval(() => {
      setChordLabel(labels[chordIndexRef.current % labels.length]);
    }, 1000);
    return () => clearInterval(id);
  }, [started]);

  // ---- full teardown on unmount --------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      try {
        saveGarden(plantsRef.current);
      } catch {
        /* ignore */
      }
      voiceRef.current?.stop();
      audioRef.current?.dispose();
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#1a1030] text-foreground select-none">
      {/* The garden SVG. Tapping it (sky) plants light — full-screen target. */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => started && onSky(e.clientX, e.clientY)}
      >
        <defs>
          {/* dusk sky gradient */}
          <linearGradient id="vg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a1b4d" />
            <stop offset="45%" stopColor="#3d2469" />
            <stop offset="80%" stopColor="#6a3b7a" />
            <stop offset="100%" stopColor="#b5728a" />
          </linearGradient>
          <radialGradient id="vg-moon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7e8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff7e8" stopOpacity="0" />
          </radialGradient>
          {/* glow for blooms + light */}
          <filter id="vg-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="9" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="vg-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        </defs>

        {/* sky */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#vg-sky)" />
        {/* moon */}
        <circle cx={VIEW_W * 0.8} cy={VIEW_H * 0.18} r="120" fill="url(#vg-moon)" />
        <circle cx={VIEW_W * 0.8} cy={VIEW_H * 0.18} r="46" fill="#fff7e8" opacity="0.85" />
        {/* stars */}
        <StarField />
        {/* soil */}
        <rect x="0" y={SOIL_Y} width={VIEW_W} height={VIEW_H - SOIL_Y} fill="#2a1530" />
        <rect x="0" y={SOIL_Y} width={VIEW_W} height="6" fill="#7a4a5e" opacity="0.6" />

        {/* live layers (mutated via refs, not React) */}
        <g ref={lightLayerRef} />
        <g ref={plantsLayerRef} />
      </svg>

      {/* ---- UI overlay ---- */}
      {!started ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/35 px-6 text-center backdrop-blur-sm">
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
            🌱 Voice Garden
          </h1>
          <p className="max-w-md text-base text-foreground sm:text-lg">
            Sing or hum and a glowing garden grows toward your voice. High notes
            reach for the sky, soft notes grow slow. Come back tomorrow — it
            keeps growing while you&apos;re away.
          </p>
          <button
            onClick={start}
            className="rounded-full bg-violet-400 px-10 py-5 text-2xl font-bold text-violet-950 shadow-lg shadow-violet-500/30 transition active:scale-95"
            style={{ minWidth: 200, minHeight: 80 }}
          >
            ▶ Start singing
          </button>
          <p className="text-sm text-muted-foreground">
            No microphone? You can tap the sky instead. 🎨
          </p>
        </div>
      ) : (
        <>
          {/* provenance label */}
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1">
            <span
              className={
                micLive
                  ? "rounded-full bg-black/40 px-4 py-2 text-base font-semibold text-violet-300/95 backdrop-blur"
                  : "rounded-full bg-black/40 px-4 py-2 text-base font-semibold text-violet-300/95 backdrop-blur"
              }
            >
              {micLive ? "Listening 🎤" : "Touch mode ✋"}
            </span>
            {chordLabel ? (
              <span className="rounded-full bg-black/30 px-4 py-1.5 text-base text-muted-foreground backdrop-blur">
                color: {chordLabel}
              </span>
            ) : null}
          </div>

          {micError ? (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-2xl bg-black/45 px-5 py-3 text-center text-base text-violet-300 backdrop-blur">
              {micError}
            </div>
          ) : (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-2xl bg-black/30 px-5 py-3 text-center text-base text-muted-foreground backdrop-blur">
              {lullaby ? "Sweet dreams, little garden 🌙" : "Sing high for the sky · tap to plant light"}
            </div>
          )}
        </>
      )}
    </main>
  );
}

/** Static starfield (rendered once by React; never mutated). */
function StarField() {
  const stars: { x: number; y: number; r: number; o: number }[] = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 70; i++) {
    stars.push({
      x: rand() * VIEW_W,
      y: rand() * SOIL_Y * 0.7,
      r: 0.6 + rand() * 1.8,
      o: 0.3 + rand() * 0.6,
    });
  }
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
      ))}
    </g>
  );
}
