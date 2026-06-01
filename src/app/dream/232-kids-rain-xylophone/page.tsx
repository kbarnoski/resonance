"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Coloured raindrops fall from the sky onto BANDIMAL xylophone bars.
// Tap a drop while it's falling — big bell note + sparkle burst!
// Uncaught drops ring the bar quietly. Tap any bar directly, any time.

const FREQS = [130.81, 164.81, 196.00, 220.00, 261.63]; // C3 E3 G3 A3 C4
const HUES  = [270,    160,    42,     345,    195];     // violet teal amber rose cyan
const BAR_H = [88,     74,     62,     52,     44];      // px; BANDIMAL: left=tallest=lowest
const COLS  = 5;
const GRAV  = 58;    // px/s² — gentle fall
const DROP_R = 18;   // drop visual radius px
const HIT_R  = 38;   // tap hit radius px (generous for 4yo)
const MAX_DR = 10;
const SPAWN  = 1.5;  // seconds between auto-spawns

type Drop = {
  id: number; col: number;
  x: number; y: number; vy: number;
  alive: boolean;
};
type Sparkle = { x: number; y: number; vx: number; vy: number; life: number; hue: number };
type St = {
  actx:     AudioContext | null;
  drops:    Drop[];
  sparkles: Sparkle[];
  barFlash: number[];
  nextId:   number;
  awake:    boolean;
  lastTs:   number;
  acc:      number;
};

function colX(col: number, W: number): number {
  return (col + 0.5) * (W / COLS);
}

function topY(col: number, H: number): number {
  return H - H * 0.04 - BAR_H[col];
}

function addDrop(st: St, W: number): void {
  if (st.drops.length >= MAX_DR) return;
  const col = Math.floor(Math.random() * COLS);
  st.drops.push({
    id: st.nextId++,
    col,
    x:  colX(col, W) + (Math.random() - 0.5) * 14,
    y:  -DROP_R - 4,
    vy: 14 + Math.random() * 10,
    alive: true,
  });
}

