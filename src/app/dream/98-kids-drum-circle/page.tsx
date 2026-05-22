"use client";

import { useRef, useState, useEffect } from "react";

// Six drum pads — distinct colors, synthesized percussion
const PADS = [
  { color: "#E63946" }, // red    – kick
  { color: "#F4A261" }, // orange – snare
  { color: "#E9C46A" }, // yellow – hihat
  { color: "#2ABFA8" }, // teal   – tom
  { color: "#4A90D9" }, // blue   – clap
  { color: "#A855C8" }, // purple – shaker
] as const;

// Ambient C/E/G pad frequencies
const PAD_FREQS = [130.81, 164.81, 196.0] as const;

interface Ring {
  x: number;
  y: number;
  r: number;
  color: string;
  alpha: number;
}

// --- Audio synthesis helpers (module-level, no component deps) ---

function buildNoiseBuf(actx: AudioContext, secs: number): AudioBuffer {
  const n = Math.ceil(actx.sampleRate * secs);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function triggerDrum(padIdx: number, actx: AudioContext): void {
  const t = actx.currentTime;

  switch (padIdx) {
    case 0: {
      // Kick — sine sweep 150→40 Hz
      const g = actx.createGain();
      g.gain.setValueAtTime(0.85, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      g.connect(actx.destination);
      const osc = actx.createOscillator();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.26);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.4);
      break;
    }
    case 1: {
      // Snare — bandpass noise + short sine body
      const g = actx.createGain();
      g.gain.setValueAtTime(0.65, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      g.connect(actx.destination);
      const src = actx.createBufferSource();
      src.buffer = buildNoiseBuf(actx, 0.28);
      const bpf = actx.createBiquadFilter();
      bpf.type = "bandpass";
      bpf.frequency.value = 900;
      bpf.Q.value = 0.8;
      src.connect(bpf);
      bpf.connect(g);
      src.start(t);
      src.stop(t + 0.28);
      // short sine body for "snap"
      const osc2 = actx.createOscillator();
      const g2 = actx.createGain();
      g2.gain.setValueAtTime(0.35, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc2.frequency.value = 200;
      osc2.connect(g2);
      g2.connect(actx.destination);
      osc2.start(t);
      osc2.stop(t + 0.07);
      break;
    }
    case 2: {
      // Hihat — highpass noise >7 kHz, short
      const g = actx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      g.connect(actx.destination);
      const src = actx.createBufferSource();
      src.buffer = buildNoiseBuf(actx, 0.12);
      const hpf = actx.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 7000;
      src.connect(hpf);
      hpf.connect(g);
      src.start(t);
      src.stop(t + 0.12);
      break;
    }
    case 3: {
      // Tom — sine sweep 110→55 Hz
      const g = actx.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      g.connect(actx.destination);
      const osc = actx.createOscillator();
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.24);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.36);
      break;
    }
    case 4: {
      // Clap — double bandpass noise burst (0 ms + 22 ms)
      [0, 0.022].forEach((d) => {
        const g = actx.createGain();
        g.gain.setValueAtTime(0.55, t + d);
        g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.13);
        g.connect(actx.destination);
        const src = actx.createBufferSource();
        src.buffer = buildNoiseBuf(actx, 0.16);
        const bpf = actx.createBiquadFilter();
        bpf.type = "bandpass";
        bpf.frequency.value = 1100;
        bpf.Q.value = 0.5;
        src.connect(bpf);
        bpf.connect(g);
        src.start(t + d);
        src.stop(t + d + 0.16);
      });
      break;
    }
    case 5: {
      // Shaker — highpass noise >5.5 kHz, very short
      const g = actx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      g.connect(actx.destination);
      const src = actx.createBufferSource();
      src.buffer = buildNoiseBuf(actx, 0.09);
      const hpf = actx.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 5500;
      src.connect(hpf);
      hpf.connect(g);
      src.start(t);
      src.stop(t + 0.09);
      break;
    }
    default:
      break;
  }
}

// --- Component ---

