"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap the dark sky to release a glowing paper lantern. Lanterns drift upward and
// chime as they float off the top of the screen.

const FREQS = [130.81, 164.81, 196.00, 220.00, 261.63]; // C3 E3 G3 A3 C4 — pentatonic
const HUES  = [270,    160,    42,     345,    195];     // violet teal amber rose cyan
const FLOAT_SPD = 22; // CSS px per second
const MAX_LAN   = 8;
const BODY_H    = 38; // CSS px — lantern body half-height
const EXIT_Y    = -(BODY_H + 14 + 8 + 8); // fully above top + margin

type Sparkle = { x: number; y: number; vx: number; vy: number; life: number; hue: number };
type Lantern  = {
  id: number; baseX: number; y: number;
  hue: number; freq: number; phase: number; age: number; gone: boolean;
};
type Star     = { x: number; y: number; r: number; ph: number };
type St       = {
  actx: AudioContext | null;
  lanterns: Lantern[];
  sparkles: Sparkle[];
  stars: Star[];
  nextId: number;
  awake: boolean;
  lastTs: number;
};

function pitchZone(x: number, W: number): number {
  return Math.min(4, Math.floor((x / W) * 5));
}

function addLantern(st: St, x: number, y: number, W: number): void {
  st.lanterns.push({
    id: st.nextId++,
    baseX: x, y,
    hue:  HUES[pitchZone(x, W)],
    freq: FREQS[pitchZone(x, W)],
    phase: Math.random() * Math.PI * 2,
    age: 0, gone: false,
  });
  if (st.lanterns.length > MAX_LAN) st.lanterns.shift();
}

function playLaunch(actx: AudioContext, freq: number): void {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.001, now);
  env.gain.linearRampToValueAtTime(0.14, now + 0.025);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
  osc.connect(env).connect(actx.destination);
  osc.start(now);
  osc.stop(now + 0.95);
}

