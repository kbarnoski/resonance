"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic per tree depth: C3 E3 G3 A3 C4
const DEPTH_FREQS   = [130.81, 164.81, 196.0, 220.0, 261.63];
// Colors warm from violet (root) to amber/gold (tips)
const DEPTH_COLORS  = ["#7c3aed", "#4f46e5", "#0284c7", "#059669", "#d97706"];
const DEPTH_WIDTHS  = [4.5, 3.0, 2.0, 1.4, 0.9];
// Segment length as fraction of canvas height
const DEPTH_LENGTHS = [0.20, 0.13, 0.085, 0.055, 0.038];
// Growth duration per segment (seconds)
const DEPTH_DURS    = [2.5, 1.8, 1.4, 1.1, 0.9];
// KS pluck gain per depth (quieter at tips)
const DEPTH_GAINS   = [0.30, 0.24, 0.19, 0.15, 0.12];

const MAX_TREES = 4;

interface Seg {
  x0: number; y0: number;
  x1: number; y1: number;
  depth: number;
  tStart: number; // seconds since tree.plantedAt
  tEnd: number;
  plucked: boolean;
  isTerminal: boolean;
  leafAngle: number; // flutter seed (radians)
}

interface GrowTree {
  seedX: number;
  seedY: number;
  segs: Seg[];
  plantedAt: number; // performance.now() / 1000
}

// Pre-compute Karplus-Strong buffer offline (avoids delay-line constraints)
function buildKarplusBuffer(actx: AudioContext, freq: number): AudioBuffer {
  const sr      = actx.sampleRate;
  const dur     = Math.max(1.5, 3.5 - freq / 280);
  const bufLen  = Math.round(sr * dur);
  const ringLen = Math.max(4, Math.round(sr / freq));
  const ring    = new Float32Array(ringLen);
  for (let i = 0; i < ringLen; i++) ring[i] = (Math.random() * 2 - 1) * 0.7;
  const data = new Float32Array(bufLen);
  for (let n = 0; n < bufLen; n++) {
    const ri = n % ringLen;
    data[n]  = ring[ri];
    ring[ri] = 0.9968 * 0.5 * (ring[ri] + ring[(n + 1) % ringLen]);
  }
  const buf = actx.createBuffer(1, bufLen, sr);
  buf.getChannelData(0).set(data);
  return buf;
}

// Generate all branch segments for one tree (upfront, then animated)
function generateSegs(seedX: number, seedY: number): Seg[] {
  const segs: Seg[] = [];

  const addBranch = (
    x: number, y: number,
    angleDeg: number,
    depth: number,
    parentTEnd: number,
  ): void => {
    if (depth >= 5) return;
    const rad  = (angleDeg * Math.PI) / 180;
    const len  = DEPTH_LENGTHS[depth];
    const x1   = x + Math.sin(rad) * len;
    const y1   = y - Math.cos(rad) * len; // canvas y decreases = visually upward
    if (y1 < 0.02) return; // clip at canvas top

    const tStart = parentTEnd + Math.random() * 0.25;
    const tEnd   = tStart + DEPTH_DURS[depth] * (0.85 + Math.random() * 0.3);

    segs.push({
      x0: x, y0: y, x1, y1, depth, tStart, tEnd,
      plucked: false,
      isTerminal: depth === 4,
      leafAngle: Math.random() * Math.PI * 2,
    });

    if (depth < 4) {
      // Alternating 25°/35° per depth level for organic asymmetry
      const spread = depth % 2 === 0 ? 25 : 32;
      const jitter = (Math.random() - 0.5) * 8;
      addBranch(x1, y1, angleDeg - spread + jitter, depth + 1, tEnd);
      addBranch(x1, y1, angleDeg + spread + jitter, depth + 1, tEnd);
    }
  };

  addBranch(seedX, seedY, 0, 0, 0);
  return segs;
}

