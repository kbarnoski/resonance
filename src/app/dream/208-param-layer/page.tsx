"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

/* ── module-level constants ─────────────────────────────────────────── */

const N_PARTIALS = 16;
const RING_STROKE = ["#8b5cf6", "#2dd4bf", "#fbbf24", "#fb7185"] as const;

/* ── module-level pure helpers ──────────────────────────────────────── */

/** Compute the 4 ring radii from canvas CSS dimensions */
function ringRadii(w: number, h: number): [number, number, number, number] {
  const s = Math.min(w, h) * 0.43;
  return [s, s * 0.71, s * 0.47, s * 0.26];
}

/** Hit-test point (x,y) against rings. Returns 0-3 for rings, -2 for center, -1 for miss. */
function hitRing(cv: HTMLCanvasElement, x: number, y: number): number {
  const cx = cv.offsetWidth / 2;
  const cy = cv.offsetHeight / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const rs = ringRadii(cv.offsetWidth, cv.offsetHeight);
  const tol = Math.max(16, rs[3] * 0.48);
  if (dist < rs[3] * 0.55) return -2;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(dist - rs[i]) < tol) return i;
  }
  return -1;
}

function canvasXY(cv: HTMLCanvasElement, e: { clientX: number; clientY: number }) {
  const r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/* ── audio parameter mappings ───────────────────────────────────────── */

/** param 0→1: fundamental frequency C2 (65 Hz) → A5 (880 Hz) */
function fundHz(p: number): number { return 65 * Math.pow(13.538, p); }

/** param 0→1: 1–16 partials */
function countPartials(p: number): number { return Math.max(1, Math.round(1 + p * 15)); }

/** param 0→1: inharmonicity stretch 0–0.22 */
function inharmonicity(p: number): number { return p * 0.22; }

/** param 0→1: decay 0.15s–5.0s (quadratic for resolution at short end) */
function decaySec(p: number): number { return 0.15 + p * p * 4.85; }

/** partial frequency with inharmonic stretch */
function partialHz(fund: number, n: number, ih: number): number {
  return fund * n * (1 + ih * (n - 1));
}

/** partial drone gain (quiet background tone) */
function droneGain(n: number, active: boolean): number {
  return active ? 0.036 / Math.sqrt(n) : 0;
}

function noteLabel(hz: number): string {
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/* ── types ──────────────────────────────────────────────────────────── */

type AudioSys = {
  ctx: AudioContext;
  oscs: OscillatorNode[];
  dGains: GainNode[];
  analyser: AnalyserNode;
  master: GainNode;
};

/* ── component ──────────────────────────────────────────────────────── */

export default function ParamLayerPage() {
  const cvRef    = useRef<HTMLCanvasElement>(null);
  const sysRef   = useRef<AudioSys | null>(null);
  /** Live params: [pitch 0-1, harmonics 0-1, spread 0-1, decay 0-1] */
  const pRef     = useRef<[number, number, number, number]>([0.52, 0.27, 0.0, 0.55]);
  const rafRef   = useRef(0);
  const dragRef  = useRef<{ ring: number; a0: number; p0: number } | null>(null);

  const [started, setStarted]     = useState(false);
  const [dispParams, setDispParams] = useState<[number, number, number, number]>([0.52, 0.27, 0.0, 0.55]);
  const [strikeFlash, setStrikeFlash] = useState(false);

  /* ── update drone oscillators to current params ──────────────── */
  const syncDrone = useCallback((p: [number, number, number, number]) => {
    const sys = sysRef.current;
    if (!sys) return;
    const fund = fundHz(p[0]);
    const np   = countPartials(p[1]);
    const ih   = inharmonicity(p[2]);
    const t    = sys.ctx.currentTime;
    for (let i = 0; i < N_PARTIALS; i++) {
      const n  = i + 1;
      const fq = partialHz(fund, n, ih);
      const ga = droneGain(n, i < np);
      sys.oscs[i].frequency.setTargetAtTime(fq, t, 0.04);
      sys.dGains[i].gain.setTargetAtTime(ga, t, 0.07);
    }
  }, []);

  /* ── strike: loud decaying bell chord ──────────────────────── */
  const strike = useCallback(() => {
    const sys = sysRef.current;
    if (!sys) return;
    const p    = pRef.current;
    const fund = fundHz(p[0]);
    const np   = countPartials(p[1]);
    const ih   = inharmonicity(p[2]);
    const dc   = decaySec(p[3]);
    const t    = sys.ctx.currentTime;
    for (let i = 0; i < np; i++) {
      const n   = i + 1;
      const fq  = partialHz(fund, n, ih);
      const amp = 0.44 / Math.sqrt(n);
      const osc = sys.ctx.createOscillator();
      const g   = sys.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = fq;
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dc);
      osc.connect(g);
      g.connect(sys.master);
      osc.start(t);
      osc.stop(t + dc + 0.05);
    }
    setStrikeFlash(true);
    setTimeout(() => setStrikeFlash(false), 120);
  }, []);

  /* ── boot: create AudioContext + drone oscillators ─────────── */
  const boot = useCallback(async () => {
    const ctx      = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const master   = ctx.createGain();
    master.gain.value = 0.72;
    master.connect(analyser);
    analyser.connect(ctx.destination);

    const oscs: OscillatorNode[] = [];
    const dGains: GainNode[]     = [];
    const p    = pRef.current;
    const fund = fundHz(p[0]);
    const np   = countPartials(p[1]);
    const ih   = inharmonicity(p[2]);

    for (let i = 0; i < N_PARTIALS; i++) {
      const n   = i + 1;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = partialHz(fund, n, ih);
      g.gain.value = droneGain(n, i < np);
      osc.connect(g);
      g.connect(master);
      osc.start();
      oscs.push(osc);
      dGains.push(g);
    }

    sysRef.current = { ctx, oscs, dGains, analyser, master };
    setStarted(true);
  }, []);

  /* ── draw loop ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!started) return;
    const cv  = cvRef.current;
    if (!cv) return;
    const gc  = cv.getContext("2d");
    if (!gc) return;
    const sys = sysRef.current;
    if (!sys) return;
    const td  = new Float32Array(sys.analyser.fftSize);
    let w = 0, h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.offsetWidth;
      h = cv.offsetHeight;
      cv.width  = w * dpr;
      cv.height = h * dpr;
      gc.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawFrame = () => {
      const p  = pRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const rs = ringRadii(w, h);

      gc.clearRect(0, 0, w, h);
      gc.fillStyle = "#030309";
      gc.fillRect(0, 0, w, h);

      /* circular waveform in center */
      sys.analyser.getFloatTimeDomainData(td);
      const waveR = rs[3] * 0.60;
      const WAVE_PTS = 256;
      gc.beginPath();
      for (let i = 0; i <= WAVE_PTS; i++) {
        const idx = Math.floor((i / WAVE_PTS) * (td.length - 1));
        const v   = td[idx] ?? 0;
        const ang = (i / WAVE_PTS) * 2 * Math.PI - Math.PI / 2;
        const rr  = waveR + v * waveR * 0.80;
        const px  = cx + rr * Math.cos(ang);
        const py  = cy + rr * Math.sin(ang);
        i === 0 ? gc.moveTo(px, py) : gc.lineTo(px, py);
      }
      gc.closePath();
      gc.strokeStyle = "rgba(255,255,255,0.52)";
      gc.lineWidth   = 1.5;
      gc.stroke();

      /* center strike button */
      const cr = rs[3] * 0.50;
      gc.beginPath();
      gc.arc(cx, cy, cr, 0, Math.PI * 2);
      gc.fillStyle = "rgba(139,92,246,0.20)";
      gc.fill();
      gc.strokeStyle = "rgba(139,92,246,0.50)";
      gc.lineWidth   = 1.5;
      gc.stroke();

      const iconSz = Math.round(cr * 0.72);
      gc.fillStyle    = "rgba(255,255,255,0.82)";
      gc.font         = `${iconSz}px ui-serif,serif`;
      gc.textAlign    = "center";
      gc.textBaseline = "middle";
      gc.fillText("▶", cx + iconSz * 0.06, cy);

      /* four rings: outer → inner */
      for (let ri = 0; ri < 4; ri++) {
        const r     = rs[ri];
        const param = p[ri];
        /* angle: 0 at 12 o'clock, clockwise */
        const ang = param * 2 * Math.PI - Math.PI / 2;

        /* track (full circle, dim) */
        gc.beginPath();
        gc.arc(cx, cy, r, 0, Math.PI * 2);
        gc.strokeStyle = "rgba(255,255,255,0.07)";
        gc.lineWidth   = 11;
        gc.stroke();

        /* progress arc */
        gc.beginPath();
        gc.arc(cx, cy, r, -Math.PI / 2, ang);
        gc.strokeStyle = RING_STROKE[ri];
        gc.lineWidth   = 11;
        gc.shadowColor = RING_STROKE[ri];
        gc.shadowBlur  = 16;
        gc.stroke();
        gc.shadowBlur  = 0;

        /* handle dot */
        const hx = cx + r * Math.cos(ang);
        const hy = cy + r * Math.sin(ang);
        gc.beginPath();
        gc.arc(hx, hy, 8, 0, Math.PI * 2);
        gc.fillStyle   = RING_STROKE[ri];
        gc.shadowColor = RING_STROKE[ri];
        gc.shadowBlur  = 20;
        gc.fill();
        gc.shadowBlur  = 0;
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  /* ── pointer event handlers ────────────────────────────────── */

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!started) return;
    const cv = cvRef.current;
    if (!cv) return;
    const { x, y } = canvasXY(cv, e);
    const hit = hitRing(cv, x, y);
    if (hit === -2) { strike(); return; }
    if (hit < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cx  = cv.offsetWidth / 2;
    const cy  = cv.offsetHeight / 2;
    const ang = Math.atan2(y - cy, x - cx);
    dragRef.current = { ring: hit, a0: ang, p0: pRef.current[hit] };
  }, [started, strike]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const cv = cvRef.current;
    if (!cv) return;
    const { x, y } = canvasXY(cv, e);
    const cx = cv.offsetWidth / 2;
    const cy = cv.offsetHeight / 2;
    let da = Math.atan2(y - cy, x - cx) - d.a0;
    if (da >  Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    const np: [number, number, number, number] = [...pRef.current] as [number, number, number, number];
    np[d.ring] = Math.max(0, Math.min(1, d.p0 + da / (2 * Math.PI)));
    pRef.current = np;
    setDispParams([...np]);
    syncDrone(np);
  }, [syncDrone]);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  /* ── cleanup ────────────────────────────────────────────────── */
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const sys = sysRef.current;
    if (!sys) return;
    sys.oscs.forEach(o => { try { o.stop(); } catch (err) { void err; } });
    sys.ctx.close().catch((err) => { void err; });
  }, []);

  /* ── derived display values ─────────────────────────────────── */
  const dispFund  = fundHz(dispParams[0]);
  const dispNP    = countPartials(dispParams[1]);
  const dispIH    = Math.round(inharmonicity(dispParams[2]) * 100);
  const dispDecay = decaySec(dispParams[3]).toFixed(2);

  return (
    <div className="fixed inset-0 bg-black text-foreground flex flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <h1 className="text-base font-semibold text-foreground">Param Layer</h1>
        <p className="text-xs text-muted-foreground font-mono">harmonic ring synth · cycle 241</p>
      </div>

      {!started ? (
        /* splash */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-muted-foreground text-base max-w-xs leading-relaxed">
            Four concentric rings shape a bell tone — pitch, overtones, metallic
            spread, and decay. Drag each ring to sculpt the timbre. Tap the
            center circle to strike.
          </p>
          <button
            onClick={boot}
            className="px-8 py-3 rounded-full bg-violet-600 hover:bg-violet-500 active:scale-95 text-foreground text-base font-medium min-h-[44px] min-w-[44px] transition-all"
          >
            Open the synth
          </button>
          <p className="text-muted-foreground/70 text-xs">
            Inspired by DEMON (hierarchical parameter propagation, arXiv May 2026)
          </p>
        </div>
      ) : (
        <>
          {/* canvas */}
          <canvas
            ref={cvRef}
            className="flex-1 w-full touch-none cursor-pointer"
            style={{ background: strikeFlash ? "rgba(139,92,246,0.06)" : undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />

          {/* HUD row */}
          <div className="shrink-0 grid grid-cols-4 border-t border-border pb-safe">
            {([
              { label: "pitch",     val: noteLabel(dispFund),  sub: `${Math.round(dispFund)} Hz`, color: "text-violet-300" },
              { label: "partials",  val: String(dispNP),        sub: `of ${N_PARTIALS}`,           color: "text-violet-300"   },
              { label: "spread",    val: `${dispIH}%`,          sub: "inharmonic",                 color: "text-violet-300"  },
              { label: "decay",     val: `${dispDecay}s`,       sub: "per strike",                 color: "text-violet-300"   },
            ] as const).map(({ label, val, sub, color }) => (
              <div key={label} className="flex flex-col items-center py-2 gap-0.5">
                <span className={`text-sm font-mono ${color}`}>{val}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{sub}</span>
                <span className="text-[9px] text-muted-foreground/70 font-mono uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* nav */}
      <div className="absolute bottom-16 right-4 z-10">
        <Link
          href="/dream"
          className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          ← dream lab
        </Link>
      </div>
      <div className="absolute bottom-16 left-4 z-10">
        <Link
          href="/dream/208-param-layer/README.md"
          className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          design notes
        </Link>
      </div>
    </div>
  );
}
