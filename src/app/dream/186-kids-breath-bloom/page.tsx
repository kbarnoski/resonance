"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── five pentatonic notes: C3 E3 G3 A3 C4 ── */
const PETALS = [
  { freq: 130.81, hue: 268 }, // violet  C3
  { freq: 164.81, hue: 130 }, // emerald E3
  { freq: 196.00, hue:  42 }, // amber   G3
  { freq: 220.00, hue: 345 }, // rose    A3
  { freq: 261.63, hue: 192 }, // cyan    C4
] as const;
const N = PETALS.length;
const BREATH_DUR = 9.0; // seconds per full cycle

type Spark = { x: number; y: number; vx: number; vy: number; a: number; r: number; hue: number };

/* smooth cosine breath: 0 = fully exhaled, 1 = fully inhaled */
function breathVal(t: number, offset = 0): number {
  const norm = ((t + offset) % BREATH_DUR) / BREATH_DUR;
  return (1 - Math.cos(2 * Math.PI * norm)) / 2;
}

export default function BreathBloomPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef   = useRef<AudioContext | null>(null);
  const rafRef    = useRef<number>(0);
  const dprRef    = useRef<number>(1);
  const gainRefs  = useRef<GainNode[]>([]);
  const glowRef   = useRef<number[]>(Array.from({ length: N }, () => 0));
  const sparksRef = useRef<Spark[]>([]);
  const hintRef   = useRef<boolean>(true);
  const startTRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    startTRef.current = performance.now();

    function resize() {
      dprRef.current = Math.min(window.devicePixelRatio || 1, 3);
      if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
        canvas.width  = canvas.offsetWidth  * dprRef.current;
        canvas.height = canvas.offsetHeight * dprRef.current;
      }
    }
    resize();
    window.addEventListener("resize", resize);

    /* ── audio init (called on first tap to satisfy autoplay policy) ── */
    function initAudio() {
      if (actxRef.current) return;
      const actx = new AudioContext();
      if (actx.state === "suspended") void actx.resume();
      actxRef.current = actx;

      /* short reverb impulse response */
      const rate  = actx.sampleRate;
      const irLen = Math.floor(rate * 3.5);
      const ir    = actx.createBuffer(2, irLen, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.exp(-5 * i / irLen);
        }
      }
      const conv = actx.createConvolver();
      conv.buffer = ir;

      const revGain = actx.createGain();
      revGain.gain.setValueAtTime(0.22, actx.currentTime);
      conv.connect(revGain);
      revGain.connect(actx.destination);

      const dryGain = actx.createGain();
      dryGain.gain.setValueAtTime(0.06, actx.currentTime);
      dryGain.connect(actx.destination);

      gainRefs.current = [];
      for (let i = 0; i < N; i++) {
        const osc = actx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(PETALS[i].freq, actx.currentTime);
        const g = actx.createGain();
        g.gain.setValueAtTime(0, actx.currentTime);
        osc.connect(g);
        g.connect(conv);
        g.connect(dryGain);
        osc.start();
        gainRefs.current.push(g);
      }
    }

    function spawnSparks(x: number, y: number, hue: number) {
      const dpr = dprRef.current;
      for (let k = 0; k < 16; k++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (2 + Math.random() * 4) * dpr;
        sparksRef.current.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.5 * dpr,
          a:  0.90 + Math.random() * 0.10,
          r:  (1.5 + Math.random() * 2.0) * dpr,
          hue,
        });
      }
      if (sparksRef.current.length > 300) sparksRef.current = sparksRef.current.slice(-300);
    }

    /* petal position + breath phase, staggered per index */
    function petalXYPhase(
      i: number, t: number,
      cx: number, cy: number, minD: number
    ): [number, number, number] {
      const angle  = (i / N) * Math.PI * 2 - Math.PI / 2;
      const offset = (i / N) * BREATH_DUR * 0.35;
      const phase  = breathVal(t, offset);
      const dist   = minD * (0.22 + 0.14 * phase);
      return [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, phase];
    }

    function onDown(e: PointerEvent) {
      e.preventDefault();
      initAudio();
      hintRef.current = false;

      const rect  = canvas.getBoundingClientRect();
      const sx    = canvas.width  / rect.width;
      const sy    = canvas.height / rect.height;
      const tapX  = (e.clientX - rect.left) * sx;
      const tapY  = (e.clientY - rect.top)  * sy;
      const t     = (performance.now() - startTRef.current) / 1000;
      const W     = canvas.width;
      const H     = canvas.height;
      const cx    = W / 2;
      const cy    = H / 2;
      const minD  = Math.min(W, H) * 0.5;

      /* find nearest petal */
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < N; i++) {
        const [px, py] = petalXYPhase(i, t, cx, cy, minD);
        const d = Math.hypot(tapX - px, tapY - py);
        if (d < bestD) { bestD = d; bestI = i; }
      }

      /* generously large hit radius — any tap on the canvas fires something */
      if (bestD > minD * 0.45) {
        /* tap in open space: bloom all petals (center tap reward) */
        for (let i = 0; i < N; i++) {
          glowRef.current[i] = Math.max(glowRef.current[i], 0.65);
        }
        spawnSparks(tapX, tapY, 280);
        const actx = actxRef.current;
        if (actx) {
          const now = actx.currentTime;
          for (let i = 0; i < N; i++) {
            const g = gainRefs.current[i];
            if (!g) continue;
            g.gain.cancelScheduledValues(now);
            g.gain.setValueAtTime(0.20, now);
            g.gain.setTargetAtTime(0, now + 0.12, 0.50);
          }
        }
      } else {
        /* tap near a petal: flash that petal */
        glowRef.current[bestI] = 1.0;
        spawnSparks(tapX, tapY, PETALS[bestI].hue);
        const actx = actxRef.current;
        const g    = actxRef.current ? gainRefs.current[bestI] : null;
        if (actx && g) {
          const now = actx.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(0.42, now);
          g.gain.setTargetAtTime(0, now + 0.08, 0.55);
        }
      }
    }

    canvas.addEventListener("pointerdown", onDown);

    /* ── main render loop ── */
    function frame(ts: number) {
      const W    = canvas.width;
      const H    = canvas.height;
      const dpr  = dprRef.current;
      const cx   = W / 2;
      const cy   = H / 2;
      const minD = Math.min(W, H) * 0.5;
      const t    = (ts - startTRef.current) / 1000;
      const master = breathVal(t);

      /* clear */
      ctx.fillStyle = "#02030d";
      ctx.fillRect(0, 0, W, H);

      /* background breath-glow radial */
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, minD * 1.4);
      bgGrad.addColorStop(0,   `rgba(50,30,110,${(0.06 + 0.09 * master).toFixed(3)})`);
      bgGrad.addColorStop(0.55, `rgba(20,10,55,${(0.03 + 0.04 * master).toFixed(3)})`);
      bgGrad.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      /* faint stem lines center → petals */
      for (let i = 0; i < N; i++) {
        const [px, py, phase] = petalXYPhase(i, t, cx, cy, minD);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = `hsla(${PETALS[i].hue},60%,65%,${(0.04 + 0.07 * phase).toFixed(2)})`;
        ctx.lineWidth   = 1.0 * dpr;
        ctx.stroke();
      }

      /* center orb */
      const orbR    = minD * (0.052 + 0.018 * master);
      const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR * 4.5);
      orbGrad.addColorStop(0,    `rgba(220,205,255,${(0.22 + 0.28 * master).toFixed(2)})`);
      orbGrad.addColorStop(0.25, `rgba(160,120,240,${(0.10 + 0.13 * master).toFixed(2)})`);
      orbGrad.addColorStop(0.65, `rgba(90,55,175,${(0.04 + 0.04 * master).toFixed(2)})`);
      orbGrad.addColorStop(1,    "rgba(0,0,0,0)");
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = `rgba(210,195,255,${(0.55 + 0.32 * master).toFixed(2)})`;
      ctx.shadowBlur  = 14 * dpr;
      ctx.fillStyle   = `rgba(220,210,255,${(0.55 + 0.35 * master).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur  = 0;

      /* petals — additive blending for glow */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < N; i++) {
        const [px, py, phase] = petalXYPhase(i, t, cx, cy, minD);
        const flash = glowRef.current[i];
        const glow  = Math.max(flash, phase * 0.55);
        const r     = minD * (0.052 + 0.032 * phase + flash * 0.022);

        /* outer glow halo */
        const halor  = r * 3.8;
        const petalG = ctx.createRadialGradient(px, py, 0, px, py, halor);
        petalG.addColorStop(0,   `hsla(${PETALS[i].hue},90%,80%,${(0.14 + 0.42 * glow).toFixed(2)})`);
        petalG.addColorStop(0.38, `hsla(${PETALS[i].hue},78%,58%,${(0.05 + 0.17 * glow).toFixed(2)})`);
        petalG.addColorStop(1,   "rgba(0,0,0,0)");
        ctx.fillStyle = petalG;
        ctx.beginPath();
        ctx.arc(px, py, halor, 0, Math.PI * 2);
        ctx.fill();

        /* core petal disc */
        ctx.shadowColor = `hsla(${PETALS[i].hue},100%,70%,${(0.45 * glow).toFixed(2)})`;
        ctx.shadowBlur  = 10 * dpr;
        ctx.fillStyle   = `hsla(${PETALS[i].hue},85%,72%,${(0.50 + 0.33 * glow).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur  = 0;

        /* decay tap glow */
        glowRef.current[i] = Math.max(0, flash - 0.026);

        /* audio: smooth gain follows per-petal breath */
        const actx = actxRef.current;
        const g    = gainRefs.current[i];
        if (actx && g) {
          g.gain.setTargetAtTime(phase * 0.22, actx.currentTime, 0.4);
        }
      }
      ctx.restore();

      /* sparks — also additive */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      sparksRef.current = sparksRef.current.filter(sp => sp.a > 0.02);
      for (const sp of sparksRef.current) {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r * sp.a, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${sp.hue},90%,78%,${sp.a.toFixed(2)})`;
        ctx.fill();
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vy += 0.06 * dpr;
        sp.vx *= 0.97;
        sp.a  *= 0.91;
      }
      ctx.restore();

      /* hint */
      if (hintRef.current) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = `${Math.round(14 * dpr)}px ui-monospace, monospace`;
        ctx.fillStyle    = "rgba(255,255,255,0.28)";
        ctx.fillText("tap the petals  ✦", W / 2, H * 0.88);
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      void actxRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-serif tracking-wide">Breath Bloom</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Five glowing petals breathe in unison — tap to bloom
          </p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Dream Lab
        </Link>
      </header>

      <canvas
        ref={canvasRef}
        className="flex-1 w-full touch-none select-none"
        style={{ display: "block" }}
      />

      <footer className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-xs text-muted-foreground/70">
          For kids 3+ · Zero permissions · Zero API · Zero deps
        </span>
        <Link
          href="/dream/186-kids-breath-bloom/README.md"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
