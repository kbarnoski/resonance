"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap to blow a soap bubble. Bubbles drift upward — when two touch, they chime a chord together.

const FREQS = [130.81, 164.81, 196.00, 220.00, 261.63]; // C3 E3 G3 A3 C4 — pentatonic
const HUES  = [270,    160,    42,     345,    195];      // violet emerald amber rose cyan
const RADII = [60,     52,     44,     38,     32];       // BANDIMAL: bigger = lower pitch
const MAX_BB = 10;
const FLOAT_BASE = 20; // CSS px/s base upward speed

type Sparkle = { x: number; y: number; vx: number; vy: number; life: number; hue: number };
type Bubble  = {
  id: number; x: number; y: number;
  r: number; hue: number; freq: number;
  vy: number; phase: number; age: number; gone: boolean;
};
type ColGlow = { x: number; y: number; life: number };
type St = {
  actx: AudioContext | null;
  bubbles: Bubble[];
  sparkles: Sparkle[];
  colGlows: ColGlow[];
  colPairs: Set<string>;
  nextId: number;
  awake: boolean;
  lastTs: number;
  lastAuto: number;
};

function zoneOf(x: number, W: number): number {
  return Math.min(4, Math.floor((x / W) * 5));
}

function addBubble(st: St, x: number, y: number, W: number): void {
  const z = zoneOf(x, W);
  st.bubbles.push({
    id: st.nextId++,
    x, y,
    r: RADII[z], hue: HUES[z], freq: FREQS[z],
    vy: -(FLOAT_BASE + Math.random() * 6),
    phase: Math.random() * Math.PI * 2,
    age: 0, gone: false,
  });
  if (st.bubbles.length > MAX_BB) st.bubbles.shift();
}

function playTone(actx: AudioContext, freq: number, pk: number, dec: number): void {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.001, now);
  env.gain.linearRampToValueAtTime(pk, now + 0.025);
  env.gain.exponentialRampToValueAtTime(0.001, now + dec);
  osc.connect(env).connect(actx.destination);
  osc.start(now);
  osc.stop(now + dec + 0.1);
}

function playSpawn(actx: AudioContext, freq: number): void {
  playTone(actx, freq, 0.13, 0.85);
}

function playChord(actx: AudioContext, fA: number, fB: number): void {
  playTone(actx, fA, 0.08, 1.40);
  playTone(actx, fB, 0.08, 1.40);
}

function playPop(actx: AudioContext, freq: number): void {
  // Bell-like pop: fundamental shifted up one octave
  playTone(actx, freq * 2, 0.18, 1.10);
  playTone(actx, freq * 4, 0.06, 0.55);
}

