"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── pentatonic scale: C3 / E3 / G3 / A3 ── */
const NOTES = [
  { freq: 130.81, hue: 268 }, // violet  C3
  { freq: 164.81, hue: 160 }, // teal    E3
  { freq: 196.00, hue:  42 }, // amber   G3
  { freq: 220.00, hue: 345 }, // rose    A3
] as const;

const N_NOTES  = NOTES.length;
const TRAIL    = 480;      // trail points per turtle
const CR2_CSS  = 11 * 11;  // crossing detection radius² in CSS px²
const COOL     = 700;      // ms between notes per turtle
const FOOD_MS  = 3500;     // food pellet lifetime ms
const SPD_CSS  = 1.4;      // speed in CSS px per frame

type Pt     = { x: number; y: number };
type Turtle = { x: number; y: number; heading: number; trail: Pt[]; lastMs: number };
type Food   = { x: number; y: number; born: number };

function spawnTurtles(W: number, H: number): Turtle[] {
  return Array.from({ length: N_NOTES }, (_, i) => {
    const a = (i / N_NOTES) * Math.PI * 2;
    return {
      x: W / 2 + Math.cos(a) * W * 0.24,
      y: H / 2 + Math.sin(a) * H * 0.22,
      heading: a + Math.PI,
      trail: [],
      lastMs: -9999,
    };
  });
}

