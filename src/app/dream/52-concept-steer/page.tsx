"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

// ── Concept axis definitions ──────────────────────────────────────────────────

const AXIS_LABELS = ["Brightness", "Density", "Regularity", "Complexity", "Energy", "Mode"];

// Vertex angles: top first (-π/2), clockwise every 60°
const AXIS_ANGLES = Array.from({ length: 6 }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / 6);

// Per-axis accent color
const AXIS_COLORS: ReadonlyArray<[number, number, number]> = [
  [255, 240, 120],  // Brightness — golden
  [100, 200, 255],  // Density — sky blue
  [120, 255, 180],  // Regularity — mint
  [220, 120, 255],  // Complexity — lavender
  [255, 100, 80],   // Energy — coral
  [80, 160, 255],   // Mode — steel blue
];

// ── Presets ───────────────────────────────────────────────────────────────────
// [Brightness, Density, Regularity, Complexity, Energy, Mode]
const PRESETS: Record<string, number[]> = {
  "Classical Fugue": [0.80, 0.50, 0.90, 0.70, 0.60, 0.10],
  "Dark Ambient":    [0.15, 0.10, 0.40, 0.20, 0.20, 0.65],
  "Jazz Improv":     [0.75, 0.70, 0.25, 0.85, 0.65, 0.20],
  "Drone":           [0.30, 0.15, 0.95, 0.00, 0.35, 0.50],
};

// ── Synthesis helpers ─────────────────────────────────────────────────────────

// brightness [0,1] → lowpass cutoff Hz
function calcFilterFc(brightness: number): number {
  return 400 * Math.pow(15, brightness);
}

// density [0,1] → BPM
function calcBpm(density: number): number {
  return Math.round(40 + density * 100);
}

// density [0,1] → simultaneous voice count
function calcVoices(density: number): number {
  return Math.max(1, Math.min(5, Math.ceil(density * 5)));
}

// energy [0,1] → attack time s
function calcAttack(energy: number): number {
  return Math.max(0.02, 0.8 - energy * 0.76);
}

// energy [0,1] → peak gain
function calcPeak(energy: number): number {
  return 0.08 + energy * 0.20;
}

// mode [0,1] and complexity [0,1] → semitone intervals above C3
// mode 0=major, 0.5=minor, 1=diminished
// complexity 0=unison, 1=polychord (up to 5 voices)
function buildChord(mode: number, complexity: number, voices: number): number[] {
  const major = [0, 4, 7, 11, 14];
  const minor = [0, 3, 7, 10, 14];
  const dim   = [0, 3, 6,  9, 12];
  const noteCount = Math.max(1, Math.min(5, Math.ceil(1 + complexity * 4)));
  const result: number[] = [];
  for (let i = 0; i < noteCount; i++) {
    let s: number;
    if (mode < 0.5) {
      const t = mode * 2;
      s = Math.round(major[i] * (1 - t) + minor[i] * t);
    } else {
      const t = (mode - 0.5) * 2;
      s = Math.round(minor[i] * (1 - t) + dim[i] * t);
    }
    result.push(s);
  }
  return result.slice(0, voices);
}

function calcChordLabel(mode: number, complexity: number): string {
  const q = mode < 0.25 ? "maj" : mode < 0.6 ? "min" : "dim";
  const e = complexity < 0.6 ? "" : complexity < 0.8 ? "7" : "9";
  return q + e;
}

