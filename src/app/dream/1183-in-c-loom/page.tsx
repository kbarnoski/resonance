"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { InCAudio } from "./audio";
import { CELL_COUNT, type Player } from "./ensemble";

/**
 * 1183 · In C Loom
 *
 * A faithful generative realisation of Terry Riley's *In C* (1964): twelve
 * virtual players move forward-only through 53 short melodic cells, each
 * repeating a probabilistic number of times, gently herded so no one runs
 * more than ~3 cells ahead. They phase apart and re-converge forever. The
 * piece is genuinely stateful — minute 6 sounds nothing like minute 1. This
 * is audio-first; the ring below is a calm secondary readout.
 */

type Phase = "idle" | "running";

// Rendered player positions (eased angles) live outside React state so the
// animation loop can mutate them every frame without re-rendering.
interface Rendered {
  angle: number; // current eased angle (radians)
  target: number; // target angle for the player's current cell
  glow: number; // 0..1 eased "just moved" brightness
  lastCell: number;
}

const TWO_PI = Math.PI * 2;

function cellAngle(cellIndex: number): number {
  // Cell 1 at top, moving clockwise around the ring.
  return -Math.PI / 2 + (cellIndex / CELL_COUNT) * TWO_PI;
}

export default function InCLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<InCAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const renderedRef = useRef<Rendered[]>([]);
  const reducedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tempo, setTempo] = useState(140);
  const [density, setDensity] = useState(12);
  const [seed, setSeed] = useState(1183);
  const [readout, setReadout] = useState(
    "12 players ready at cell 1 · press Begin",
  );
  const [supported, setSupported] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // Feature detection + reduced-motion (once).
  useEffect(() => {
    const hasAudio =
      typeof window !== "undefined" &&
      (typeof window.AudioContext !== "undefined" ||
        typeof (window as unknown as { webkitAudioContext?: unknown })
          .webkitAudioContext !== "undefined");
    setSupported(hasAudio);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // — draw the ring + player constellation —
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;

    // Warm parchment wash.
    ctx.clearRect(0, 0, w, h);

    // Slow (~0.15 Hz) breathing central glow — luminance drift only, no flicker.
    const t = performance.now() / 1000;
    const breathe = reducedRef.current ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.9);
    const glowR = radius * (0.85 + breathe * 0.12);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grad.addColorStop(0, `rgba(245, 194, 108, ${0.16 + breathe * 0.06})`);
    grad.addColorStop(0.6, "rgba(240, 176, 96, 0.05)");
    grad.addColorStop(1, "rgba(240, 176, 96, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, TWO_PI);
    ctx.fill();

    // 53 cell ticks around the ring.
    for (let i = 0; i < CELL_COUNT; i++) {
      const a = cellAngle(i);
      const x1 = cx + Math.cos(a) * (radius - 6);
      const y1 = cy + Math.sin(a) * (radius - 6);
      const x2 = cx + Math.cos(a) * (radius + 6);
      const y2 = cy + Math.sin(a) * (radius + 6);
      // Middle stretch (B♭ shading) tinted a touch amber; ends brighter gold.
      const shaded = i >= 20 && i <= 38;
      ctx.strokeStyle = shaded
        ? "rgba(180, 120, 60, 0.45)"
        : "rgba(150, 110, 70, 0.32)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Player dots.
    const players: ReadonlyArray<Player> = audio ? audio.getPlayers() : [];
    const rendered = renderedRef.current;
    for (let i = 0; i < rendered.length; i++) {
      const r = rendered[i];
      const p = players[i];
      const activeNow = p ? p.active : true;
      if (p && p.cellIndex !== r.lastCell) {
        r.target = cellAngle(p.cellIndex);
        r.lastCell = p.cellIndex;
        r.glow = 1;
      }
      // Shortest-arc easing toward the target angle (slow, calm).
      let delta = r.target - r.angle;
      while (delta > Math.PI) delta -= TWO_PI;
      while (delta < -Math.PI) delta += TWO_PI;
      const ease = reducedRef.current ? 0.16 : 0.08;
      r.angle += delta * ease;
      r.glow *= reducedRef.current ? 0.9 : 0.95;

      if (!activeNow) continue;

      const px = cx + Math.cos(r.angle) * radius;
      const py = cy + Math.sin(r.angle) * radius;
      const base = 3.4;
      const dotR = base + r.glow * 2.2;

      const g2 = ctx.createRadialGradient(px, py, 0, px, py, dotR * 3.2);
      g2.addColorStop(0, `rgba(210, 120, 40, ${0.5 + r.glow * 0.4})`);
      g2.addColorStop(1, "rgba(210, 120, 40, 0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(px, py, dotR * 3.2, 0, TWO_PI);
      ctx.fill();

      ctx.fillStyle = `rgba(120, 60, 20, ${0.85})`;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, TWO_PI);
      ctx.fill();
    }
  }, []);

  // — animation loop —
  const loop = useCallback(() => {
    drawFrame();
    const audio = audioRef.current;
    if (audio) {
      const s = audio.getSpread();
      const range =
        s.minCell === s.maxCell
          ? `cell ${s.minCell}`
          : `cells ${s.minCell}–${s.maxCell}`;
      setReadout(
        `${s.activeCount} players spread across ${range} · pass ${s.pass}`,
      );
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [drawFrame]);

  const ensureRendered = useCallback(() => {
    renderedRef.current = Array.from({ length: 12 }, () => ({
      angle: cellAngle(0),
      target: cellAngle(0),
      glow: 0,
      lastCell: 0,
    }));
  }, []);

  const handleBegin = useCallback(async () => {
    if (!supported) return;
    if (phase === "running") {
      // Stop + full teardown.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      await audioRef.current?.dispose();
      audioRef.current = null;
      setPhase("idle");
      setReadout("stopped · press Begin to perform again");
      return;
    }
    try {
      ensureRendered();
      const audio = new InCAudio({
        seed,
        numPlayers: 12,
        tempo,
        density,
      });
      audioRef.current = audio;
      await audio.start();
      setPhase("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setSupported(false);
    }
  }, [supported, phase, seed, tempo, density, ensureRendered, loop]);

  // Keep the (static) ring visible before the first Begin.
  useEffect(() => {
    if (phase === "idle") {
      ensureRendered();
      drawFrame();
    }
  }, [phase, ensureRendered, drawFrame]);

  // Live control wiring.
  useEffect(() => {
    audioRef.current?.setTempo(tempo);
  }, [tempo]);
  useEffect(() => {
    audioRef.current?.setDensity(density);
  }, [density]);

  const rerollSeed = useCallback(() => {
    const next = Math.floor(Math.random() * 1_000_000) + 1;
    setSeed(next);
    audioRef.current?.reseed(next);
    ensureRendered();
  }, [ensureRendered]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="min-h-screen w-full bg-[#f6efdd] text-stone-800">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10 sm:py-14">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-violet-700/80">
            Dream Lab · 1183
          </p>
          <h1 className="text-3xl font-semibold text-stone-900 sm:text-4xl">
            In C Loom
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-stone-700">
            A self-organising minimalist ensemble that performs Terry Riley&rsquo;s{" "}
            <em>In C</em> endlessly. Twelve players advance independently through
            53 melodic cells, phasing apart and re-converging into ever-shifting
            interlocking patterns. It is genuinely different at minute 6 than at
            minute 1 &mdash; press Begin and let it run.
          </p>
        </header>

        {!supported && (
          <p className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-base text-violet-600">
            Web Audio isn&rsquo;t available in this browser, so the ensemble
            can&rsquo;t sound. The ring below still shows the score layout.
          </p>
        )}

        <div className="relative overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-b from-[#fbf6e9] to-[#f2e8cf] shadow-sm">
          <canvas
            ref={canvasRef}
            className="block h-[340px] w-full sm:h-[420px]"
            aria-label="Constellation of 12 players moving around a ring of 53 cells"
          />
          <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-base font-medium text-stone-700">
            {readout}
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBegin}
              disabled={!supported}
              className="min-h-[44px] rounded-full bg-violet-600 px-6 py-2.5 text-base font-semibold text-foreground shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {phase === "running" ? "Stop" : "Begin"}
            </button>
            <button
              type="button"
              onClick={rerollSeed}
              className="min-h-[44px] rounded-full border border-violet-300 bg-muted px-5 py-2.5 text-base font-medium text-stone-800 transition-colors hover:bg-violet-50"
            >
              Re-roll seed
              <span className="ml-2 text-sm text-violet-700">#{seed}</span>
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-base font-medium text-stone-800">
              Pulse tempo
              <span className="ml-2 text-sm text-violet-700">{tempo} BPM</span>
            </span>
            <input
              type="range"
              min={90}
              max={190}
              step={1}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-violet-200 accent-violet-600"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-base font-medium text-stone-800">
              Density
              <span className="ml-2 text-sm text-violet-700">
                {density} of 12 players
              </span>
            </span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={density}
              onChange={(e) => setDensity(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-violet-200 accent-violet-600"
            />
          </label>
        </div>

        <div className="rounded-xl border border-violet-200/70 bg-[#fbf6e9] px-4 py-3">
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="text-base font-medium text-violet-700 hover:text-violet-800"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
          {showNotes && (
            <div className="mt-3 flex flex-col gap-3 text-base leading-relaxed text-stone-700">
              <p>
                Each of the 53 cells is a short authored figure in C. Cells
                1&ndash;20 are diatonic C major; cells 21&ndash;39 introduce the
                B&flat; that gives <em>In C</em> its famous mixolydian shading;
                cells 40&ndash;53 bring back B natural and F&sharp; to resolve
                bright to a C octave.
              </p>
              <p>
                A player repeats its current cell a probabilistic (seeded) number
                of times, then advances &mdash; but never more than three cells
                ahead of the slowest player. That single herding rule is what
                keeps twelve independent voices from drifting into chaos while
                still letting them phase.
              </p>
              <p>
                References: Terry Riley, <em>In C</em> (1964); Steve Reich,{" "}
                <em>Piano Phase</em> (1967). What&rsquo;s designed-not-heard: the
                cells are faithful in shape and arc but are not an exact
                transcription, and the marimba/drone timbres are a synthesised
                impression rather than sampled instruments.
              </p>
            </div>
          )}
        </div>
      </div>

      <PrototypeNav slugs={[]} />
    </main>
  );
}
