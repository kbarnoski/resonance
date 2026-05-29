"use client";
import { useRef, useEffect } from "react";

// ── constants ────────────────────────────────────────────────────────────────
const MAX_FLIES = 8;
const CONNECT_DIST = 155; // px — max silk-thread length
const FRICTION = 0.983;
const MAX_SPEED = 1.3;

// Pentatonic major (C4 through D5) — all threads chime in harmony
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.26];

// ── pure helpers (not hooks) ─────────────────────────────────────────────────
function threadKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function chimeFreq(dist: number): number {
  const idx = Math.round((1 - dist / CONNECT_DIST) * (PENTA.length - 1));
  return PENTA[Math.max(0, Math.min(PENTA.length - 1, idx))];
}

function strikeChime(ctx: AudioContext, freq: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "triangle";
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
  osc.start(now);
  osc.stop(now + 2.2);
}

// ── types ────────────────────────────────────────────────────────────────────
interface Fly {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number; // 48–160 (yellow → cyan-green)
  pulse: number;
}

interface AppSt {
  flies: Fly[];
  nextId: number;
  threads: Set<string>; // active thread keys from last frame
  audioCtx: AudioContext | null;
  raf: number;
}

// ── component ────────────────────────────────────────────────────────────────
export default function FireflyWebPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<AppSt>({
    flies: [],
    nextId: 0,
    threads: new Set(),
    audioCtx: null,
    raf: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gc = canvas.getContext("2d");
    if (!gc) return;
    const st = stRef.current;

    // ── resize ──────────────────────────────────────────────────────────────
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // ── spawn helper ─────────────────────────────────────────────────────────
    function addFly(x: number, y: number) {
      if (st.flies.length >= MAX_FLIES) return;
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.35 + Math.random() * 0.45;
      st.flies.push({
        id: st.nextId++,
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        hue: 48 + Math.random() * 112,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // Seed 2 fireflies so the canvas isn't empty
    addFly(canvas.width * 0.36, canvas.height * 0.54);
    addFly(canvas.width * 0.64, canvas.height * 0.44);

    // ── draw loop ────────────────────────────────────────────────────────────
    function drawFrame(t: number) {
      if (!canvas || !gc) return;
      const W = canvas.width;
      const H = canvas.height;

      // Translucent overdraw creates glow trails
      gc.fillStyle = "rgba(4, 4, 14, 0.21)";
      gc.fillRect(0, 0, W, H);

      // Update firefly physics
      for (const f of st.flies) {
        let ax = 0;
        let ay = 0;

        // Gentle drift toward nearby fireflies
        for (const g of st.flies) {
          if (g.id === f.id) continue;
          const dx = g.x - f.x;
          const dy = g.y - f.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < CONNECT_DIST * 2.2) {
            const pull = 0.022 * (1 - d / (CONNECT_DIST * 2.2));
            ax += (dx / d) * pull;
            ay += (dy / d) * pull;
          }
        }

        // Soft random wander
        ax += (Math.random() - 0.5) * 0.055;
        ay += (Math.random() - 0.5) * 0.055;

        f.vx = (f.vx + ax) * FRICTION;
        f.vy = (f.vy + ay) * FRICTION;

        // Speed clamp
        const spd = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
        if (spd > MAX_SPEED) {
          f.vx = (f.vx / spd) * MAX_SPEED;
          f.vy = (f.vy / spd) * MAX_SPEED;
        }

        // Wall repulsion
        if (f.x < 22) f.vx += 0.15;
        if (f.x > W - 22) f.vx -= 0.15;
        if (f.y < 30) f.vy += 0.15;
        if (f.y > H - 70) f.vy -= 0.15;

        f.x += f.vx;
        f.y += f.vy;
        f.pulse += 0.032;
      }

      // Thread detection + drawing
      const nowThreads = new Set<string>();
      for (let i = 0; i < st.flies.length; i++) {
        for (let j = i + 1; j < st.flies.length; j++) {
          const a = st.flies[i];
          const b = st.flies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > CONNECT_DIST) continue;

          const key = threadKey(a.id, b.id);
          nowThreads.add(key);

          // Chime on new thread formation
          if (!st.threads.has(key) && st.audioCtx) {
            strikeChime(st.audioCtx, chimeFreq(dist));
          }

          // Silk thread: quadratic curve with vibration
          const closeness = 1 - dist / CONNECT_DIST;
          const alpha = 0.85 * closeness;
          const vibAmp = 9 * closeness;
          const vibPhase = t * 0.0038 + dist * 0.028;
          // perpendicular unit vector for vibration offset
          const px = (-dy / dist) * Math.sin(vibPhase) * vibAmp;
          const py = (dx / dist) * Math.sin(vibPhase) * vibAmp;
          const mx = (a.x + b.x) / 2 + px;
          const my = (a.y + b.y) / 2 + py;

          const midHue = (a.hue + b.hue) / 2;
          const grad = gc.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, `hsla(${a.hue}, 92%, 78%, ${alpha})`);
          grad.addColorStop(0.5, `hsla(${midHue}, 92%, 88%, ${Math.min(1, alpha * 1.25)})`);
          grad.addColorStop(1, `hsla(${b.hue}, 92%, 78%, ${alpha})`);

          gc.beginPath();
          gc.moveTo(a.x, a.y);
          gc.quadraticCurveTo(mx, my, b.x, b.y);
          gc.strokeStyle = grad;
          gc.lineWidth = 1.6 + closeness;
          gc.shadowBlur = 12;
          gc.shadowColor = `hsla(${midHue}, 90%, 72%, ${alpha * 0.55})`;
          gc.stroke();
          gc.shadowBlur = 0;
        }
      }
      st.threads = nowThreads;

      // Draw fireflies (on top of threads)
      for (const f of st.flies) {
        const glow = 0.72 + 0.28 * Math.sin(f.pulse);

        // Outer halo
        const halo = gc.createRadialGradient(f.x, f.y, 0, f.x, f.y, 24);
        halo.addColorStop(0, `hsla(${f.hue}, 92%, 82%, ${0.52 * glow})`);
        halo.addColorStop(0.6, `hsla(${f.hue}, 85%, 65%, ${0.18 * glow})`);
        halo.addColorStop(1, `hsla(${f.hue}, 80%, 50%, 0)`);
        gc.fillStyle = halo;
        gc.beginPath();
        gc.arc(f.x, f.y, 24, 0, Math.PI * 2);
        gc.fill();

        // Bright core
        gc.fillStyle = `hsl(${f.hue}, 95%, ${78 + 16 * glow}%)`;
        gc.shadowBlur = 6;
        gc.shadowColor = `hsl(${f.hue}, 90%, 90%)`;
        gc.beginPath();
        gc.arc(f.x, f.y, 5, 0, Math.PI * 2);
        gc.fill();
        gc.shadowBlur = 0;
      }

      st.raf = requestAnimationFrame(drawFrame);
    }

    st.raf = requestAnimationFrame(drawFrame);

    // ── interaction handlers ──────────────────────────────────────────────────
    const onMouse = (e: MouseEvent) => {
      if (!st.audioCtx) st.audioCtx = new AudioContext();
      else st.audioCtx.resume();
      const r = canvas.getBoundingClientRect();
      addFly(
        (e.clientX - r.left) * (canvas.width / r.width),
        (e.clientY - r.top) * (canvas.height / r.height),
      );
    };

    const onTouch = (e: TouchEvent) => {
      if (!st.audioCtx) st.audioCtx = new AudioContext();
      else st.audioCtx.resume();
      const r = canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      if (!touch) return;
      addFly(
        (touch.clientX - r.left) * (canvas.width / r.width),
        (touch.clientY - r.top) * (canvas.height / r.height),
      );
    };

    canvas.addEventListener("mousedown", onMouse);
    canvas.addEventListener("touchstart", onTouch, { passive: true });

    return () => {
      cancelAnimationFrame(st.raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onMouse);
      canvas.removeEventListener("touchstart", onTouch);
      st.audioCtx?.close();
    };
  }, []);

  return (
    <div className="relative w-full h-dvh bg-[#04040e] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none select-none"
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none">
        <h1 className="text-2xl font-serif text-white/95">Firefly Web</h1>
        <p className="text-base text-white/75 mt-1">
          Tap anywhere to release a firefly — when two meet, they spin a glowing silk thread
        </p>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
        <span className="text-sm text-white/55">tap · up to 8 fireflies</span>
        <a
          href="/dream/211-kids-firefly-web/README.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-white/55 hover:text-white/80 transition-colors pointer-events-auto"
        >
          design notes ↗
        </a>
      </div>
    </div>
  );
}
