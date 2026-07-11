"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── L-System plant ─────────────────────────────────────────────────────────────
const AXIOM = "F";
const LS_RULES: Record<string, string> = { F: "FF+[+F-F-F]-[-F+F+F]" };
const LS_ANGLE = (22.5 * Math.PI) / 180;
const MAX_ITER = 4;

function expandLS(n: number): string {
  let s = AXIOM;
  for (let i = 0; i < n; i++) {
    s = s
      .split("")
      .map((c) => LS_RULES[c] ?? c)
      .join("");
  }
  return s;
}

// ── Branch depth → visual style ───────────────────────────────────────────────
const BRANCH_COLOR = ["#7c3aed", "#5b21b6", "#0f766e", "#059669", "#34d399"];
const BRANCH_WIDTH = [3.2, 2.4, 1.7, 1.1, 0.6];
const BRANCH_BLUR = [12, 8, 6, 4, 2.5];

// ── Pentatonic scale C3–C6 (C D F G A per octave) ────────────────────────────
const PENT: number[] = [
  130.81, 146.83, 174.61, 196.0, 220.0,
  261.63, 293.66, 349.23, 392.0, 440.0,
  523.25, 587.33, 698.46, 784.0, 880.0,
];

// ── Karplus-Strong pluck synthesis ────────────────────────────────────────────
function pluckStr(
  ctx: AudioContext,
  freq: number,
  pan: number,
  vol: number,
): void {
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const buf = ctx.createBuffer(1, N, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < N; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = N / sr;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 3600;
  const fb = ctx.createGain();
  fb.gain.value = 0.994;
  const pnr = ctx.createStereoPanner();
  pnr.pan.value = Math.max(-1, Math.min(1, pan));
  const out = ctx.createGain();
  out.gain.value = vol;
  out.gain.setTargetAtTime(0, ctx.currentTime + 1.4, 0.35);

  src.connect(delay);
  delay.connect(lpf);
  lpf.connect(fb);
  fb.connect(delay);
  lpf.connect(pnr);
  pnr.connect(out);
  out.connect(ctx.destination);
  src.start();
}

function strumAt(ctx: AudioContext, iter: number): void {
  const base = (iter * 3) % PENT.length;
  [0, 2, 4, 7].forEach((o, i) => {
    setTimeout(
      () =>
        pluckStr(
          ctx,
          PENT[(base + o) % PENT.length],
          (i - 1.5) * 0.28,
          0.38 - i * 0.02,
        ),
      i * 78,
    );
  });
}

// ── L-System segment extraction ───────────────────────────────────────────────
interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
}

function computeSegments(
  sentence: string,
  cx: number,
  cy: number,
  step: number,
): Seg[] {
  type State = { x: number; y: number; a: number; d: number };
  const stack: State[] = [];
  const segs: Seg[] = [];
  let x = cx,
    y = cy,
    a = -Math.PI / 2,
    d = 0;

  for (const ch of sentence) {
    if (ch === "F") {
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      segs.push({ x1: x, y1: y, x2: nx, y2: ny, depth: d });
      x = nx;
      y = ny;
    } else if (ch === "+") {
      a += LS_ANGLE;
    } else if (ch === "-") {
      a -= LS_ANGLE;
    } else if (ch === "[") {
      stack.push({ x, y, a, d });
      d++;
    } else if (ch === "]") {
      const s = stack.pop();
      if (s) {
        x = s.x;
        y = s.y;
        a = s.a;
        d = s.d;
      }
    }
  }
  return segs;
}

// ── Plant renderer (batch-animated) ───────────────────────────────────────────
function renderBackground(g: CanvasRenderingContext2D, W: number, H: number) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#0a0a0f";
  g.fillRect(0, 0, W, H);
}

