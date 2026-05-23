'use client';
import { useEffect, useRef, useState } from 'react';

const ORCHESTRAS = [
  {
    id: 'playground',
    name: 'Playground',
    emoji: '🎪',
    color: '#f59e0b',
    glowColor: 'rgba(245,158,11,',
    waveType: 'triangle' as OscillatorType,
    rootMidi: 48,
    droneNotes: [48, 55],
    attack: 0.02,
    decay: 0.5,
  },
  {
    id: 'space',
    name: 'Space',
    emoji: '🚀',
    color: '#8b5cf6',
    glowColor: 'rgba(139,92,246,',
    waveType: 'sine' as OscillatorType,
    rootMidi: 36,
    droneNotes: [36, 43],
    attack: 0.09,
    decay: 1.3,
  },
  {
    id: 'forest',
    name: 'Forest',
    emoji: '🌲',
    color: '#34d399',
    glowColor: 'rgba(52,211,153,',
    waveType: 'triangle' as OscillatorType,
    rootMidi: 43,
    droneNotes: [43, 50],
    attack: 0.03,
    decay: 0.7,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    color: '#22d3ee',
    glowColor: 'rgba(34,211,238,',
    waveType: 'sine' as OscillatorType,
    rootMidi: 36,
    droneNotes: [36, 40, 43],
    attack: 0.07,
    decay: 1.1,
  },
];

// C major pentatonic intervals (semitones from root), 2.5 octaves
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function yToMidi(yNorm: number, rootMidi: number): number {
  // yNorm 0=top (high pitch), 1=bottom (low pitch)
  const idx = Math.round((1 - yNorm) * (PENTA.length - 1));
  return rootMidi + PENTA[Math.max(0, Math.min(PENTA.length - 1, idx))];
}

function buildImpulse(ctx: AudioContext, dur: number, dec: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, dec);
    }
  }
  return buf;
}

interface TrailPt { x: number; y: number; ts: number }

