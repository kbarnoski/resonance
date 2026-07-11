"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// **For**: kids (4+)
// 5 pentatonic cups in a staircase cascade. Rain fills the biggest cup first;
// each overflow streams water into the next, ringing a bell. Cascade plays
// C3→E3→G3→A3→C4 ascending arpeggio. Bigger cup = lower pitch (BANDIMAL).

const PENTATONIC = [130.81, 164.81, 196.0, 220.0, 261.63]; // C3 E3 G3 A3 C4
const CUP_RGB: [number, number, number][] = [
  [139, 92, 246],  // C3 violet
  [52, 211, 153],  // E3 emerald
  [251, 191, 36],  // G3 amber
  [251, 113, 133], // A3 rose
  [99, 179, 237],  // C4 sky
];
const NC = 5; // number of cups

type Cup = {
  cx: number; cy: number; w: number; h: number;
  fill: number; flash: number; cooldown: number; streamTimer: number;
};
type Drop = {
  x: number; y: number; vx: number; vy: number;
  r: number; rgb: [number, number, number];
};
type Splash = { x: number; y: number; t: number; ci: number };
type Pending = { cupIdx: number; delay: number };

function buildCups(W: number, H: number): Cup[] {
  return Array.from({ length: NC }, (_, i) => {
    const t = i / (NC - 1);
    return {
      cx: W * (0.10 + 0.80 * t),
      cy: H * (0.08 + 0.56 * t),
      w:  W * (0.155 - 0.085 * t),
      h:  H * (0.115 - 0.060 * t),
      fill: i === 0 ? 0.38 : 0, // pre-fill cup 0 so first cascade arrives sooner
      flash: 0,
      cooldown: 0,
      streamTimer: 0,
    };
  });
}

function ringBell(actx: AudioContext, freq: number, gain: number) {
  const now = actx.currentTime;
  const master = actx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(gain, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.001, now + 4.5);
  master.connect(actx.destination);
  const partials: [number, number][] = [
    [1, 1.0],
    [2.756, 0.28],
    [5.404, 0.07],
  ];
  for (const [mul, gv] of partials) {
    const osc = actx.createOscillator();
    const og = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq * mul;
    og.gain.value = gv;
    osc.connect(og);
    og.connect(master);
    osc.start(now);
    osc.stop(now + 5.2);
  }
}

