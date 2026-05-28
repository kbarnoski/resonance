"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// **For**: kids (4+)
// 8 pentatonic wind chimes with pendulum physics.
// Longer = lower (BANDIMAL rule). Tap/drag to blow wind.
// When adjacent chimes touch, both ring. Autonomous from load.

const NOTES: Array<{ freq: number; color: [number, number, number] }> = [
  { freq: 130.81, color: [139, 92, 246] },  // C3 violet
  { freq: 164.81, color: [52, 211, 153] },  // E3 emerald
  { freq: 196.00, color: [251, 191, 36] },  // G3 amber
  { freq: 220.00, color: [251, 113, 133] }, // A3 rose
  { freq: 261.63, color: [99, 179, 237] },  // C4 sky
  { freq: 329.63, color: [167, 243, 208] }, // E4 mint
  { freq: 392.00, color: [253, 224, 71] },  // G4 yellow
  { freq: 440.00, color: [249, 168, 212] }, // A4 pink
];

type Chime = {
  x: number;
  L: number;
  freq: number;
  color: [number, number, number];
  theta: number;    // angle from vertical (radians)
  omega: number;    // angular velocity (rad/s)
  flash: number;    // 0–1, decays after collision
  cooldown: number; // seconds until chime can ring again
};

// Additive bell tone: triangle fundamental + 2nd + 4th partial
function ringBell(actx: AudioContext, freq: number, gain: number) {
  const now = actx.currentTime;
  const master = actx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(gain, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.001, now + 4.8);
  master.connect(actx.destination);
  ([
    [1, 1.0],
    [2.756, 0.32], // slightly inharmonic 2nd (glass-bell characteristic)
    [5.404, 0.09],
  ] as [number, number][]).forEach(([mul, gv]) => {
    const osc = actx.createOscillator();
    const og = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq * mul;
    og.gain.value = gv;
    osc.connect(og);
    og.connect(master);
    osc.start(now);
    osc.stop(now + 5.5);
  });
}

