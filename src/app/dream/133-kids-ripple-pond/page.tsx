"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic: C3 E3 G3 A3 C4 — mapped left→right by X position
const NOTE_HZ   = [130.81, 164.81, 196.0, 220.0, 261.63];
const NOTE_COLS = ["#8b5cf6", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4"];
// violet  rose    amber   emerald  cyan

const RING_SPEED  = 65;  // px/s — ripple expansion rate
const MAX_RIPPLES = 12;  // cap for performance on low-end tablets

let uidCounter = 0;

interface Ripple {
  id: number;
  x: number; y: number;   // CSS px, center
  r: number;              // current radius
  noteIdx: number;
  maxR: number;           // fade-out distance
  bounced: number;        // bitmask: 1=left 2=right 4=top 8=bottom
}

interface Flash {
  x: number; y: number;
  t: number;              // 0→1, drives fade + expansion
  col1: string;
  col2: string;
}

interface StoneDrop {
  x: number; y: number;
  t: number;              // 0→1 over 350 ms — stone-impact animation
  noteIdx: number;
}

interface BounceRing {
  cx: number; cy: number; // virtual image-source (may be off-screen)
  r: number;              // current radius (starts at wall-distance)
  noteIdx: number;
  maxR: number;
}

function buildImpulse(actx: AudioContext): AudioBuffer {
  const sr  = actx.sampleRate;
  const len = Math.floor(sr * 1.4);
  const buf = actx.createBuffer(1, len, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++)
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
  return buf;
}

function playNote(
  actx: AudioContext,
  conv: ConvolverNode,
  master: GainNode,
  freq: number,
  peakGain = 0.20
) {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  const env = actx.createGain();
  const wet = actx.createGain();

  osc.type = "triangle";
  osc.frequency.value = freq;

  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peakGain, now + 0.025);
  env.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

  wet.gain.value = 0.20;

  osc.connect(env);
  env.connect(master);
  env.connect(wet);
  wet.connect(conv);

  osc.start(now);
  osc.stop(now + 1.4);
}

