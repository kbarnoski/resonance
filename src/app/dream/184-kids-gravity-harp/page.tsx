"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── 6 harp strings: top = highest pitch (BANDIMAL rule) ── */
const STRINGS = [
  { yFrac: 0.18, freq: 523.25, color: "#c084fc", vfreq: 8.0 }, // C5 violet
  { yFrac: 0.30, freq: 440.00, color: "#34d399", vfreq: 7.0 }, // A4 emerald
  { yFrac: 0.42, freq: 392.00, color: "#fb923c", vfreq: 6.0 }, // G4 amber
  { yFrac: 0.54, freq: 329.63, color: "#f472b6", vfreq: 5.0 }, // E4 rose
  { yFrac: 0.66, freq: 293.66, color: "#38bdf8", vfreq: 4.5 }, // D4 sky
  { yFrac: 0.78, freq: 261.63, color: "#a78bfa", vfreq: 4.0 }, // C4 lavender
] as const;

const N = STRINGS.length;
const BALL_R = 22;
const GRAV = 0.30;
const MAX_BALLS = 8;

type Ball  = { id: number; x: number; y: number; vx: number; vy: number; color: string };
type Spark = { x: number; y: number; vx: number; vy: number; a: number; color: string };

let gid = 0;

/* Karplus-Strong buffer: delay-line + IIR lowpass + feedback */
function buildKS(actx: AudioContext, freq: number): AudioBuffer {
  const P   = Math.round(actx.sampleRate / freq);
  const len = P * 700;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0;  i < P;   i++) d[i] = Math.random() * 2 - 1;
  for (let i = P;  i < len; i++) d[i] = 0.997 * 0.5 * (d[i - P] + d[i - 1]);
  return buf;
}

function fireKS(actx: AudioContext, buf: AudioBuffer, dest: AudioNode, vol: number) {
  const g   = actx.createGain();
  g.gain.value = Math.max(0.10, Math.min(0.92, vol));
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(g);
  g.connect(dest);
  src.start();
}