// Compute vertex canvas position for an axis at a given value
function axisVertex(i: number, val: number, cx: number, cy: number, r: number) {
  const a = AXIS_ANGLES[i];
  return { x: cx + Math.cos(a) * r * val, y: cy + Math.sin(a) * r * val };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConceptSteer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef   = useRef(0);

  // [Brightness, Density, Regularity, Complexity, Energy, Mode] each 0–1
  const valsRef   = useRef<number[]>([0.70, 0.50, 0.60, 0.50, 0.50, 0.20]);

  const dragAxis  = useRef(-1); // -1 = none
  const layoutRef = useRef({ cx: 0, cy: 0, r: 0 });

  const acRef     = useRef<AudioContext | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [hudText, setHudText] = useState("— BPM · —");

  // ── Pointer interaction ───────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { cx, cy, r } = layoutRef.current;
      let bestIdx = -1, bestDist = 30;
      for (let i = 0; i < 6; i++) {
        const vp = axisVertex(i, valsRef.current[i], cx, cy, r);
        const d = Math.hypot(px - vp.x, py - vp.y);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        dragAxis.current = bestIdx;
        canvas.setPointerCapture(e.pointerId);
      }
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragAxis.current < 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { cx, cy, r } = layoutRef.current;
      const angle = AXIS_ANGLES[dragAxis.current];
      const proj = (px - cx) * Math.cos(angle) + (py - cy) * Math.sin(angle);
      const next = [...valsRef.current];
      next[dragAxis.current] = Math.max(0, Math.min(1, proj / r));
      valsRef.current = next;
    },
    []
  );

  const handlePointerUp = useCallback(() => { dragAxis.current = -1; }, []);

  // ── Audio synthesis ───────────────────────────────────────────────────────

  const fireChord = useCallback(() => {
    const ac   = acRef.current;
    const filt = filterRef.current;
    if (!ac || !filt) return;
    const [brightness, density, regularity, complexity, energy, mode] = valsRef.current;
    const bpm    = calcBpm(density);
    const voices = calcVoices(density);
    const chord  = buildChord(mode, complexity, voices);
    const attack = calcAttack(energy);
    const peak   = calcPeak(energy);
    const dur    = Math.max(0.08, (60 / bpm) * (0.15 + regularity * 0.75));
    const atk    = Math.min(attack, dur * 0.4);
    const now    = ac.currentTime;
    const arpGap = density > 0.45 ? (60 / bpm) / Math.max(1, chord.length) * 0.65 : 0;

    filt.frequency.exponentialRampToValueAtTime(
      Math.max(80, calcFilterFc(brightness)),
      now + 0.25
    );

    for (let i = 0; i < chord.length; i++) {
      const timeOff = i * arpGap + (regularity < 0.4 ? Math.random() * 0.03 : 0);
      const freqJitter = regularity < 0.4 ? (0.98 + Math.random() * 0.04) : 1;
      const freq = 130.81 * Math.pow(2, chord[i] / 12) * freqJitter;
      const t0   = now + timeOff;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(filt);
      osc.type = "triangle";
      osc.frequency.value = freq;
      const p = peak / Math.sqrt(Math.max(1, chord.length));
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(p, t0 + atk);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
  }, []);

  const startPlaying = useCallback(() => {
    const ac = new AudioContext();
    acRef.current = ac;
    const filt = ac.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 2000;
    filt.Q.value = 0.7;
    filterRef.current = filt;
    const master = ac.createGain();
    master.gain.value = 0.75;
    filt.connect(master);
    master.connect(ac.destination);
    fireChord();
    setPlaying(true);
    const tick = () => {
      fireChord();
      timerRef.current = setTimeout(tick, 60000 / calcBpm(valsRef.current[1]));
    };
    timerRef.current = setTimeout(tick, 60000 / calcBpm(valsRef.current[1]));
  }, [fireChord]);

  const stopPlaying = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    acRef.current?.close();
    acRef.current = null;
    filterRef.current = null;
    setPlaying(false);
  }, []);

  // ── Canvas render loop ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const el = canvas.parentElement;
      w = el ? el.clientWidth : window.innerWidth;
      h = el ? el.clientHeight : window.innerHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastHud = 0;

    const render = (ts: number) => {
      const vals = valsRef.current;
      const [brightness, density, , complexity, , mode] = vals;

      ctx.fillStyle = "rgb(6,6,10)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const r  = Math.min(w, h) * 0.34;
      layoutRef.current = { cx, cy, r };

      // Ambient glow from current concept position
      const bgR = Math.round(AXIS_COLORS[0][0] * brightness * 0.5 + AXIS_COLORS[5][0] * mode * 0.2);
      const bgG = Math.round(AXIS_COLORS[0][1] * brightness * 0.4 + AXIS_COLORS[3][1] * complexity * 0.2);
      const bgB = Math.round(AXIS_COLORS[0][2] * brightness * 0.3 + AXIS_COLORS[5][2] * mode * 0.4);
      const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.8);
      bgGlow.addColorStop(0, `rgba(${bgR},${bgG},${bgB},0.20)`);
      bgGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      // Concentric hexagonal grid rings at 25 / 50 / 75 / 100%
      for (let ring = 1; ring <= 4; ring++) {
        const rr = r * ring / 4;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = AXIS_ANGLES[i];
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = ring === 4 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
        ctx.lineWidth = ring === 4 ? 1 : 0.5;
        ctx.stroke();
      }

      // Axis spokes
      for (let i = 0; i < 6; i++) {
        const a = AXIS_ANGLES[i];
        const [cr, cg, cb] = AXIS_COLORS[i];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.20)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Concept polygon — filled + outlined
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const vp = axisVertex(i, vals[i], cx, cy, r);
        i === 0 ? ctx.moveTo(vp.x, vp.y) : ctx.lineTo(vp.x, vp.y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${bgR},${bgG},${bgB},0.10)`;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const vp = axisVertex(i, vals[i], cx, cy, r);
        i === 0 ? ctx.moveTo(vp.x, vp.y) : ctx.lineTo(vp.x, vp.y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.50)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";

      // Vertex handles
      for (let i = 0; i < 6; i++) {
        const vp = axisVertex(i, vals[i], cx, cy, r);
        const [cr, cg, cb] = AXIS_COLORS[i];
        const active = dragAxis.current === i;
        ctx.shadowBlur = active ? 22 : 10;
        ctx.shadowColor = `rgb(${cr},${cg},${cb})`;
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, active ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Axis labels + values
      ctx.textBaseline = "middle";
      for (let i = 0; i < 6; i++) {
        const a = AXIS_ANGLES[i];
        const labelR = r + 30;
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        const [cr, cg, cb] = AXIS_COLORS[i];

        ctx.textAlign = Math.abs(lx - cx) < 12 ? "center" : lx < cx ? "right" : "left";
        ctx.font = "11px monospace";
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.85)`;
        ctx.fillText(AXIS_LABELS[i], lx, ly);

        const lyVal = Math.sin(a) < -0.3 ? ly - 14 : ly + 14;
        ctx.font = "9px monospace";
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.45)`;
        ctx.fillText(vals[i].toFixed(2), lx, lyVal);
      }

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.fill();

      if (ts - lastHud > 200) {
        lastHud = ts;
        setHudText(`${calcBpm(vals[1])} BPM · ${calcChordLabel(vals[5], vals[3])}`);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => () => { stopPlaying(); }, [stopPlaying]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div className="text-[10px] tracking-[0.2em] uppercase text-white/30 mb-1">
          Concept Steer
        </div>
        {playing && (
          <div className="text-[11px] text-white/40 tracking-wider">{hudText}</div>
        )}
      </div>

      {/* Pre-play splash */}
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="pointer-events-auto text-center px-6">
            <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Concept Steer</h1>
            <p className="text-sm text-white/50 max-w-sm mb-2 leading-relaxed">
              Navigate music as a space of named concepts.
            </p>
            <p className="text-xs text-white/35 max-xs mb-5 leading-relaxed">
              Six axes derived from music AI internal representations:
              <br />Brightness · Density · Regularity · Complexity · Energy · Mode.
              <br />Drag any handle on the radar chart. The synthesizer follows.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mb-5">
              {Object.keys(PRESETS).map(name => (
                <button
                  key={name}
                  onClick={() => { valsRef.current = [...PRESETS[name]]; }}
                  className="px-3 py-1.5 text-xs tracking-wide border border-white/20 rounded hover:bg-white/5 hover:border-white/40 transition"
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              onClick={startPlaying}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              ▶ Play
            </button>
            <Link href="/dream" className="block mt-8 text-[11px] text-white/30 hover:text-white/60">
              ← back to dream sandbox
            </Link>
          </div>
        </div>
      )}

      {/* Running controls */}
      {playing && (
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 items-end pointer-events-auto">
          <div className="flex flex-wrap gap-1 justify-end mb-0.5">
            {Object.keys(PRESETS).map(name => (
              <button
                key={name}
                onClick={() => { valsRef.current = [...PRESETS[name]]; }}
                className="px-2 py-1 text-[10px] tracking-wide border border-white/15 rounded hover:bg-white/5 hover:border-white/35 transition"
              >
                {name}
              </button>
            ))}
          </div>
          <button
            onClick={stopPlaying}
            className="text-[10px] tracking-wider uppercase text-white/50 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1 rounded"
          >
            stop
          </button>
          <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">
            ← back
          </Link>
        </div>
      )}

      {/* Route label */}
      <div className="absolute bottom-4 left-4 text-[10px] text-white/20 pointer-events-none select-none">
        /dream/52-concept-steer
      </div>
    </div>
  );
}