export default function WindChimes() {
  const [started, setStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stateRef = useRef({
    actx: null as AudioContext | null,
    chimes: [] as Chime[],
    wind: 0,
    windTimer: 1.2,  // seconds until first autonomous gust
    animId: 0,
    lastTs: 0,
    startTs: 0,
  });

  const handleStart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const actx = new AudioContext();
    const st = stateRef.current;
    st.actx = actx;
    st.startTs = performance.now();

    // Build chimes: left=longest/lowest, right=shortest/highest (BANDIMAL)
    const margin = W * 0.09;
    const usable = W - margin * 2;
    st.chimes = NOTES.map((n, i) => {
      const t = i / (NOTES.length - 1);
      return {
        x: margin + t * usable,
        L: H * (0.60 - 0.35 * t), // 0.60→0.25 of canvas height
        freq: n.freq,
        color: n.color,
        theta: (Math.random() - 0.5) * 0.06, // tiny random start splay
        omega: 0,
        flash: 0,
        cooldown: 0,
      };
    });

    // Ambient soft C3+G3 drone
    ([
      [130.81, 0.006],
      [196.00, 0.004],
    ] as [number, number][]).forEach(([f, g]) => {
      const osc = actx.createOscillator();
      const gn = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gn.gain.value = g;
      osc.connect(gn);
      gn.connect(actx.destination);
      osc.start();
    });

    // Startup gust so chimes begin moving immediately
    st.wind = (Math.random() < 0.5 ? -1 : 1) * 1.8;
    setStarted(true);
  };

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stateRef.current;

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
      applyDpr();
      // Update positions without resetting physics state
      const margin = W * 0.09;
      const usable = W - margin * 2;
      st.chimes.forEach((c, i) => {
        const t = i / (st.chimes.length - 1);
        c.x = margin + t * usable;
        c.L = H * (0.60 - 0.35 * t);
      });
    };
    window.addEventListener("resize", onResize);

    // Tap/drag → directional wind impulse
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ex = e.clientX - rect.left;
      // Left side = leftward wind, right side = rightward
      st.wind += (ex < W / 2 ? -1 : 1) * (1.4 + Math.random() * 0.9);
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      const rect = canvas.getBoundingClientRect();
      const ex = e.clientX - rect.left;
      st.wind += (ex < W / 2 ? -1 : 1) * 0.20;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);

    // Physics constants — tuned for visual beauty
    const G_EFF = 260;   // effective gravity (pixels/s²)
    const DAMP = 0.30;   // angular velocity damping
    const COLL_PX = 18;  // collision distance at tip (pixels)
    const MAX_ANG = Math.PI / 5; // 36° max swing

    const render = (ts: number) => {
      const dt = Math.min((ts - st.lastTs) / 1000, 0.05);
      st.lastTs = ts;

      // Wind decays exponentially
      st.wind *= Math.exp(-2.2 * dt);

      // Autonomous gusts every 3–6 seconds
      st.windTimer -= dt;
      if (st.windTimer <= 0) {
        st.wind += (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.5);
        st.windTimer = 3 + Math.random() * 3;
      }

      // Physics step (linearized pendulum for small angles)
      for (const c of st.chimes) {
        const alpha =
          -(G_EFF / c.L) * c.theta // restoring force
          - DAMP * c.omega          // damping
          + st.wind / c.L;          // wind torque
        c.omega += alpha * dt;
        c.theta += c.omega * dt;
        // Clamp + bounce
        if (Math.abs(c.theta) > MAX_ANG) {
          c.theta = Math.sign(c.theta) * MAX_ANG;
          c.omega *= -0.30;
        }
        c.flash = Math.max(0, c.flash - dt * 1.1);
        c.cooldown = Math.max(0, c.cooldown - dt);
      }

      // Collision detection — adjacent pairs only
      if (st.actx) {
        for (let i = 0; i < st.chimes.length - 1; i++) {
          const a = st.chimes[i];
          const b = st.chimes[i + 1];
          const ax = a.x + Math.sin(a.theta) * a.L;
          const bx = b.x + Math.sin(b.theta) * b.L;
          if (Math.abs(ax - bx) < COLL_PX && a.cooldown <= 0 && b.cooldown <= 0) {
            // Elastic-ish momentum exchange
            const tmpOmega = a.omega;
            a.omega = b.omega * 0.60;
            b.omega = tmpOmega * 0.60;
            const vol = Math.min(0.48, 0.13 + Math.abs(tmpOmega - b.omega) * 0.14);
            ringBell(st.actx, a.freq, vol);
            ringBell(st.actx, b.freq, vol);
            a.flash = 1;
            b.flash = 1;
            a.cooldown = 0.55;
            b.cooldown = 0.55;
          }
        }
      }

      // ─── Render ───────────────────────────────────────────────────────────
      const TOP = H * 0.065;

      // Night-sky gradient background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#09091c");
      bg.addColorStop(1, "#030312");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Horizontal hanging bar
      ctx.beginPath();
      ctx.moveTo(W * 0.05, TOP);
      ctx.lineTo(W * 0.95, TOP);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.globalCompositeOperation = "lighter";

      for (const c of st.chimes) {
        const tipX = c.x + Math.sin(c.theta) * c.L;
        const tipY = TOP + Math.cos(c.theta) * c.L;
        const [r, g, b] = c.color;
        const glow = 0.45 + c.flash * 0.55;

        // Thin string from bar to top of rod
        const topFrac = 0.04;
        ctx.beginPath();
        ctx.moveTo(c.x, TOP);
        ctx.lineTo(
          c.x + Math.sin(c.theta) * c.L * topFrac,
          TOP + Math.cos(c.theta) * c.L * topFrac
        );
        ctx.strokeStyle = `rgba(${r},${g},${b},0.22)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Chime rod (glowing thick line)
        ctx.beginPath();
        ctx.moveTo(
          c.x + Math.sin(c.theta) * c.L * topFrac,
          TOP + Math.cos(c.theta) * c.L * topFrac
        );
        ctx.lineTo(tipX, tipY);
        ctx.strokeStyle = `rgba(${r},${g},${b},${glow})`;
        ctx.lineWidth = 3 + c.flash * 3.5;
        ctx.stroke();

        // Bell disc at tip
        ctx.beginPath();
        ctx.arc(tipX, tipY, 6 + c.flash * 7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.88 * glow})`;
        ctx.fill();

        // Collision glow halo
        if (c.flash > 0.05) {
          const haloR = 55 * c.flash;
          const gr = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, haloR);
          gr.addColorStop(0, `rgba(${r},${g},${b},${0.32 * c.flash})`);
          gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(tipX, tipY, haloR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = "source-over";

      // Hint text: fade in 0–1s, hold, fade out 7–10s
      const elapsed = (ts - st.startTs) / 1000;
      const hintA =
        elapsed < 1 ? elapsed :
        elapsed < 7 ? 1 :
        Math.max(0, 1 - (elapsed - 7) / 3);
      if (hintA > 0.01) {
        ctx.save();
        ctx.globalAlpha = hintA * 0.60;
        ctx.fillStyle = "#fff";
        ctx.font = "14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("tap or drag — blow the wind", W / 2, H * 0.93);
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
      // AudioContext close stops all connected oscillators
      if (st.actx) {
        void st.actx.close();
        st.actx = null;
      }
    };
  }, [started]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ background: "#030312" }}
      />

      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-3xl font-light tracking-tight text-white mb-3">
            Wind Chimes
          </h1>
          <p className="text-base text-white/75 max-w-sm mb-8 leading-relaxed">
            Eight glowing chimes hang in the dark — longer ones ring lower.
            Tap or drag to blow the wind. When chimes touch, they ring together.
          </p>
          <button
            onClick={handleStart}
            className="px-8 py-3 text-base border border-white/30 rounded-xl hover:bg-white/5 hover:border-white/60 transition text-white min-h-[48px]"
          >
            Hang the chimes
          </button>
          <Link
            href="/dream"
            className="mt-10 text-sm text-white/55 hover:text-white/80"
          >
            ← dream sandbox
          </Link>
        </div>
      )}

      {started && (
        <div className="absolute top-4 right-4">
          <Link
            href="/dream"
            className="text-sm text-white/55 hover:text-white/80"
          >
            ← back
          </Link>
        </div>
      )}
    </div>
  );
}