// Soft brown-noise wind layer — felt rather than heard
function startWind(actx: AudioContext, dest: AudioNode): void {
  const sr  = actx.sampleRate;
  const buf = actx.createBuffer(1, sr * 2, sr);
  const dat = buf.getChannelData(0);
  for (let i = 0; i < dat.length; i++) dat[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.loop   = true;
  const lp   = actx.createBiquadFilter();
  lp.type    = "lowpass";
  lp.frequency.value = 220;
  const g    = actx.createGain();
  g.gain.value = 0;
  src.connect(lp);
  lp.connect(g);
  g.connect(dest);
  src.start();
  g.gain.setTargetAtTime(0.038, actx.currentTime, 2.5);
}

export default function KidsSeedSong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef   = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const ksBufsRef = useRef<AudioBuffer[]>([]);
  const treesRef  = useRef<GrowTree[]>([]);
  const [started, setStarted] = useState(false);

  function handleStart() {
    const actx   = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.82;
    master.connect(actx.destination);
    actxRef.current   = actx;
    masterRef.current = master;
    // Pre-compute all 5 KS buffers (one per depth/pitch)
    ksBufsRef.current = DEPTH_FREQS.map(f => buildKarplusBuffer(actx, f));
    startWind(actx, master);
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let rafId = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (treesRef.current.length >= MAX_TREES) return;
      const rect = canvas.getBoundingClientRect();
      const xN   = (e.clientX - rect.left) / canvas.offsetWidth;
      const yN   = (e.clientY - rect.top)  / canvas.offsetHeight;
      treesRef.current.push({
        seedX: xN, seedY: yN,
        segs: generateSegs(xN, yN),
        plantedAt: performance.now() / 1000,
      });
    };
    canvas.addEventListener("pointerdown", onPointer, { passive: false });

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      const W   = canvas.offsetWidth;
      const H   = canvas.offsetHeight;
      const now = ts / 1000;

      // Dark forest background
      ctx.fillStyle = "#060d06";
      ctx.fillRect(0, 0, W, H);

      const actx   = actxRef.current;
      const master = masterRef.current;
      const ksBufs = ksBufsRef.current;

      for (const tree of treesRef.current) {
        const elapsed = now - tree.plantedAt;

        // Glowing seed dot at base
        ctx.save();
        ctx.beginPath();
        ctx.arc(tree.seedX * W, tree.seedY * H, 4, 0, Math.PI * 2);
        ctx.fillStyle   = "#7c3aed";
        ctx.shadowColor = "#7c3aed";
        ctx.shadowBlur  = 12;
        ctx.fill();
        ctx.restore();

        for (const seg of tree.segs) {
          if (elapsed < seg.tStart) continue;
          const t    = Math.min(1, (elapsed - seg.tStart) / (seg.tEnd - seg.tStart));
          const curX = seg.x0 + (seg.x1 - seg.x0) * t;
          const curY = seg.y0 + (seg.y1 - seg.y0) * t;

          // Fire KS pluck when segment reaches its endpoint
          if (t >= 0.97 && !seg.plucked) {
            seg.plucked = true;
            if (actx && master && ksBufs.length > 0) {
              const src = actx.createBufferSource();
              src.buffer = ksBufs[seg.depth];
              const g = actx.createGain();
              g.gain.value = DEPTH_GAINS[seg.depth];
              src.connect(g);
              g.connect(master);
              src.start(actx.currentTime + 0.01);
            }
          }

          // Draw growing branch
          ctx.save();
          ctx.strokeStyle = DEPTH_COLORS[seg.depth];
          ctx.lineWidth   = DEPTH_WIDTHS[seg.depth];
          ctx.lineCap     = "round";
          ctx.shadowColor = DEPTH_COLORS[seg.depth];
          ctx.shadowBlur  = seg.depth < 2 ? 6 : 2;
          ctx.beginPath();
          ctx.moveTo(seg.x0 * W, seg.y0 * H);
          ctx.lineTo(curX    * W, curY    * H);
          ctx.stroke();
          ctx.restore();

          // Leaves: 3 small fluttering ellipses at terminal tips when grown
          if (seg.isTerminal && t >= 0.97) {
            const fl = Math.sin(ts * 0.0013 + seg.leafAngle) * 0.014;
            for (let k = 0; k < 3; k++) {
              const la = seg.leafAngle + (k * Math.PI * 2) / 3;
              const lx = (seg.x1 + Math.sin(la + fl) * 0.022) * W;
              const ly = (seg.y1 + Math.cos(la + fl) * 0.015) * H;
              ctx.save();
              ctx.globalAlpha  = 0.65;
              ctx.fillStyle    = "#d97706";
              ctx.shadowColor  = "#d97706";
              ctx.shadowBlur   = 4;
              ctx.beginPath();
              ctx.ellipse(lx, ly, 5, 3, la + fl, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }

      // Instructional hint text
      const count = treesRef.current.length;
      if (count === 0) {
        ctx.save();
        ctx.globalAlpha  = 0.44;
        ctx.fillStyle    = "#ffffff";
        ctx.font         = "17px monospace";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap anywhere to plant a seed 🌱", W / 2, H / 2);
        ctx.restore();
      } else if (count >= MAX_TREES) {
        ctx.save();
        ctx.globalAlpha  = 0.30;
        ctx.fillStyle    = "#d97706";
        ctx.font         = "13px monospace";
        ctx.textAlign    = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("your forest is growing…", W / 2, H - 16);
        ctx.restore();
      }
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
      actxRef.current?.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#060d06] text-foreground gap-6 px-6 text-center">
        <div className="text-5xl select-none" aria-hidden="true">🌱</div>
        <h1 className="text-2xl font-serif text-foreground">Seed Song</h1>
        <p className="text-base text-muted-foreground max-w-xs">
          Tap anywhere to plant a seed. Watch a glowing tree grow — and hear each branch ring
          as it blooms.
        </p>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/40 rounded-2xl px-8 py-4 text-foreground text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          🌱 Plant a seed
        </button>
        <p className="text-sm text-muted-foreground">no microphone needed · for kids 4+</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ cursor: "crosshair" }}
      />
    </div>
  );
}
