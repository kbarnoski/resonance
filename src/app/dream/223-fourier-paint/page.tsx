'use client';
import { useEffect, useRef, useState } from 'react';

const RESAMPLE_N = 256;
const BASE_FREQ = 55; // A1; epicycle k → k × 55 Hz
const MAX_TERMS = 64;
const TAU = 2 * Math.PI;
const ANIM_RATE = 0.18; // fraction of RESAMPLE_N advanced per second for k=1

type Pt = { x: number; y: number };
type Cyc = { k: number; amp: number; phase: number };

function arcResample(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) return Array.from({ length: n }, () => ({ ...(pts[0] ?? { x: 0, y: 0 }) }));
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    lens.push(lens[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = lens[lens.length - 1];
  return Array.from({ length: n }, (_, i) => {
    const s = (i / n) * total;
    let lo = 0, hi = lens.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (lens[m] <= s) lo = m; else hi = m; }
    const t = lens[hi] > lens[lo] ? (s - lens[lo]) / (lens[hi] - lens[lo]) : 0;
    return { x: pts[lo].x + t * (pts[hi].x - pts[lo].x), y: pts[lo].y + t * (pts[hi].y - pts[lo].y) };
  });
}

// DFT treating path as complex signal z[n] = x[n] + i*y[n], sorted by amplitude
function buildCycles(pts: Pt[]): Cyc[] {
  const N = pts.length;
  const mcx = pts.reduce((s, p) => s + p.x, 0) / N;
  const mcy = pts.reduce((s, p) => s + p.y, 0) / N;
  const out: Cyc[] = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = (TAU * k * n) / N;
      const px = pts[n].x - mcx, py = pts[n].y - mcy;
      re += px * Math.cos(a) + py * Math.sin(a);
      im += py * Math.cos(a) - px * Math.sin(a);
    }
    re /= N; im /= N;
    out.push({ k, amp: Math.sqrt(re * re + im * im), phase: Math.atan2(im, re) });
  }
  return out.sort((a, b) => b.amp - a.amp).slice(0, MAX_TERMS);
}

