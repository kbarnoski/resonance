"use client";

import { useEffect, useRef, useState } from "react";

// C-major pentatonic: C3..A4 (8 notes)
const PENTA_HZ = [130.81, 164.81, 196.0, 261.63, 329.63, 392.0, 440.0, 523.25];
const SHAPE_COLORS = [
  "#a78bfa", // violet
  "#67e8f9", // cyan
  "#6ee7b7", // emerald
  "#fcd34d", // amber
  "#f9a8d4", // rose
  "#fb923c", // orange
];
const CLOSE_DIST_CSS = 42; // px (CSS units) to auto-close shape
const TRAVERSE_PX_S = 195; // traversal speed in canvas px/s
const NOTE_SPACING_PX = 92; // px between note trigger points
const MAX_SHAPES = 6;
const DENSIFY_STEP = 5; // px between densified path points

type Pt = { x: number; y: number };

interface Shape {
  id: number;
  color: string;
  pts: Pt[]; // densified perimeter points, ~DENSIFY_STEP px apart
  perimPx: number;
  trigIdxs: number[]; // indices into pts where notes fire
  t: number; // 0..1 fractional position along perimeter
  flash: number; // 0..1, decays after each note
}

function densifyClose(raw: Pt[]): { pts: Pt[]; perimPx: number } {
  if (raw.length < 2) return { pts: raw, perimPx: 0 };
  const pts: Pt[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = pts[pts.length - 1];
    const b = raw[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < DENSIFY_STEP) continue;
    const n = Math.ceil(d / DENSIFY_STEP);
    for (let k = 1; k <= n; k++) {
      pts.push({ x: a.x + (dx * k) / n, y: a.y + (dy * k) / n });
    }
  }
  // Stitch closing segment back to pts[0]
  const tail = pts[pts.length - 1];
  const head = pts[0];
  const closeD = Math.hypot(head.x - tail.x, head.y - tail.y);
  if (closeD >= DENSIFY_STEP) {
    const n = Math.ceil(closeD / DENSIFY_STEP);
    const dx = head.x - tail.x;
    const dy = head.y - tail.y;
    for (let k = 1; k < n; k++) {
      pts.push({ x: tail.x + (dx * k) / n, y: tail.y + (dy * k) / n });
    }
  }
  // Compute perimeter
  let perimPx = 0;
  for (let i = 1; i < pts.length; i++) {
    perimPx += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  if (pts.length > 1) {
    perimPx += Math.hypot(
      pts[0].x - pts[pts.length - 1].x,
      pts[0].y - pts[pts.length - 1].y
    );
  }
  return { pts, perimPx };
}

function buildShape(raw: Pt[], id: number, color: string): Shape {
  const { pts, perimPx } = densifyClose(raw);
  const noteCount = Math.max(3, Math.min(12, Math.round(perimPx / NOTE_SPACING_PX)));
  const trigIdxs: number[] = [];
  for (let i = 0; i < noteCount; i++) {
    trigIdxs.push(Math.round((i / noteCount) * pts.length) % pts.length);
  }
  return { id, color, pts, perimPx, trigIdxs, t: 0, flash: 0 };
}

function pingNote(actx: AudioContext, dest: AudioNode, y: number, canvasH: number) {
  const frac = 1 - Math.max(0, Math.min(1, y / canvasH));
  const idx = Math.round(frac * (PENTA_HZ.length - 1));
  const freq = PENTA_HZ[idx];
  const now = actx.currentTime;

  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.21, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
  osc.connect(g);
  g.connect(dest);
  osc.start(now);
  osc.stop(now + 0.65);

  const osc2 = actx.createOscillator();
  const g2 = actx.createGain();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  g2.gain.setValueAtTime(0.055, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  osc2.connect(g2);
  g2.connect(dest);
  osc2.start(now);
  osc2.stop(now + 0.45);
}

function launchAmbient(actx: AudioContext, dest: AudioNode) {
  [130.81, 196.0, 261.63].forEach((freq) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, actx.currentTime);
    g.gain.linearRampToValueAtTime(0.015, actx.currentTime + 2.8);
    osc.connect(g);
    g.connect(dest);
    osc.start();
  });
}