export default function KidsConductorWand() {
  const [orchIdx, setOrchIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const orch = ORCHESTRAS[orchIdx];

    // ── Audio ──────────────────────────────────────────────────────────────
    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.75;
    master.connect(ac.destination);

    const dryG = ac.createGain();
    dryG.gain.value = 0.75;
    dryG.connect(master);

    const wetG = ac.createGain();
    wetG.gain.value = 0.32;
    wetG.connect(master);

    const rev = ac.createConvolver();
    rev.buffer = buildImpulse(ac, 2.8, 4);
    rev.connect(wetG);

    // Ambient drone — always on, very soft
    const drones: OscillatorNode[] = [];
    orch.droneNotes.forEach((midi, i) => {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = midiToHz(midi);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.setTargetAtTime(0.013 / (i + 1), ac.currentTime + 0.5, 2.5);
      osc.connect(g);
      g.connect(rev);
      osc.start();
      drones.push(osc);
    });

    const playNote = (yNorm: number) => {
      const midi = yToMidi(yNorm, orch.rootMidi);
      const hz = midiToHz(midi);
      const osc = ac.createOscillator();
      osc.type = orch.waveType;
      osc.frequency.value = hz;
      const env = ac.createGain();
      env.gain.setValueAtTime(0, ac.currentTime);
      env.gain.linearRampToValueAtTime(0.26, ac.currentTime + orch.attack);
      env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + orch.attack + orch.decay);
      osc.connect(env);
      env.connect(dryG);
      env.connect(rev);
      osc.start();
      osc.stop(ac.currentTime + orch.attack + orch.decay + 0.05);
    };

    const playDrum = () => {
      const len = Math.floor(ac.sampleRate * 0.13);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      const env = ac.createGain();
      env.gain.setValueAtTime(0.38, ac.currentTime);
      env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.13);
      src.connect(env);
      env.connect(dryG);
      src.start();
    };

    // ── Canvas ─────────────────────────────────────────────────────────────
    let dpr = window.devicePixelRatio || 1;
    const doResize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    doResize();
    const obs = new ResizeObserver(doResize);
    obs.observe(canvas);

    const g2d = canvas.getContext('2d')!;

    // ── Interaction state ──────────────────────────────────────────────────
    let trail: TrailPt[] = [];
    let wandX = -1;
    let wandY = -1;
    let pressing = false;
    let pressStart = 0;
    let lastNoteMs = 0;
    let speed = 0;
    let prevX = 0;
    let everTouched = false;
    let demoAngle = 0;

    // ── Render loop ────────────────────────────────────────────────────────
    let animId: number;
    const renderFrame = (now: number) => {
      animId = requestAnimationFrame(renderFrame);
      const W = canvas.width;
      const H = canvas.height;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;

      // Soft background fade (trail persistence)
      g2d.fillStyle = 'rgba(3,7,18,0.18)';
      g2d.fillRect(0, 0, W, H);

      // Demo: auto-conduct a Lissajous wand until first touch
      if (!everTouched) {
        demoAngle += 0.013;
        const cx = cw / 2;
        const cy = ch / 2;
        wandX = cx + Math.cos(demoAngle) * cx * 0.42;
        wandY = cy + Math.sin(demoAngle * 0.73) * cy * 0.36;
        trail.push({ x: wandX, y: wandY, ts: now });
        if (now - lastNoteMs > 400) {
          playNote(wandY / ch);
          lastNoteMs = now;
        }
      }

      // User conducting: trigger notes at rate proportional to speed
      if (pressing && wandX >= 0) {
        const interval = speed > 220 ? 145 : speed > 80 ? 300 : 580;
        if (now - lastNoteMs > interval) {
          playNote(wandY / ch);
          lastNoteMs = now;
        }
      }

      // Draw rainbow trail
      const TRAIL_MS = 1500;
      trail = trail.filter(p => now - p.ts < TRAIL_MS);
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const age = (now - p.ts) / TRAIL_MS;
        const alpha = (1 - age) * 0.72;
        const r = (1 - age) * 22 * dpr;
        const hue = (i / Math.max(1, trail.length)) * 270 + 20;
        g2d.beginPath();
        g2d.arc(p.x * dpr, p.y * dpr, Math.max(0.5, r), 0, Math.PI * 2);
        g2d.fillStyle = `hsla(${hue},88%,65%,${alpha})`;
        g2d.fill();
      }

      // Draw wand
      if (wandX >= 0) {
        const wx = wandX * dpr;
        const wy = wandY * dpr;
        const R = 26 * dpr;
        // Outer glow
        const grd = g2d.createRadialGradient(wx, wy, 0, wx, wy, R * 3.2);
        grd.addColorStop(0, orch.glowColor + '0.9)');
        grd.addColorStop(0.35, orch.glowColor + '0.4)');
        grd.addColorStop(1, orch.glowColor + '0)');
        g2d.beginPath();
        g2d.arc(wx, wy, R * 3.2, 0, Math.PI * 2);
        g2d.fillStyle = grd;
        g2d.fill();
        // Core circle
        g2d.beginPath();
        g2d.arc(wx, wy, R, 0, Math.PI * 2);
        g2d.fillStyle = orch.color;
        g2d.fill();
        // Inner sparkle highlight
        g2d.beginPath();
        g2d.arc(wx - R * 0.3, wy - R * 0.3, R * 0.24, 0, Math.PI * 2);
        g2d.fillStyle = 'rgba(255,255,255,0.9)';
        g2d.fill();
      }
    };
    animId = requestAnimationFrame(renderFrame);

    // ── Pointer events ─────────────────────────────────────────────────────
    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pressing = true;
      everTouched = true;
      pressStart = performance.now();
      const { x, y } = getPos(e);
      wandX = x;
      wandY = y;
      prevX = x;
      speed = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (!pressing) return;
      const { x, y } = getPos(e);
      speed = Math.abs(x - prevX) * 60;
      prevX = x;
      wandX = x;
      wandY = y;
      trail.push({ x, y, ts: performance.now() });
    };

    const onUp = () => {
      if (!pressing) return;
      pressing = false;
      const held = performance.now() - pressStart;
      if (held < 280) playDrum();
    };

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      drones.forEach(d => d.stop(0));
      ac.close();
    };
  }, [started, orchIdx]);

  if (!started) {
    const orch = ORCHESTRAS[orchIdx];
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-6 py-10">
        <h1 className="text-3xl font-bold text-white text-center mb-3">
          Conductor Wand
        </h1>
        <p className="text-base text-white/75 text-center mb-8 max-w-sm leading-relaxed">
          Drag your finger to play the orchestra.<br />
          Move fast for quick notes · slow for long ones.<br />
          Quick tap = drum hit.
        </p>

        <p className="text-base text-white/80 mb-4 font-medium">Choose your orchestra:</p>
        <div className="grid grid-cols-2 gap-3 mb-10 w-full max-w-xs">
          {ORCHESTRAS.map((o, i) => (
            <button
              key={o.id}
              onClick={() => setOrchIdx(i)}
              className={`min-h-[80px] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all ${
                orchIdx === i
                  ? 'border-white/80 bg-white/10'
                  : 'border-white/20 bg-white/5'
              }`}
            >
              <span className="text-4xl">{o.emoji}</span>
              <span
                className={`text-base font-medium ${
                  orchIdx === i ? 'text-white' : 'text-white/60'
                }`}
              >
                {o.name}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setStarted(true)}
          className="min-h-[64px] px-10 rounded-2xl text-xl font-bold text-[#030712] transition-opacity hover:opacity-90"
          style={{ backgroundColor: orch.color }}
        >
          Start {orch.emoji}
        </button>
        <p className="text-sm text-white/40 mt-6 text-center">
          No permissions needed
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ cursor: 'none' }}
      />
      {/* Orchestra badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
        <span className="text-2xl">{ORCHESTRAS[orchIdx].emoji}</span>
        <span className="text-base text-white/80 font-medium">
          {ORCHESTRAS[orchIdx].name}
        </span>
      </div>
      {/* Hint */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none">
        <span className="text-sm text-white/40">
          drag to play · tap for drum
        </span>
      </div>
    </div>
  );
}
