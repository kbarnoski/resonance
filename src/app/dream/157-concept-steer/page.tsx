"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Hexagon vertex angles — top = Brightness, then clockwise
const AXIS_LABELS = [
  "Brightness", "Density", "Regularity", "Complexity", "Energy", "Mode",
] as const;

const AXIS_ANGLES = Array.from({ length: 6 }, (_, i) =>
  -Math.PI / 2 + (i * Math.PI * 2) / 6
);

// Presets: [Brightness, Density, Regularity, Complexity, Energy, Mode]
const PRESETS: { name: string; values: number[] }[] = [
  { name: "Classical Fugue", values: [0.85, 0.55, 0.90, 0.80, 0.55, 0.05] },
  { name: "Dark Ambient",    values: [0.15, 0.15, 0.10, 0.20, 0.20, 0.95] },
  { name: "Jazz Improv",     values: [0.75, 0.70, 0.20, 0.75, 0.65, 0.15] },
  { name: "Drone",           values: [0.30, 0.10, 0.85, 0.05, 0.30, 0.50] },
];

// Build semitone offsets from C3 for current complexity × mode
function buildSemitones(complexity: number, mode: number): number[] {
  const third = mode < 0.6 ? 4 : 3;
  const fifth = mode > 0.85 ? 6 : 7;
  const seventh = mode < 0.5 ? 11 : 10;
  if (complexity < 0.2) return [0];
  if (complexity < 0.4) return [0, fifth];
  if (complexity < 0.6) return [0, third, fifth];
  if (complexity < 0.8) return [0, third, fifth, seventh];
  return [0, third, fifth, seventh, 14];
}

// Human-readable chord name for current mode × complexity
function deriveChordName(complexity: number, mode: number): string {
  if (complexity < 0.2) return "C";
  if (complexity < 0.4) return "C5";
  if (mode < 0.4) {
    if (complexity < 0.6) return "C";
    if (complexity < 0.8) return "Cmaj7";
    return "Cmaj9";
  }
  if (mode < 0.6) {
    if (complexity < 0.6) return "Csus4";
    if (complexity < 0.8) return "C7sus4";
    return "C9sus4";
  }
  if (mode < 0.85) {
    if (complexity < 0.6) return "Cm";
    if (complexity < 0.8) return "Cm7";
    return "Cm9";
  }
  if (complexity < 0.6) return "Cdim";
  if (complexity < 0.8) return "Cdim7";
  return "Cdim9";
}