export default function ShapeLoop() {
  const [started, setStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const shapesRef = useRef<Shape[]>([]);
  const drawingRef = useRef<Pt[] | null>(null);
  const colorIdxRef = useRef(0);
  const idRef = useRef(0);
  const rafRef = useRef<number>(0);
  const prevTsRef = useRef<number>(0);

  function handleStart() {
    const actx = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.72;
    master.connect(actx.destination);
    actxRef.current = actx;
    masterRef.current = master;
    launchAmbient(actx, master);
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const actx = actxRef.current;
    const master = masterRef.current;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function getPos(e: PointerEvent): Pt {
      const rect = canvas!.getBoundingClientRect();
      const dpr = devicePixelRatio;
      return {
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr,
      };
    }

    function commitDrawing() {
      const drawing = drawingRef.current;
      if (!drawing || drawing.length < 10) {
        drawingRef.current = null;
        return;
      }
      drawing.push(drawing[0]); // close loop
      const color = SHAPE_COLORS[colorIdxRef.current % SHAPE_COLORS.length];
      colorIdxRef.current++;
      const shape = buildShape(drawing, idRef.current++, color);
      if (shape.pts.length < 3) {
        drawingRef.current = null;
        return;
      }
      shapesRef.current = [...shapesRef.current.slice(-(MAX_SHAPES - 1)), shape];
      drawingRef.current = null;
    }

    function onDown(e: PointerEvent) {
      e.preventDefault();
      const pos = getPos(e);
      // Erase check: if near any existing shape's path
      const eraseR = 28 * devicePixelRatio;
      const shapes = shapesRef.current;
      for (let i = shapes.length - 1; i >= 0; i--) {
        const hit = shapes[i].pts.some(
          (p) => Math.hypot(p.x - pos.x, p.y - pos.y) < eraseR
        );
        if (hit) {
          shapesRef.current = shapes.filter((s) => s.id !== shapes[i].id);
          return;
        }
      }
      // Start drawing
      if (shapes.length < MAX_SHAPES) {
        drawingRef.current = [pos];
        canvas!.setPointerCapture(e.pointerId);
      }
    }

    function onMove(e: PointerEvent) {
      const drawing = drawingRef.current;
      if (!drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      drawing.push(pos);
      // Auto-close when finger returns near start
      if (drawing.length > 14) {
        const closeDist = CLOSE_DIST_CSS * devicePixelRatio;
        const d = Math.hypot(pos.x - drawing[0].x, pos.y - drawing[0].y);
        if (d < closeDist) {
          commitDrawing();
        }
      }
    }

    function onUp(e: PointerEvent) {
      if (!drawingRef.current) return;
      e.preventDefault();
      commitDrawing();
    }

    function onCancel() {
      drawingRef.current = null;
    }

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onCancel);

    function frame(ts: number) {
      const dt = Math.min((ts - prevTsRef.current) / 1000, 0.05);
      prevTsRef.current = ts;

      const W = canvas!.width;
      const H = canvas!.height;
      ctx!.clearRect(0, 0, W, H);

      const shapes = shapesRef.current;
      shapes.forEach((shape) => {
        const { pts, color, trigIdxs, perimPx } = shape;
        if (pts.length < 2) return;

        // Draw shape outline
        ctx!.save();
        ctx!.strokeStyle = color;
        ctx!.lineWidth = 2.5 * devicePixelRatio;
        ctx!.shadowBlur = 10 + shape.flash * 14;
        ctx!.shadowColor = color;
        ctx!.globalAlpha = 0.72 + shape.flash * 0.28;
        ctx!.beginPath();
        ctx!.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx!.lineTo(pts[i].x, pts[i].y);
        }
        ctx!.closePath();
        ctx!.stroke();

        // Draw trigger dots (small colored circles on the shape)
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = 0.45;
        ctx!.fillStyle = color;
        trigIdxs.forEach((ti) => {
          const p = pts[ti];
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, 3.5 * devicePixelRatio, 0, Math.PI * 2);
          ctx!.fill();
        });
        ctx!.restore();

        // Draw traversal dot
        const tIdx = Math.floor(shape.t * pts.length) % pts.length;
        const tp = pts[tIdx];
        ctx!.save();
        ctx!.fillStyle = "#ffffff";
        ctx!.shadowBlur = 18 + shape.flash * 22;
        ctx!.shadowColor = color;
        ctx!.globalAlpha = 0.95;
        ctx!.beginPath();
        ctx!.arc(
          tp.x,
          tp.y,
          (4.5 + shape.flash * 3.5) * devicePixelRatio,
          0,
          Math.PI * 2
        );
        ctx!.fill();
        ctx!.restore();

        // Advance traversal
        const oldT = shape.t;
        const dtFrac = perimPx > 0 ? (TRAVERSE_PX_S * dt) / perimPx : 0;
        const newT = (oldT + dtFrac) % 1;
        shape.t = newT;

        // Check note triggers
        for (const ti of trigIdxs) {
          const thresh = ti / pts.length;
          const passed =
            oldT < newT
              ? thresh > oldT && thresh <= newT
              : thresh > oldT || thresh <= newT;
          if (passed && actx && master) {
            pingNote(actx, master, pts[ti].y, H);
            shape.flash = 1.0;
            break; // one note per frame per shape
          }
        }

        // Decay flash
        shape.flash = Math.max(0, shape.flash - dt * 4.2);
      });

      // Draw in-progress path
      const drawing = drawingRef.current;
      if (drawing && drawing.length > 1) {
        const dColor = SHAPE_COLORS[colorIdxRef.current % SHAPE_COLORS.length];
        ctx!.save();
        ctx!.strokeStyle = dColor;
        ctx!.lineWidth = 2 * devicePixelRatio;
        ctx!.globalAlpha = 0.55;
        ctx!.shadowBlur = 8;
        ctx!.shadowColor = dColor;
        ctx!.beginPath();
        ctx!.moveTo(drawing[0].x, drawing[0].y);
        for (let i = 1; i < drawing.length; i++) {
          ctx!.lineTo(drawing[i].x, drawing[i].y);
        }
        ctx!.stroke();
        // Close-guide dashed ring
        if (drawing.length > 8) {
          ctx!.strokeStyle = dColor;
          ctx!.lineWidth = 1.2 * devicePixelRatio;
          ctx!.globalAlpha = 0.22;
          ctx!.shadowBlur = 0;
          ctx!.setLineDash([5 * devicePixelRatio, 5 * devicePixelRatio]);
          ctx!.beginPath();
          ctx!.arc(
            drawing[0].x,
            drawing[0].y,
            CLOSE_DIST_CSS * devicePixelRatio,
            0,
            Math.PI * 2
          );
          ctx!.stroke();
          ctx!.setLineDash([]);
        }
        ctx!.restore();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame((ts) => {
      prevTsRef.current = ts;
      rafRef.current = requestAnimationFrame(frame);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a14] px-6 text-center">
        <h1 className="text-3xl font-bold text-foreground mb-3">Shape Loop</h1>
        <p className="text-base text-muted-foreground mb-8 max-w-xs">
          Draw any closed shape — it becomes a looping melody. Add shapes to layer the music.
        </p>
        <div className="flex gap-3 mb-8 items-center">
          {SHAPE_COLORS.slice(0, 4).map((c, i) => (
            <div
              key={i}
              className="rounded-full border-2 opacity-60"
              style={{
                width: 36 + i * 4,
                height: 36 + i * 4,
                borderColor: c,
                boxShadow: `0 0 10px ${c}66`,
              }}
            />
          ))}
        </div>
        <button
          onClick={handleStart}
          className="bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground text-xl font-semibold rounded-2xl px-8 transition-colors"
          style={{
            minHeight: 64,
            minWidth: 200,
            boxShadow: "0 0 28px rgba(139,92,246,0.45)",
          }}
        >
          Let&apos;s draw! 🎵
        </button>
        <p className="text-xs text-muted-foreground mt-6">
          Tap a shape to erase it · Up to 6 loops at once
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#0a0a14] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none select-none"
      />
      <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
        <span className="text-xs text-muted-foreground/70">
          Draw a closed shape · Tap to erase
        </span>
      </div>
    </div>
  );
}