export default function KidsDrumCircle() {
  const actxRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ringsRef = useRef<Ring[]>([]);
  const rafRef = useRef<number>(0);
  const pressedMut = useRef<Set<number>>(new Set());
  const pointerPad = useRef<Map<number, number>>(new Map());
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());

  // Canvas animation loop — expanding colored rings on each hit
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    function resize() {
      cvs!.width = window.innerWidth;
      cvs!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function drawFrame() {
      if (!cvs || !ctx) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const alive: Ring[] = [];
      for (const ring of ringsRef.current) {
        ring.r += 2.8;
        ring.alpha *= 0.955;
        if (ring.alpha > 0.012) {
          alive.push(ring);
          const hexA = Math.round(ring.alpha * 255)
            .toString(16)
            .padStart(2, "0");
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
          ctx.strokeStyle = ring.color + hexA;
          ctx.lineWidth = Math.max(1.5, 4 * ring.alpha);
          ctx.stroke();
        }
      }
      ringsRef.current = alive;
      rafRef.current = requestAnimationFrame(drawFrame);
    }

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function bootAudio(): AudioContext {
    if (!actxRef.current) {
      const actx = new AudioContext();
      actxRef.current = actx;
      // Quiet ambient C/E/G pad
      const master = actx.createGain();
      master.gain.value = 0.028;
      master.connect(actx.destination);
      PAD_FREQS.forEach((freq, i) => {
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const g = actx.createGain();
        const lfo = actx.createOscillator();
        const lg = actx.createGain();
        lfo.frequency.value = 0.07 + i * 0.022;
        lg.gain.value = 0.06;
        lfo.connect(lg);
        lg.connect(g.gain);
        osc.connect(g);
        g.connect(master);
        osc.start();
        lfo.start();
      });
    }
    if (actxRef.current.state === "suspended") void actxRef.current.resume();
    return actxRef.current;
  }

  function hitPad(padIdx: number, clientX: number, clientY: number) {
    if (pressedMut.current.has(padIdx)) return;
    const actx = bootAudio();
    triggerDrum(padIdx, actx);
    ringsRef.current.push({ x: clientX, y: clientY, r: 8, color: PADS[padIdx].color, alpha: 0.85 });
    pressedMut.current.add(padIdx);
    setPressed(new Set(pressedMut.current));
  }

  function releasePad(padIdx: number) {
    pressedMut.current.delete(padIdx);
    setPressed(new Set(pressedMut.current));
  }

  function handlePointerDown(e: React.PointerEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const attr = el?.closest("[data-pad]")?.getAttribute("data-pad");
    if (attr == null) return;
    const idx = parseInt(attr, 10);
    pointerPad.current.set(e.pointerId, idx);
    hitPad(idx, e.clientX, e.clientY);
  }

  function handlePointerUp(e: React.PointerEvent) {
    const idx = pointerPad.current.get(e.pointerId);
    if (idx !== undefined) {
      releasePad(idx);
      pointerPad.current.delete(e.pointerId);
    }
  }

  return (
    <div
      className="relative w-full overflow-hidden flex flex-col items-center justify-center"
      style={{ height: "calc(100vh - 3rem)", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Background ring canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* 3×2 grid of drum pads */}
      <div
        className="relative grid grid-cols-3 grid-rows-2"
        style={{ gap: "3vmin" }}
      >
        {PADS.map((pad, i) => (
          <div
            key={i}
            data-pad={String(i)}
            style={{
              width: "26vmin",
              height: "26vmin",
              minWidth: 80,
              minHeight: 80,
              borderRadius: "50%",
              backgroundColor: pad.color,
              boxShadow: pressed.has(i)
                ? `0 0 10vmin 4vmin ${pad.color}cc, 0 0 24vmin 9vmin ${pad.color}40`
                : `0 0 3vmin 0.8vmin ${pad.color}55`,
              transform: pressed.has(i) ? "scale(0.88)" : "scale(1)",
              transition: "transform 0.06s ease-out, box-shadow 0.08s ease-out",
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {/* Barely-visible hint — for parents, not kids */}
      <p
        className="absolute pointer-events-none font-mono tracking-widest text-center"
        style={{ bottom: "2.5vmin", fontSize: "2vmin", color: "rgba(255,255,255,0.22)" }}
      >
        tap the colors
      </p>
    </div>
  );
}