export default function ConceptSteer() {
  const [started, setStarted] = useState(false);
  const [concept, setConcept] = useState<number[]>([0.7, 0.5, 0.5, 0.5, 0.5, 0.3]);
  const [chordLabel, setChordLabel] = useState("C");

  const conceptRef = useRef<number[]>([0.7, 0.5, 0.5, 0.5, 0.5, 0.3]);
  const actxRef = useRef<AudioContext | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<number | null>(null);
  const animRef = useRef(0);

  // Sync state → ref; update filter frequency
  useEffect(() => {
    conceptRef.current = concept;
    setChordLabel(deriveChordName(concept[3], concept[5]));
    const actx = actxRef.current;
    if (filterRef.current && actx) {
      filterRef.current.frequency.setTargetAtTime(
        400 + concept[0] * 5600,
        actx.currentTime,
        0.08
      );
    }
  }, [concept]);

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      actxRef.current?.close().catch(() => {});
    };
  }, []);

  // Canvas render loop — activates after start
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawFrame = () => {
      if (!canvas.isConnected) return;
      const c = conceptRef.current;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.36;

      // Hexagonal grid rings at 25 / 50 / 75 / 100 %
      ctx.lineWidth = 1;
      for (let ring = 0.25; ring <= 1.01; ring += 0.25) {
        ctx.strokeStyle = ring === 1
          ? "rgba(255,255,255,0.12)"
          : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        AXIS_ANGLES.forEach((angle, i) => {
          const x = cx + Math.cos(angle) * maxR * ring;
          const y = cy + Math.sin(angle) * maxR * ring;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }

      // Axis lines from center to outer vertex
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      AXIS_ANGLES.forEach((angle) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
        ctx.stroke();
      });

      // Filled concept polygon
      ctx.beginPath();
      AXIS_ANGLES.forEach((angle, i) => {
        const x = cx + Math.cos(angle) * maxR * c[i];
        const y = cy + Math.sin(angle) * maxR * c[i];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(139, 92, 246, 0.14)";
      ctx.fill();
      ctx.strokeStyle = "rgba(167, 139, 250, 0.80)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Vertex handle dots
      AXIS_ANGLES.forEach((angle, i) => {
        const x = cx + Math.cos(angle) * maxR * c[i];
        const y = cy + Math.sin(angle) * maxR * c[i];
        const r = dragRef.current === i ? 13 : 9;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = dragRef.current === i
          ? "rgba(221, 214, 254, 1)"
          : "rgba(167, 139, 250, 0.90)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Axis labels + percentage values
      AXIS_ANGLES.forEach((angle, i) => {
        const labelR = maxR + 40;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.80)";
        ctx.font = "bold 12px ui-monospace,monospace";
        ctx.fillText(AXIS_LABELS[i].toUpperCase(), lx, ly);
        ctx.fillStyle = "rgba(196, 181, 253, 0.75)";
        ctx.font = "11px ui-monospace,monospace";
        ctx.fillText(Math.round(c[i] * 100) + "%", lx, ly + 17);
      });

      animRef.current = requestAnimationFrame(drawFrame);
    };
    animRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  const handleStart = () => {
    const actx = new AudioContext();
    actxRef.current = actx;
    activeRef.current = true;

    const filter = actx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400 + conceptRef.current[0] * 5600;
    filter.Q.value = 0.9;
    filter.connect(actx.destination);
    filterRef.current = filter;

    let nextBeat = actx.currentTime + 0.15;

    const loop = () => {
      if (!activeRef.current) return;
      const co = conceptRef.current;
      // Density → BPM (40–140) and voice count (1–5)
      const bpm = 40 + co[1] * 100;
      const beatLen = 60 / bpm;
      const voices = Math.round(1 + co[1] * 4);
      // Energy → attack time and gain
      const attack = 0.8 - co[4] * 0.76;
      const noteGain = (0.28 + co[4] * 0.68) / Math.max(1, voices);
      const semis = buildSemitones(co[3], co[5]);

      for (let v = 0; v < voices; v++) {
        const semi = semis[v % semis.length];
        // Higher voices go up an octave for spread
        const octave = v > 2 ? 12 : 0;
        const freq = 130.81 * Math.pow(2, (semi + octave) / 12);
        // Regularity → timing jitter (0 = grid-locked, 1 = free)
        const jitter = (1 - co[2]) * (Math.random() - 0.5) * 0.10;
        const when = Math.max(actx.currentTime + 0.001, nextBeat + jitter);
        const dur = attack + Math.max(0.08, attack * 1.3);

        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        // Dense passages: slight detuning on upper voices
        if (co[1] > 0.5 && v > 0) osc.detune.value = (Math.random() - 0.5) * 7;

        const g = actx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(noteGain, when + attack);
        g.gain.exponentialRampToValueAtTime(0.001, when + dur);

        osc.connect(g);
        g.connect(filter);
        osc.start(when);
        osc.stop(when + dur + 0.05);
      }

      nextBeat += beatLen;
      const ms = Math.max(0, (nextBeat - actx.currentTime) * 1000 - 60);
      timerRef.current = setTimeout(loop, ms);
    };

    loop();
    setStarted(true);
  };

  const getXY = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [px, py] = getXY(e);
    const cx = canvas.offsetWidth / 2;
    const cy = canvas.offsetHeight / 2;
    const maxR = Math.min(canvas.offsetWidth, canvas.offsetHeight) * 0.36;
    const c = conceptRef.current;

    let closest = -1;
    let minDist = 26;
    AXIS_ANGLES.forEach((angle, i) => {
      const vx = cx + Math.cos(angle) * maxR * c[i];
      const vy = cy + Math.sin(angle) * maxR * c[i];
      const d = Math.hypot(px - vx, py - vy);
      if (d < minDist) { minDist = d; closest = i; }
    });

    if (closest >= 0) {
      dragRef.current = closest;
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [px, py] = getXY(e);
    const cx = canvas.offsetWidth / 2;
    const cy = canvas.offsetHeight / 2;
    const maxR = Math.min(canvas.offsetWidth, canvas.offsetHeight) * 0.36;
    const i = dragRef.current;
    const angle = AXIS_ANGLES[i];
    const proj = ((px - cx) * Math.cos(angle) + (py - cy) * Math.sin(angle)) / maxR;
    const val = Math.max(0.02, Math.min(1, proj));
    setConcept((prev) => { const n = [...prev]; n[i] = val; return n; });
  };

  const handlePointerUp = () => { dragRef.current = null; };

  return (
    <div className="relative flex flex-col w-full" style={{ height: "calc(100vh - 3rem)" }}>
      {!started ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-4">
            Dream Lab · 157
          </p>
          <h1 className="text-2xl md:text-3xl font-serif mb-3 text-foreground">
            Concept Steer
          </h1>
          <p className="text-base text-foreground max-w-sm mb-3 leading-relaxed">
            A hexagonal radar chart where each vertex controls a musical dimension:
            Brightness, Density, Regularity, Complexity, Energy, Mode.
          </p>
          <p className="text-sm text-muted-foreground max-w-xs mb-8 leading-relaxed">
            These six axes are what music AI models learn internally — surfaced by sparse
            autoencoder research on transformer weights. Now they are your synthesizer controls.
          </p>
          <button
            onClick={handleStart}
            className="px-6 py-2.5 min-h-[44px] text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
          >
            Begin
          </button>
          <Link
            href="/dream"
            className="mt-12 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back to dream sandbox
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 relative overflow-hidden">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
              style={{ background: "#050508" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            {/* Live chord label */}
            <div className="absolute top-4 inset-x-0 text-center pointer-events-none">
              <span className="text-xl font-mono text-violet-300">{chordLabel}</span>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
              <p className="text-[11px] text-muted-foreground/70">drag vertices · music follows</p>
              <Link
                href="/dream/157-concept-steer/README.md"
                className="pointer-events-auto text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
              >
                design notes ↗
              </Link>
            </div>
          </div>

          {/* Presets row */}
          <div className="shrink-0 border-t border-border px-4 py-3 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider mr-1">
              Presets
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => setConcept([...p.values])}
                className="text-xs px-3 py-1.5 min-h-[36px] rounded border border-border text-muted-foreground hover:border-violet-400/50 hover:text-foreground transition"
              >
                {p.name}
              </button>
            ))}
            <div className="ml-auto">
              <Link
                href="/dream"
                className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
              >
                ← back
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