// ── Page component ─────────────────────────────────────────────────────────────
export default function EcoBloomPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const iterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<number>(0);

  const [iteration, setIteration] = useState(0);
  const [started, setStarted] = useState(false);

  // Keep ref in sync
  useEffect(() => {
    iterRef.current = iteration;
  }, [iteration]);

  // ── Draw animated plant on iteration change ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const W = canvas.width;
    const H = canvas.height;

    if (animRef.current) cancelAnimationFrame(animRef.current);

    renderBackground(g, W, H);
    if (iteration === 0) return;

    const segs = computeSegments(
      expandLS(iteration),
      W / 2,
      H * 0.94,
      (H * 0.76) / Math.pow(2.0, iteration),
    );

    // Animate: draw ~60 segments per frame → full plant appears in ~1s
    const batchSize = Math.max(1, Math.ceil(segs.length / 55));
    let idx = 0;

    const drawBatch = () => {
      const end = Math.min(idx + batchSize, segs.length);
      for (; idx < end; idx++) {
        const { x1, y1, x2, y2, depth } = segs[idx];
        const di = Math.min(depth, BRANCH_COLOR.length - 1);
        g.beginPath();
        g.strokeStyle = BRANCH_COLOR[di];
        g.lineWidth = BRANCH_WIDTH[di];
        g.shadowColor = BRANCH_COLOR[di];
        g.shadowBlur = BRANCH_BLUR[di];
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      if (idx < segs.length) {
        animRef.current = requestAnimationFrame(drawBatch);
      }
    };
    animRef.current = requestAnimationFrame(drawBatch);
  }, [iteration]);

  // ── Sync canvas resolution to CSS layout size ───────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const r = canvas.getBoundingClientRect();
      const nw = Math.round(r.width);
      const nh = Math.round(r.height);
      if (canvas.width === nw && canvas.height === nh) return;
      canvas.width = nw;
      canvas.height = nh;
      const g = canvas.getContext("2d");
      if (!g) return;
      renderBackground(g, nw, nh);
      const iter = iterRef.current;
      if (iter > 0) {
        const segs = computeSegments(
          expandLS(iter),
          nw / 2,
          nh * 0.94,
          (nh * 0.76) / Math.pow(2.0, iter),
        );
        segs.forEach(({ x1, y1, x2, y2, depth }) => {
          const di = Math.min(depth, BRANCH_COLOR.length - 1);
          g.beginPath();
          g.strokeStyle = BRANCH_COLOR[di];
          g.lineWidth = BRANCH_WIDTH[di];
          g.shadowColor = BRANCH_COLOR[di];
          g.shadowBlur = BRANCH_BLUR[di];
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.stroke();
        });
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Auto-grow scheduler ──────────────────────────────────────────────────────
  const scheduleAutoGrow = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = Math.max(2800, 4800 - iterRef.current * 500);
    timerRef.current = setTimeout(() => {
      const next = iterRef.current >= MAX_ITER ? 0 : iterRef.current + 1;
      setIteration(next);
      if (next > 0 && audioRef.current) strumAt(audioRef.current, next);
      scheduleAutoGrow();
    }, delay);
  };

  const initAudio = (): AudioContext => {
    if (!audioRef.current) {
      audioRef.current = new AudioContext();
    }
    return audioRef.current;
  };

  const handleGrow = () => {
    const ctx = initAudio();
    if (!started) {
      setStarted(true);
      setIteration(1);
      strumAt(ctx, 1);
      scheduleAutoGrow();
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    const next = iterRef.current >= MAX_ITER ? 0 : iterRef.current + 1;
    setIteration(next);
    if (next > 0) strumAt(ctx, next);
    scheduleAutoGrow();
  };

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      void audioRef.current?.close();
    };
  }, []);

  const iterLabel =
    iteration === 0 ? "seed" : `iter ${iteration}/${MAX_ITER}`;

  return (
    <div className="relative h-screen overflow-hidden bg-[#0a0a0f]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-pointer select-none"
        onClick={handleGrow}
      />

      {/* UI layer */}
      <div className="absolute inset-0 pointer-events-none flex flex-col">
        {/* Header */}
        <div className="p-5 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-serif text-foreground">eco-bloom</h1>
            <p className="text-base text-muted-foreground mt-0.5">
              L-system plant · Karplus-Strong strings
            </p>
          </div>
          <Link
            href="/dream"
            className="pointer-events-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← lab
          </Link>
        </div>

        {/* Pre-start prompt */}
        {!started && (
          <div className="flex-1 flex items-center justify-center">
            <button
              className="pointer-events-auto px-8 py-3 min-h-[44px]
                         bg-violet-500/20 border border-violet-400/40 rounded-lg
                         text-foreground text-base font-mono
                         hover:bg-violet-500/30 active:bg-violet-500/40 transition-all"
              onClick={handleGrow}
            >
              grow
            </button>
          </div>
        )}

        {/* Footer */}
        {started && (
          <div className="mt-auto p-5">
            <p className="text-sm font-mono text-muted-foreground">
              {iterLabel} · tap to grow · auto-cycles
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
