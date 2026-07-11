"use client";
import { useEffect, useRef, useState } from "react";

// 9 pentatonic pitches C3→C5 (Hz)
const FREQS = [131.0, 165.0, 196.0, 220.0, 262.0, 330.0, 392.0, 440.0, 523.0];
const CLRS = [
  "#a78bfa", "#818cf8", "#38bdf8", "#2dd4bf",
  "#86efac", "#fcd34d", "#fb923c", "#f87171", "#f0abfc",
];
const N = FREQS.length;

const STEP_PX  = 46;    // drag distance between stars
const MAX_CONS = 6;     // max simultaneous completed constellations
const LIFE_MS  = 16000; // ms before arpeggio
const ARPEG_MS = 3000;  // arpeggio duration ms
const FADE_MS  = 3500;  // fade-out duration ms

interface Star { x: number; y: number; p: number; }
interface Con  { id: number; stars: Star[]; born: number; phase: "live"|"arping"|"fading"; arped: boolean; alpha: number; }
interface Draft { x: number; y: number; dist: number; stars: Star[]; }

// Karplus-Strong pluck synthesis — pre-computed 2.5 s buffer per pitch
function buildKS(actx: AudioContext, freq: number): AudioBuffer {
  const sr = actx.sampleRate;
  const total = Math.ceil(sr * 2.5);
  const P = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(P);
  for (let i = 0; i < P; i++) ring[i] = Math.random() * 2 - 1;
  const out = new Float32Array(total);
  let ptr = 0;
  for (let i = 0; i < total; i++) {
    const a = ring[ptr], b = ring[(ptr + 1) % P];
    out[i] = a;
    ring[ptr] = (a + b) * 0.498;
    ptr = (ptr + 1) % P;
  }
  const buf = actx.createBuffer(1, total, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

function playKS(actx: AudioContext, buf: AudioBuffer, gain: number, when: number) {
  const src = actx.createBufferSource();
  src.buffer = buf;
  const gn = actx.createGain();
  gn.gain.value = gain;
  src.connect(gn);
  gn.connect(actx.destination);
  src.start(when);
}

function startPad(actx: AudioContext) {
  ([
    [131.0, 0.012],
    [165.0, 0.008],
    [196.0, 0.006],
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
}

function pitchAt(y: number, h: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, y / h))) * (N - 1));
}

function drawStarShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export default function KidsStarPaintPage() {
  const [started, setStarted] = useState(false);
  const cvRef    = useRef<HTMLCanvasElement>(null);
  const actxRef  = useRef<AudioContext | null>(null);
  const bufsRef  = useRef<AudioBuffer[]>([]);
  const consRef  = useRef<Con[]>([]);
  const draftsRef = useRef<Map<number, Draft>>(new Map());
  const bgRef    = useRef<{ x: number; y: number; r: number; phase: number }[]>([]);
  const uidRef   = useRef(0);
  const startRef = useRef(0);

  function handleStart() {
    const actx = new AudioContext();
    actxRef.current = actx;
    bufsRef.current = FREQS.map(f => buildKS(actx, f));
    startPad(actx);
    startRef.current = performance.now();
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width  = cv.offsetWidth  * dpr;
      cv.height = cv.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = cv.offsetWidth, h = cv.offsetHeight;
      bgRef.current = Array.from({ length: 90 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const p = pitchAt(y, cv.offsetHeight);
      draftsRef.current.set(e.pointerId, { x, y, dist: 0, stars: [{ x, y, p }] });
      const actx = actxRef.current;
      if (actx) {
        if (actx.state === "suspended") void actx.resume();
        playKS(actx, bufsRef.current[p], 0.55, actx.currentTime);
      }
      cv.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const draft = draftsRef.current.get(e.pointerId);
      if (!draft) return;
      const rect = cv.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      draft.dist += Math.hypot(nx - draft.x, ny - draft.y);
      draft.x = nx;
      draft.y = ny;
      const actx = actxRef.current;
      while (draft.dist >= STEP_PX) {
        draft.dist -= STEP_PX;
        const p = pitchAt(ny, cv.offsetHeight);
        draft.stars.push({ x: nx, y: ny, p });
        if (actx && bufsRef.current[p]) {
          playKS(actx, bufsRef.current[p], 0.48, actx.currentTime);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const draft = draftsRef.current.get(e.pointerId);
      if (!draft) return;
      draftsRef.current.delete(e.pointerId);
      if (!draft.stars.length) return;
      if (consRef.current.length >= MAX_CONS) consRef.current.shift();
      consRef.current.push({
        id: uidRef.current++,
        stars: draft.stars,
        born: performance.now(),
        phase: "live",
        arped: false,
        alpha: 1,
      });
    };

    cv.addEventListener("pointerdown", onDown, { passive: false });
    cv.addEventListener("pointermove", onMove, { passive: false });
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);

    const drawCon = (stars: Star[], alpha: number, pulse: number) => {
      if (!stars.length) return;
      // Connecting lines
      if (stars.length > 1) {
        ctx.save();
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = alpha * 0.52;
        ctx.shadowBlur = 4;
        for (let i = 1; i < stars.length; i++) {
          const a = stars[i - 1], b = stars[i];
          const col = CLRS[Math.round((a.p + b.p) / 2)];
          ctx.strokeStyle = col;
          ctx.shadowColor = col;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.restore();
      }
      // Star shapes
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 10 + pulse * 7;
      for (const s of stars) {
        const col = CLRS[s.p];
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        drawStarShape(ctx, s.x, s.y, 4.5 + pulse * 2);
      }
      ctx.restore();
    };

    let raf = 0;
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const w = cv.offsetWidth, h = cv.offsetHeight;
      const now = performance.now();
      const since = now - startRef.current;

      // Background
      ctx.fillStyle = "#08080e";
      ctx.fillRect(0, 0, w, h);

      // Twinkling background stars
      ctx.fillStyle = "#ffffff";
      for (const s of bgRef.current) {
        const a = 0.06 + 0.1 * Math.sin(ts * 0.0007 + s.phase);
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Hint (first 9 s)
      if (since < 9000) {
        const t = since / 9000;
        const fade = since < 2000 ? since / 2000 : Math.max(0, 1 - (since - 6000) / 3000);
        ctx.save();
        ctx.globalAlpha = fade * 0.6;
        ctx.fillStyle = "#ffffff";
        ctx.font = `${16 + (1 - t) * 4}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("Draw across the sky ✦", w / 2, h - 46);
        ctx.restore();
      }

      // Active drafts
      for (const d of draftsRef.current.values()) {
        drawCon(d.stars, 0.88, 0);
      }

      // Completed constellations — age management + draw
      const dead: number[] = [];
      for (const con of consRef.current) {
        const age = now - con.born;

        if (con.phase === "live" && age >= LIFE_MS) {
          con.phase = "arping";
        }

        if (con.phase === "arping" && !con.arped) {
          con.arped = true;
          const actx = actxRef.current;
          if (actx) {
            const pitches = [...new Set(con.stars.map(s => s.p))].sort((a, b) => b - a);
            const step = (ARPEG_MS / 1000) / Math.max(1, pitches.length);
            const t0 = actx.currentTime;
            pitches.forEach((p, i) => {
              if (bufsRef.current[p]) {
                playKS(actx, bufsRef.current[p], 0.38, t0 + i * step * 0.7);
              }
            });
          }
        }

        if (con.phase === "arping" && age >= LIFE_MS + ARPEG_MS) {
          con.phase = "fading";
        }

        if (con.phase === "fading") {
          con.alpha = Math.max(0, 1 - (age - LIFE_MS - ARPEG_MS) / FADE_MS);
          if (con.alpha <= 0) { dead.push(con.id); continue; }
        }

        const pulse = con.phase === "arping"
          ? Math.max(0, Math.sin((age - LIFE_MS) * 0.007))
          : 0;

        drawCon(con.stars, con.alpha, pulse);
      }
      consRef.current = consRef.current.filter(c => !dead.includes(c.id));
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      void actxRef.current?.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#08080e] text-foreground gap-6 px-6 text-center select-none">
        <h1 className="text-3xl font-bold">Star Song</h1>
        <p className="text-muted-foreground text-base max-w-xs leading-relaxed">
          Draw a path across the night sky —<br />
          every star you paint will sing.
        </p>
        <button
          onClick={handleStart}
          className="mt-2 bg-violet-600/80 hover:bg-violet-500/90 active:scale-95 transition-transform text-foreground text-xl font-bold px-8 py-4 rounded-2xl min-h-[60px] min-w-[180px]"
        >
          ✦ Let&apos;s paint!
        </button>
        <p className="text-xs text-muted-foreground">
          For kids 3+ · No mic needed · Zero permissions
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full bg-[#08080e] overflow-hidden select-none">
      <canvas
        ref={cvRef}
        className="w-full h-full touch-none"
        style={{ cursor: "none" }}
      />
      <a
        href="README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 right-4 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        design notes
      </a>
    </div>
  );
}
