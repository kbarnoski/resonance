"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createFlock,
  stepFlock,
  findClusters,
  GRID_COLS,
  GRID_ROWS,
  type Boid,
  type Attractor,
} from "./flock";
import { createAudioEngine, SCALE, type AudioEngine } from "./audio";

const CHANNEL = "resonance-ensemble-1206";
const N_BOIDS = 180;
const CLUSTER_MIN = 9; // birds in a grid cell to count as a singing knot
const BPM = 96;
const GHOSTS = 2;

type PeerState = { nx: number; ny: number; hue: number; last: number };
type Bloom = { x: number; y: number; hue: number; start: number; life: number };
type ClockState = { t0: number | null; bpm: number };

function makePeerId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// teal → magenta → amber by normalised speed (chromatic chiaroscuro)
function drawSpeedColor(t: number, alpha: number): string {
  const c = Math.min(1, Math.max(0, t));
  let r: number, g: number, b: number;
  if (c < 0.5) {
    const k = c / 0.5;
    r = 30 + (230 - 30) * k;
    g = 220 + (70 - 220) * k;
    b = 200 + (200 - 200) * k;
  } else {
    const k = (c - 0.5) / 0.5;
    r = 230 + (255 - 230) * k;
    g = 70 + (190 - 70) * k;
    b = 200 + (70 - 200) * k;
  }
  return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
}

