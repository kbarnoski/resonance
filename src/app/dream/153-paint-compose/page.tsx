"use client";
import { useEffect, useRef, useState } from "react";

// Pentatonic scale C2–C5 (20 notes, sorted ascending)
const PENTA: number[] = [];
const PENTA_BASE = [261.63, 293.66, 329.63, 392.0, 440.0]; // C4 D4 E4 G4 A4
for (let o = -2; o <= 1; o++) {
  for (const f of PENTA_BASE) PENTA.push(f * Math.pow(2, o));
}
PENTA.sort((a, b) => a - b);

const PALETTE = [
  { hue: 270, name: "violet" },
  { hue: 210, name: "blue" },
  { hue: 165, name: "cyan" },
  { hue: 120, name: "emerald" },
  { hue: 55, name: "amber" },
  { hue: 20, name: "rose" },
  { hue: 310, name: "pink" },
];

const BRUSH_SIZES = [2, 5, 10];
const MAX_VOICES = 6;

type Pt = { x: number; y: number };

type Voice = {
  id: number;
  rawPts: Pt[];
  notePts: Pt[];
  freqs: number[];
  hue: number;
  brushW: number;
  wave: OscillatorType;
  pan: number;
  gain: number;
  noteCount: number;
  noteIdx: number;
  nextBeat: number;
  flash: Float32Array;
};

function pitchAt(y: number, h: number): number {
  const t = 1 - y / h;
  const i = Math.round(t * (PENTA.length - 1));
  return PENTA[Math.max(0, Math.min(PENTA.length - 1, i))];
}

function waveFor(hue: number): OscillatorType {
  if (hue < 50 || hue > 310) return "sawtooth";
  if (hue >= 130 && hue <= 230) return "sine";
  return "triangle";
}