export default function KidsTurtleTrailPage() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const actxRef     = useRef<AudioContext | null>(null);
  const gainRefs    = useRef<GainNode[]>([]);
  const tsRef       = useRef<Turtle[]>([]);
  const foodRef     = useRef<Food | null>(null);
  const rafRef      = useRef(0);
  const dprRef      = useRef(1);
  const hintRef     = useRef(true);
  const audioOnRef  = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;

    function resize() {
      dprRef.current = Math.min(window.devicePixelRatio || 1, 3);
      if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
        canvas.width  = canvas.offsetWidth  * dprRef.current;
        canvas.height = canvas.offsetHeight * dprRef.current;
        ctx.fillStyle = "#03020a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      tsRef.current = spawnTurtles(canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    /* ── audio (deferred to first tap) ── */
    function initAudio() {
      if (audioOnRef.current) return;
      audioOnRef.current = true;
      const actx = new AudioContext();
      if (actx.state === "suspended") void actx.resume();
      actxRef.current = actx;

      /* short plate reverb */
      const irLen = Math.round(actx.sampleRate * 2.0);
      const ir    = actx.createBuffer(2, irLen, actx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let k = 0; k < irLen; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-5 * k / irLen);
      }
      const conv = actx.createConvolver();
      conv.buffer = ir;
      const wet = actx.createGain(); wet.gain.value = 0.55;
      conv.connect(wet); wet.connect(actx.destination);
      const dry = actx.createGain(); dry.gain.value = 0.45;
      dry.connect(actx.destination);

      /* ambient drone: C3 + G3 */
      for (const f of [130.81, 196.00]) {
        const o = actx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = actx.createGain(); g.gain.value = 0.018;
        o.connect(g); g.connect(actx.destination); o.start();
      }

      /* 4 turtle oscillators */
      gainRefs.current = [];
      for (let i = 0; i < N_NOTES; i++) {
        const o = actx.createOscillator(); o.type = "triangle"; o.frequency.value = NOTES[i].freq;
        const g = actx.createGain(); g.gain.value = 0;
        o.connect(g); g.connect(conv); g.connect(dry); o.start();
        gainRefs.current.push(g);
      }
    }

    function playNote(idx: number) {
      const actx = actxRef.current;
      const g    = gainRefs.current[idx];
      if (!actx || !g) return;
      const t = actx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    }

    /* ── pointer: start audio and place food pellet ── */
    function onDown(e: PointerEvent) {
      e.preventDefault();
      initAudio();
      hintRef.current = false;
      const rect = canvas.getBoundingClientRect();
      const dpr  = dprRef.current;
      foodRef.current = {
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top)  * dpr,
        born: performance.now(),
      };
    }

    canvas.addEventListener("pointerdown", onDown);

    /* ── main loop ── */
    let frame = 0;

    function tick() {
      rafRef.current = requestAnimationFrame(tick);
      frame++;
      const W   = canvas.width;
      const H   = canvas.height;
      const dpr = dprRef.current;
      const spd = SPD_CSS * dpr;
      const cr2 = CR2_CSS * dpr * dpr;
      const now = performance.now();

      if (foodRef.current && now - foodRef.current.born > FOOD_MS) foodRef.current = null;

      /* dim background — old trail segments slowly fade */
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,2,10,0.22)";
      ctx.fillRect(0, 0, W, H);

      const turtles = tsRef.current;
      const food    = foodRef.current;

      for (let i = 0; i < N_NOTES; i++) {
        const t = turtles[i];

        /* heading: steer toward food or wander randomly */
        if (food) {
          const dx = food.x - t.x, dy = food.y - t.y;
          if (dx * dx + dy * dy > 9) {
            let dh = Math.atan2(dy, dx) - t.heading;
            while (dh >  Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            t.heading += dh * 0.09;
          }
        } else {
          t.heading += (Math.random() - 0.5) * 0.11;
        }

        /* steer toward center when near canvas edge */
        if (t.x < W * 0.08 || t.x > W * 0.92 || t.y < H * 0.08 || t.y > H * 0.92) {
          let dh = Math.atan2(H / 2 - t.y, W / 2 - t.x) - t.heading;
          while (dh >  Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          t.heading += dh * 0.07;
        }

        t.x = Math.max(3, Math.min(W - 3, t.x + Math.cos(t.heading) * spd));
        t.y = Math.max(3, Math.min(H - 3, t.y + Math.sin(t.heading) * spd));

        t.trail.push({ x: t.x, y: t.y });
        if (t.trail.length > TRAIL) t.trail.shift();

        /* crossing detection: every other frame, stride-4 sampling */
        if (frame % 2 === 0 && now - t.lastMs > COOL) {
          const hit = turtles.some((other, j) => {
            if (j === i) return false;
            const otr = other.trail;
            const end = otr.length - 30; /* skip most recent points to avoid false hits */
            if (end <= 0) return false;
            for (let k = 0; k < end; k += 4) {
              const p  = otr[k];
              const dx = t.x - p.x, dy = t.y - p.y;
              if (dx * dx + dy * dy < cr2) return true;
            }
            return false;
          });
          if (hit) {
            t.lastMs = now;
            playNote(i);
          }
        }
      }

      /* draw trails (additive for glow) */
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < N_NOTES; i++) {
        const tr = turtles[i].trail;
        if (tr.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(tr[0].x, tr[0].y);
        for (let k = 1; k < tr.length; k++) ctx.lineTo(tr[k].x, tr[k].y);
        ctx.strokeStyle = `hsla(${NOTES[i].hue},85%,65%,0.45)`;
        ctx.lineWidth   = 2.5 * dpr;
        ctx.stroke();
      }

      /* draw turtle heads with radial glow */
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < N_NOTES; i++) {
        const t = turtles[i];
        const h = NOTES[i].hue;
        const r = 8 * dpr;
        const glow = ctx.createRadialGradient(t.x, t.y, r * 0.3, t.x, t.y, r * 2.4);
        glow.addColorStop(0, `hsla(${h},90%,80%,0.92)`);
        glow.addColorStop(1, `hsla(${h},80%,60%,0.00)`);
        ctx.beginPath(); ctx.arc(t.x, t.y, r * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = glow; ctx.fill();
        ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h},90%,80%,0.95)`; ctx.fill();
      }

      /* draw food pellet with fading ring */
      if (food) {
        const age   = Math.min(1, (now - food.born) / FOOD_MS);
        const alpha = Math.max(0, 1 - age * 1.4);
        ctx.beginPath(); ctx.arc(food.x, food.y, 8 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,240,150,${alpha})`; ctx.fill();
        ctx.beginPath(); ctx.arc(food.x, food.y, (14 + age * 8) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,240,150,${alpha * 0.35})`;
        ctx.lineWidth = 1.5 * dpr; ctx.stroke();
      }

      /* hint text (before first tap) */
      if (hintRef.current) {
        ctx.globalCompositeOperation = "source-over";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = `${Math.round(14 * dpr)}px ui-monospace, monospace`;
        ctx.fillStyle    = "rgba(255,255,255,0.35)";
        ctx.fillText("tap anywhere to drop a treat", W / 2, H * 0.88);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      void actxRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#03020a] text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-serif tracking-wide">Turtle Trail</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Four turtles wander and play notes when their paths cross
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
          href="/dream/194-kids-turtle-trail/README.md"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
