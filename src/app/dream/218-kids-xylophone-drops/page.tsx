"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Drops fall from the sky and ring the xylophone bars below.
// Tap the sky to aim a drop; tap a bar to ring it instantly.

// ── bars: tallest (lowest pitch) on left → shortest (highest) on right ───
// BANDIMAL rule: bigger bar = deeper note
const BARS = [
  { freq: 261.63, color: "#7c3aed", barH: 110, dropR: 22 }, // C4 violet
  { freq: 329.63, color: "#0891b2", barH: 96,  dropR: 19 }, // E4 teal
  { freq: 392.00, color: "#059669", barH: 84,  dropR: 17 }, // G4 emerald
  { freq: 440.00, color: "#d97706", barH: 74,  dropR: 15 }, // A4 amber
  { freq: 523.25, color: "#e11d48", barH: 66,  dropR: 13 }, // C5 rose
];

const N          = BARS.length;
const BAR_MARGIN = 20;   // bottom gap in CSS px
const GRAVITY    = 0.18; // px / frame²
const V0         = 2.0;  // initial drop velocity px / frame
const GLOW_MAX   = 24;   // frames of bar glow after hit
const SPL_MAX    = 24;   // frames of splash lifetime

type Drop   = { id: number; bi: number; x: number; y: number; vy: number };
type Splash = { id: number; x: number; y: number; bi: number; frame: number };

type St = {
  drops:   Drop[];
  splashes: Splash[];
  barGlow: number[];
  nextId:  number;
};

// ── audio ────────────────────────────────────────────────────────────────
function strikeNote(actx: AudioContext, freq: number): void {
  const g = actx.createGain();
  g.gain.setValueAtTime(0.5, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.9);
  g.connect(actx.destination);
  const osc = actx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  osc.connect(g);
  osc.start();
  osc.stop(actx.currentTime + 0.95);
}

// ── canvas helpers ────────────────────────────────────────────────────────
function drawRoundRect(
  gc: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  gc.beginPath();
  gc.moveTo(x + r, y);
  gc.lineTo(x + w - r, y);
  gc.arcTo(x + w, y,     x + w, y + r,     r);
  gc.lineTo(x + w, y + h - r);
  gc.arcTo(x + w, y + h, x + w - r, y + h, r);
  gc.lineTo(x + r, y + h);
  gc.arcTo(x,     y + h, x,     y + h - r, r);
  gc.lineTo(x, y + r);
  gc.arcTo(x,     y,     x + r, y,         r);
  gc.closePath();
}

