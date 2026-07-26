"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  ScentField,
  colToPan,
  mulberry32,
  rowToFreq,
  FIELD_W,
  FIELD_H,
} from "./field";
import { Swarm, type AgentHit } from "./swarm";
import { SwarmAudio } from "./audio";
import { Autopilot } from "./autopilot";

const SEED = 0x2960;
const N_AGENTS = 48;

type Mode = "autopilot" | "human";

export default function MurmurationPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState<Mode>("autopilot");
  const [needsTap, setNeedsTap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Live state shared with the animation loop via refs.
  const modeRef = useRef<Mode>("autopilot");
  const audioRef = useRef<SwarmAudio | null>(null);
  const pointerDownRef = useRef(false);
  const pointerPosRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    modeRef.current = mode;
    // Leaving human control: lift the finger so autopilot resumes cleanly.
    if (mode === "autopilot") pointerDownRef.current = false;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError(
        "This browser will not open a 2-D canvas — the flock cannot take shape here.",
      );
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // --- Engines (created once, seeded deterministically) -----------------
    const rand = mulberry32(SEED);
    const field = new ScentField();
    const swarm = new Swarm(N_AGENTS, field, rand);
    const autopilot = new Autopilot(mulberry32(SEED ^ 0x9e37));
    const hits: AgentHit[] = [];

    let audio: SwarmAudio | null = null;
    try {
      audio = new SwarmAudio();
      audioRef.current = audio;
      setNeedsTap(audio.suspended());
      void audio.resume().then(() => {
        if (audio) setNeedsTap(audio.suspended());
      });
    } catch {
      audio = null;
      setError(
        "Audio is unavailable here — the flock still breathes on screen, but in silence.",
      );
    }

    // --- Offscreen buffer for the scent heat-field ------------------------
    const heat = document.createElement("canvas");
    heat.width = FIELD_W;
    heat.height = FIELD_H;
    const heatCtx = heat.getContext("2d");
    const img = heatCtx ? heatCtx.createImageData(FIELD_W, FIELD_H) : null;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cw = 0;
    let ch = 0;
    const resize = () => {
      cw = canvas.clientWidth || window.innerWidth;
      ch = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const evap = reduce ? 0.993 : 0.99;
    const cursor = { gx: FIELD_W / 2, gy: FIELD_H / 2, on: false, glow: 0 };

    let raf = 0;
    let last = performance.now();
    const startT = last;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp after tab-switch stalls
      const t = (now - startT) / 1000;

      // --- Evaporate the memory field -----------------------------------
      field.evaporate(evap);

      // --- Determine the active gesture ---------------------------------
      let pressing: boolean;
      let gx: number;
      let gy: number;
      if (modeRef.current === "autopilot") {
        autopilot.step(reduce ? dt * 0.6 : dt);
        gx = autopilot.x * (FIELD_W - 1);
        gy = autopilot.y * (FIELD_H - 1);
        pressing = true;
      } else {
        gx = pointerPosRef.current.x * (FIELD_W - 1);
        gy = pointerPosRef.current.y * (FIELD_H - 1);
        pressing = pointerDownRef.current;
      }

      // --- Deposit scent + drive the hand voice -------------------------
      cursor.on = pressing;
      if (pressing) {
        cursor.gx = gx;
        cursor.gy = gy;
        field.splat(gx, gy, 2.4, 0.22);
        if (audio) {
          audio.setHand(true, rowToFreq(gy), colToPan(gx), 0.55);
        }
        cursor.glow += (1 - cursor.glow) * 0.2;
      } else {
        if (audio) audio.setHand(false, 220, 0, 0);
        cursor.glow += (0 - cursor.glow) * 0.1;
      }

      // --- Advance the swarm; sound its grains --------------------------
      swarm.step(field, dt, hits);
      if (audio) {
        audio.beginFrame(6);
        for (let i = 0; i < hits.length; i++) {
          const hh = hits[i];
          audio.grain(
            rowToFreq(hh.gy),
            colToPan(hh.gx),
            0.4 + hh.strength * 0.6,
          );
        }
      }

      // --- Render -------------------------------------------------------
      // Gentle sub-3Hz breathing on peak brightness (off if reduced motion).
      const shimmer = reduce ? 1 : 1 + 0.08 * Math.sin(t * 2 * Math.PI * 0.6);
      drawScene(
        ctx,
        cw,
        ch,
        field,
        swarm,
        cursor,
        heat,
        heatCtx,
        img,
        shimmer,
      );
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      audio?.dispose();
      audioRef.current = null;
    };
    // Engines are created once on mount; the loop reads live state via refs.
  }, []);

  // --- Pointer handling ---------------------------------------------------
  const posFromEvent = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    pointerPosRef.current = { x, y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      posFromEvent(e);
      pointerDownRef.current = true;
      modeRef.current = "human";
      setMode("human");
      void audioRef.current?.resume().then(() => {
        if (audioRef.current) setNeedsTap(audioRef.current.suspended());
      });
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [posFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (modeRef.current === "human") posFromEvent(e);
    },
    [posFromEvent],
  );

  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);

  const returnToAutopilot = useCallback(() => {
    setMode("autopilot");
  }, []);

  const tapToBegin = useCallback(async () => {
    await audioRef.current?.resume();
    if (audioRef.current) setNeedsTap(audioRef.current.suspended());
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream 2960 · Murmuration
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          An instrument that remembers as a swarm
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Drag to play; a flock of voices grows around the phrases you keep
          returning to, and forgets the ones you abandon.
        </p>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-24 z-20 flex flex-wrap items-center justify-center gap-3 px-6">
        {mode === "autopilot" ? (
          <span className="pointer-events-none min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Autopilot · drag to take over
          </span>
        ) : (
          <button
            onClick={returnToAutopilot}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Return to autopilot
          </button>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* Notice */}
      {error && (
        <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-1 px-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Autoplay gate */}
      {needsTap && (
        <button
          onClick={tapToBegin}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <span className="min-h-[44px] rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Tap to begin
          </span>
        </button>
      )}

      {/* Design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              A stigmergic swarm memory
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                What if an instrument&apos;s memory were a living swarm? You play
                with your hand — dragging a continuous-pitch voice across a field
                where the vertical axis is pitch and the horizontal axis is pan.
                Every gesture deposits a fading &ldquo;scent&rdquo; onto that
                field, exactly like an ant&apos;s pheromone trail.
              </p>
              <p>
                Forty-eight autonomous voice-agents wander the field, steering up
                the scent gradient — so they replay <em>where you have been</em>
                — and each time an agent sounds, it deposits a little more scent.
                Paths you revisit brighten into attractors and self-sustain into
                a shimmering choir; paths you abandon evaporate and the flock
                disperses to your newer gestures.
              </p>
              <p>
                <strong className="text-foreground">How to play:</strong> it is
                already alive under a ghost hand. Drag anywhere to take over —
                trace a shape, then return to it a few seconds later and watch a
                cluster of motes gather and hold the phrase. Stop feeding a phrase
                and it dims. Press &ldquo;Return to autopilot&rdquo; to hand the
                instrument back.
              </p>
              <p>
                <strong className="text-foreground">References:</strong> M. J.
                Buehler, <em>MusicSwarm</em> (Advanced Intelligent Systems, 2026)
                — swarms of agents self-organise music via stigmergic peer signals
                and shared memory, where local novelties consolidate into global
                form; Tim Blackwell, <em>Swarm Granulator</em>; and O. Bown &amp;
                A. Eldridge, ecosystem-based generative music.
              </p>
              <p>
                <strong className="text-foreground">Limitations:</strong> the
                &ldquo;memory&rdquo; is a single fading scalar field, not real
                phrase recognition; agent voices are simple grains; and on a busy
                field the choir can crowd toward the brightest attractor.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2960-murmuration"]} />
    </main>
  );
}

// --- Rendering --------------------------------------------------------------

interface CursorState {
  gx: number;
  gy: number;
  on: boolean;
  glow: number;
}

/** Draw the whole scene: heat field, agent motes + trails, and the cursor. */
function drawScene(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  field: ScentField,
  swarm: Swarm,
  cursor: CursorState,
  heat: HTMLCanvasElement,
  heatCtx: CanvasRenderingContext2D | null,
  img: ImageData | null,
  shimmer: number,
): void {
  // Base wash.
  ctx.fillStyle = "#0a0713";
  ctx.fillRect(0, 0, cw, ch);

  const sx = cw / FIELD_W;
  const sy = ch / FIELD_H;

  // --- Heat field (violet ramp: dim violet -> white-hot) ----------------
  if (heatCtx && img) {
    const data = img.data;
    const cells = field.cells;
    const inv = 1 / (field.peak + 1e-4);
    for (let i = 0; i < cells.length; i++) {
      const v = Math.min(1, cells[i] * inv) * shimmer;
      const it = Math.pow(Math.min(1, v), 0.7);
      const o = i * 4;
      // Violet base warming to white at the peaks.
      data[o] = Math.min(255, 120 * it + 150 * it * it * it);
      data[o + 1] = Math.min(255, 30 * it + 210 * it * it * it * it);
      data[o + 2] = Math.min(255, 170 * it + 85 * it * it * it);
      data[o + 3] = Math.min(255, 40 + 215 * it);
    }
    heatCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(heat, 0, 0, cw, ch);
    ctx.globalCompositeOperation = "source-over";
  }

  // --- Agent motes + short motion trails --------------------------------
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < swarm.n; i++) {
    const px = swarm.px[i] * sx;
    const py = swarm.py[i] * sy;
    const qx = swarm.qx[i] * sx;
    const qy = swarm.qy[i] * sy;
    const g = swarm.glow[i];
    const alpha = 0.18 + g * 0.8;

    // Trail.
    ctx.strokeStyle = `rgba(190, 150, 255, ${alpha * 0.5})`;
    ctx.lineWidth = 1 + g * 1.5;
    ctx.beginPath();
    ctx.moveTo(qx, qy);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Mote head — brighter/whiter with glow.
    const rad = 1.4 + g * 2.6;
    const r = Math.min(255, 180 + g * 75);
    const gg = Math.min(255, 130 + g * 125);
    const b = 255;
    ctx.fillStyle = `rgba(${r | 0}, ${gg | 0}, ${b}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // --- Cursor head (glowing) --------------------------------------------
  if (cursor.glow > 0.02) {
    const px = cursor.gx * sx;
    const py = cursor.gy * sy;
    const rad = 10 + cursor.glow * 26;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
    grad.addColorStop(0, `rgba(220, 200, 255, ${0.7 * cursor.glow})`);
    grad.addColorStop(0.4, `rgba(150, 90, 245, ${0.4 * cursor.glow})`);
    grad.addColorStop(1, "rgba(120, 60, 240, 0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
}
