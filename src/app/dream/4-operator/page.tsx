"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Minimal Web MIDI types (not in lib.dom) ───────────────────────────────────

interface MidiMsg { data: Uint8Array; }
interface MidiInput { name: string; onmidimessage: ((e: MidiMsg) => void) | null; }
interface MidiAccess { inputs: Map<string, MidiInput>; onstatechange: (() => void) | null; }

// ── Particle / ring types ─────────────────────────────────────────────────────

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
}
interface BloomRing { r: number; alpha: number; hue: number; }
interface Transition { progress: number; targetScene: number; switched: boolean; }

// ── Scene definitions ─────────────────────────────────────────────────────────

const SCENES = [
  { id: 0, name: "Void",      desc: "Primordial drift — opening",       phase: "Pre",  color: "#6366f1" },
  { id: 1, name: "Threshold", desc: "Stone chamber — the call begins",  phase: "I",    color: "#22d3ee" },
  { id: 2, name: "Bloom",     desc: "Radial pulses from center",        phase: "II",   color: "#4ade80" },
  { id: 3, name: "Current",   desc: "Fluid turbulence — mid-journey",   phase: "III",  color: "#facc15" },
  { id: 4, name: "Ascension", desc: "Upward surge — pre-peak",          phase: "IV",   color: "#f97316" },
  { id: 5, name: "Terminus",  desc: "Dissolution — return to void",     phase: "V–VI", color: "#ec4899" },
];

// ── Scene render functions ────────────────────────────────────────────────────

function renderVoid(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number,
  _beat: number, beatEdge: boolean, pts: Particle[]
) {
  ctx.fillStyle = "rgba(0,0,8,0.25)";
  ctx.fillRect(0, 0, w, h);
  while (pts.length < 160) {
    pts.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      life: Math.random() * 300, maxLife: 300 + Math.random() * 400,
      size: Math.random() * 1.8 + 0.4,
    });
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    p.x += p.vx; p.y += p.vy; p.life++;
    if (p.life > p.maxLife || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
      pts.splice(i, 1); continue;
    }
    const a = Math.sin((p.life / p.maxLife) * Math.PI) * (0.55 + 0.45 * Math.sin(t * 2.5 + p.x * 0.02));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(160,150,255,${a})`;
    ctx.fill();
  }
  if (beatEdge) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.48);
    g.addColorStop(0, "rgba(99,102,241,0.38)");
    g.addColorStop(1, "rgba(99,102,241,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function renderThreshold(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, beat: number
) {
  ctx.fillStyle = "rgba(3,6,14,0.22)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const y = h * (0.25 + i * 0.17) + Math.sin(t * 0.4 + i * 1.3) * 18;
    const a = (0.04 + Math.sin(t * 0.5 + i) * 0.015) * (1 + beat * 0.6);
    const g = ctx.createLinearGradient(0, y - 35, 0, y + 35);
    g.addColorStop(0, "rgba(34,211,238,0)");
    g.addColorStop(0.5, `rgba(34,211,238,${a})`);
    g.addColorStop(1, "rgba(34,211,238,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 35, w, 70);
  }
  for (let i = 0; i < 40; i++) {
    const x = (Math.sin(i * 1.618 + t * 0.08) * 0.5 + 0.5) * w;
    const y = (Math.cos(i * 2.414 + t * 0.05) * 0.4 + 0.5) * h;
    ctx.beginPath();
    ctx.arc(x, y, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180,220,230,${0.06 + beat * 0.07})`;
    ctx.fill();
  }
}