export default function KidsGravityHarpPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;
    const dpr    = Math.min(window.devicePixelRatio || 1, 3);
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

    /* ── audio ── */
    let actx: AudioContext | null = null;
    let dest: GainNode | null = null;
    const ksBufs: AudioBuffer[] = [];

    function initAudio() {
      if (actx) return;
      actx = new AudioContext();
      if (actx.state === "suspended") void actx.resume();
      dest = actx.createGain();
      dest.gain.value = 0.85;
      dest.connect(actx.destination);
      for (const s of STRINGS) ksBufs.push(buildKS(actx, s.freq));
      /* ambient C2 + G2 pad */
      const padFreqs  = [65.41, 98.00];
      const padGains  = [0.010, 0.007];
      for (let p = 0; p < 2; p++) {
        const osc = actx.createOscillator();
        const gn  = actx.createGain();
        osc.frequency.value = padFreqs[p];
        gn.gain.value       = padGains[p];
        osc.connect(gn);
        gn.connect(dest);
        osc.start();
      }
    }

    /* ── physics state ── */
    const balls: Ball[]  = [];
    const vibs           = Array.from({ length: N }, () => ({ amp: 0 }));
    const lastPluck      = new Array<number>(N).fill(0);
    const sparks: Spark[] = [];
    const hint           = { shown: true };

    function dropBall(px: number) {
      if (balls.length >= MAX_BALLS) balls.shift();
      balls.push({
        id:    gid++,
        x:     Math.max(BALL_R, Math.min(W - BALL_R, px)),
        y:     -BALL_R,
        vx:    (Math.random() - 0.5) * 0.8,
        vy:    0.5,
        color: STRINGS[Math.floor(Math.random() * N)].color,
      });
    }

    /* auto-spawn two demo balls so canvas is immediately alive */
    const t1 = setTimeout(() => { if (W > 0) dropBall(W * 0.30); }, 300);
    const t2 = setTimeout(() => { if (W > 0) dropBall(W * 0.68); }, 950);

    /* ── pointer events ── */
    function onDown(e: PointerEvent) {
      e.preventDefault();
      initAudio();
      hint.shown = false;
      const rect = canvas.getBoundingClientRect();
      dropBall(e.clientX - rect.left);
    }
    canvas.addEventListener("pointerdown", onDown);

    /* ── render loop ── */
    let raf = 0;
    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (W === 0 || H === 0) return;

      ctx.fillStyle = "#060310";
      ctx.fillRect(0, 0, W, H);

      const strY   = Array.from(STRINGS, s => s.yFrac * H);
      const floorY = H * 0.92;

      /* decay string vibrations */
      for (const v of vibs) { if (v.amp > 0.01) v.amp *= 0.97; else v.amp = 0; }

      /* update sparks */
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.14;
        sp.vx *= 0.97;
        sp.a  *= 0.91;
        if (sp.a < 0.03) sparks.splice(i, 1);
      }

      /* update balls */
      for (const b of balls) {
        const prevY = b.y;
        b.vy = Math.min(b.vy + GRAV, 22);
        b.y += b.vy;
        b.x += b.vx;

        /* side walls */
        if (b.x < BALL_R)     { b.x = BALL_R;     b.vx = Math.abs(b.vx) * 0.72; }
        if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.72; }

        /* floor elastic bounce */
        if (b.y + BALL_R >= floorY && b.vy > 0) {
          b.y  = floorY - BALL_R;
          b.vy *= -0.80;
          b.vx *= 0.92;
          if (Math.abs(b.vy) < 1.5) b.vy = 0; // settle
        }

        /* string crossing — pass-through with energy loss */
        if (b.vy !== 0) {
          for (let i = 0; i < N; i++) {
            const sy      = strY[i];
            const crossed = (prevY < sy && b.y >= sy) || (prevY > sy && b.y <= sy);
            if (crossed && ts - lastPluck[i] > 90) {
              lastPluck[i] = ts;
              const speed  = Math.abs(b.vy);
              b.vy  *= 0.62;           // absorb 38% kinetic energy, keep direction
              b.color = STRINGS[i].color;
              vibs[i].amp = Math.min(1, vibs[i].amp + 0.55 + speed * 0.04);
              /* sparks at contact point */
              for (let k = 0; k < 10; k++) {
                const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.3;
                const spd = 1.5 + Math.random() * 3.5;
                sparks.push({
                  x: b.x, y: sy,
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd,
                  a:  0.90,
                  color: STRINGS[i].color,
                });
              }
              if (sparks.length > 180) sparks.splice(0, sparks.length - 180);
              /* KS pluck */
              if (actx && dest && ksBufs[i]) {
                fireKS(actx, ksBufs[i], dest, 0.12 + speed * 0.07);
              }
              break; // one string per frame per ball
            }
          }
        }

        /* recycle off-bottom */
        if (b.y > H + BALL_R) {
          b.y  = -BALL_R;
          b.x  = BALL_R + Math.random() * (W - 2 * BALL_R);
          b.vy = 0.5;
          b.vx = (Math.random() - 0.5) * 0.8;
        }
      }

      /* draw strings */
      for (let i = 0; i < N; i++) {
        const s   = STRINGS[i];
        const sy  = strY[i];
        const amp = vibs[i].amp;
        ctx.beginPath();
        ctx.lineWidth   = 2.5 + amp * 2;
        ctx.strokeStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur  = amp > 0.04 ? 8 + amp * 24 : 4;
        if (amp > 0.02) {
          /* vibrating string: fundamental mode shape sin(πt) × oscillator */
          const steps = 80;
          ctx.moveTo(0, sy);
          for (let n = 1; n <= steps; n++) {
            const t    = n / steps;
            const wave = amp * 16 * Math.sin(Math.PI * t)
                       * Math.cos(s.vfreq * 2 * Math.PI * ts * 0.001);
            ctx.lineTo(t * W, sy + wave);
          }
        } else {
          ctx.moveTo(0, sy);
          ctx.lineTo(W, sy);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      /* draw sparks */
      for (const sp of sparks) {
        ctx.globalAlpha = sp.a;
        ctx.fillStyle   = sp.color;
        ctx.shadowColor = sp.color;
        ctx.shadowBlur  = 5;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, Math.max(0.5, 3 * sp.a), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;

      /* draw balls */
      for (const b of balls) {
        ctx.shadowColor = b.color;
        ctx.shadowBlur  = 18;
        ctx.fillStyle   = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        /* specular highlight */
        ctx.fillStyle  = "rgba(255,255,255,0.28)";
        ctx.beginPath();
        ctx.arc(b.x - 5, b.y - 6, BALL_R * 0.36, 0, Math.PI * 2);
        ctx.fill();
      }

      /* hint text */
      if (hint.shown) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = "15px ui-monospace, monospace";
        ctx.fillStyle    = "rgba(255,255,255,0.28)";
        ctx.fillText("tap to drop a ball  ✦", W / 2, H * 0.50);
      }
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      void actx?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Gravity Harp</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Drop a ball · watch it bounce through the strings
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
        className="flex-1 w-full touch-none select-none cursor-pointer"
        style={{ display: "block" }}
      />

      <footer className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          For kids 3+ · Zero permissions · Zero API · Zero deps
        </span>
        <Link
          href="/dream/184-kids-gravity-harp/README.md"
          className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
