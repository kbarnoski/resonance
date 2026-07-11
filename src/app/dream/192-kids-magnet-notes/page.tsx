"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── six pentatonic notes ── */
const NOTES = [
  { freq: 130.81, hue: 268 }, // violet  C3
  { freq: 164.81, hue: 160 }, // teal    E3
  { freq: 196.00, hue:  42 }, // amber   G3
  { freq: 220.00, hue: 345 }, // rose    A3
  { freq: 261.63, hue: 195 }, // cyan    C4
  { freq: 329.63, hue: 140 }, // emerald E4
] as const;

const N        = NOTES.length;
const ORB_CSS  = 40;  // radius in CSS px → diameter 80px ≥ 64px tap target
const REACT_CSS = 200; // attraction starts at this distance (CSS px)
const VISC     = 0.988;
const ATTRACT  = 0.090; // base attraction per frame (dpr-adjusted units)

type Spark = { x: number; y: number; vx: number; vy: number; a: number; hue: number };
interface Orb {
  x: number; y: number; vx: number; vy: number; flash: number;
}

function buildOrbs(W: number, H: number, dpr: number): Orb[] {
  return Array.from({ length: N }, (_, i) => {
    const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const r = Math.min(W, H) * (0.14 + Math.random() * 0.14);
    return {
      x: W / 2 + Math.cos(angle) * r,
      y: H / 2 + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * 1.8 * dpr,
      vy: (Math.random() - 0.5) * 1.8 * dpr,
      flash: 0,
    };
  });
}

