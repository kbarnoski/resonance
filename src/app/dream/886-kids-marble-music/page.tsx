"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ModalEngine } from "./synth";
import {
  type Marble,
  type Obstacle,
  stepMarble,
} from "./physics";
import {
  BOARD_W,
  BOARD_H,
  makeLevel,
  MATERIAL_COLOR,
  MATERIAL_GLOW,
} from "./level";

const MAX_MARBLES = 10;
const MARBLE_R = 22;
const GRAVITY = 1700; // px/s² on the reference board
const MAX_TILT = 0.6; // radians clamp for the gravity rotation

const MARBLE_HUES = [275, 190, 150, 30, 330, 50];

let _id = 0;

type TiltMode = "sensor" | "manual";

export default function MarbleMusicPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<ModalEngine | null>(null);
  const marblesRef = useRef<Marble[]>([]);
  const obstaclesRef = useRef<Obstacle[]>(makeLevel());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const tiltRef = useRef<number>(0); // current applied tilt (radians)
  const manualTiltRef = useRef<number>(0); // from buttons/drag
  const sensorTiltRef = useRef<number>(0); // from device orientation
  const tiltModeRef = useRef<TiltMode>("manual");

  const [started, setStarted] = useState(false);
  const [marbleCount, setMarbleCount] = useState(0);
  const [tiltMode, setTiltMode] = useState<TiltMode>("manual");
  const [sensorStatus, setSensorStatus] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);

  // Drop a marble at a board-space x (0..BOARD_W).
  const dropMarble = useCallback((boardX: number) => {
    const marbles = marblesRef.current;
    if (marbles.length >= MAX_MARBLES) {
      marbles.shift(); // recycle oldest
    }
    const hue = MARBLE_HUES[_id % MARBLE_HUES.length];
    marbles.push({
      id: _id++,
      x: Math.max(MARBLE_R, Math.min(BOARD_W - MARBLE_R, boardX)),
      y: 40,
      vx: (Math.random() - 0.5) * 60,
      vy: 20,
      r: MARBLE_R,
      hue,
      trail: [],
      stuck: false,
      stuckIn: -1,
    });
    setMarbleCount(marbles.length);
  }, []);

  // Pointer -> board coordinates and either free a stuck marble or drop one.
  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * BOARD_W;
      const py = ((clientY - rect.top) / rect.height) * BOARD_H;

      // If a tap lands near a stuck marble, free it (gentle stakes).
      const marbles = marblesRef.current;
      for (const m of marbles) {
        if (m.stuck && Math.hypot(m.x - px, m.y - py) < 90) {
          m.stuck = false;
          m.stuckIn = -1;
          m.vy = -120;
          m.vx = (Math.random() - 0.5) * 200;
          return;
        }
      }
      dropMarble(px);
    },
    [dropMarble],
  );

  // Animation + physics loop.
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g2d = canvas.getContext("2d");
    if (!g2d) return;

    const loop = (now: number) => {
      const prev = lastTimeRef.current || now;
      let dt = (now - prev) / 1000;
      lastTimeRef.current = now;
      if (dt > 0.05) dt = 0.05; // clamp big frame gaps

      // Smooth the tilt toward its source.
      const target =
        tiltModeRef.current === "sensor"
          ? sensorTiltRef.current
          : manualTiltRef.current;
      tiltRef.current += (target - tiltRef.current) * Math.min(1, dt * 8);
      const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, tiltRef.current));

      // Gravity vector rotated by tilt.
      const gx = Math.sin(tilt) * GRAVITY;
      const gy = Math.cos(tilt) * GRAVITY;

      const obstacles = obstaclesRef.current;
      const engine = engineRef.current;

      // Step physics (sub-step for stability at high speed).
      const sub = 2;
      const sdt = dt / sub;
      const marbles = marblesRef.current;
      for (const m of marbles) {
        if (m.trail.length > 10) m.trail.shift();
        m.trail.push({ x: m.x, y: m.y });
        for (let s = 0; s < sub; s++) {
          const hit = stepMarble(m, obstacles, gx, gy, sdt, BOARD_W);
          if (hit && engine) {
            const o = obstacles[hit.obstacleIndex];
            const strength = Math.min(1, hit.normalSpeed / 900);
            if (strength > 0.03) {
              engine.strike(o.material, o.fundamentalHz, strength);
            }
          }
        }
      }

      // Recycle marbles that fall off the bottom.
      let removed = false;
      for (let i = marbles.length - 1; i >= 0; i--) {
        if (marbles[i].y > BOARD_H + 80) {
          marbles.splice(i, 1);
          removed = true;
        }
      }
      if (removed) setMarbleCount(marbles.length);

      // Decay obstacle pulses.
      for (const o of obstacles) {
        if (o.pulse > 0) o.pulse = Math.max(0, o.pulse - dt * 3.5);
      }

      drawScene(g2d, canvas, obstacles, marbles, tilt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    if (started) return;
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtor();
    await ctx.resume();
    ctxRef.current = ctx;
    engineRef.current = new ModalEngine(ctx);

    // Try device orientation (sensor tilt). iOS needs a gesture-triggered
    // permission request; we are inside a button click here.
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          setSensorStatus("Tilt your device to steer the marbles.");
          tiltModeRef.current = "sensor";
          setTiltMode("sensor");
        } else {
          setSensorStatus("Tilt sensor blocked — use the tilt buttons below.");
        }
      } catch {
        setSensorStatus("Tilt sensor unavailable — use the tilt buttons.");
      }
    } else if (DOE) {
      // Non-iOS: listener will set sensor mode once data actually arrives.
      setSensorStatus("Waiting for tilt sensor… buttons work meanwhile.");
    } else {
      setSensorStatus("No tilt sensor here — use the tilt buttons below.");
    }

    setStarted(true);
    // Seed a couple of marbles so it's instantly alive.
    dropMarble(BOARD_W * 0.4);
    setTimeout(() => dropMarble(BOARD_W * 0.6), 350);
    startLoop();
  }, [started, dropMarble, startLoop]);

  // Device orientation listener.
  useEffect(() => {
    if (!started) return;
    let gotData = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      gotData = true;
      // gamma: left/right tilt in degrees (-90..90). Map to radians, damped.
      const rad = (e.gamma / 90) * MAX_TILT * 1.4;
      sensorTiltRef.current = Math.max(-MAX_TILT, Math.min(MAX_TILT, rad));
      if (tiltModeRef.current !== "sensor") {
        tiltModeRef.current = "sensor";
        setTiltMode("sensor");
        setSensorStatus("Tilt your device to steer the marbles.");
      }
    };
    window.addEventListener("deviceorientation", onOrient);
    // If no data after a moment, fall back to manual silently.
    const t = window.setTimeout(() => {
      if (!gotData && tiltModeRef.current !== "sensor") {
        setSensorStatus("Tilt sensor not responding — use the tilt buttons.");
      }
    }, 2500);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.clearTimeout(t);
    };
  }, [started]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close();
      }
    };
  }, []);

  // Manual tilt button handlers (hold-to-tilt via pointer down/up).
  const setManualTilt = useCallback(
    (v: number) => {
      manualTiltRef.current = v;
      if (v !== 0) {
        tiltModeRef.current = "manual";
        setTiltMode("manual");
      }
    },
    [],
  );

  return (
    <main className="min-h-screen w-full bg-[#140d1f] text-white flex flex-col items-center">
      <div className="w-full max-w-[520px] px-4 pt-6 pb-3 flex flex-col items-center">
        <Link
          href="/dream"
          className="self-start text-base text-white/55 hover:text-white/80"
        >
          ← back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white text-center">
          Marble Music Machine
        </h1>
        <p className="mt-2 text-base text-white/75 text-center">
          Tap the top to drop a glowing marble. Every bounce sings the{" "}
          <span className="text-violet-300">material</span> it hits — wood
          thuds, glass rings, metal shimmers, drums boom.
        </p>
      </div>

      <div className="relative w-full max-w-[520px] px-4">
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          className="w-full rounded-2xl border border-white/10 bg-[#1a1029] touch-none select-none"
          style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}` }}
          onPointerDown={(e) => {
            if (!started) return;
            handlePointer(e.clientX, e.clientY);
          }}
        />

        {!started && (
          <button
            onClick={() => void start()}
            className="absolute inset-0 m-4 rounded-2xl bg-violet-500/20 border border-violet-400/40 backdrop-blur-sm flex flex-col items-center justify-center gap-3 min-h-[64px]"
          >
            <span className="text-2xl font-semibold text-white">
              Tap to Play
            </span>
            <span className="text-base text-white/75 px-6 text-center">
              Turn your sound on. Then tap the top of the board to drop marbles.
            </span>
          </button>
        )}
      </div>

      {started && (
        <div className="w-full max-w-[520px] px-4 pt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <button
              onPointerDown={() => setManualTilt(-MAX_TILT)}
              onPointerUp={() => setManualTilt(0)}
              onPointerLeave={() => setManualTilt(0)}
              onPointerCancel={() => setManualTilt(0)}
              className="flex-1 min-h-[64px] rounded-2xl bg-violet-500/20 border border-violet-400/40 text-2xl font-semibold text-white active:bg-violet-500/40 touch-none select-none"
            >
              ◀ Tilt
            </button>
            <button
              onClick={() => dropMarble(BOARD_W * (0.3 + Math.random() * 0.4))}
              className="flex-1 min-h-[64px] rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-xl font-semibold text-white active:bg-emerald-500/40 touch-none select-none"
            >
              + Marble
            </button>
            <button
              onPointerDown={() => setManualTilt(MAX_TILT)}
              onPointerUp={() => setManualTilt(0)}
              onPointerLeave={() => setManualTilt(0)}
              onPointerCancel={() => setManualTilt(0)}
              className="flex-1 min-h-[64px] rounded-2xl bg-violet-500/20 border border-violet-400/40 text-2xl font-semibold text-white active:bg-violet-500/40 touch-none select-none"
            >
              Tilt ▶
            </button>
          </div>

          <div className="flex items-center justify-between text-base">
            <span className="text-white/75 font-mono">
              {marbleCount} / {MAX_MARBLES} marbles
            </span>
            <span className="text-white/55 font-mono">
              {tiltMode === "sensor" ? "tilt: sensor" : "tilt: buttons"}
            </span>
          </div>

          {sensorStatus && (
            <p
              className={`text-base ${
                tiltMode === "sensor" ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {sensorStatus}
            </p>
          )}

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="self-start text-base text-violet-300 underline underline-offset-4"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>

          {showNotes && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-base text-white/80 leading-relaxed">
              <p>
                Every object has a <span className="text-violet-300">material</span>{" "}
                and a fixed pitch. When a marble hits it, a small{" "}
                <span className="text-violet-300">modal synthesizer</span> fires
                a bank of decaying sine partials — the partial ratios and decay
                times are what make wood sound like wood and metal sound like
                metal. How hard the marble hits sets the loudness and brightness,
                so a soft graze and a hard slam on the same bell sound different.
              </p>
              <p className="mt-3">
                Pitches are tuned to a C-major pentatonic scale, so the machine
                always sounds nice no matter where the marbles fall. It never
                repeats: it is a self-playing instrument in the spirit of
                Wintergatan&rsquo;s Marble Machine and Jem Finer&rsquo;s
                self-generative marble machine.
              </p>
              <p className="mt-3 text-white/55 font-mono text-sm">
                Canvas2D + Web Audio, no libraries. RESEARCH §530.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="h-8" />
    </main>
  );
}