function burstSparkles(st: St, x: number, y: number, hue: number): void {
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    st.sparkles.push({
      x, y,
      vx: Math.cos(a) * (12 + Math.random() * 22),
      vy: Math.sin(a) * (12 + Math.random() * 22) - 16,
      life: 1.0, hue,
    });
  }
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, hue: number, wobble: number, dpr: number
): void {
  const px = cx * dpr;
  const py = cy * dpr;
  const rp = (r + wobble * 2.5) * dpr;

  ctx.save();

  // Outer iridescent glow
  ctx.shadowColor = `hsl(${hue},88%,65%)`;
  ctx.shadowBlur  = 14 * dpr;

  // Translucent interior
  ctx.beginPath();
  ctx.arc(px, py, rp, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${hue},68%,55%,0.07)`;
  ctx.fill();

  // Colored rim
  ctx.strokeStyle = `hsl(${hue},85%,62%)`;
  ctx.lineWidth   = 2.2 * dpr;
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Secondary inner ring (iridescent sheen)
  ctx.beginPath();
  ctx.arc(px, py, rp * 0.78, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${(hue + 40) % 360},70%,72%,0.18)`;
  ctx.lineWidth   = 1 * dpr;
  ctx.stroke();

  // Highlight crescent (top-left)
  const hx = px - rp * 0.30;
  const hy = py - rp * 0.32;
  const hr = rp * 0.24;
  const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  grad.addColorStop(0, "rgba(255,255,255,0.72)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Bottom glint (small)
  const bx = px + rp * 0.22;
  const by = py + rp * 0.38;
  const br = rp * 0.10;
  const grad2 = ctx.createRadialGradient(bx, by, 0, bx, by, br);
  grad2.addColorStop(0, "rgba(255,255,255,0.35)");
  grad2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = grad2;
  ctx.fill();

  ctx.restore();
}

function drawColGlow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, life: number, dpr: number
): void {
  ctx.save();
  ctx.globalAlpha = life * 0.90;
  ctx.shadowColor = "rgba(255,255,255,0.95)";
  ctx.shadowBlur  = 14 * dpr;
  ctx.fillStyle   = "white";
  ctx.beginPath();
  ctx.arc(cx * dpr, cy * dpr, 5 * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BubbleBath() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({
    actx: null, bubbles: [], sparkles: [], colGlows: [],
    colPairs: new Set(), nextId: 0,
    awake: false, lastTs: 0, lastAuto: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stRef.current;

    // Audio init (deferred to first tap)
    function initAudio(): void {
      if (st.actx) return;
      const actx = new AudioContext();
      st.actx = actx;
      // Soft ambient C3 + G3
      for (const f of [130.81, 196.00]) {
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type  = "sine";
        osc.frequency.value = f;
        g.gain.value = 0.006;
        osc.connect(g).connect(actx.destination);
        osc.start();
      }
    }

    // Canvas resize
    function resize(): void {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Demo: two bubbles alive before first tap
    const demoTimer = setTimeout(() => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (W > 0 && H > 0) {
        addBubble(st, W * 0.28, H * 0.70, W);
        addBubble(st, W * 0.66, H * 0.60, W);
      }
    }, 120);

    // Pointer: spawn a bubble at tap position
    function onPointerDown(e: PointerEvent): void {
      if (!canvas) return;
      initAudio();
      st.awake = true;
      const rect = canvas.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;
      addBubble(st, cx, cy, canvas.offsetWidth);
      if (st.actx) playSpawn(st.actx, FREQS[zoneOf(cx, canvas.offsetWidth)]);
    }
    canvas.addEventListener("pointerdown", onPointerDown);

    // Animation loop
    let rafId = 0;
    const animate = (ts: number): void => {
      rafId = requestAnimationFrame(animate);
      if (!canvas) return;
      const W   = canvas.offsetWidth;
      const H   = canvas.offsetHeight;
      if (W === 0 || H === 0) return;
      const dpr  = canvas.width / W;
      const dtMs = Math.min(ts - st.lastTs, 50);
      st.lastTs  = ts;
      const dtS  = dtMs / 1000;

      // Deep midnight background
      ctx.fillStyle = "#040c1f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update bubbles — float up, pop at top
      const active: Bubble[] = [];
      for (const b of st.bubbles) {
        if (b.gone) continue;
        b.age += dtMs;
        b.y   += b.vy * dtS;
        if (b.y < -b.r) {
          b.gone = true;
          if (st.actx) playPop(st.actx, b.freq);
          burstSparkles(st, b.x, Math.max(4, b.r * 0.5), b.hue);
          continue;
        }
        active.push(b);
      }
      st.bubbles = active;

      // Auto-respawn to keep canvas lively after first tap
      if (st.awake && st.bubbles.length < 3 && ts - st.lastAuto > 4200) {
        st.lastAuto = ts;
        const rx = W * (0.15 + Math.random() * 0.70);
        const ry = H * (0.72 + Math.random() * 0.18);
        addBubble(st, rx, ry, W);
        if (st.actx) playSpawn(st.actx, FREQS[zoneOf(rx, W)]);
      }

      // Collision detection — O(n²) fine for max 10 bubbles
      const nowPairs = new Set<string>();
      for (let i = 0; i < st.bubbles.length; i++) {
        for (let j = i + 1; j < st.bubbles.length; j++) {
          const a = st.bubbles[i];
          const b = st.bubbles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.sqrt(dx * dx + dy * dy) < a.r + b.r) {
            const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
            nowPairs.add(key);
            if (!st.colPairs.has(key)) {
              // First frame of this collision → play chord + glow
              if (st.actx) playChord(st.actx, a.freq, b.freq);
              st.colGlows.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, life: 1.0 });
            }
          }
        }
      }
      st.colPairs = nowPairs;

      // Draw bubbles
      for (const b of st.bubbles) {
        const wobble = Math.sin(ts * 0.0018 + b.phase);
        drawBubble(ctx, b.x, b.y, b.r, b.hue, wobble, dpr);
      }

      // Collision glow dots
      for (const cg of st.colGlows) {
        cg.life -= 2.4 * dtS;
        if (cg.life > 0) drawColGlow(ctx, cg.x, cg.y, cg.life, dpr);
      }
      st.colGlows = st.colGlows.filter(cg => cg.life > 0);

      // Sparkles (pop burst particles)
      for (const sp of st.sparkles) {
        sp.x   += sp.vx * dtS;
        sp.y   += sp.vy * dtS;
        sp.vy  += 28 * dtS;
        sp.life -= 1.3 * dtS;
      }
      for (const sp of st.sparkles) {
        if (sp.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = sp.life * 0.88;
        ctx.shadowColor = `hsl(${sp.hue},90%,70%)`;
        ctx.shadowBlur  = 5 * dpr;
        ctx.fillStyle   = `hsl(${sp.hue},95%,78%)`;
        ctx.beginPath();
        ctx.arc(sp.x * dpr, sp.y * dpr, 2.4 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      st.sparkles = st.sparkles.filter(sp => sp.life > 0);

      // Hint before first tap
      if (!st.awake) {
        const alpha = Math.min(0.78, ts * 0.0005);
        ctx.fillStyle    = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.font         = `${Math.round(16 * dpr)}px sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap to blow a bubble 🫧", canvas.width / 2, canvas.height * 0.91);
      }
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(demoTimer);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      st.actx?.close().catch(() => undefined);
    };
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen bg-black text-foreground select-none">
      <div className="w-full max-w-lg px-4 pt-6 pb-8 flex flex-col items-center gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-mono font-bold">Bubble Bath</h1>
          <p className="text-muted-foreground text-base mt-1">
            Tap to blow a bubble — when two touch, they chime a chord together
          </p>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full aspect-[3/4] rounded-xl touch-none"
        />

        <Link
          href="/dream"
          className="text-muted-foreground/70 text-sm hover:text-muted-foreground transition mt-1"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