export default function KidsRipplePond() {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const actxRef        = useRef<AudioContext | null>(null);
  const convRef        = useRef<ConvolverNode | null>(null);
  const masterRef      = useRef<GainNode | null>(null);
  const ripplesRef     = useRef<Ripple[]>([]);
  const flashesRef     = useRef<Flash[]>([]);
  const stoneDropsRef  = useRef<StoneDrop[]>([]);
  const bounceRingsRef = useRef<BounceRing[]>([]);
  const collidedRef    = useRef<Set<string>>(new Set());
  const [started, setStarted] = useState(false);

  function handleStart() {
    const actx   = new AudioContext();
    const conv   = actx.createConvolver();
    const master = actx.createGain();

    conv.buffer       = buildImpulse(actx);
    master.gain.value = 0.80;

    conv.connect(master);
    master.connect(actx.destination);

    actxRef.current   = actx;
    convRef.current   = conv;
    masterRef.current = master;

    // Ambient drone: C3 + E3 + G3 — barely audible, keeps the pond alive
    ([130.81, 164.81, 196.0] as const).forEach((freq, i) => {
      const osc = actx.createOscillator();
      const g   = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = [0.007, 0.005, 0.004][i];
      osc.connect(g);
      g.connect(master);
      osc.start();
    });

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
    let last  = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const actx   = actxRef.current;
      const conv   = convRef.current;
      const master = masterRef.current;
      if (!actx || !conv || !master) return;

      const rect = canvas.getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;
      const W    = canvas.offsetWidth;
      const H    = canvas.offsetHeight;

      // Map X → pentatonic note index (0–4)
      const noteIdx = Math.min(4, Math.floor((px / W) * 5));
      const maxR    = Math.hypot(W, H) * 0.60;

      // Drop oldest if at capacity
      if (ripplesRef.current.length >= MAX_RIPPLES) {
        ripplesRef.current.shift();
      }

      ripplesRef.current.push({
        id: uidCounter++,
        x: px, y: py,
        r: 0,
        noteIdx,
        maxR,
        bounced: 0,
      });

      // Stone-drop impact animation (replaces the old tiny white dot)
      stoneDropsRef.current.push({ x: px, y: py, t: 0, noteIdx });

      playNote(actx, conv, master, NOTE_HZ[noteIdx]);
    };

    canvas.addEventListener("pointerdown", onPointer);

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(last === 0 ? 16 : ts - last, 80) * 0.001;
      last = ts;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      const actx   = actxRef.current;
      const conv   = convRef.current;
      const master = masterRef.current;

      // Expand all ripple rings
      for (const rip of ripplesRef.current) rip.r += RING_SPEED * dt;

      // Expand bounce rings
      for (const br of bounceRingsRef.current) br.r += RING_SPEED * dt;

      // Advance flash animations
      for (const f of flashesRef.current) f.t += dt * 2.4;

      // Advance stone-drop animations (350 ms each)
      for (const sd of stoneDropsRef.current) sd.t += dt / 0.35;

      // Edge-bounce detection — image-source reflection off each wall
      for (const rip of ripplesRef.current) {
        const bR = rip.maxR * 0.65; // bounce rings travel slightly less far
        // Left wall (x = 0): virtual source at (-x, y)
        if (!(rip.bounced & 1) && rip.r >= rip.x) {
          rip.bounced |= 1;
          bounceRingsRef.current.push({ cx: -rip.x, cy: rip.y, r: rip.x, noteIdx: rip.noteIdx, maxR: bR });
        }
        // Right wall (x = W): virtual source at (2W - x, y)
        if (!(rip.bounced & 2) && rip.r >= W - rip.x) {
          rip.bounced |= 2;
          bounceRingsRef.current.push({ cx: 2 * W - rip.x, cy: rip.y, r: W - rip.x, noteIdx: rip.noteIdx, maxR: bR });
        }
        // Top wall (y = 0): virtual source at (x, -y)
        if (!(rip.bounced & 4) && rip.r >= rip.y) {
          rip.bounced |= 4;
          bounceRingsRef.current.push({ cx: rip.x, cy: -rip.y, r: rip.y, noteIdx: rip.noteIdx, maxR: bR });
        }
        // Bottom wall (y = H): virtual source at (x, 2H - y)
        if (!(rip.bounced & 8) && rip.r >= H - rip.y) {
          rip.bounced |= 8;
          bounceRingsRef.current.push({ cx: rip.x, cy: 2 * H - rip.y, r: H - rip.y, noteIdx: rip.noteIdx, maxR: bR });
        }
      }

      // Collision detection — external tangency: r₁ + r₂ ≥ dist(c₁, c₂)
      const ripples = ripplesRef.current;
      for (let i = 0; i < ripples.length; i++) {
        for (let j = i + 1; j < ripples.length; j++) {
          const a = ripples[i];
          const b = ripples[j];
          const key = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
          if (collidedRef.current.has(key)) continue;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (a.r + b.r >= dist) {
            collidedRef.current.add(key);
            // Collision point: along line from a to b at distance r_a from a
            const t = dist > 0 ? a.r / dist : 0.5;
            const fx = a.x + (b.x - a.x) * t;
            const fy = a.y + (b.y - a.y) * t;
            flashesRef.current.push({
              x: fx, y: fy,
              t: 0,
              col1: NOTE_COLS[a.noteIdx],
              col2: NOTE_COLS[b.noteIdx],
            });
            // Chord — both notes at reduced gain
            if (actx && conv && master) {
              playNote(actx, conv, master, NOTE_HZ[a.noteIdx], 0.12);
              if (a.noteIdx !== b.noteIdx)
                playNote(actx, conv, master, NOTE_HZ[b.noteIdx], 0.12);
            }
          }
        }
      }

      // Expire rings and flashes
      ripplesRef.current     = ripplesRef.current.filter(r => r.r < r.maxR);
      bounceRingsRef.current = bounceRingsRef.current.filter(br => br.r < br.maxR);
      flashesRef.current     = flashesRef.current.filter(f => f.t < 1);
      stoneDropsRef.current  = stoneDropsRef.current.filter(sd => sd.t < 1);

      // Clean collision history when pond is empty
      if (ripplesRef.current.length === 0) collidedRef.current.clear();

      // ── Draw ──────────────────────────────────────────────────

      // Deep ocean background
      ctx.fillStyle = "#020a1a";
      ctx.fillRect(0, 0, W, H);

      // Gentle caustic shimmer — deterministic, slow
      const tSlow = ts * 0.00025;
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const shimX = ((Math.sin(i * 2.399 + tSlow * 0.7) + 1) / 2) * W;
        const shimY = ((Math.cos(i * 1.618 + tSlow * 0.5) + 1) / 2) * H;
        const rg = ctx.createRadialGradient(shimX, shimY, 0, shimX, shimY, 28 + i * 7);
        rg.addColorStop(0, "rgba(40,140,220,0.045)");
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();

      // Bounce rings — dimmer, drawn behind primary rings
      ctx.save();
      for (const br of bounceRingsRef.current) {
        const fade = Math.max(0, 1 - br.r / br.maxR);
        ctx.globalAlpha = fade * 0.38;
        ctx.shadowColor = NOTE_COLS[br.noteIdx];
        ctx.shadowBlur  = 7 * fade;
        ctx.beginPath();
        ctx.arc(br.cx, br.cy, br.r, 0, 2 * Math.PI);
        ctx.strokeStyle = NOTE_COLS[br.noteIdx];
        ctx.lineWidth   = 1.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();

      // Primary ripple rings
      ctx.save();
      for (const rip of ripplesRef.current) {
        const alpha = Math.max(0, 1 - rip.r / rip.maxR);
        ctx.globalAlpha = alpha * 0.80;
        ctx.shadowColor  = NOTE_COLS[rip.noteIdx];
        ctx.shadowBlur   = 10 * alpha;
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.r, 0, 2 * Math.PI);
        ctx.strokeStyle = NOTE_COLS[rip.noteIdx];
        ctx.lineWidth   = 2.5 * (0.4 + alpha * 0.6);
        ctx.stroke();
        // Inner secondary ring (softer, half radius behind)
        if (rip.r > 22) {
          ctx.globalAlpha = alpha * 0.22;
          ctx.shadowBlur  = 0;
          ctx.beginPath();
          ctx.arc(rip.x, rip.y, rip.r - 18, 0, 2 * Math.PI);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();

      // Stone-drop impact animations — two quick rings + white dot at tap point
      ctx.save();
      for (const sd of stoneDropsRef.current) {
        const col = NOTE_COLS[sd.noteIdx];
        // Outer ring: expands 0→28 px over 350 ms, fades fast
        const r1 = sd.t * 28;
        const a1 = Math.max(0, 1 - sd.t * 1.65);
        if (a1 > 0) {
          ctx.globalAlpha = a1 * 0.90;
          ctx.shadowColor = col;
          ctx.shadowBlur  = 10;
          ctx.beginPath();
          ctx.arc(sd.x, sd.y, r1, 0, 2 * Math.PI);
          ctx.strokeStyle = col;
          ctx.lineWidth   = 2.2;
          ctx.stroke();
        }
        // Inner ring: smaller, fades faster
        const r2 = sd.t * 15;
        const a2 = Math.max(0, 1 - sd.t * 2.4);
        if (a2 > 0) {
          ctx.globalAlpha = a2 * 0.55;
          ctx.shadowBlur  = 0;
          ctx.beginPath();
          ctx.arc(sd.x, sd.y, r2, 0, 2 * Math.PI);
          ctx.strokeStyle = col;
          ctx.lineWidth   = 1.4;
          ctx.stroke();
        }
        // Central white dot: 6 px → 0 over first 45% of animation
        if (sd.t < 0.45) {
          const dotFrac = 1 - sd.t / 0.45;
          ctx.globalAlpha = dotFrac * 0.92;
          ctx.shadowColor = "#ffffff";
          ctx.shadowBlur  = 6;
          ctx.beginPath();
          ctx.arc(sd.x, sd.y, 5 * dotFrac, 0, 2 * Math.PI);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();

      // Collision flashes
      ctx.save();
      for (const f of flashesRef.current) {
        const alpha  = Math.max(0, 1 - f.t);
        const radius = 10 + f.t * 58;
        ctx.globalAlpha = alpha * 0.88;
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
        grad.addColorStop(0,    "#ffffff");
        grad.addColorStop(0.25, f.col1);
        grad.addColorStop(0.70, f.col2 + "88");
        grad.addColorStop(1,    "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, 2 * Math.PI);
        ctx.fill();
        // Sparkle ring
        ctx.globalAlpha = alpha * 0.55;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius * 0.85, 0, 2 * Math.PI);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth   = 1.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Empty-state hint
      if (ripplesRef.current.length === 0 && stoneDropsRef.current.length === 0) {
        ctx.save();
        ctx.globalAlpha  = 0.58;
        ctx.font         = "16px monospace";
        ctx.fillStyle    = "#fff";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap anywhere to drop a stone", W / 2, H / 2);
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#020a1a] text-white gap-6 px-6 text-center">
        <div className="text-5xl select-none" aria-hidden="true">💧</div>
        <h1 className="text-2xl font-serif text-white/95">Ripple Pond</h1>
        <p className="text-base text-white/75 max-w-xs">
          Tap to drop a stone — the ripple sings. When two ripples meet, they make a chord
          and burst with light.
        </p>
        <div className="flex gap-3 items-center opacity-45 select-none mt-1" aria-hidden="true">
          {NOTE_COLS.map((col, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: col,
                boxShadow: `0 0 8px ${col}`,
              }}
            />
          ))}
        </div>
        <button
          className="min-h-[64px] min-w-[220px] bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/40 rounded-2xl px-8 py-4 text-white/95 text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          💧 Open the pond
        </button>
        <p className="text-sm text-white/55">no microphone needed · for kids 3+</p>
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