function playBell(actx: AudioContext, freq: number, loud: boolean): void {
  const now = actx.currentTime;
  const bus = actx.createGain();
  bus.connect(actx.destination);
  const pk  = loud ? 0.30 : 0.13;
  const dur = loud ? 1.80 : 1.00;
  const partials: [number, number][] = [[freq, pk], [freq * 2.756, pk * 0.10]];
  for (const [f, g] of partials) {
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(g, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(env).connect(bus);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }
}

function burst(st: St, x: number, y: number, hue: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a  = (Math.PI * 2 * i) / n;
    const sp = 20 + Math.random() * 38;
    st.sparkles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 24,
      life: 1.0, hue,
    });
  }
}

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  col: number, W: number, H: number, flash: number, dpr: number,
): void {
  const cw  = W / COLS;
  const pad = cw * 0.10;
  const bx  = (col * cw + pad) * dpr;
  const bw  = (cw - pad * 2) * dpr;
  const bh  = BAR_H[col] * dpr;
  const by  = topY(col, H) * dpr;
  const r   = 6 * dpr;
  const hue = HUES[col];
  const gl  = 0.15 + flash * 0.85;

  ctx.save();
  ctx.shadowColor = `hsla(${hue},88%,62%,${gl.toFixed(2)})`;
  ctx.shadowBlur  = (10 + flash * 18) * dpr;

  ctx.fillStyle = `hsl(${hue},36%,17%)`;
  rrect(ctx, bx, by, bw, bh, r);
  ctx.fill();

  ctx.strokeStyle = `hsla(${hue},78%,54%,${(0.50 + flash * 0.50).toFixed(2)})`;
  ctx.lineWidth   = 2 * dpr;
  rrect(ctx, bx, by, bw, bh, r);
  ctx.stroke();

  // top highlight strip
  ctx.shadowBlur = 0;
  ctx.fillStyle  = `hsla(${hue},78%,72%,${(0.10 + flash * 0.12).toFixed(2)})`;
  rrect(ctx, bx + 4 * dpr, by + 4 * dpr, bw - 8 * dpr, bh * 0.28, r * 0.5);
  ctx.fill();

  // resonator hole
  const holeR = Math.min(bw * 0.22, 7 * dpr);
  ctx.fillStyle = `hsla(${hue},44%,9%,0.75)`;
  ctx.beginPath();
  ctx.arc(bx + bw * 0.5, by + bh * 0.70, holeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawDrop(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, hue: number, dpr: number,
): void {
  const cx = x * dpr;
  const cy = y * dpr;
  const r  = DROP_R * dpr;

  ctx.save();
  ctx.shadowColor = `hsla(${hue},90%,65%,0.85)`;
  ctx.shadowBlur  = 9 * dpr;
  ctx.fillStyle   = `hsla(${hue},72%,52%,0.92)`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue},88%,70%)`;
  ctx.lineWidth   = 1.5 * dpr;
  ctx.stroke();
  // inner highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle  = `hsla(${hue},75%,82%,0.28)`;
  ctx.beginPath();
  ctx.arc(cx - r * 0.26, cy - r * 0.26, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RainXylophone() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({
    actx: null, drops: [], sparkles: [],
    barFlash: [0, 0, 0, 0, 0],
    nextId: 0, awake: false, lastTs: 0, acc: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stRef.current;

    function resize(): void {
      if (!canvas) return;
      const dpr    = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function initAudio(): void {
      if (st.actx) return;
      const actx = new AudioContext();
      st.actx = actx;
      for (const [f, g] of [[130.81, 0.006], [196.00, 0.004]] as [number, number][]) {
        const osc  = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        gain.gain.value = g;
        osc.connect(gain).connect(actx.destination);
        osc.start();
      }
    }

    // demo drops: two visible before first tap
    const demoTimer = setTimeout(() => {
      const W = canvas.offsetWidth;
      if (W > 0) {
        addDrop(st, W);
        setTimeout(() => addDrop(st, W), 700);
      }
    }, 80);

    function onPointerDown(e: PointerEvent): void {
      if (!canvas) return;
      initAudio();
      st.awake = true;
      const rect = canvas.getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;
      const W    = canvas.offsetWidth;
      const H    = canvas.offsetHeight;

      // try to catch a falling drop first
      let caught = false;
      for (const d of st.drops) {
        if (!d.alive) continue;
        const dx = px - d.x;
        const dy = py - d.y;
        if (dx * dx + dy * dy <= HIT_R * HIT_R) {
          d.alive = false;
          caught  = true;
          if (st.actx) playBell(st.actx, FREQS[d.col], true);
          burst(st, d.x, d.y, HUES[d.col], 20);
          st.barFlash[d.col] = 1.0;
          break;
        }
      }

      if (!caught) {
        const col  = Math.min(COLS - 1, Math.floor((px / W) * COLS));
        const bTop = topY(col, H);
        if (py >= bTop - 20) {
          if (st.actx) playBell(st.actx, FREQS[col], false);
          st.barFlash[col] = 0.85;
          burst(st, colX(col, W), bTop, HUES[col], 10);
        }
      }
    }
    canvas.addEventListener("pointerdown", onPointerDown);

    let rafId = 0;
    const animate = (ts: number): void => {
      rafId = requestAnimationFrame(animate);
      if (!canvas) return;
      const W   = canvas.offsetWidth;
      const H   = canvas.offsetHeight;
      if (W === 0 || H === 0) return;
      const dpr = canvas.width / W;
      const dt  = Math.min(ts - st.lastTs, 50) / 1000;
      st.lastTs = ts;

      // auto-spawn one drop per interval
      st.acc += dt;
      if (st.acc >= SPAWN) {
        st.acc -= SPAWN;
        addDrop(st, W);
      }

      // background
      ctx.fillStyle = "#06091e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // bars (drawn before drops so drops appear on top)
      for (let c = 0; c < COLS; c++) {
        st.barFlash[c] = Math.max(0, st.barFlash[c] - 2.2 * dt);
        drawBar(ctx, c, W, H, st.barFlash[c], dpr);
      }

      // update drops
      for (const d of st.drops) {
        if (!d.alive) continue;
        d.vy += GRAV * dt;
        d.x  += (colX(d.col, W) - d.x) * 0.05; // gentle drift toward column center
        d.y  += d.vy * dt;
        if (d.y >= topY(d.col, H)) {
          d.alive = false;
          if (st.actx) playBell(st.actx, FREQS[d.col], false);
          burst(st, d.x, topY(d.col, H), HUES[d.col], 10);
          st.barFlash[d.col] = 0.70;
        }
      }
      st.drops = st.drops.filter(d => d.alive);

      // draw drops
      for (const d of st.drops) drawDrop(ctx, d.x, d.y, HUES[d.col], dpr);

      // sparkles
      for (const sp of st.sparkles) {
        sp.x   += sp.vx * dt;
        sp.y   += sp.vy * dt;
        sp.vy  += 42 * dt;
        sp.life -= 1.4 * dt;
      }
      ctx.save();
      for (const sp of st.sparkles) {
        if (sp.life <= 0) continue;
        ctx.globalAlpha = sp.life * 0.9;
        ctx.shadowColor = `hsl(${sp.hue},90%,68%)`;
        ctx.shadowBlur  = 5 * dpr;
        ctx.fillStyle   = `hsl(${sp.hue},92%,76%)`;
        ctx.beginPath();
        ctx.arc(sp.x * dpr, sp.y * dpr, 2.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      st.sparkles = st.sparkles.filter(sp => sp.life > 0);

      // hint text before first tap
      if (!st.awake) {
        const alpha = Math.min(0.80, Math.max(0, (ts - 1200) * 0.0006));
        if (alpha > 0.01) {
          ctx.save();
          ctx.globalAlpha  = alpha;
          ctx.fillStyle    = "white";
          ctx.font         = `${Math.round(15 * dpr)}px sans-serif`;
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("tap the drops to catch them! 🎵", canvas.width / 2, canvas.height * 0.16);
          ctx.restore();
        }
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
    <div className="flex flex-col items-center min-h-screen bg-black text-white select-none">
      <div className="w-full max-w-lg px-4 pt-6 pb-8 flex flex-col items-center gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-mono font-bold">Rain Xylophone</h1>
          <p className="text-white/75 text-base mt-1">
            catch the drops before they land!
          </p>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full aspect-[3/4] rounded-xl touch-none"
        />

        <Link
          href="/dream"
          className="text-white/40 text-sm hover:text-white/60 transition mt-1"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