// ---- Rendering (pure draw helpers, no React) ----

function drawScene(
  g: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  obstacles: Obstacle[],
  marbles: Marble[],
  tilt: number,
): void {
  const w = canvas.width;
  const h = canvas.height;

  // Background gradient with a subtle tilt-following warm glow.
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#221636");
  bg.addColorStop(1, "#150d22");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // Tilt horizon hint line at the top so kids see the board "leaning".
  g.save();
  g.translate(w / 2, 24);
  g.rotate(tilt * 0.5);
  g.strokeStyle = "rgba(196,162,255,0.25)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-w * 0.4, 0);
  g.lineTo(w * 0.4, 0);
  g.stroke();
  g.restore();

  // Obstacles.
  for (const o of obstacles) {
    drawObstacle(g, o);
  }

  // Marbles with trails.
  for (const m of marbles) {
    drawMarble(g, m);
  }
}

function drawObstacle(g: CanvasRenderingContext2D, o: Obstacle): void {
  const base = MATERIAL_COLOR[o.material];
  const glow = MATERIAL_GLOW[o.material];
  const pulse = o.pulse;

  g.save();
  if (o.sticky) {
    // Sticky mud: murky brown blob with a wobbly fill.
    g.fillStyle = "#5b4a2e";
    g.strokeStyle = "rgba(255,220,150,0.35)";
  } else {
    g.fillStyle = base;
    g.strokeStyle = "rgba(255,255,255,0.18)";
  }
  g.lineWidth = 2;

  if (pulse > 0) {
    g.shadowColor = glow;
    g.shadowBlur = 12 + pulse * 38;
  }

  if (o.shape === "circle") {
    g.beginPath();
    g.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (o.sticky) {
      g.fillStyle = "rgba(255,235,180,0.85)";
      g.font = "bold 26px ui-monospace, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("zzz", o.cx, o.cy);
    }
  } else {
    // Capsule: thick rounded line.
    g.lineCap = "round";
    g.strokeStyle = base;
    g.lineWidth = o.r * 2;
    g.beginPath();
    g.moveTo(o.ax, o.ay);
    g.lineTo(o.bx, o.by);
    g.stroke();
    // Highlight edge.
    g.shadowBlur = pulse > 0 ? 12 + pulse * 38 : 0;
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(o.ax, o.ay);
    g.lineTo(o.bx, o.by);
    g.stroke();
  }
  g.restore();
}

function drawMarble(g: CanvasRenderingContext2D, m: Marble): void {
  // Trail.
  for (let i = 0; i < m.trail.length; i++) {
    const t = m.trail[i];
    const a = (i / m.trail.length) * 0.25;
    g.beginPath();
    g.fillStyle = `hsla(${m.hue}, 90%, 70%, ${a})`;
    g.arc(t.x, t.y, m.r * (0.4 + (i / m.trail.length) * 0.5), 0, Math.PI * 2);
    g.fill();
  }

  // Glowing marble: radial gradient.
  const grad = g.createRadialGradient(
    m.x - m.r * 0.3,
    m.y - m.r * 0.3,
    m.r * 0.1,
    m.x,
    m.y,
    m.r,
  );
  grad.addColorStop(0, `hsla(${m.hue}, 100%, 92%, 1)`);
  grad.addColorStop(0.5, `hsla(${m.hue}, 95%, 70%, 1)`);
  grad.addColorStop(1, `hsla(${m.hue}, 90%, 45%, 1)`);

  g.save();
  g.shadowColor = `hsla(${m.hue}, 100%, 70%, 0.9)`;
  g.shadowBlur = m.stuck ? 6 : 18;
  g.fillStyle = grad;
  g.beginPath();
  g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