export default function RainChain() {
  const [started, setStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef({
    actx: null as AudioContext | null,
    cups: [] as Cup[],
    drops: [] as Drop[],
    splashes: [] as Splash[],
    pending: [] as Pending[],
    rainTimer: 0,
    animId: 0,
    lastTs: 0,
    startTs: 0,
  });

  const handleStart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const actx = new AudioContext();
    const st = stRef.current;
    st.actx = actx;
    st.cups = buildCups(canvas.offsetWidth, canvas.offsetHeight);
    st.startTs = performance.now();
    // Ambient C3 + G3 drone
    const drones: [number, number][] = [[130.81, 0.005], [196.0, 0.003]];
    for (const [f, g] of drones) {
      const osc = actx.createOscillator();
      const gn = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gn.gain.value = g;
      osc.connect(gn);
      gn.connect(actx.destination);
      osc.start();
    }
    setStarted(true);
  };

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stRef.current;

    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;

    const applyDpr = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.scale(dpr, dpr);
    };
    applyDpr();

    const onResize = () => {
      const fills = st.cups.map((c) => c.fill);
      applyDpr();
      st.cups = buildCups(W, H);
      st.cups.forEach((c, i) => { c.fill = fills[i] ?? 0; });
    };
    window.addEventListener("resize", onResize);

    const spawnRain = (ex: number, count: number) => {
      for (let i = 0; i < count && st.drops.length < 240; i++) {
        st.drops.push({
          x: ex + (Math.random() - 0.5) * 60,
          y: -12,
          vx: (Math.random() - 0.5) * 18,
          vy: 170 + Math.random() * 100,
          r: 1.4 + Math.random() * 1.2,
          rgb: [130, 190, 255],
        });
      }
    };

    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      spawnRain(e.clientX - rect.left, 32);
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      const rect = canvas.getBoundingClientRect();
      spawnRain(e.clientX - rect.left, 5);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);

    const GRAVITY = 540;
    const FILL_PER_DROP = 0.034;
    const STREAM_DUR = 0.70;
    const CASCADE_DELAY = 0.22; // seconds before next cup fills

    const render = (ts: number) => {
      const dt = Math.min((ts - st.lastTs) / 1000, 0.05);
      st.lastTs = ts;

      // Autonomous rain — biased 65% toward left (cup 0 zone)
      st.rainTimer -= dt;
      if (st.rainTimer <= 0 && st.drops.length < 200) {
        const bias = Math.random() < 0.65
          ? st.cups[0].cx + (Math.random() - 0.5) * W * 0.45
          : Math.random() * W;
        st.drops.push({
          x: Math.max(0, Math.min(W, bias)),
          y: -10,
          vx: (Math.random() - 0.5) * 14,
          vy: 175 + Math.random() * 95,
          r: 1.3 + Math.random() * 0.9,
          rgb: [100, 165, 255],
        });
        st.rainTimer = 0.17 + Math.random() * 0.08; // ~5 drops/sec
      }

      // Process pending cascade fills
      for (const p of st.pending) { p.delay -= dt; }
      const fired = st.pending.filter((p) => p.delay <= 0);
      st.pending = st.pending.filter((p) => p.delay > 0);
      for (const p of fired) {
        st.cups[p.cupIdx].fill = Math.min(1.0, st.cups[p.cupIdx].fill + 1.0);
      }

      // Move drops + cup hit detection
      const keep: Drop[] = [];
      for (const d of st.drops) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += GRAVITY * dt;
        if (d.y > H + 20) continue;
        let landed = false;
        for (let ci = 0; ci < NC; ci++) {
          const c = st.cups[ci];
          const inX = d.x >= c.cx - c.w * 0.50 && d.x <= c.cx + c.w * 0.50;
          const atTop = d.y >= c.cy && d.y <= c.cy + c.h * 0.30;
          if (inX && atTop) {
            c.fill = Math.min(1, c.fill + FILL_PER_DROP);
            st.splashes.push({ x: d.x, y: c.cy + 3, t: 0, ci });
            landed = true;
            break;
          }
        }
        if (!landed) keep.push(d);
      }
      st.drops = keep;

      // Overflow detection
      for (let ci = 0; ci < NC; ci++) {
        const c = st.cups[ci];
        c.flash = Math.max(0, c.flash - dt * 1.3);
        c.cooldown = Math.max(0, c.cooldown - dt);
        c.streamTimer = Math.max(0, c.streamTimer - dt);
        if (c.fill >= 1.0 && c.cooldown <= 0) {
          c.fill = 0.06;
          c.flash = 1.0;
          c.cooldown = 0.80;
          c.streamTimer = STREAM_DUR;
          if (st.actx) ringBell(st.actx, PENTATONIC[ci], 0.36);
          if (ci + 1 < NC) {
            // Schedule cascade: water arrives after stream delay
            st.pending.push({ cupIdx: ci + 1, delay: CASCADE_DELAY });
          }
        }
      }

      // Age splashes
      st.splashes = st.splashes.filter((s) => { s.t += dt; return s.t < 0.38; });

      // ── RENDER ─────────────────────────────────────────────────────────────

      // Night-sky gradient background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#020c1e");
      bg.addColorStop(1, "#010810");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = "lighter";

      // Rain drops (elongated in direction of motion)
      for (const d of st.drops) {
        const [r, g, b] = d.rgb;
        const len = Math.min(d.vy * 0.012, 7);
        ctx.beginPath();
        ctx.ellipse(d.x, d.y - len / 2, d.r * 0.44, d.r + len / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.62)`;
        ctx.fill();
      }

      // Splashes (expanding rings at cup top)
      for (const s of st.splashes) {
        const [r, g, b] = CUP_RGB[s.ci];
        const prog = s.t / 0.38;
        ctx.beginPath();
        ctx.arc(s.x, s.y, prog * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - prog) * 0.65})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Overflow streams (quadratic bezier arc from cup N right-top to cup N+1 left)
      for (let ci = 0; ci < NC - 1; ci++) {
        const c = st.cups[ci];
        if (c.streamTimer <= 0) continue;
        const nc = st.cups[ci + 1];
        const prog = c.streamTimer / STREAM_DUR;
        const [r, g, b] = CUP_RGB[ci];
        const ex = c.cx + c.w * 0.48;
        const ey = c.cy;
        const nx = nc.cx - nc.w * 0.32;
        const ny = nc.cy + nc.h * 0.08;
        const mx = (ex + nx) * 0.50;
        const my = ey + (ny - ey) * 0.55 + 18;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.quadraticCurveTo(mx, my, nx, ny);
        ctx.strokeStyle = `rgba(${r},${g},${b},${prog * 0.72})`;
        ctx.lineWidth = 2 + prog * 2.5;
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "source-over";

      // Cups
      for (let ci = 0; ci < NC; ci++) {
        const c = st.cups[ci];
        const [r, g, b] = CUP_RGB[ci];
        const lx = c.cx - c.w / 2;
        const rx = c.cx + c.w / 2;
        const topY = c.cy;
        const botY = c.cy + c.h;

        // Overflow glow halo
        if (c.flash > 0.05) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const hR = 46 * c.flash;
          const gr = ctx.createRadialGradient(c.cx, topY, 0, c.cx, topY, hR);
          gr.addColorStop(0, `rgba(${r},${g},${b},${0.38 * c.flash})`);
          gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(c.cx, topY, hR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Water fill (bottom of cup, grows upward)
        if (c.fill > 0.01) {
          const waterH = c.fill * (c.h - 5);
          const waterY = botY - waterH;
          ctx.fillStyle = `rgba(${r},${g},${b},0.22)`;
          ctx.fillRect(lx + 2, waterY, c.w - 4, waterH);
          // Shimmering water surface
          ctx.fillStyle = `rgba(${r},${g},${b},${0.42 + c.flash * 0.35})`;
          ctx.fillRect(lx + 2, waterY, c.w - 4, 2.5);
        }

        // Cup walls (U-shape: left wall, bottom, right wall)
        const wallA = 0.55 + c.flash * 0.42;
        ctx.beginPath();
        ctx.moveTo(lx, topY);
        ctx.lineTo(lx, botY);
        ctx.lineTo(rx, botY);
        ctx.lineTo(rx, topY);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wallA})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      // Hint text: fade in 1s, hold until 8s, fade out
      const elapsed = (ts - st.startTs) / 1000;
      const hA =
        elapsed < 1 ? elapsed :
        elapsed < 8 ? 1 :
        Math.max(0, 1 - (elapsed - 8) / 3);
      if (hA > 0.01) {
        ctx.save();
        ctx.globalAlpha = hA * 0.58;
        ctx.fillStyle = "#fff";
        ctx.font = "14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("tap anywhere to make it rain", W / 2, H * 0.93);
        ctx.restore();
      }

      st.animId = requestAnimationFrame(render);
    };

    st.lastTs = performance.now();
    st.animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(st.animId);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      if (st.actx) { void st.actx.close(); st.actx = null; }
    };
  }, [started]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ background: "#010810" }}
      />

      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-3xl font-light tracking-tight text-foreground mb-3">
            Rain Chain
          </h1>
          <p className="text-base text-muted-foreground max-w-sm mb-8 leading-relaxed">
            Five cups hang in a staircase. Rain fills the biggest cup first.
            When it overflows, water cascades to the next — each cup ringing
            a different bell. Tap anywhere to make it rain.
          </p>
          <button
            onClick={handleStart}
            className="px-8 py-3 text-base border border-border rounded-xl hover:bg-accent hover:border-border transition text-foreground min-h-[48px]"
          >
            Start the rain
          </button>
          <Link
            href="/dream"
            className="mt-10 text-sm text-muted-foreground hover:text-foreground"
          >
            ← dream sandbox
          </Link>
        </div>
      )}

      {started && (
        <div className="absolute top-4 right-4">
          <Link href="/dream" className="text-sm text-muted-foreground hover:text-foreground">
            ← back
          </Link>
        </div>
      )}
    </div>
  );
}