export default function FourierPaint() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rawRef = useRef<Pt[]>([]);
  const cyclesRef = useRef<Cyc[]>([]);
  const traceRef = useRef<Pt[]>([]);
  const animTRef = useRef(0);
  const rafRef = useRef<number>(0);
  const prevTRef = useRef<number>(0);
  const isDownRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<GainNode[]>([]);
  const termsRef = useRef(32);

  const [mode, setMode] = useState<'idle' | 'drawing' | 'animating'>('idle');
  const [terms, setTerms] = useState(32);
  const [hasPath, setHasPath] = useState(false);

  termsRef.current = terms;

  // Resize canvas with DPR
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applySize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Idle hint drawing
  useEffect(() => {
    if (mode !== 'idle') return;
    let raf: number;
    const drawHint = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      if (W === 0) { raf = requestAnimationFrame(drawHint); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.strokeStyle = 'rgba(139,92,246,0.22)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      const cx = W / 2, cy = H / 2 + 10;
      const R = Math.min(W, H) * 0.2;
      for (let i = 0; i <= 200; i++) {
        const t = (i / 200) * TAU;
        const r = R * (0.72 + 0.28 * Math.cos(5 * t));
        const x = cx + r * Math.cos(t - Math.PI / 2);
        const y = cy + r * Math.sin(t - Math.PI / 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(drawHint);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  // Update audio gains when terms slider changes
  useEffect(() => {
    if (mode !== 'animating') return;
    const ctx = audioCtxRef.current;
    const gains = gainNodesRef.current;
    const cycs = cyclesRef.current;
    if (!ctx || !gains.length) return;
    const totalAmp = cycs.slice(0, terms).reduce((s, c) => s + c.amp, 0) || 1;
    gains.forEach((g, i) => {
      const cyc = cycs[i];
      const active = i < terms && cyc && cyc.k > 0 && cyc.k * BASE_FREQ <= 14000;
      g.gain.setTargetAtTime(active ? cyc.amp / totalAmp : 0, ctx.currentTime, 0.06);
    });
  }, [terms, mode]);

  // Main animation + audio loop (triggers on mode only)
  useEffect(() => {
    if (mode !== 'animating') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cycs = cyclesRef.current;
    if (!cycs.length) return;

    // Start audio
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const master = audioCtx.createGain();
    master.gain.value = 0.32;
    master.connect(audioCtx.destination);

    const initTerms = termsRef.current;
    const totalAmp = cycs.slice(0, initTerms).reduce((s, c) => s + c.amp, 0) || 1;
    const gains: GainNode[] = cycs.map((cyc, i) => {
      const g = audioCtx.createGain();
      const audible = cyc.k > 0 && cyc.k * BASE_FREQ <= 14000;
      g.gain.value = audible && i < initTerms ? cyc.amp / totalAmp : 0;
      if (audible) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = cyc.k * BASE_FREQ;
        osc.connect(g);
        g.connect(master);
        osc.start();
      }
      return g;
    });
    gainNodesRef.current = gains;

    traceRef.current = [];
    animTRef.current = 0;
    prevTRef.current = performance.now();

    const step = (now: number) => {
      const dt = (now - prevTRef.current) / 1000;
      prevTRef.current = now;
      animTRef.current = (animTRef.current + RESAMPLE_N * ANIM_RATE * dt) % RESAMPLE_N;
      const t = animTRef.current;
      const K = Math.min(termsRef.current, cycs.length);
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      const ctx2 = canvas.getContext('2d');
      if (!ctx2) return;

      ctx2.clearRect(0, 0, W, H);

      // Draw accumulated trace path
      const trace = traceRef.current;
      if (trace.length > 2) {
        ctx2.beginPath();
        ctx2.strokeStyle = 'rgba(167,139,250,0.78)';
        ctx2.lineWidth = 1.8;
        ctx2.lineJoin = 'round';
        ctx2.moveTo(trace[0].x + W / 2, trace[0].y + H / 2);
        for (let i = 1; i < trace.length; i++) ctx2.lineTo(trace[i].x + W / 2, trace[i].y + H / 2);
        ctx2.stroke();
      }

      // Draw epicycle chain
      let cx = 0, cy = 0;
      for (let i = 0; i < K; i++) {
        const { amp, phase, k } = cycs[i];
        const angle = (TAU * k * t) / RESAMPLE_N + phase;
        const nx = cx + amp * Math.cos(angle);
        const ny = cy + amp * Math.sin(angle);

        // Circle outline (only for visible circles)
        if (amp > 1.5) {
          ctx2.beginPath();
          ctx2.arc(cx + W / 2, cy + H / 2, amp, 0, TAU);
          ctx2.strokeStyle = `rgba(109,40,217,${Math.max(0.05, 0.18 - i * 0.0022)})`;
          ctx2.lineWidth = 0.5;
          ctx2.stroke();
        }
        // Arm
        ctx2.beginPath();
        ctx2.moveTo(cx + W / 2, cy + H / 2);
        ctx2.lineTo(nx + W / 2, ny + H / 2);
        ctx2.strokeStyle = `rgba(139,92,246,${Math.max(0.12, 0.42 - i * 0.005)})`;
        ctx2.lineWidth = 0.9;
        ctx2.stroke();

        cx = nx; cy = ny;
      }

      // Accumulate tip into trace buffer (ring: max 2× RESAMPLE_N pts)
      trace.push({ x: cx, y: cy });
      if (trace.length > RESAMPLE_N * 2) trace.shift();

      // Tip glow
      const tx = cx + W / 2, ty = cy + H / 2;
      const grd = ctx2.createRadialGradient(tx, ty, 0, tx, ty, 18);
      grd.addColorStop(0, 'rgba(251,191,36,0.85)');
      grd.addColorStop(0.35, 'rgba(251,191,36,0.45)');
      grd.addColorStop(1, 'rgba(251,191,36,0)');
      ctx2.beginPath();
      ctx2.arc(tx, ty, 18, 0, TAU);
      ctx2.fillStyle = grd;
      ctx2.fill();
      ctx2.beginPath();
      ctx2.arc(tx, ty, 2.8, 0, TAU);
      ctx2.fillStyle = '#fbbf24';
      ctx2.fill();

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtx.close();
      audioCtxRef.current = null;
      gainNodesRef.current = [];
    };
  }, [mode]);

  // Cleanup on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
  }, []);

  const getPos = (canvas: HTMLCanvasElement, cX: number, cY: number): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: cX - r.left, y: cY - r.top };
  };

  const addStroke = (pt: Pt) => {
    rawRef.current.push(pt);
    const pts = rawRef.current;
    if (pts.length < 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = 'rgba(167,139,250,0.92)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (pts.length === 16) setHasPath(true);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
  };

  const handleDraw = () => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    clearCanvas();
    rawRef.current = [];
    cyclesRef.current = [];
    traceRef.current = [];
    setHasPath(false);
    setMode('drawing');
  };

  const handleAnimate = () => {
    if (rawRef.current.length < 15) return;
    cancelAnimationFrame(rafRef.current);
    // Resample and scale to fit canvas
    const canvas = canvasRef.current;
    const raw = rawRef.current;
    const resampled = arcResample(raw, RESAMPLE_N);
    // Pre-center and scale so shape fits comfortably
    const mcx = resampled.reduce((s, p) => s + p.x, 0) / RESAMPLE_N;
    const mcy = resampled.reduce((s, p) => s + p.y, 0) / RESAMPLE_N;
    const centered = resampled.map(p => ({ x: p.x - mcx, y: p.y - mcy }));
    const maxR = centered.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0) || 1;
    const targetR = canvas ? Math.min(canvas.offsetWidth, canvas.offsetHeight) * 0.36 : 150;
    const scale = targetR / maxR;
    const scaled = centered.map(p => ({ x: p.x * scale, y: p.y * scale }));
    cyclesRef.current = buildCycles(scaled);
    setMode('animating');
  };

  const handleClear = () => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    clearCanvas();
    rawRef.current = [];
    cyclesRef.current = [];
    traceRef.current = [];
    setHasPath(false);
    setMode('idle');
  };

  return (
    <div className="flex flex-col h-screen bg-black text-foreground select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-2xl font-mono text-foreground">Fourier Paint</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            {mode === 'idle' && 'Draw any closed shape — Fourier decomposes it into sound'}
            {mode === 'drawing' && 'Draw a closed shape, then press Animate + sound'}
            {mode === 'animating' && 'Epicycles trace your shape · drag Terms to hear more/fewer harmonics'}
          </p>
        </div>
        <a href="/dream" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← lab</a>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 w-full touch-none"
        style={{ cursor: mode === 'drawing' ? 'crosshair' : 'default' }}
        onMouseDown={e => {
          if (mode !== 'drawing') return;
          isDownRef.current = true;
          const canvas = canvasRef.current!;
          rawRef.current = [];
          setHasPath(false);
          clearCanvas();
          addStroke(getPos(canvas, e.clientX, e.clientY));
        }}
        onMouseMove={e => {
          if (!isDownRef.current || mode !== 'drawing') return;
          addStroke(getPos(canvasRef.current!, e.clientX, e.clientY));
        }}
        onMouseUp={() => { isDownRef.current = false; }}
        onMouseLeave={() => { isDownRef.current = false; }}
        onTouchStart={e => {
          if (mode !== 'drawing') return;
          e.preventDefault();
          isDownRef.current = true;
          const canvas = canvasRef.current!;
          rawRef.current = [];
          setHasPath(false);
          clearCanvas();
          addStroke(getPos(canvas, e.touches[0].clientX, e.touches[0].clientY));
        }}
        onTouchMove={e => {
          if (!isDownRef.current || mode !== 'drawing') return;
          e.preventDefault();
          addStroke(getPos(canvasRef.current!, e.touches[0].clientX, e.touches[0].clientY));
        }}
        onTouchEnd={() => { isDownRef.current = false; }}
      />

      {/* Controls */}
      <div className="shrink-0 px-5 py-4 border-t border-border flex flex-wrap items-center gap-3">
        {mode === 'idle' && (
          <>
            <button onClick={handleDraw}
              className="min-h-[44px] px-6 py-2.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 font-mono text-sm rounded-lg border border-violet-500/30 transition-colors">
              Draw shape
            </button>
            <p className="text-sm text-muted-foreground font-mono">
              circles → pure tone · stars → odd harmonics · spirals → complex timbre
            </p>
          </>
        )}
        {mode === 'drawing' && (
          <>
            <button onClick={handleAnimate} disabled={!hasPath}
              className="min-h-[44px] px-6 py-2.5 bg-violet-500/20 hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-violet-300 font-mono text-sm rounded-lg border border-violet-500/30 transition-colors">
              Animate + sound
            </button>
            <button onClick={handleDraw}
              className="min-h-[44px] px-4 py-2.5 bg-muted hover:bg-accent text-muted-foreground font-mono text-sm rounded-lg border border-border transition-colors">
              Redraw
            </button>
            <button onClick={handleClear}
              className="min-h-[44px] px-4 py-2.5 bg-muted hover:bg-accent text-muted-foreground font-mono text-sm rounded-lg border border-border transition-colors">
              Clear
            </button>
          </>
        )}
        {mode === 'animating' && (
          <>
            <button onClick={handleDraw}
              className="min-h-[44px] px-5 py-2.5 bg-muted hover:bg-accent text-muted-foreground font-mono text-sm rounded-lg border border-border transition-colors">
              New shape
            </button>
            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
              <span className="text-sm text-muted-foreground font-mono shrink-0">Terms {terms}</span>
              <input type="range" min={1} max={MAX_TERMS} value={terms}
                onChange={e => setTerms(Number(e.target.value))}
                className="flex-1 accent-violet-400 min-h-[20px]" />
            </div>
            <button onClick={handleClear}
              className="min-h-[44px] px-4 py-2.5 bg-muted hover:bg-accent text-muted-foreground font-mono text-sm rounded-lg border border-border transition-colors">
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}
