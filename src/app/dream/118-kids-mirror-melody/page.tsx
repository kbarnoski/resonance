"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// C-major pentatonic C3 → A4
const PENTA_HZ = [130.81, 164.81, 196.0, 220.0, 261.63, 329.63, 392.0, 440.0];

// Paired colors: rose (left/direct) and cyan (right/mirror)
const COL_LEFT = "#f472b6";   // rose-400
const COL_RIGHT = "#67e8f9";  // cyan-300

const FADE_S = 7;
const MIN_NOTE_MS = 85;
const NOTE_DUR = 0.22;
const MAX_PTS = 600;

interface Pt {
  x: number;
  y: number;
  born: number;
  left: boolean;
}

export default function KidsMirrorMelody() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const ptsRef = useRef<Pt[]>([]);
  // pointerId → timestamp of last played note
  const lastRef = useRef<Map<number, number>>(new Map());
  const animRef = useRef(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !started) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ac = acRef.current;
    if (!ac) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;

    const resize = () => {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Soft ambient pad: C3 + G3 + C4
    const ambG = ac.createGain();
    ambG.gain.value = 0.022;
    ambG.connect(ac.destination);
    const ambFreqs = [130.81, 196.0, 261.63];
    const ambOscs = ambFreqs.map((f) => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(ambG);
      o.start();
      return o;
    });

    const playNote = (noteIdx: number, pan: number) => {
      const hz = PENTA_HZ[Math.max(0, Math.min(7, noteIdx))];
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const sp = ac.createStereoPanner();
      osc.type = "triangle";
      osc.frequency.value = hz;
      const t = ac.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.26, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.001, t + NOTE_DUR);
      sp.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(g);
      g.connect(sp);
      sp.connect(ac.destination);
      osc.start(t);
      osc.stop(t + NOTE_DUR + 0.06);
    };

    const handleInput = (e: PointerEvent) => {
      if (!canvas) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || x > W || y < 0 || y > H) return;

      const cx = W / 2;
      const isLeft = x <= cx;
      // top = high note (index 7), bottom = low (index 0)
      const noteIdx = Math.min(7, Math.max(0, Math.round((1 - y / H) * 7)));
      const now = performance.now();

      // Throttle per pointer
      const last = lastRef.current.get(e.pointerId) ?? 0;
      if (now - last >= MIN_NOTE_MS) {
        // Direct voice panned to drawing side
        playNote(noteIdx, isLeft ? -0.55 : 0.55);
        // Mirror voice panned to opposite side
        playNote(noteIdx, isLeft ? 0.55 : -0.55);
        lastRef.current.set(e.pointerId, now);
      }

      // Mirror X position across center line
      const mx = isLeft ? cx + (cx - x) : cx - (x - cx);

      ptsRef.current.push({ x, y, born: now, left: isLeft });
      ptsRef.current.push({ x: mx, y, born: now, left: !isLeft });

      // Hard cap to prevent unbounded growth
      if (ptsRef.current.length > MAX_PTS) {
        ptsRef.current = ptsRef.current.slice(ptsRef.current.length - MAX_PTS);
      }
    };

    const handleUp = (e: PointerEvent) => {
      lastRef.current.delete(e.pointerId);
    };

    canvas.addEventListener("pointerdown", handleInput, { passive: false });
    canvas.addEventListener("pointermove", handleInput, { passive: false });
    canvas.addEventListener("pointerup", handleUp);
    canvas.addEventListener("pointercancel", handleUp);
    canvas.style.touchAction = "none";

    const loop = (nowMs: number) => {
      animRef.current = requestAnimationFrame(loop);
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      // Subtle half-tints to cue the sides
      ctx.save();
      ctx.fillStyle = "rgba(244,114,182,0.04)";
      ctx.fillRect(0, 0, W / 2, H);
      ctx.fillStyle = "rgba(103,232,249,0.04)";
      ctx.fillRect(W / 2, 0, W / 2, H);
      ctx.restore();

      // Center divider line
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Cull expired points
      const alive: Pt[] = [];
      for (const p of ptsRef.current) {
        if ((nowMs - p.born) / 1000 < FADE_S) alive.push(p);
      }
      ptsRef.current = alive;

      // "Draw to play" hint when canvas is empty
      if (alive.length === 0) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#fff";
        const fs = Math.round(Math.max(16, H * 0.055));
        ctx.font = `${fs}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("draw anywhere to play", W / 2, H / 2);
        ctx.restore();
      }

      // Draw glowing dots
      for (const p of alive) {
        const age = (nowMs - p.born) / 1000;
        const alpha = Math.pow(1 - age / FADE_S, 1.4);
        const r = 4 + (1 - age / FADE_S) * 6;
        const color = p.left ? COL_LEFT : COL_RIGHT;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 22;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", handleInput);
      canvas.removeEventListener("pointermove", handleInput);
      canvas.removeEventListener("pointerup", handleUp);
      canvas.removeEventListener("pointercancel", handleUp);
      ambOscs.forEach((o) => {
        try {
          o.stop();
        } catch (_) {}
      });
    };
  }, [started]);

  const handleStart = () => {
    if (acRef.current) return;
    const ac = new AudioContext();
    void ac.resume();
    acRef.current = ac;
    setStarted(true);
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-black text-foreground px-4 py-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold mb-2 text-foreground">Mirror Melody</h1>
        <p className="text-base text-foreground mb-3">
          Draw on one side — the mirror sings back. Higher up = higher note.
          Two voices, one canvas.
        </p>

        <div className="flex gap-6 mb-5">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-full bg-violet-400" />
            <span className="text-sm text-muted-foreground">left voice</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-full bg-violet-300" />
            <span className="text-sm text-muted-foreground">mirror voice</span>
          </span>
        </div>

        {!started ? (
          <div className="flex justify-center pt-8">
            <button
              onClick={handleStart}
              className="bg-violet-600 hover:bg-violet-500 text-foreground text-xl font-semibold px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] transition-colors"
            >
              ▶ Start
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full rounded-2xl"
            style={{ height: "66vh", display: "block", background: "#000" }}
          />
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>For kids (4+) · no mic · draw anywhere · multi-touch OK</span>
          <Link href="/dream" className="underline">
            ← dream lab
          </Link>
        </div>
      </div>
    </main>
  );
}