function renderBloom(
  ctx: CanvasRenderingContext2D, w: number, h: number, _t: number,
  beat: number, beatEdge: boolean, rings: BloomRing[]
) {
  ctx.fillStyle = "rgba(0,3,0,0.2)";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, maxR = Math.min(w, h) * 0.52;
  if (beatEdge) rings.push({ r: 0, alpha: 0.88, hue: 110 + Math.random() * 60 });
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    ring.r += 2.8; ring.alpha *= 0.965;
    if (ring.alpha < 0.01 || ring.r > maxR) { rings.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${ring.hue},75%,65%,${ring.alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * i / 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(74,222,128,${0.05 + beat * 0.07})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.24);
  g.addColorStop(0, `rgba(74,222,128,${0.28 + beat * 0.32})`);
  g.addColorStop(1, "rgba(74,222,128,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

function renderCurrent(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, beat: number
) {
  ctx.fillStyle = "rgba(0,4,0,0.2)";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  for (let c = 0; c < 4; c++) {
    const ph = t * 0.28 + c * 0.75 + beat * 1.2;
    const sc = Math.min(w, h) * (0.22 + c * 0.04);
    ctx.beginPath();
    for (let s = 0; s <= 360; s++) {
      const a = (s / 360) * Math.PI * 2;
      const x = cx + Math.sin((2 + c * 0.5) * a + ph) * sc;
      const y = cy + Math.sin((3 + c * 0.33) * a) * sc;
      s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `hsla(${80 + c * 18 + beat * 25},65%,62%,${0.14 + c * 0.05 + beat * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function renderAscension(
  ctx: CanvasRenderingContext2D, w: number, h: number, _t: number,
  beat: number, beatEdge: boolean, pts: Particle[]
) {
  ctx.fillStyle = "rgba(5,2,0,0.22)";
  ctx.fillRect(0, 0, w, h);
  if (Math.random() < (3 + beat * 5) / 60) {
    pts.push({
      x: w * 0.15 + Math.random() * w * 0.7, y: h + 10,
      vx: (Math.random() - 0.5) * 1.2, vy: -(1.8 + Math.random() * 3),
      life: 0, maxLife: 90 + Math.random() * 100, size: 1 + Math.random() * 2.2,
    });
  }
  if (beatEdge) {
    for (let i = 0; i < 14; i++) {
      pts.push({
        x: w * 0.1 + Math.random() * w * 0.8, y: h * 0.55 + Math.random() * h * 0.45,
        vx: (Math.random() - 0.5) * 3.5, vy: -(4 + Math.random() * 6),
        life: 0, maxLife: 55 + Math.random() * 55, size: 1.5 + Math.random() * 3,
      });
    }
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    p.x += p.vx; p.y += p.vy; p.vy -= 0.025; p.life++;
    if (p.life > p.maxLife || p.y < -20) { pts.splice(i, 1); continue; }
    const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.9;
    const hue = 22 + (p.life / p.maxLife) * 35;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue},90%,65%,${alpha})`;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
    ctx.strokeStyle = `hsla(${hue},90%,65%,${alpha * 0.25})`;
    ctx.lineWidth = p.size * 0.5;
    ctx.stroke();
  }
}

function renderTerminus(
  ctx: CanvasRenderingContext2D, w: number, h: number, _t: number,
  beat: number, pts: Particle[]
) {
  ctx.fillStyle = "rgba(4,0,6,0.25)";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, spin = 0.55 + beat * 2.5;
  if (pts.length < 220) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.min(w, h) * (0.25 + Math.random() * 0.22);
    pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: 0, vy: 0, life: 0, maxLife: 180 + Math.random() * 120, size: 0.8 + Math.random() * 2 });
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    const dx = cx - p.x, dy = cy - p.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const pull = 0.025 + beat * 0.04;
    p.vx += (dx / dist) * pull + (-dy / dist) * spin * 0.018;
    p.vy += (dy / dist) * pull + (dx / dist) * spin * 0.018;
    p.vx *= 0.97; p.vy *= 0.97; p.x += p.vx; p.y += p.vy; p.life++;
    if (p.life > p.maxLife || dist < 6) { pts.splice(i, 1); continue; }
    const alpha = (1 - p.life / p.maxLife) * 0.85;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${290 + (p.life / p.maxLife) * 40},80%,70%,${alpha})`;
    ctx.fill();
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55 + beat * 20);
  g.addColorStop(0, `rgba(236,72,153,${0.45 + beat * 0.3})`);
  g.addColorStop(1, "rgba(236,72,153,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 75 + beat * 20, 0, Math.PI * 2);
  ctx.fill();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OperatorPanel() {
  const {
    running: micRunning, error: micError,
    start: startMic, stop: stopMic,
    getFrame, gain, setGain,
  } = useMicAnalyser({ smoothing: 0.85, gain: 2.0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const activeSceneRef = useRef(0);
  const transitionRef = useRef<Transition | null>(null);
  const beatPhaseRef = useRef(0);
  const prevBeatRef = useRef(0);
  const bpmRef = useRef(0);
  const amplitudeRef = useRef(0);
  const tapTimesRef = useRef<number[]>([]);
  const midiDeviceRef = useRef<string | null>(null);
  const lastMidiRef = useRef<string | null>(null);

  const voidPtsRef = useRef<Particle[]>([]);
  const ascPtsRef = useRef<Particle[]>([]);
  const termPtsRef = useRef<Particle[]>([]);
  const bloomRingsRef = useRef<BloomRing[]>([]);

  const [ui, setUi] = useState({
    activeScene: 0,
    transScene: null as number | null,
    bpm: 0,
    amplitude: 0,
    beatPhase: 0,
    midiDevice: null as string | null,
    lastMidi: null as string | null,
  });

  // ── BPM tap ───────────────────────────────────────────────────────────────

  const tapBeat = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    taps.push(now);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      bpmRef.current = Math.round(60000 / (sum / (taps.length - 1)));
    }
  }, []);

  // ── Scene trigger ──────────────────────────────────────────────────────────

  const triggerScene = useCallback((id: number) => {
    if (transitionRef.current?.targetScene === id) return;
    if (id === activeSceneRef.current && !transitionRef.current) return;
    transitionRef.current = { progress: 0, targetScene: id, switched: false };
  }, []);

  // ── MIDI setup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!("requestMIDIAccess" in navigator)) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).requestMIDIAccess().then((access: MidiAccess) => {
      if (cancelled) return;
      const bindInputs = () => {
        if (cancelled) return;
        const inputs = Array.from(access.inputs.values());
        midiDeviceRef.current = inputs.length > 0 ? inputs[0].name : null;
        inputs.forEach((input) => {
          input.onmidimessage = (e: MidiMsg) => {
            if (e.data.length < 2) return;
            const status = e.data[0], d1 = e.data[1], d2 = e.data.length > 2 ? e.data[2] : 0;
            const type = status & 0xf0;
            if (type === 0x90 && d2 > 0) {
              const scene = d1 - 48; // C3=48 → scene 0
              if (scene >= 0 && scene < SCENES.length) triggerScene(scene);
              lastMidiRef.current = `Note ON: ${d1} vel:${d2}`;
            } else if (type === 0xb0) {
              lastMidiRef.current = `CC ${d1}: ${d2}`;
              if (d1 === 48) tapBeat();
            }
          };
        });
      };
      bindInputs();
      access.onstatechange = bindInputs;
    }).catch(() => { /* MIDI unavailable */ });
    return () => { cancelled = true; };
  }, [triggerScene, tapBeat]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); tapBeat(); }
      const digit = e.code.match(/^Digit(\d)$/);
      if (digit) {
        const n = parseInt(digit[1], 10) - 1;
        if (n >= 0 && n < SCENES.length) triggerScene(n);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tapBeat, triggerScene]);

  // ── Animation loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastT = performance.now();
    let uiAt = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const t = now / 1000;

      // Beat phase — runs at set BPM or defaults to 80 for visual continuity
      const bpm = bpmRef.current > 0 ? bpmRef.current : 80;
      const prev = prevBeatRef.current;
      beatPhaseRef.current = (beatPhaseRef.current + dt * bpm / 60) % 1;
      const beat = beatPhaseRef.current;
      const beatEdge = beat < prev;
      prevBeatRef.current = beat;

      // Mic amplitude
      const frame = getFrame();
      if (frame) amplitudeRef.current = frame.amplitude;

      // Dip-to-black transition
      let overlayAlpha = 0;
      const tr = transitionRef.current;
      if (tr) {
        tr.progress += dt / 0.35;
        if (tr.progress >= 0.5 && !tr.switched) {
          activeSceneRef.current = tr.targetScene;
          tr.switched = true;
          voidPtsRef.current = []; ascPtsRef.current = [];
          termPtsRef.current = []; bloomRingsRef.current = [];
        }
        if (tr.progress >= 1) {
          transitionRef.current = null;
        } else {
          overlayAlpha = tr.progress < 0.5 ? tr.progress * 2 : (1 - tr.progress) * 2;
        }
      }

      // Draw current scene
      switch (activeSceneRef.current) {
        case 0: renderVoid(ctx, w, h, t, beat, beatEdge, voidPtsRef.current); break;
        case 1: renderThreshold(ctx, w, h, t, beat); break;
        case 2: renderBloom(ctx, w, h, t, beat, beatEdge, bloomRingsRef.current); break;
        case 3: renderCurrent(ctx, w, h, t, beat); break;
        case 4: renderAscension(ctx, w, h, t, beat, beatEdge, ascPtsRef.current); break;
        case 5: renderTerminus(ctx, w, h, t, beat, termPtsRef.current); break;
        default: break;
      }

      if (overlayAlpha > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      if (now - uiAt > 100) {
        uiAt = now;
        setUi({
          activeScene: activeSceneRef.current,
          transScene: transitionRef.current?.targetScene ?? null,
          bpm: bpmRef.current,
          amplitude: amplitudeRef.current,
          beatPhase: beat,
          midiDevice: midiDeviceRef.current,
          lastMidi: lastMidiRef.current,
        });
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [getFrame]);

  // ── Render ────────────────────────────────────────────────────────────────

  const currentScene = SCENES[ui.activeScene];

  return (
    <div className="flex" style={{ height: "calc(100vh - 3rem)" }}>

      {/* ── Performer view ──────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        <div className="absolute top-3 left-3 pointer-events-none">
          <div className="text-[10px] tracking-widest text-white/30 mb-0.5">
            SCENE {ui.activeScene + 1}
          </div>
          <div className="text-xl tracking-wide" style={{ color: currentScene.color }}>
            {currentScene.name}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {currentScene.phase} — {currentScene.desc}
          </div>
        </div>

        <div
          className="absolute top-3 right-3 pointer-events-none text-right"
          style={{ opacity: 0.6 + (1 - ui.beatPhase) * 0.4 }}
        >
          <div className="text-2xl font-mono" style={{ color: currentScene.color }}>
            {ui.bpm > 0 ? ui.bpm : "·"}
          </div>
          <div className="text-[10px] text-white/30 tracking-widest">BPM</div>
        </div>

        {micRunning && (
          <div className="absolute bottom-4 left-3 pointer-events-none">
            <div className="text-[10px] text-white/30 tracking-widest mb-1.5">CROWD NOISE</div>
            <div className="w-28 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: `${ui.amplitude * 100}%`,
                  background: ui.amplitude > 0.7 ? "#f87171" : ui.amplitude > 0.4 ? "#facc15" : "#4ade80",
                }}
              />
            </div>
          </div>
        )}

        {ui.transScene !== null && (
          <div className="absolute bottom-4 right-3 pointer-events-none text-[10px] text-white/35 text-right">
            → {SCENES[ui.transScene].name}
          </div>
        )}
      </div>

      {/* ── Operator controls ────────────────────────────────────────────── */}
      <div className="w-64 md:w-72 border-l border-white/10 bg-black flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="text-[10px] tracking-widest text-white/40">OPERATOR PANEL</div>
          <div className="text-[10px] text-white/20 mt-0.5">/dream/4-operator · sandbox</div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Scene picker */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-[10px] tracking-wider text-white/35 mb-2">SCENES — keys 1–6</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SCENES.map((scene) => {
                const isActive = ui.activeScene === scene.id && ui.transScene === null;
                const isNext = ui.transScene === scene.id;
                return (
                  <button
                    key={scene.id}
                    onClick={() => triggerScene(scene.id)}
                    className={`text-left p-2 rounded border transition-all duration-150 ${
                      isActive
                        ? "border-white/35 bg-white/5"
                        : isNext
                        ? "border-white/20 bg-white/5 animate-pulse"
                        : "border-white/10 hover:border-white/25 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: isActive ? scene.color : "rgba(255,255,255,0.2)" }}
                      />
                      <span className="text-[9px] text-white/35">{scene.phase}</span>
                    </div>
                    <div
                      className="text-[11px]"
                      style={{ color: isActive ? scene.color : "rgba(255,255,255,0.65)" }}
                    >
                      {scene.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BPM tap */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-[10px] tracking-wider text-white/35 mb-2">BPM — space to tap</div>
            <div className="flex items-center gap-3">
              <button
                onClick={tapBeat}
                className="flex-1 py-3 text-center border border-white/20 rounded hover:border-white/45 hover:bg-white/5 active:bg-white/10 active:scale-95 transition-all text-xs tracking-widest select-none"
              >
                TAP
              </button>
              <div className="text-right w-16">
                <div
                  className="text-xl font-mono transition-opacity duration-75"
                  style={{
                    color: currentScene.color,
                    opacity: ui.bpm > 0 ? 0.5 + (1 - ui.beatPhase) * 0.5 : 0.4,
                  }}
                >
                  {ui.bpm > 0 ? ui.bpm : "—"}
                </div>
                <div className="text-[9px] text-white/25">BPM</div>
              </div>
            </div>
            {ui.bpm > 0 && (
              <button
                onClick={() => { bpmRef.current = 0; tapTimesRef.current = []; }}
                className="mt-2 text-[10px] text-white/20 hover:text-white/45 transition-colors"
              >
                clear
              </button>
            )}
          </div>

          {/* Mic */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-[10px] tracking-wider text-white/35 mb-2">MIC — crowd noise</div>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={micRunning ? stopMic : startMic}
                className={`text-[10px] tracking-wider px-3 py-1.5 rounded border transition-all ${
                  micRunning
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-900/20"
                    : "border-white/20 text-white/45 hover:border-white/35"
                }`}
              >
                {micRunning ? "● LIVE" : "START MIC"}
              </button>
              {micRunning && (
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${ui.amplitude * 100}%`,
                      background: ui.amplitude > 0.7 ? "#f87171" : ui.amplitude > 0.4 ? "#facc15" : "#4ade80",
                    }}
                  />
                </div>
              )}
            </div>
            {micRunning && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/30">GAIN</span>
                <input
                  type="range" min="0.5" max="4" step="0.1"
                  value={gain}
                  onChange={(e) => setGain(parseFloat(e.target.value))}
                  className="flex-1 accent-white"
                />
                <span className="text-[10px] text-white/30 w-7 text-right">{gain.toFixed(1)}×</span>
              </div>
            )}
            {micError && (
              <p className="text-[10px] text-rose-400/70 mt-1">{micError}</p>
            )}
          </div>

          {/* MIDI */}
          <div className="px-4 py-3">
            <div className="text-[10px] tracking-wider text-white/35 mb-2">MIDI</div>
            <div className={`text-[11px] ${ui.midiDevice ? "text-emerald-400" : "text-white/25"}`}>
              {ui.midiDevice ? `● ${ui.midiDevice}` : "○ No device detected"}
            </div>
            {ui.lastMidi && (
              <div className="text-[10px] text-white/35 mt-1 font-mono">{ui.lastMidi}</div>
            )}
            <div className="text-[10px] text-white/18 mt-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.18)" }}>
              Notes C3–A3 → scenes 1–6<br />CC48 → tap beat
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/10 flex-shrink-0 space-y-1">
          <Link
            href="/dream"
            className="block text-[10px] text-white/25 hover:text-white/55 transition-colors"
          >
            ← back to sandbox
          </Link>
        </div>
      </div>
    </div>
  );
}