export default function KidsMagnetNotesPage() {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const actxRef       = useRef<AudioContext | null>(null);
  const gainRef       = useRef<GainNode[]>([]);
  const orbRef        = useRef<Orb[]>([]);
  const sparksRef     = useRef<Spark[]>([]);
  const hitSetRef     = useRef<Set<string>>(new Set());
  const rafRef        = useRef<number>(0);
  const dprRef        = useRef<number>(1);
  const hintRef       = useRef<boolean>(true);
  const audioReadyRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    function resize() {
      dprRef.current = Math.min(window.devicePixelRatio || 1, 3);
      if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
        canvas.width  = canvas.offsetWidth  * dprRef.current;
        canvas.height = canvas.offsetHeight * dprRef.current;
      }
      orbRef.current = buildOrbs(canvas.width, canvas.height, dprRef.current);
    }
    resize();
    window.addEventListener("resize", resize);

    /* ── audio (deferred to first tap) ── */
    function startAudio() {
      if (audioReadyRef.current) return;
      audioReadyRef.current = true;
      const actx = new AudioContext();
      if (actx.state === "suspended") void actx.resume();
      actxRef.current = actx;

      /* short plate reverb */
      const irLen = Math.floor(actx.sampleRate * 2.2);
      const ir = actx.createBuffer(2, irLen, actx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let k = 0; k < irLen; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-5 * k / irLen);
      }
      const conv = actx.createConvolver();
      conv.buffer = ir;
      const rev = actx.createGain();
      rev.gain.value = 0.30;
      conv.connect(rev);
      rev.connect(actx.destination);

      const dry = actx.createGain();
      dry.gain.value = 0.07;
      dry.connect(actx.destination);

      gainRef.current = [];
      for (let i = 0; i < N; i++) {
        const osc = actx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = NOTES[i].freq;
        const g = actx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(conv);
        g.connect(dry);
        osc.start();
        gainRef.current.push(g);
      }
    }

    /* ── sparkle burst ── */
    function spawnSparks(x: number, y: number, hue: number, n: number) {
      const dpr = dprRef.current;
      for (let k = 0; k < n; k++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (1.5 + Math.random() * 4.5) * dpr;
        sparksRef.current.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.8 * dpr,
          a: 0.80 + Math.random() * 0.20,
          hue,
        });
      }
      if (sparksRef.current.length > 500) sparksRef.current = sparksRef.current.slice(-500);
    }

    /* ── tap handler ── */
    function onDown(e: PointerEvent) {
      e.preventDefault();
      startAudio();
      hintRef.current = false;

      const rect = canvas.getBoundingClientRect();
      const dpr  = dprRef.current;
      const tx   = (e.clientX - rect.left) * dpr;
      const ty   = (e.clientY - rect.top)  * dpr;
      const orbs = orbRef.current;
      const R    = ORB_CSS * dpr;

      /* find nearest orb */
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = orbs[i].x - tx;
        const dy = orbs[i].y - ty;
        const d  = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; bestI = i; }
      }

      /* flick nearest orb toward the orb it's farthest from */
      if (bestD < R * 4) {
        const orb = orbs[bestI];
        /* pick orb that is furthest in arc opposite to current velocity */
        let targetI = (bestI + Math.floor(N / 2)) % N;
        let maxDist = 0;
        for (let j = 0; j < N; j++) {
          if (j === bestI) continue;
          const dx = orbs[j].x - orb.x;
          const dy = orbs[j].y - orb.y;
          if (Math.hypot(dx, dy) > maxDist) { maxDist = Math.hypot(dx, dy); targetI = j; }
        }
        const dx = orbs[targetI].x - orb.x;
        const dy = orbs[targetI].y - orb.y;
        const dd = Math.hypot(dx, dy) + 0.001;
        const kick = 6 * dpr;
        orb.vx += (dx / dd) * kick;
        orb.vy += (dy / dd) * kick;
        orb.flash = Math.max(orb.flash, 0.8);
        spawnSparks(orb.x, orb.y, NOTES[bestI].hue, 8);
        const actx = actxRef.current;
        const g    = gainRef.current[bestI];
        if (actx && g) {
          const now = actx.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(0.18, now);
          g.gain.setTargetAtTime(0, now + 0.06, 0.40);
        }
      } else {
        /* tap in open space — give all orbs a gentle outward nudge from tap */
        for (let i = 0; i < N; i++) {
          const dx = orbs[i].x - tx;
          const dy = orbs[i].y - ty;
          const dd = Math.hypot(dx, dy) + 0.001;
          orbs[i].vx += (dx / dd) * 2 * dpr;
          orbs[i].vy += (dy / dd) * 2 * dpr;
        }
      }
    }

    canvas.addEventListener("pointerdown", onDown);

    /* ── main loop ── */
    function frame() {
      const W = canvas.width;
      const H = canvas.height;
      const dpr = dprRef.current;
      const R   = ORB_CSS * dpr;
      const AD  = REACT_CSS * dpr;
      const orbs = orbRef.current;
      const actx = actxRef.current;

      /* physics */
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = orbs[j].x - orbs[i].x;
          const dy = orbs[j].y - orbs[i].y;
          const d  = Math.hypot(dx, dy) + 0.001;
          const nx = dx / d;
          const ny = dy / d;

          if (d < R * 2) {
            /* elastic collision — push apart and exchange radial velocity */
            const overlap = R * 2 - d;
            orbs[i].x -= nx * overlap * 0.5;
            orbs[i].y -= ny * overlap * 0.5;
            orbs[j].x += nx * overlap * 0.5;
            orbs[j].y += ny * overlap * 0.5;

            const dvx = orbs[j].vx - orbs[i].vx;
            const dvy = orbs[j].vy - orbs[i].vy;
            const dot = dvx * nx + dvy * ny;
            if (dot < 0) {
              const imp = dot * 0.88;
              orbs[i].vx += imp * nx;
              orbs[i].vy += imp * ny;
              orbs[j].vx -= imp * nx;
              orbs[j].vy -= imp * ny;
            }
          } else if (d < AD) {
            /* magnetic attraction — strongest near contact, zero at edge */
            const t = (d - R * 2) / (AD - R * 2); // 0=near, 1=edge
            const f = ATTRACT * dpr * (1 - t) * (1 - t);
            orbs[i].vx += nx * f;
            orbs[i].vy += ny * f;
            orbs[j].vx -= nx * f;
            orbs[j].vy -= ny * f;
          }
        }

        orbs[i].vx *= VISC;
        orbs[i].vy *= VISC;
        orbs[i].x  += orbs[i].vx;
        orbs[i].y  += orbs[i].vy;

        /* boundary bounce */
        if (orbs[i].x < R)     { orbs[i].x = R;     orbs[i].vx =  Math.abs(orbs[i].vx) * 0.75; }
        if (orbs[i].x > W - R) { orbs[i].x = W - R; orbs[i].vx = -Math.abs(orbs[i].vx) * 0.75; }
        if (orbs[i].y < R)     { orbs[i].y = R;      orbs[i].vy =  Math.abs(orbs[i].vy) * 0.75; }
        if (orbs[i].y > H - R) { orbs[i].y = H - R;  orbs[i].vy = -Math.abs(orbs[i].vy) * 0.75; }
      }

      /* collision sparks + audio spikes */
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = orbs[j].x - orbs[i].x;
          const dy = orbs[j].y - orbs[i].y;
          const d  = Math.hypot(dx, dy);
          const key = `${i}-${j}`;
          if (d < R * 2 + 6) {
            if (!hitSetRef.current.has(key)) {
              hitSetRef.current.add(key);
              const cx = (orbs[i].x + orbs[j].x) / 2;
              const cy = (orbs[i].y + orbs[j].y) / 2;
              spawnSparks(cx, cy, NOTES[i].hue, 12);
              spawnSparks(cx, cy, NOTES[j].hue, 12);
              orbs[i].flash = Math.max(orbs[i].flash, 0.9);
              orbs[j].flash = Math.max(orbs[j].flash, 0.9);
              if (actx) {
                const now = actx.currentTime;
                [gainRef.current[i], gainRef.current[j]].forEach(g => {
                  if (!g) return;
                  g.gain.cancelScheduledValues(now);
                  g.gain.setValueAtTime(0.20, now);
                  g.gain.setTargetAtTime(0, now + 0.05, 0.55);
                });
              }
            }
          } else {
            hitSetRef.current.delete(key);
          }
        }
      }

      /* audio: smooth proximity gain per orb */
      if (actx) {
        const now = actx.currentTime;
        for (let i = 0; i < N; i++) {
          let maxP = 0;
          for (let j = 0; j < N; j++) {
            if (j === i) continue;
            const d = Math.hypot(orbs[j].x - orbs[i].x, orbs[j].y - orbs[i].y);
            if (d < AD) {
              const p = Math.max(0, 1 - (d - R * 2) / (AD - R * 2));
              if (p > maxP) maxP = p;
            }
          }
          const g = gainRef.current[i];
          if (g) g.gain.setTargetAtTime(maxP * maxP * 0.09, now, 0.20);
        }
      }

      /* ── draw ── */
      ctx.fillStyle = "#020310";
      ctx.fillRect(0, 0, W, H);

      /* connection lines between attracted pairs */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = orbs[j].x - orbs[i].x;
          const dy = orbs[j].y - orbs[i].y;
          const d  = Math.hypot(dx, dy);
          if (d < AD) {
            const prox = Math.max(0, 1 - (d - R * 2) / (AD - R * 2));
            if (prox > 0.04) {
              const alpha = prox * prox * 0.50;
              const grad  = ctx.createLinearGradient(orbs[i].x, orbs[i].y, orbs[j].x, orbs[j].y);
              grad.addColorStop(0,   `hsla(${NOTES[i].hue},85%,70%,${alpha.toFixed(3)})`);
              grad.addColorStop(1,   `hsla(${NOTES[j].hue},85%,70%,${alpha.toFixed(3)})`);
              ctx.beginPath();
              ctx.moveTo(orbs[i].x, orbs[i].y);
              ctx.lineTo(orbs[j].x, orbs[j].y);
              ctx.strokeStyle = grad;
              ctx.lineWidth   = (1 + prox * 3) * dpr;
              ctx.stroke();
            }
          }
        }
      }
      ctx.restore();

      /* orb glows + cores */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < N; i++) {
        const orb   = orbs[i];
        const hue   = NOTES[i].hue;
        const flash = orb.flash;

        /* max proximity for glow sizing */
        let maxP = 0;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const d = Math.hypot(orbs[j].x - orb.x, orbs[j].y - orb.y);
          if (d < AD) {
            const p = Math.max(0, 1 - (d - R * 2) / (AD - R * 2));
            if (p > maxP) maxP = p;
          }
        }

        /* outer glow */
        const glowR = R * (1.8 + maxP * 1.4 + flash * 0.7);
        const haloG = ctx.createRadialGradient(orb.x, orb.y, R * 0.2, orb.x, orb.y, glowR);
        haloG.addColorStop(0,   `hsla(${hue},90%,85%,${(0.20 + maxP * 0.35 + flash * 0.25).toFixed(2)})`);
        haloG.addColorStop(0.4, `hsla(${hue},78%,62%,${(0.06 + maxP * 0.14 + flash * 0.18).toFixed(2)})`);
        haloG.addColorStop(1,   "rgba(0,0,0,0)");
        ctx.fillStyle = haloG;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        /* core */
        const coreR = R * (1 + flash * 0.14);
        ctx.fillStyle = `hsla(${hue},85%,80%,${(0.60 + maxP * 0.25 + flash * 0.18).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, coreR, 0, Math.PI * 2);
        ctx.fill();

        orb.flash = Math.max(0, flash - 0.024);
      }
      ctx.restore();

      /* sparkles */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      sparksRef.current = sparksRef.current.filter(sp => sp.a > 0.02);
      for (const sp of sparksRef.current) {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.5 * dpr * sp.a, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${sp.hue},88%,80%,${sp.a.toFixed(2)})`;
        ctx.fill();
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vy += 0.07 * dpr;
        sp.vx *= 0.96;
        sp.a  *= 0.92;
      }
      ctx.restore();

      /* hint */
      if (hintRef.current) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = `${Math.round(14 * dpr)}px ui-monospace, monospace`;
        ctx.fillStyle    = "rgba(255,255,255,0.30)";
        ctx.fillText("tap an orb to send it flying ✦", W / 2, H * 0.90);
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
    <div className="flex flex-col h-screen bg-[#020310] text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-serif tracking-wide">Magnet Notes</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Tap an orb to send it toward the others — notes ring when they meet
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
          href="/dream/192-kids-magnet-notes/README.md"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