export default function Murmuration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const flockRef = useRef<Boid[]>([]);
  const bloomsRef = useRef<Bloom[]>([]);
  const firedRef = useRef<Map<string, number>>(new Map());
  const clockRef = useRef<ClockState>({ t0: null, bpm: BPM });
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const selfPosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });
  const selfRef = useRef<{ id: string; hue: number }>({
    id: makePeerId(),
    hue: Math.floor(Math.random() * 360),
  });

  const [started, setStarted] = useState(false);
  const [hands, setHands] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const selfColor = `hsl(${selfRef.current.hue} 85% 62%)`;

  const post = useCallback((msg: Record<string, unknown>) => {
    try {
      channelRef.current?.postMessage(msg);
    } catch {
      /* channel closed — ignore */
    }
  }, []);

  // schedule a glass ping locally + record a visual bloom
  const ringNote = useCallback(
    (
      midi: number,
      beat: number,
      col: number,
      row: number,
      brightness: number,
    ) => {
      const engine = engineRef.current;
      const clk = clockRef.current;
      if (!engine || clk.t0 == null) return;
      const key = `${col},${row}:${beat}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.set(key, beat);

      const beatDur = 60000 / clk.bpm;
      const whenMs = clk.t0 + beat * beatDur;
      const whenSec = engine.now() + (whenMs - Date.now()) / 1000;
      if (whenSec < engine.now() - 0.05) return;
      const pan = (col / (GRID_COLS - 1)) * 2 - 1;
      engine.ping(midi, whenSec, brightness, pan);

      const { w, h } = sizeRef.current;
      bloomsRef.current.push({
        x: ((col + 0.5) / GRID_COLS) * w,
        y: ((row + 0.5) / GRID_ROWS) * h,
        hue: 180 + brightness * 140,
        start: whenMs,
        life: 900,
      });
    },
    [],
  );

  // ── Transport: BroadcastChannel presence + shared clock + intents ──────────
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CHANNEL);
    } catch {
      ch = null; // unsupported → solo, never crash
    }
    channelRef.current = ch;
    const self = selfRef.current;

    if (ch) {
      ch.onmessage = (ev: MessageEvent) => {
        const m = ev.data as Record<string, unknown>;
        if (!m || m.from === self.id) return;
        if (m.type === "pos" || m.type === "hello") {
          peersRef.current.set(m.from as string, {
            nx: m.nx as number,
            ny: m.ny as number,
            hue: m.hue as number,
            last: Date.now(),
          });
          if (m.type === "hello" && clockRef.current.t0 != null) {
            post({
              type: "clock",
              from: self.id,
              t0: clockRef.current.t0,
              bpm: clockRef.current.bpm,
            });
          }
        } else if (m.type === "bye") {
          peersRef.current.delete(m.from as string);
        } else if (m.type === "clock") {
          const t0 = m.t0 as number;
          if (clockRef.current.t0 == null || t0 < clockRef.current.t0) {
            clockRef.current = { t0, bpm: m.bpm as number };
          }
        } else if (m.type === "intent") {
          ringNote(
            m.midi as number,
            m.beat as number,
            m.col as number,
            m.row as number,
            m.brightness as number,
          );
        }
      };
      post({ type: "hello", from: self.id, hue: self.hue, nx: 0.5, ny: 0.5 });
    }

    const beat = window.setInterval(() => {
      const p = selfPosRef.current;
      post({ type: "pos", from: self.id, hue: self.hue, nx: p.x, ny: p.y });
    }, 60); // ~16Hz position heartbeat

    const prune = window.setInterval(() => {
      const now = Date.now();
      for (const [id, p] of peersRef.current) {
        if (now - p.last > 5000) peersRef.current.delete(id);
      }
      setHands(peersRef.current.size);
      // keep the fired-key map from growing without bound
      if (firedRef.current.size > 400 && clockRef.current.t0 != null) {
        const cur = Math.floor(
          (Date.now() - clockRef.current.t0) / (60000 / clockRef.current.bpm),
        );
        for (const [k, b] of firedRef.current) {
          if (b < cur - 4) firedRef.current.delete(k);
        }
      }
    }, 800);

    return () => {
      window.clearInterval(beat);
      window.clearInterval(prune);
      post({ type: "bye", from: self.id });
      ch?.close();
      channelRef.current = null;
    };
  }, [post, ringNote]);

  // ── Simulation + render + voice scheduler (runs once started) ──────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    engineRef.current = createAudioEngine();
    engineRef.current.resume();

    if (clockRef.current.t0 == null) {
      clockRef.current = { t0: Date.now(), bpm: BPM };
      post({
        type: "clock",
        from: selfRef.current.id,
        t0: clockRef.current.t0,
        bpm: BPM,
      });
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const rect = canvas!.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas!.width = Math.floor(rect.width * dpr);
      canvas!.height = Math.floor(rect.height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const { w: iw, h: ih } = sizeRef.current;
    flockRef.current = createFlock(N_BOIDS, iw, ih);
    pointerRef.current = { x: 0.5, y: 0.5 };
    selfPosRef.current = { x: 0.5, y: 0.5 };

    // voice scheduler — quantise cluster knots to the shared beat grid,
    // committing one beat ahead (lookahead-commit; see README).
    const scheduler = window.setInterval(() => {
      const clk = clockRef.current;
      if (clk.t0 == null) return;
      const { w, h } = sizeRef.current;
      const clusters = findClusters(flockRef.current, w, h, CLUSTER_MIN);
      const beatDur = 60000 / clk.bpm;
      const beatFloat = (Date.now() - clk.t0) / beatDur;
      const targetBeat = Math.floor(beatFloat) + 1; // 1-beat lookahead window
      let fresh = 0;
      for (const cl of clusters) {
        if (fresh >= 2) break; // bound new onsets so it never muddies
        const key = `${cl.col},${cl.row}:${targetBeat}`;
        if (firedRef.current.has(key)) continue;
        // higher on screen (row 0) → higher pitch
        const t = 1 - cl.row / (GRID_ROWS - 1);
        const idx = Math.round(t * (SCALE.length - 1));
        const midi = SCALE[Math.max(0, Math.min(SCALE.length - 1, idx))];
        ringNote(midi, targetBeat, cl.col, cl.row, cl.speed);
        post({
          type: "intent",
          from: selfRef.current.id,
          col: cl.col,
          row: cl.row,
          beat: targetBeat,
          midi,
          brightness: cl.speed,
        });
        fresh++;
      }
    }, 40);

    let raf = 0;
    let prev = performance.now();
    const ghostSeed = Math.random() * 1000;

    function frame(now: number) {
      const { w, h } = sizeRef.current;
      let dt = (now - prev) / 16.667;
      prev = now;
      if (dt > 2.5) dt = 2.5;

      // ease our attractor toward the pointer target
      const sp = selfPosRef.current;
      sp.x += (pointerRef.current.x - sp.x) * 0.12;
      sp.y += (pointerRef.current.y - sp.y) * 0.12;

      const peerCount = peersRef.current.size;
      const attractors: Attractor[] = [];
      attractors.push({
        x: sp.x * w,
        y: sp.y * h,
        hue: selfRef.current.hue,
        weight: 1.6,
        kind: "self",
      });
      // ghosts drift so the piece breathes even solo; fade as hands arrive
      const gw = peerCount > 0 ? 0.5 : 0.95;
      const tt = (now + ghostSeed) * 0.001;
      for (let g = 0; g < GHOSTS; g++) {
        const ph = g * 2.3;
        attractors.push({
          x: (0.5 + Math.sin(tt * 0.23 + ph) * 0.34) * w,
          y: (0.5 + Math.cos(tt * 0.17 + ph * 1.4) * 0.3) * h,
          hue: (selfRef.current.hue + 140 + g * 80) % 360,
          weight: gw,
          kind: "ghost",
        });
      }
      for (const p of peersRef.current.values()) {
        attractors.push({
          x: p.nx * w,
          y: p.ny * h,
          hue: p.hue,
          weight: 1.6,
          kind: "peer",
        });
      }

      stepFlock(flockRef.current, attractors, dt, w, h);

      // ── render: deep indigo base + additive luminous streaks ──
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = "rgba(9,11,22,0.30)";
      ctx!.fillRect(0, 0, w, h);

      ctx!.globalCompositeOperation = "lighter";
      const flock = flockRef.current;
      for (let i = 0; i < flock.length; i++) {
        const b = flock[i];
        const s = Math.min(1, Math.hypot(b.vx, b.vy) / 3.4);
        ctx!.strokeStyle = drawSpeedColor(s, 0.5);
        ctx!.lineWidth = 1.2;
        ctx!.beginPath();
        ctx!.moveTo(b.px, b.py);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
        ctx!.fillStyle = drawSpeedColor(s, 0.9);
        ctx!.fillRect(b.x - 0.9, b.y - 0.9, 1.8, 1.8);
      }

      // attractor glows
      for (const at of attractors) {
        const rad = at.kind === "self" ? 90 : at.kind === "peer" ? 82 : 60;
        const a = at.kind === "ghost" ? 0.28 : 0.5;
        const grad = ctx!.createRadialGradient(
          at.x,
          at.y,
          0,
          at.x,
          at.y,
          rad,
        );
        grad.addColorStop(0, `hsla(${at.hue},90%,65%,${a})`);
        grad.addColorStop(1, `hsla(${at.hue},90%,55%,0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(at.x, at.y, rad, 0, Math.PI * 2);
        ctx!.fill();
      }

      // cluster blooms (expanding rings when a knot sings)
      const nowMs = Date.now();
      const blooms = bloomsRef.current;
      for (let i = blooms.length - 1; i >= 0; i--) {
        const bl = blooms[i];
        const age = nowMs - bl.start;
        if (age < 0) continue;
        if (age > bl.life) {
          blooms.splice(i, 1);
          continue;
        }
        const k = age / bl.life;
        const r = 8 + k * 70;
        ctx!.strokeStyle = `hsla(${bl.hue},90%,70%,${(1 - k) * 0.55})`;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(bl.x, bl.y, r, 0, Math.PI * 2);
        ctx!.stroke();
      }
      ctx!.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(scheduler);
      window.removeEventListener("resize", resize);
    };
  }, [started, post, ringNote]);

  const onPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#070812] text-foreground">
      <canvas
        ref={canvasRef}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* presence chips */}
      {started && (
        <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 font-mono text-xs">
          <span
            className="rounded-full px-2.5 py-1 text-foreground"
            style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${selfColor}` }}
          >
            you
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {hands} {hands === 1 ? "hand" : "hands"}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {GHOSTS} ghosts
          </span>
        </div>
      )}

      {/* hint */}
      {started && (
        <p className="pointer-events-none absolute bottom-4 left-4 font-mono text-xs text-muted-foreground">
          Move to steer the flock · Open a second tab to add a hand.
        </p>
      )}

      {/* design notes link */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 min-h-[36px] rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* intro overlay */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#070812]/80 via-[#0a0b18]/70 to-[#070812]/90 px-6">
          <div className="max-w-xl text-center">
            <h1 className="font-semibold text-3xl leading-tight text-foreground sm:text-4xl">
              Murmuration
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base text-foreground sm:text-lg">
              A flock of 180 voice-birds that sing when they cluster. You are a
              glowing attractor pulling the swarm — several hands together
              sculpt one emergent piece of music.
            </p>
            <button
              onClick={() => setStarted(true)}
              className="mt-7 min-h-[44px] rounded-lg bg-card px-4 py-2.5 font-mono text-sm font-medium text-[#070812] hover:bg-accent"
            >
              Enter the flock
            </button>
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              Open a second tab to add a hand.
            </p>
          </div>
        </div>
      )}

      {/* inline design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-[#070812]/95 px-6 py-16">
          <div className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed text-foreground">
            <h2 className="font-semibold text-2xl text-foreground">Design notes</h2>
            <p>
              <span className="font-mono text-foreground">The question:</span> what
              if the ensemble were a murmuration — a flock that sings when it
              clusters — and each person is an attractor pulling the swarm, so a
              room sculpts one emergent piece together?
            </p>
            <p>
              <span className="font-mono text-foreground">Flock:</span> 180 boids
              (Reynolds 1987 — separation, alignment, cohesion) integrated
              locally on every client from a fixed seed, steered by the union of
              all attractors. Ghost attractors drift so it breathes solo; each
              real peer becomes another glowing hand.
            </p>
            <p>
              <span className="font-mono text-foreground">Sound clock:</span> the
              motion is continuous but the voice is quantised to a shared beat
              grid. A 40ms scheduler commits cluster events one beat ahead
              (lookahead-commit, after ReaLJam arXiv:2502.21267 and StreamMUSE
              arXiv:2606.11886) and schedules the grain via Web Audio so every
              tab rings the same notes in phase.
            </p>
            <p>
              <span className="font-mono text-foreground">Voice:</span> granular /
              bowed-glass pings — a short glassy harmonic burst per cluster,
              pitch from its vertical position on a minor-pentatonic set,
              brightness from flock speed. Warm and transient, never a drone.
            </p>
            <p>
              <span className="font-mono text-foreground">Multiplayer:</span>{" "}
              BroadcastChannel is same-origin — open a second tab or device on
              the same origin to add a hand. Cross-device WebRTC is the next
              step. Full write-up in the folder README.
            </p>
            <Link
              href="/dream"
              className="inline-block font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              ← back to the lab
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