function playExit(actx: AudioContext, freq: number): void {
  const now = actx.currentTime;
  const bus = actx.createGain();
  bus.connect(actx.destination);
  const partials: [number, number][] = [[freq, 0.30], [freq * 2, 0.08]];
  for (const [f, pk] of partials) {
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(pk, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
    osc.connect(env).connect(bus);
    osc.start(now);
    osc.stop(now + 1.9);
  }
}

function emitBurst(st: St, x: number, y: number, hue: number): void {
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14;
    st.sparkles.push({
      x, y,
      vx: Math.cos(a) * (16 + Math.random() * 30),
      vy: Math.sin(a) * (16 + Math.random() * 30) - 22,
      life: 1.0, hue,
    });
  }
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawLantern(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, hue: number, dpr: number
): void {
  const x   = cx * dpr;
  const y   = cy * dpr;
  const bw  = 23 * dpr;  // half-width
  const bh  = BODY_H * dpr;
  const rad = 8 * dpr;

  ctx.save();

  // Outer glow
  ctx.shadowColor = `hsl(${hue},95%,68%)`;
  ctx.shadowBlur  = 20 * dpr;

  // Body fill
  drawRoundRect(ctx, x - bw, y - bh, bw * 2, bh * 2, rad);
  ctx.fillStyle = `hsl(${hue},58%,22%)`;
  ctx.fill();

  // Body rim
  ctx.strokeStyle = `hsl(${hue},88%,56%)`;
  ctx.lineWidth   = 1.6 * dpr;
  drawRoundRect(ctx, x - bw, y - bh, bw * 2, bh * 2, rad);
  ctx.stroke();

  // Inner glow panel (no shadow)
  ctx.shadowBlur = 0;
  drawRoundRect(ctx, x - bw * 0.65, y - bh * 0.65, bw * 1.3, bh * 1.3, rad * 0.5);
  ctx.fillStyle = `hsla(${hue},92%,68%,0.16)`;
  ctx.fill();

  // Horizontal equator rib
  ctx.strokeStyle = `hsla(${hue},78%,52%,0.4)`;
  ctx.lineWidth   = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(x - bw, y);
  ctx.lineTo(x + bw, y);
  ctx.stroke();

  // Top handle arc
  ctx.shadowColor = `hsl(${hue},90%,65%)`;
  ctx.shadowBlur  = 7 * dpr;
  ctx.strokeStyle = `hsl(${hue},78%,58%)`;
  ctx.lineWidth   = 2 * dpr;
  ctx.beginPath();
  ctx.arc(x, y - bh - 7 * dpr, 6 * dpr, Math.PI, 0);
  ctx.stroke();

  // Tassel cord
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `hsl(${hue},72%,52%)`;
  ctx.lineWidth   = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(x, y + bh);
  ctx.lineTo(x, y + bh + 12 * dpr);
  ctx.stroke();

  // Tassel bob
  ctx.shadowColor = `hsl(${hue},90%,65%)`;
  ctx.shadowBlur  = 6 * dpr;
  ctx.fillStyle   = `hsl(${hue},88%,60%)`;
  ctx.beginPath();
  ctx.arc(x, y + bh + 12 * dpr, 4 * dpr, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LanternLaunch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({
    actx: null, lanterns: [], sparkles: [], stars: [],
    nextId: 0, awake: false, lastTs: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stRef.current;

    // ── Audio ────────────────────────────────────────────────────────────────
    function initAudio(): void {
      if (st.actx) return;
      const actx = new AudioContext();
      st.actx = actx;
      // Soft ambient pad C3 + G3 + C4
      for (const f of [130.81, 196.00, 261.63]) {
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type  = "sine";
        osc.frequency.value = f;
        g.gain.value = 0.006;
        osc.connect(g).connect(actx.destination);
        osc.start();
      }
    }

    // ── Canvas resize ────────────────────────────────────────────────────────
    function resize(): void {
      if (!canvas) return;
      const dpr    = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Pre-place twinkling stars
    st.stars = Array.from({ length: 58 }, () => ({
      x:  Math.random(),
      y:  Math.random() * 0.88,  // keep stars above hint text area
      r:  0.5 + Math.random() * 1.6,
      ph: Math.random() * Math.PI * 2,
    }));

    // Demo: two lanterns alive before first tap
    const demoTimer = setTimeout(() => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (W > 0 && H > 0) {
        addLantern(st, W * 0.28, H * 0.80, W);
        addLantern(st, W * 0.70, H * 0.65, W);
      }
    }, 120);

    // ── Pointer ──────────────────────────────────────────────────────────────
    function onPointerDown(e: PointerEvent): void {
      if (!canvas) return;
      initAudio();
      st.awake = true;
      const rect = canvas.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;
      addLantern(st, cx, cy, canvas.offsetWidth);
      if (st.actx) playLaunch(st.actx, FREQS[pitchZone(cx, canvas.offsetWidth)]);
    }
    canvas.addEventListener("pointerdown", onPointerDown);

    // ── Animation loop ───────────────────────────────────────────────────────
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

      // Dark sky fill
      ctx.fillStyle = "#03081a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Twinkling stars
      for (const s of st.stars) {
        const twk = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(ts * 0.0007 + s.ph));
        ctx.fillStyle = `rgba(255,255,220,${(twk * 0.88).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update lanterns
      for (const l of st.lanterns) {
        if (l.gone) continue;
        l.age += dtMs;
        l.y   -= FLOAT_SPD * dtS;
        if (l.y < EXIT_Y) {
          l.gone = true;
          if (st.actx) playExit(st.actx, l.freq);
          emitBurst(st, l.baseX, Math.max(H * 0.02, 5), l.hue);
          continue;
        }
        const drawX = l.baseX + Math.sin(l.phase + l.age * 0.0009) * 10;
        drawLantern(ctx, drawX, l.y, l.hue, dpr);
      }
      st.lanterns = st.lanterns.filter(l => !l.gone);

      // Update sparkles
      for (const sp of st.sparkles) {
        sp.x   += sp.vx * dtS;
        sp.y   += sp.vy * dtS;
        sp.vy  += 30 * dtS;
        sp.life -= 1.3 * dtS;
      }
      for (const sp of st.sparkles) {
        if (sp.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = sp.life * 0.92;
        ctx.shadowColor = `hsl(${sp.hue},92%,70%)`;
        ctx.shadowBlur  = 5 * dpr;
        ctx.fillStyle   = `hsl(${sp.hue},95%,76%)`;
        ctx.beginPath();
        ctx.arc(sp.x * dpr, sp.y * dpr, 2.4 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      st.sparkles = st.sparkles.filter(sp => sp.life > 0);

      // Hint text before first tap
      if (!st.awake) {
        const alpha = Math.min(0.72, ts * 0.0004);
        ctx.fillStyle    = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.font         = `${Math.round(16 * dpr)}px sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap the sky to release a lantern 🏮", canvas.width / 2, canvas.height * 0.90);
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
          <h1 className="text-2xl font-mono font-bold">Lantern Launch</h1>
          <p className="text-muted-foreground text-base mt-1">
            Tap the sky — lanterns float up and chime as they leave
          </p>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full aspect-[4/3] rounded-xl touch-none"
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