function resamplePath(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) return [pts[0] ?? { x: 0, y: 0 }];
  if (n === 1) return [pts[Math.floor(pts.length / 2)]];
  const arcs = [0];
  for (let i = 1; i < pts.length; i++) {
    arcs.push(arcs[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = arcs[arcs.length - 1];
  const out: Pt[] = [];
  for (let s = 0; s < n; s++) {
    const target = (s / (n - 1)) * total;
    let lo = 0, hi = arcs.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (arcs[mid] <= target) lo = mid; else hi = mid;
    }
    const span = arcs[hi] - arcs[lo];
    const frac = span > 0 ? (target - arcs[lo]) / span : 0;
    out.push({
      x: pts[lo].x + frac * (pts[hi].x - pts[lo].x),
      y: pts[lo].y + frac * (pts[hi].y - pts[lo].y),
    });
  }
  return out;
}

export default function PaintComposePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voicesRef = useRef<Voice[]>([]);
  const draftRef = useRef<{ pts: Pt[] } | null>(null);
  const nextIdRef = useRef(0);
  const schedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [started, setStarted] = useState(false);
  const [hue, setHue] = useState(270);
  const [brushW, setBrushW] = useState(5);
  const [bpm, setBpm] = useState(80);
  const [count, setCount] = useState(0);

  const hueRef = useRef(270);
  const brushWRef = useRef(5);
  const bpmRef = useRef(80);

  // rAF draw loop — runs once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const doResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    doResize();
    window.addEventListener("resize", doResize);

    const drawLoop = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      ctx.fillStyle = "#030308";
      ctx.fillRect(0, 0, W, H);

      for (const v of voicesRef.current) {
        // Draw raw stroke path
        if (v.rawPts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(v.rawPts[0].x, v.rawPts[0].y);
          for (let i = 1; i < v.rawPts.length; i++) {
            ctx.lineTo(v.rawPts[i].x, v.rawPts[i].y);
          }
          ctx.strokeStyle = `hsla(${v.hue},72%,52%,0.6)`;
          ctx.lineWidth = v.brushW;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.shadowBlur = 6;
          ctx.shadowColor = `hsla(${v.hue},85%,62%,0.35)`;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Draw note-trigger dots with flash
        for (let i = 0; i < v.notePts.length; i++) {
          const p = v.notePts[i];
          const fl = v.flash[i];
          const r = v.brushW * 0.7 + fl * 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${v.hue},90%,${52 + fl * 32}%,${0.38 + fl * 0.62})`;
          if (fl > 0.08) {
            ctx.shadowBlur = fl * 22;
            ctx.shadowColor = `hsla(${v.hue},100%,78%,${fl * 0.9})`;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
          if (v.flash[i] > 0.005) {
            v.flash[i] *= 0.82;
          } else {
            v.flash[i] = 0;
          }
        }
      }

      // Draw in-progress stroke
      const dr = draftRef.current;
      if (dr && dr.pts.length > 1) {
        const h = hueRef.current, w = brushWRef.current;
        ctx.beginPath();
        ctx.moveTo(dr.pts[0].x, dr.pts[0].y);
        for (let i = 1; i < dr.pts.length; i++) {
          ctx.lineTo(dr.pts[i].x, dr.pts[i].y);
        }
        ctx.strokeStyle = `hsla(${h},80%,65%,0.9)`;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 14;
        ctx.shadowColor = `hsla(${h},90%,75%,0.55)`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(drawLoop);
    };

    raf = requestAnimationFrame(drawLoop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", doResize);
    };
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (schedRef.current) clearInterval(schedRef.current);
      actxRef.current?.close();
    };
  }, []);

  function startSession() {
    const actx = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.6;
    master.connect(actx.destination);
    actxRef.current = actx;
    masterRef.current = master;

    // Scheduler: runs every 20ms, looks 100ms ahead
    const interval = setInterval(() => {
      const a = actxRef.current, m = masterRef.current;
      if (!a || !m) return;
      const now = a.currentTime;
      const noteDur = 60 / (bpmRef.current * 2); // 8th note

      for (const v of voicesRef.current) {
        while (v.nextBeat < now + 0.1) {
          const freq = v.freqs[v.noteIdx];
          const when = v.nextBeat;
          const rel = noteDur * 0.82;

          const osc = a.createOscillator();
          const gn = a.createGain();
          const pn = a.createStereoPanner();
          osc.type = v.wave;
          osc.frequency.value = freq;
          pn.pan.value = v.pan;
          gn.gain.setValueAtTime(0, when);
          gn.gain.linearRampToValueAtTime(v.gain, when + 0.018);
          gn.gain.exponentialRampToValueAtTime(0.001, when + rel);
          osc.connect(gn);
          gn.connect(pn);
          pn.connect(m);
          osc.start(when);
          osc.stop(when + rel + 0.01);

          const ni = v.noteIdx;
          const delayMs = Math.max(0, (when - now) * 1000);
          setTimeout(() => {
            v.flash[ni] = 1.0;
          }, delayMs);

          v.noteIdx = (v.noteIdx + 1) % v.noteCount;
          v.nextBeat += noteDur;
        }
      }
    }, 20);

    schedRef.current = interval;
    setStarted(true);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!started) return;
    const r = canvasRef.current!.getBoundingClientRect();
    draftRef.current = { pts: [{ x: e.clientX - r.left, y: e.clientY - r.top }] };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draftRef.current) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
    const pts = draftRef.current.pts;
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 2) {
      pts.push(pt);
    }
  }

  function commitStroke() {
    const dr = draftRef.current;
    draftRef.current = null;
    const actx = actxRef.current;
    if (!dr || dr.pts.length < 3 || !actx) return;

    const H = canvasRef.current!.offsetHeight;
    const W = canvasRef.current!.offsetWidth;

    let arc = 0;
    for (let i = 1; i < dr.pts.length; i++) {
      arc += Math.hypot(dr.pts[i].x - dr.pts[i - 1].x, dr.pts[i].y - dr.pts[i - 1].y);
    }
    // More notes for longer strokes (2–8)
    const nc = Math.max(2, Math.min(8, Math.round(arc / 38)));
    const notePts = resamplePath(dr.pts, nc);
    const freqs = notePts.map(p => pitchAt(p.y, H));
    const meanX = dr.pts.reduce((s, p) => s + p.x, 0) / dr.pts.length;

    const v: Voice = {
      id: nextIdRef.current++,
      rawPts: dr.pts,
      notePts,
      freqs,
      hue: hueRef.current,
      brushW: brushWRef.current,
      wave: waveFor(hueRef.current),
      pan: ((meanX / W) * 2 - 1) * 0.75,
      gain: Math.min(0.72, 0.22 + brushWRef.current / 15),
      noteCount: nc,
      noteIdx: 0,
      nextBeat: actx.currentTime + 0.04,
      flash: new Float32Array(nc),
    };

    const vs = voicesRef.current;
    if (vs.length >= MAX_VOICES) vs.shift();
    vs.push(v);
    setCount(vs.length);
  }

  function clearAll() {
    voicesRef.current = [];
    setCount(0);
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "paint-compose.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  function pickHue(h: number) {
    hueRef.current = h;
    setHue(h);
  }

  function pickBrush(w: number) {
    brushWRef.current = w;
    setBrushW(w);
  }

  function pickBpm(v: number) {
    bpmRef.current = v;
    setBpm(v);
  }

  return (
    <div className="h-screen flex flex-col bg-[#030308] text-foreground select-none overflow-hidden">
      {/* Header toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-wrap">
        <div className="flex-shrink-0">
          <h1 className="text-xl font-serif text-foreground leading-tight">Paint Compose</h1>
          <p className="text-sm text-muted-foreground leading-tight">Each brushstroke loops as a melody</p>
        </div>

        {/* Color palette */}
        <div className="flex gap-1.5 ml-2">
          {PALETTE.map(c => (
            <button
              key={c.hue}
              onClick={() => pickHue(c.hue)}
              title={c.name}
              aria-label={c.name}
              className={`w-7 h-7 rounded-full flex-shrink-0 transition-all ${
                hue === c.hue
                  ? "ring-2 ring-border ring-offset-1 ring-offset-[#030308] scale-110"
                  : "opacity-55 hover:opacity-90"
              }`}
              style={{ backgroundColor: `hsl(${c.hue},72%,52%)` }}
            />
          ))}
        </div>

        {/* Brush size */}
        <div className="flex gap-1">
          {BRUSH_SIZES.map(w => (
            <button
              key={w}
              onClick={() => pickBrush(w)}
              aria-label={`brush ${w}`}
              className={`w-8 h-8 rounded flex items-center justify-center transition-all ${
                brushW === w ? "bg-muted" : "hover:bg-accent"
              }`}
            >
              <div
                className="rounded-full bg-muted"
                style={{ width: `${w + 2}px`, height: `${w + 2}px` }}
              />
            </button>
          ))}
        </div>

        {/* BPM */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>BPM</span>
          <input
            type="range"
            min={40}
            max={160}
            step={5}
            value={bpm}
            onChange={e => pickBpm(+e.target.value)}
            className="w-16 accent-violet-400"
          />
          <span className="w-8 text-foreground font-mono text-xs">{bpm}</span>
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={clearAll}
            className="text-sm px-3 py-1.5 min-h-[36px] rounded border border-border hover:bg-accent text-foreground transition-all"
          >
            Clear
          </button>
          <button
            onClick={downloadPng}
            className="text-sm px-3 py-1.5 min-h-[36px] rounded border border-border hover:bg-accent text-foreground transition-all"
          >
            ↓ PNG
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
            <p className="text-muted-foreground text-base text-center max-w-xs leading-relaxed px-4">
              Paint strokes on a dark canvas.
              <br />
              Each stroke becomes a looping melody —<br />
              <span className="text-muted-foreground text-sm">shape becomes sound, painting becomes score.</span>
            </p>
            <button
              onClick={startSession}
              className="px-8 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground font-medium text-base min-h-[48px] min-w-[160px] transition-all"
            >
              ▶ Start Painting
            </button>
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{ cursor: started ? "crosshair" : "default" }}
          className="w-full h-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={commitStroke}
          onPointerCancel={commitStroke}
        />

        {started && (
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm text-muted-foreground pointer-events-none text-center whitespace-nowrap">
            {count === 0
              ? "Draw a stroke to compose"
              : `${count} / ${MAX_VOICES} voices · draw to layer`}
          </p>
        )}
      </div>
    </div>
  );
}
