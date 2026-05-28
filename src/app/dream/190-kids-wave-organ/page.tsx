"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── 7 pentatonic pipes: left = tallest = lowest (BANDIMAL rule) ── */
const PIPES = [
  { freq: 130.81, hue: 268, hFrac: 0.52 }, // C3  violet   — tallest
  { freq: 164.81, hue: 222, hFrac: 0.45 }, // E3  blue-indigo
  { freq: 196.00, hue: 188, hFrac: 0.38 }, // G3  cyan
  { freq: 220.00, hue: 150, hFrac: 0.32 }, // A3  emerald
  { freq: 261.63, hue:  98, hFrac: 0.25 }, // C4  lime
  { freq: 329.63, hue:  38, hFrac: 0.19 }, // E4  amber
  { freq: 392.00, hue: 355, hFrac: 0.13 }, // G4  rose     — shortest
] as const;

const N          = PIPES.length;
const WAVE_Y     = 0.73;  // rest water level (fraction of canvas H, from top)
const PIPE_GAIN  = 0.11;  // volume per submerged pipe
const PIPE_W     = 0.082; // pipe width as fraction of canvas width

type Impulse = { x: number; t: number };
type Droplet = { x: number; y: number; vx: number; vy: number; a: number };

export default function WaveOrganPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let W = 0, H = 0;

    function resize() {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    /* ── audio (deferred to first tap — autoplay policy) ── */
    let actx: AudioContext | null = null;
    const gains: GainNode[] = [];
    const submerged = Array<boolean>(N).fill(false);

    function initAudio() {
      if (actx) return;
      actx = new AudioContext();
      if (actx.state === "suspended") void actx.resume();

      const master = actx.createGain();
      master.gain.value = 0.65;
      master.connect(actx.destination);

      /* short plate reverb for warmth */
      const sr   = actx.sampleRate;
      const len  = Math.floor(sr * 1.8);
      const buf  = actx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.exp(-3.5 * n / len);
      }
      const conv    = actx.createConvolver();
      conv.buffer   = buf;
      const revBus  = actx.createGain();
      revBus.gain.value = 0.22;
      conv.connect(revBus);
      revBus.connect(actx.destination);

      for (let i = 0; i < N; i++) {
        const osc   = actx.createOscillator();
        osc.type    = "triangle";
        osc.frequency.value = PIPES[i].freq;
        const g = actx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(master);
        g.connect(conv);
        osc.start();
        gains.push(g);
      }
    }

    /* ── wave physics ── */
    const impulses: Impulse[] = [];
    const droplets: Droplet[] = [];
    const startTs = performance.now();

    function getWaterY(x: number, t: number): number {
      const base = WAVE_Y * H;
      let w = 0;
      /* three overlapping sinusoids for organic-looking water */
      w += 0.14 * H * Math.sin(2 * Math.PI * 0.12 * t + x * 0.0030);
      w += 0.07 * H * Math.sin(2 * Math.PI * 0.23 * t - x * 0.0058 + 1.3);
      w += 0.04 * H * Math.cos(2 * Math.PI * 0.08 * t + 0.9);
      /* tap impulses: Gaussian surge decaying over ~3 s */
      for (const imp of impulses) {
        const dx  = (x - imp.x) / W;
        const dt  = t - imp.t;
        if (dt > 3.5) continue;
        w -= 0.22 * H * Math.exp(-dt * 1.1) * Math.exp(-dx * dx / 0.016);
      }
      return base + w;
    }

    function pipeCenterX(i: number): number {
      return (W / N) * (i + 0.5);
    }

    /* ── render loop ── */
    let raf = 0;
    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (W === 0 || H === 0) return;

      const t = (ts - startTs) / 1000;

      /* expire old impulses */
      while (impulses.length > 0 && t - impulses[0].t > 3.8) impulses.shift();

      /* update audio: smooth gain ramps on submersion state changes */
      if (actx) {
        for (let i = 0; i < N; i++) {
          const wy     = getWaterY(pipeCenterX(i), t);
          const mouthY = (1 - PIPES[i].hFrac) * H;
          const nowSub = wy < mouthY;
          if (nowSub !== submerged[i]) {
            submerged[i] = nowSub;
            gains[i].gain.setTargetAtTime(
              nowSub ? PIPE_GAIN : 0,
              actx.currentTime,
              nowSub ? 0.14 : 0.22,
            );
          }
        }
      }

      /* ── DRAW ── */
      /* background: deep ocean night */
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#020814");
      bg.addColorStop(1, "#060c1c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      /* compute water surface samples */
      const step = Math.max(3, Math.floor(W / 120));
      const pts: [number, number][] = [];
      for (let xi = 0; xi <= W; xi += step) pts.push([xi, getWaterY(xi, t)]);
      if (pts[pts.length - 1][0] < W) pts.push([W, getWaterY(W, t)]);

      /* draw pipes (behind water) */
      for (let i = 0; i < N; i++) {
        const cx  = pipeCenterX(i);
        const pw  = PIPE_W * W;
        const ph  = PIPES[i].hFrac * H;
        const px  = cx - pw / 2;
        const py  = H - ph;
        const { hue } = PIPES[i];
        const isSub = submerged[i];

        ctx.save();
        if (isSub) {
          ctx.shadowBlur  = 16 * dpr;
          ctx.shadowColor = `hsl(${hue}, 90%, 65%)`;
        }
        ctx.fillStyle = isSub
          ? `hsla(${hue}, 82%, 62%, 0.95)`
          : `hsla(${hue}, 65%, 52%, 0.50)`;
        /* rounded-top pipe using quadraticCurveTo */
        const r = Math.min(pw / 2, 5);
        ctx.beginPath();
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + pw - r, py);
        ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
        ctx.lineTo(px + pw, py + ph);
        ctx.lineTo(px, py + ph);
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      /* water fill (covers lower portion of pipes) */
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const [wx, wy] of pts) ctx.lineTo(wx, wy);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 140, 215, 0.22)";
      ctx.fill();

      /* water surface highlight */
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.strokeStyle = "rgba(130, 225, 255, 0.60)";
      ctx.lineWidth   = 1.8;
      ctx.stroke();

      /* secondary under-surface glow */
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1] + 6);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1] + 6);
      ctx.strokeStyle = "rgba(60, 180, 240, 0.18)";
      ctx.lineWidth   = 4;
      ctx.stroke();

      /* splash droplets (additive) */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let k = droplets.length - 1; k >= 0; k--) {
        const d = droplets[k];
        d.x  += d.vx;
        d.y  += d.vy;
        d.vy += 0.28;
        d.vx *= 0.97;
        d.a  *= 0.87;
        if (d.a < 0.04) { droplets.splice(k, 1); continue; }
        ctx.beginPath();
        ctx.arc(d.x, d.y, Math.max(0.8, 2.8 * d.a), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150, 225, 255, ${d.a.toFixed(2)})`;
        ctx.fill();
      }
      ctx.restore();

      /* hint text — fades after first tap */
      if (impulses.length === 0) {
        const age    = Math.min(t / 2, 1);
        const alpha  = (0.30 * age).toFixed(2);
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = `14px ui-monospace, monospace`;
        ctx.fillStyle    = `rgba(255,255,255,${alpha})`;
        ctx.fillText("tap to make waves  ∿", W / 2, H * 0.22);
      }
    }

    /* ── tap handler ── */
    function onDown(e: PointerEvent) {
      e.preventDefault();
      initAudio();
      const rect = canvas.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const t    = (performance.now() - startTs) / 1000;
      impulses.push({ x, t });
      if (impulses.length > 14) impulses.shift();

      /* spawn splash droplets at water surface */
      const wy = getWaterY(x, t);
      for (let k = 0; k < 9; k++) {
        const ang = -Math.PI * (0.25 + 0.5 * Math.random());
        const spd = 2.5 + Math.random() * 3.8;
        droplets.push({
          x:  x + (Math.random() - 0.5) * 18,
          y:  wy,
          vx: Math.cos(ang + (Math.random() - 0.5) * 0.9) * spd,
          vy: Math.sin(ang) * spd,
          a:  0.80 + Math.random() * 0.18,
        });
      }
      if (droplets.length > 120) droplets.splice(0, droplets.length - 120);
    }
    canvas.addEventListener("pointerdown", onDown);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      void actx?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#020814] text-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h1 className="text-xl font-serif tracking-wide">Wave Organ</h1>
          <p className="text-base text-white/75 mt-0.5">
            Ocean waves play the pipes · tap to make waves
          </p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-white/55 hover:text-white/80 transition-colors"
        >
          ← Dream Lab
        </Link>
      </header>

      <canvas
        ref={canvasRef}
        className="flex-1 w-full touch-none select-none cursor-pointer"
        style={{ display: "block" }}
      />

      <footer className="px-4 py-2 border-t border-white/10 shrink-0 flex items-center justify-between">
        <span className="text-xs text-white/55">
          For kids 3+ · Zero permissions · Zero API · Zero deps
        </span>
        <Link
          href="/dream/190-kids-wave-organ/README.md"
          className="text-xs text-white/55 hover:text-white/75 transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