// ── component ─────────────────────────────────────────────────────────────
export default function XylophoneDrops() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const stRef     = useRef<St>({
    drops:    [],
    splashes: [],
    barGlow:  Array(N).fill(0) as number[],
    nextId:   0,
  });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stRef.current;

    // ── DPR / resize ──────────────────────────────────────────────────
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    // Logical-pixel helpers (CSS px)
    const cssW = () => canvas.width  / dpr;
    const cssH = () => canvas.height / dpr;
    const barW = () => cssW() / N;
    const barTop = (bi: number) => cssH() - BAR_MARGIN - BARS[bi].barH;

    // ── spawn / hit helpers ───────────────────────────────────────────
    const spawnDrop = (bi: number) => {
      const bw = barW();
      st.drops.push({
        id: st.nextId++,
        bi,
        x:  bi * bw + bw / 2,
        y:  -BARS[bi].dropR - 4,
        vy: V0,
      });
    };

    const hitBar = (bi: number, x: number, y: number) => {
      if (!acRef.current) acRef.current = new AudioContext();
      strikeNote(acRef.current, BARS[bi].freq);
      st.barGlow[bi] = GLOW_MAX;
      st.splashes.push({ id: st.nextId++, x, y, bi, frame: 0 });
    };

    // ── auto-spawn ────────────────────────────────────────────────────
    const autoTimer = setInterval(
      () => spawnDrop(Math.floor(Math.random() * N)),
      1800,
    );
    // Seed 3 drops across the bars on load
    [0, 2, 4].forEach((bi, k) => setTimeout(() => spawnDrop(bi), k * 360 + 80));

    // ── pointer ───────────────────────────────────────────────────────
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (!acRef.current) acRef.current = new AudioContext();
      const rect = canvas.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;
      const bw   = barW();
      const bi   = Math.min(N - 1, Math.floor(cx / bw));
      const bt   = barTop(bi);
      if (cy >= bt - 10) {
        // Tapped on a bar — ring it immediately
        hitBar(bi, bi * bw + bw / 2, bt);
      } else {
        // Tapped above — spawn a drop in this column
        spawnDrop(bi);
      }
    };
    canvas.addEventListener("pointerdown", onPointer);

    // ── animation loop ────────────────────────────────────────────────
    const animate = () => {
      const gc = canvas.getContext("2d");
      if (!gc) { rafRef.current = requestAnimationFrame(animate); return; }

      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w  = cssW();
      const h  = cssH();
      const bw = w / N;

      // Update glow counters
      for (let i = 0; i < N; i++) {
        if (st.barGlow[i] > 0) st.barGlow[i]--;
      }

      // Update drops — detect bar collisions
      const alive: Drop[] = [];
      for (const d of st.drops) {
        d.y  += d.vy;
        d.vy += GRAVITY;
        const bt = barTop(d.bi);
        if (d.y + BARS[d.bi].dropR >= bt) {
          hitBar(d.bi, d.x, bt);
          // drop removed (not pushed to alive)
        } else if (d.y < h + 60) {
          alive.push(d);
        }
      }
      st.drops = alive;

      // Age splashes
      st.splashes = st.splashes.filter(s => (s.frame++, s.frame < SPL_MAX));

      // ── draw ────────────────────────────────────────────────────────
      gc.fillStyle = "#080810";
      gc.fillRect(0, 0, w, h);

      // Bars
      for (let i = 0; i < N; i++) {
        const b  = BARS[i];
        const gf = st.barGlow[i] / GLOW_MAX;
        const bt = barTop(i);
        gc.save();
        gc.shadowColor = b.color;
        gc.shadowBlur  = 8 + 30 * gf;
        gc.globalAlpha = 0.42 + 0.58 * gf;
        gc.fillStyle   = b.color;
        drawRoundRect(gc, i * bw + 5, bt, bw - 10, b.barH, 7);
        gc.fill();
        gc.restore();

        // Top edge specular
        gc.save();
        gc.strokeStyle = `rgba(255,255,255,${0.18 + 0.22 * gf})`;
        gc.lineWidth   = 1.5;
        gc.beginPath();
        gc.moveTo(i * bw + 14, bt + 5);
        gc.lineTo((i + 1) * bw - 14, bt + 5);
        gc.stroke();
        gc.restore();
      }

      // Drops
      for (const d of st.drops) {
        const b = BARS[d.bi];
        const r = b.dropR;
        gc.save();
        gc.shadowColor = b.color;
        gc.shadowBlur  = 12;
        gc.fillStyle   = b.color;
        gc.beginPath();
        gc.arc(d.x, d.y, r, 0, Math.PI * 2);
        gc.fill();
        // Specular highlight
        gc.fillStyle = "rgba(255,255,255,0.38)";
        gc.beginPath();
        gc.arc(d.x - r * 0.28, d.y - r * 0.32, r * 0.3, 0, Math.PI * 2);
        gc.fill();
        gc.restore();
      }

      // Splashes
      for (const sp of st.splashes) {
        const b    = BARS[sp.bi];
        const frac = sp.frame / SPL_MAX;
        gc.save();
        gc.globalAlpha = (1 - frac) * 0.85;
        gc.shadowColor = b.color;
        gc.shadowBlur  = 6;
        gc.fillStyle   = b.color;
        for (let p = 0; p < 7; p++) {
          const angle = (p / 7) * Math.PI * 2 - Math.PI / 2;
          const dist  = frac * 36;
          const pr    = (1 - frac) * 5.5;
          gc.beginPath();
          gc.arc(
            sp.x + Math.cos(angle) * dist,
            sp.y + Math.sin(angle) * dist,
            Math.max(0.5, pr), 0, Math.PI * 2,
          );
          gc.fill();
        }
        gc.restore();
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(autoTimer);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
      acRef.current?.close();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#080810] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />

      <div className="absolute top-0 left-0 right-0 p-4 text-center pointer-events-none">
        <h1 className="text-2xl font-bold text-white/95">Xylophone Drops</h1>
        <p className="text-base text-white/75 mt-1">
          Tap the sky to drop — taller bars play deeper notes
        </p>
      </div>

      <div className="absolute top-4 right-4">
        <Link
          href="/dream"
          className="text-white/55 text-sm hover:text-white/80 transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
