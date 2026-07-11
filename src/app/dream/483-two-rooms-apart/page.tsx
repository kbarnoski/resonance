"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Two Rooms Apart (483) — Cycle 2 of the "Resonant Room" spine
//
// THE ONE QUESTION: What if you played into TWO sympathetic rooms tuned a
// tritone apart — so every note beats against its own echo — and resolution
// meant collapsing the two rooms into agreement, an act only you can perform?
//
// Core technique: two parallel banks of N=8 tuned resonator filters
//   Room A: reference tuning (overtones of the played note)
//   Room B: same notes shifted by a continuous detune offset (0–600 cents)
//   At 600 cents (tritone), the two rooms maximally disagree: every partial
//   beats against a shifted copy. Dragging detune toward 0 fuses them.
//
// Real-time roughness: Plomp-Levelt / Sethares dyad model over all partial
//   pairs across both rooms, giving a 0..1 tension scalar that drives visuals.
//
// References:
//   Stautner & Puckette (CMJ 1982); Jot & Chaigne (AES 1991) — FDN lineage
//   Plomp & Levelt (JASA 1965) — sensory dissonance curves
//   Sethares, "Local consonance..." JASA 94(3), 1993
//   MacCallum & Einbond, CMMR 2008 — roughness in spectral composition
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const NUM_RESONATORS = 8; // partials per room per note
const DECAY_T60_SEC = 5.5; // target T60
const NOTE_A4 = 440;

// Plomp-Levelt roughness model constants
const PL_B1 = 3.5;
const PL_B2 = 5.75;

// QWERTY mapping: bottom two rows → chromatic scale
const QWERTY_KEYS: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69,
  u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ";": 76,
};

// On-screen keyboard: 2 octaves C4–B5
const SCREEN_KEYS: Array<{ midi: number; black: boolean; label: string }> = [];
(function buildKeys() {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  for (let i = 0; i < 25; i++) {
    const midi = 60 + i;
    const name = noteNames[midi % 12];
    SCREEN_KEYS.push({ midi, black: name.includes("#"), label: name });
  }
})();

// Demo phrase: midi notes, delay ms from start
const DEMO_PHRASE: Array<{ note: number; vel: number; dur: number; t: number }> = [
  { note: 60, vel: 90, dur: 1200, t: 0 },
  { note: 64, vel: 80, dur: 1000, t: 400 },
  { note: 67, vel: 85, dur: 1400, t: 900 },
  { note: 70, vel: 75, dur: 1200, t: 1600 },
  { note: 65, vel: 80, dur: 1000, t: 2400 },
  { note: 62, vel: 85, dur: 1400, t: 3000 },
  { note: 60, vel: 90, dur: 2000, t: 3800 },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resonator {
  freq: number;       // Hz (current, post-detune)
  freqBase: number;   // Hz (Room A / reference)
  amp: number;        // decaying amplitude [0..1]
  decayPerFrame: number;
  room: 0 | 1;        // 0=Room A, 1=Room B
  partial: number;    // partial index 1..N
  midi: number;
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface ActiveNote {
  midi: number;
  velocity: number;
  resonators: Resonator[];
}

interface EngineState {
  ctx: AudioContext;
  masterGain: GainNode;
  panA: StereoPannerNode;
  panB: StereoPannerNode;
  limiter: DynamicsCompressorNode;
  activeNotes: Map<number, ActiveNote>;
  detuneCents: number; // 0..600
}

// ── Utility: midi to Hz ───────────────────────────────────────────────────────

function midiToHz(midi: number): number {
  return NOTE_A4 * Math.pow(2, (midi - 69) / 12);
}

function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

// ── Roughness engine (Plomp-Levelt) ──────────────────────────────────────────
// Computes 0..1 roughness from a list of (freq, amp) partials.
// Cross-room pairs dominate at full tritone detune.

function computeRoughness(partials: Array<{ f: number; a: number }>): number {
  if (partials.length < 2) return 0;
  let roughSum = 0;
  const n = partials.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const f1 = partials[i].f;
      const f2 = partials[j].f;
      const a1 = partials[i].a;
      const a2 = partials[j].a;
      if (a1 < 0.001 || a2 < 0.001) continue;
      const fMin = Math.min(f1, f2);
      const df = Math.abs(f2 - f1);
      // Plomp-Levelt: critical bandwidth ~ 1.72 * fMin^0.65 (rough)
      const s = 0.24 / (0.0207 * fMin + 18.96);
      const x = s * df;
      const rough = a1 * a2 * (Math.exp(-PL_B1 * x) - Math.exp(-PL_B2 * x));
      roughSum += Math.max(0, rough);
    }
  }
  // Normalize: max theoretical roughness scales with n^2
  const norm = (n * (n - 1)) / 2;
  return Math.min(1, roughSum / (norm * 0.04 + 0.001));
}

// ── Audio engine ──────────────────────────────────────────────────────────────

function createEngine(): EngineState {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" });

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;

  const panA = ctx.createStereoPanner();
  panA.pan.value = -0.35;
  const panB = ctx.createStereoPanner();
  panB.pan.value = 0.35;

  // Brick-wall limiter
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  panA.connect(masterGain);
  panB.connect(masterGain);
  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  return {
    ctx,
    masterGain,
    panA,
    panB,
    limiter,
    activeNotes: new Map(),
    detuneCents: 600,
  };
}

function createExcitationBurst(
  ctx: AudioContext,
  velocity: number,
  destination: AudioNode,
): void {
  const bufSize = Math.floor(ctx.sampleRate * 0.04); // 40ms
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const velScale = velocity / 127;
  for (let i = 0; i < bufSize; i++) {
    const env = Math.exp(-i / (bufSize * 0.12));
    data[i] = (Math.random() * 2 - 1) * env * velScale;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // Pre-filter: bandpass ~200-4000 Hz to shape the excitation
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 0.7;
  src.connect(filter);
  filter.connect(destination);
  src.start();
  src.stop(ctx.currentTime + 0.05);
}

function addNote(engine: EngineState, midi: number, velocity: number): void {
  // Release any existing note first
  releaseNote(engine, midi);

  const baseFreq = midiToHz(midi);
  const velScale = velocity / 127;
  const detunedRatio = centsToRatio(engine.detuneCents);

  const resonators: Resonator[] = [];
  const ctx = engine.ctx;

  // Decay constant: amplitude decays as exp(-k*t), T60 when amp=0.001
  const decayK = Math.log(1000) / DECAY_T60_SEC;
  const decayPerFrame = Math.exp(-decayK / 60);

  for (let room = 0; room < 2; room++) {
    const pan = room === 0 ? engine.panA : engine.panB;

    // Create a single noise source for this room's excitation
    const excGain = ctx.createGain();
    excGain.gain.value = velScale * 0.8;
    createExcitationBurst(ctx, velocity, excGain);

    for (let p = 1; p <= NUM_RESONATORS; p++) {
      const freqBase = baseFreq * p;
      if (freqBase > 18000) break; // above hearing, skip
      // Room B is detuned up by detuneCents
      const freq = room === 0 ? freqBase : freqBase * detunedRatio;

      // High-Q bandpass resonator
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = Math.min(freq, 20000);
      // Q scales with partial: higher partials ring longer relatively
      filter.Q.value = 60 + p * 8;

      const gain = ctx.createGain();
      // Partial amplitude: 1/p with slight velocity bow
      const ampScale = (1 / p) * velScale;
      gain.gain.value = ampScale * 0.9;

      excGain.connect(filter);
      filter.connect(gain);
      gain.connect(pan);

      resonators.push({
        freq,
        freqBase,
        amp: ampScale,
        decayPerFrame,
        room: room as 0 | 1,
        partial: p,
        midi,
        filter,
        gain,
      });
    }
    // Let excGain clean up on its own after burst ends
  }

  engine.activeNotes.set(midi, { midi, velocity, resonators });
}

function releaseNote(engine: EngineState, midi: number): void {
  const note = engine.activeNotes.get(midi);
  if (!note) return;
  const ctx = engine.ctx;
  const now = ctx.currentTime;
  for (const r of note.resonators) {
    r.gain.gain.setTargetAtTime(0, now, 0.15); // gentle tail-off
    // Disconnect after fade
    setTimeout(() => {
      try {
        r.filter.disconnect();
        r.gain.disconnect();
      } catch { /* already disconnected */ }
    }, 2000);
  }
  engine.activeNotes.delete(midi);
}

function applyDetune(engine: EngineState, cents: number): void {
  engine.detuneCents = cents;
  const ratio = centsToRatio(cents);
  for (const note of engine.activeNotes.values()) {
    for (const r of note.resonators) {
      if (r.room === 1) {
        const newFreq = r.freqBase * ratio;
        r.freq = newFreq;
        r.filter.frequency.setTargetAtTime(Math.min(newFreq, 20000), engine.ctx.currentTime, 0.02);
      }
    }
  }
}

function collectPartials(engine: EngineState): Array<{ f: number; a: number }> {
  const result: Array<{ f: number; a: number }> = [];
  for (const note of engine.activeNotes.values()) {
    for (const r of note.resonators) {
      if (r.amp > 0.002) {
        result.push({ f: r.freq, a: r.amp });
      }
    }
  }
  return result;
}

function disposeEngine(engine: EngineState): void {
  for (const note of engine.activeNotes.values()) {
    for (const r of note.resonators) {
      try { r.filter.disconnect(); } catch { /* ignore */ }
      try { r.gain.disconnect(); } catch { /* ignore */ }
    }
  }
  engine.activeNotes.clear();
  engine.ctx.close().catch(() => { /* ignore */ });
}

// ── Canvas 2D Renderer ────────────────────────────────────────────────────────

interface ParticleViz {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  room: 0 | 1;
  partial: number;
  midi: number;
  phase: number;
  phaseSpeed: number;
  amp: number;
  targetAmp: number;
  freq: number;
  freqBase: number;
}

interface RendererState {
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  particles: ParticleViz[];
  roughness: number;
  smoothRoughness: number;
  raf: number;
  time: number;
}

function createRenderer(canvas: HTMLCanvasElement): RendererState {
  const ctx2d = canvas.getContext("2d")!;
  return {
    canvas,
    ctx2d,
    particles: [],
    roughness: 0,
    smoothRoughness: 0,
    raf: 0,
    time: 0,
  };
}

function syncParticles(
  renderer: RendererState,
  engine: EngineState,
  roughness: number,
): void {
  renderer.roughness = roughness;
  renderer.smoothRoughness += (roughness - renderer.smoothRoughness) * 0.04;

  const w = renderer.canvas.width;
  const h = renderer.canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  // Build a map of existing particles by key
  const existingMap = new Map<string, ParticleViz>();
  for (const p of renderer.particles) {
    existingMap.set(`${p.midi}-${p.room}-${p.partial}`, p);
  }

  const newParticles: ParticleViz[] = [];

  for (const note of engine.activeNotes.values()) {
    for (const r of note.resonators) {
      const key = `${r.midi}-${r.room}-${r.partial}`;
      let pv = existingMap.get(key);

      if (!pv) {
        // Place in two ring-arcs: Room A = upper-left semicircle, Room B = upper-right
        const totalA = NUM_RESONATORS;
        const angleBase = r.room === 0
          ? Math.PI + (r.partial / totalA) * Math.PI  // lower-left arc
          : (r.partial / totalA) * Math.PI;           // lower-right arc
        const radius = 0.28 + (r.partial / NUM_RESONATORS) * 0.18;
        const bx = cx + Math.cos(angleBase) * radius * Math.min(w, h);
        const by = cy + Math.sin(angleBase) * radius * Math.min(w, h);

        pv = {
          x: bx, y: by, baseX: bx, baseY: by,
          room: r.room, partial: r.partial, midi: r.midi,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: (r.freq * 0.00015) % (Math.PI * 2),
          amp: 0, targetAmp: r.amp,
          freq: r.freq, freqBase: r.freqBase,
        };
      } else {
        pv.targetAmp = r.amp;
        pv.freq = r.freq;
      }

      // Decay amp toward target
      pv.amp += (pv.targetAmp - pv.amp) * 0.08;
      pv.phase += pv.phaseSpeed;

      newParticles.push(pv);
    }
  }

  // Fade out departing particles
  for (const [key, pv] of existingMap) {
    const stillActive = newParticles.some(
      (p) => `${p.midi}-${p.room}-${p.partial}` === key
    );
    if (!stillActive) {
      pv.targetAmp = 0;
      pv.amp *= 0.92;
      if (pv.amp > 0.003) newParticles.push(pv);
    }
  }

  renderer.particles = newParticles;
}

function drawFrame(renderer: RendererState, detuneCents: number): void {
  const { canvas, ctx2d, particles, smoothRoughness } = renderer;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  renderer.time += 1 / 60;

  // Background
  ctx2d.fillStyle = `rgba(6, 4, 18, 0.82)`;
  ctx2d.fillRect(0, 0, w, h);

  const detuneFrac = detuneCents / 600; // 0=unison, 1=full tritone

  // Draw inter-room beating lines between paired partials
  const roomAParticles = particles.filter((p) => p.room === 0 && p.amp > 0.01);
  const roomBParticles = particles.filter((p) => p.room === 1 && p.amp > 0.01);

  for (const pA of roomAParticles) {
    for (const pB of roomBParticles) {
      if (pA.midi !== pB.midi || pA.partial !== pB.partial) continue;
      // Beat frequency = |fA - fB|
      const beatFreq = Math.abs(pA.freq - pB.freq);
      const beatPhase = renderer.time * beatFreq * Math.PI * 2;
      const beatAmp = Math.sin(beatPhase);

      // Lerp between positions based on beat
      const tx = (pA.x + pB.x) / 2 + beatAmp * 10 * detuneFrac;
      const ty = (pA.y + pB.y) / 2;

      const pairAmp = Math.min(pA.amp, pB.amp);
      const alpha = pairAmp * (0.2 + detuneFrac * 0.6) * Math.abs(beatAmp) * 0.7;
      if (alpha < 0.01) continue;

      // Color: rose at high detune, emerald near unison
      const r = Math.round(220 * detuneFrac + 52 * (1 - detuneFrac));
      const g = Math.round(80 * detuneFrac + 211 * (1 - detuneFrac));
      const b = Math.round(120 * detuneFrac + 153 * (1 - detuneFrac));

      ctx2d.beginPath();
      ctx2d.moveTo(pA.x, pA.y);
      ctx2d.quadraticCurveTo(tx, ty, pB.x, pB.y);
      ctx2d.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      ctx2d.lineWidth = 1 + pairAmp * 2;
      ctx2d.stroke();

      // Interference dot at midpoint
      if (detuneFrac > 0.05 && pairAmp > 0.05) {
        const dotAlpha = pairAmp * detuneFrac * Math.abs(beatAmp) * 0.9;
        ctx2d.beginPath();
        ctx2d.arc(tx, ty, 2 + Math.abs(beatAmp) * 3, 0, Math.PI * 2);
        ctx2d.fillStyle = `rgba(255,160,160,${dotAlpha.toFixed(3)})`;
        ctx2d.fill();
      }
    }
  }

  // Draw room labels / arcs
  const arcRadius = Math.min(w, h) * 0.48;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, arcRadius, Math.PI, Math.PI * 2);
  ctx2d.strokeStyle = `rgba(167, 139, 250, ${0.06 + smoothRoughness * 0.12})`;
  ctx2d.lineWidth = 1;
  ctx2d.stroke();

  ctx2d.beginPath();
  ctx2d.arc(cx, cy, arcRadius, 0, Math.PI);
  ctx2d.strokeStyle = `rgba(56, 189, 248, ${0.06 + smoothRoughness * 0.12})`;
  ctx2d.lineWidth = 1;
  ctx2d.stroke();

  // Center "tension zone" glow
  if (smoothRoughness > 0.01) {
    const glowR = Math.min(w, h) * 0.12 * smoothRoughness;
    const grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grad.addColorStop(0, `rgba(220, 80, 120, ${(smoothRoughness * 0.35).toFixed(3)})`);
    grad.addColorStop(1, `rgba(220, 80, 120, 0)`);
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx2d.fillStyle = grad;
    ctx2d.fill();
  }

  // Draw particles
  for (const p of particles) {
    if (p.amp < 0.003) continue;

    // Oscillate position around base
    const wobble = p.amp * 6 * (0.5 + detuneFrac * 0.5);
    const px = p.baseX + Math.sin(p.phase) * wobble;
    const py = p.baseY + Math.cos(p.phase * 0.7) * wobble;
    p.x = px;
    p.y = py;

    const radius = 3 + p.amp * 14 * (1 + smoothRoughness * 0.5);
    const baseColor = p.room === 0
      ? { r: 167, g: 139, b: 250 }  // violet (Room A)
      : { r: 56, g: 189, b: 248 };  // sky blue (Room B)

    // At unison, both shift toward emerald
    const fusionFrac = 1 - detuneFrac;
    const er = Math.round(baseColor.r * (1 - fusionFrac * 0.5) + 52 * fusionFrac * 0.5);
    const eg = Math.round(baseColor.g * (1 - fusionFrac * 0.5) + 211 * fusionFrac * 0.5);
    const eb = Math.round(baseColor.b * (1 - fusionFrac * 0.5) + 153 * fusionFrac * 0.5);

    const grad = ctx2d.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, `rgba(${er},${eg},${eb},${Math.min(1, p.amp * 4).toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(${er},${eg},${eb},${(p.amp * 1.2).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${er},${eg},${eb},0)`);

    ctx2d.beginPath();
    ctx2d.arc(px, py, radius, 0, Math.PI * 2);
    ctx2d.fillStyle = grad;
    ctx2d.fill();
  }

  // Room labels
  ctx2d.font = "bold 11px monospace";
  ctx2d.fillStyle = `rgba(167, 139, 250, 0.6)`;
  ctx2d.fillText("Room A", 14, h - 14);
  ctx2d.fillStyle = `rgba(56, 189, 248, 0.6)`;
  ctx2d.fillText("Room B", w - 66, h - 14);

  // Roughness heat bar at top
  const barW = w - 40;
  const barH = 4;
  const barY = 8;
  ctx2d.fillStyle = "rgba(255,255,255,0.08)";
  ctx2d.fillRect(20, barY, barW, barH);
  const grad2 = ctx2d.createLinearGradient(20, 0, 20 + barW * smoothRoughness, 0);
  grad2.addColorStop(0, "rgba(52,211,153,0.7)");
  grad2.addColorStop(0.5, "rgba(251,191,36,0.8)");
  grad2.addColorStop(1, "rgba(244,63,94,0.9)");
  ctx2d.fillStyle = grad2;
  ctx2d.fillRect(20, barY, barW * smoothRoughness, barH);
}

function startRenderLoop(
  renderer: RendererState,
  getEngine: () => EngineState | null,
  getDetune: () => number,
  onRoughness: (r: number) => void,
): void {
  let frameCount = 0;

  function loop() {
    renderer.raf = requestAnimationFrame(loop);
    frameCount++;

    const engine = getEngine();
    if (!engine) {
      renderer.ctx2d.fillStyle = "rgb(6,4,18)";
      renderer.ctx2d.fillRect(0, 0, renderer.canvas.width, renderer.canvas.height);
      return;
    }

    // Decay all resonator amplitudes
    if (frameCount % 1 === 0) {
      for (const note of engine.activeNotes.values()) {
        for (const r of note.resonators) {
          r.amp *= r.decayPerFrame;
        }
      }
    }

    // Compute roughness every 3 frames
    let roughness = renderer.smoothRoughness;
    if (frameCount % 3 === 0) {
      const partials = collectPartials(engine);
      roughness = computeRoughness(partials);
      onRoughness(roughness);
    }

    syncParticles(renderer, engine, roughness);
    drawFrame(renderer, getDetune());
  }

  loop();
}

function stopRenderLoop(renderer: RendererState): void {
  cancelAnimationFrame(renderer.raf);
  renderer.raf = 0;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TwoRoomsApartPage() {
  const [started, setStarted] = useState(false);
  const [audioOk, setAudioOk] = useState(true);
  const [midiStatus, setMidiStatus] = useState<"pending" | "ok" | "denied" | "unavailable">("pending");
  const [detuneCents, setDetuneCents] = useState(600);
  const [roughness, setRoughness] = useState(0);
  const [showDesign, setShowDesign] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<EngineState | null>(null);
  const rendererRef = useRef<RendererState | null>(null);
  const detuneCentsRef = useRef(600);
  const activeKeysRef = useRef<Set<number>>(new Set());
  const midiRef = useRef<MIDIAccess | null>(null);
  const demoTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Keep detune ref in sync
  useEffect(() => {
    detuneCentsRef.current = detuneCents;
    if (engineRef.current) applyDetune(engineRef.current, detuneCents);
  }, [detuneCents]);

  // ── Note on/off helpers ──────────────────────────────────────────────────────

  const playNote = useCallback((midi: number, velocity: number) => {
    if (!engineRef.current) return;
    addNote(engineRef.current, midi, velocity);
    setActiveKeys((prev) => new Set([...prev, midi]));
    activeKeysRef.current.add(midi);
  }, []);

  const stopNote = useCallback((midi: number) => {
    if (!engineRef.current) return;
    releaseNote(engineRef.current, midi);
    setActiveKeys((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
    activeKeysRef.current.delete(midi);
  }, []);

  // ── Demo phrase ──────────────────────────────────────────────────────────────

  const runDemo = useCallback(() => {
    for (const event of DEMO_PHRASE) {
      const onId = setTimeout(() => playNote(event.note, event.vel), event.t);
      const offId = setTimeout(() => stopNote(event.note), event.t + event.dur);
      demoTimeoutsRef.current.push(onId, offId);
    }
  }, [playNote, stopNote]);

  // ── Start handler (user gesture) ─────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // Create audio engine
    try {
      const engine = createEngine();
      engineRef.current = engine;

      // Init renderer
      const canvas = canvasRef.current;
      if (canvas) {
        const renderer = createRenderer(canvas);
        rendererRef.current = renderer;
        startRenderLoop(
          renderer,
          () => engineRef.current,
          () => detuneCentsRef.current,
          (r) => setRoughness(r),
        );
      }
    } catch {
      setAudioOk(false);
      return;
    }

    // MIDI
    if (navigator.requestMIDIAccess) {
      try {
        const midi = await navigator.requestMIDIAccess();
        midiRef.current = midi;
        setMidiStatus("ok");

        const handleMidiMessage = (e: MIDIMessageEvent) => {
          if (!e.data) return;
          const status = e.data[0] ?? 0;
          const note = e.data[1] ?? 0;
          const vel = e.data[2] ?? 0;
          const cmd = status & 0xf0;
          if (cmd === 0x90 && vel > 0) playNote(note, vel);
          else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) stopNote(note);
        };

        const attachInputs = () => {
          for (const input of midi.inputs.values()) {
            input.onmidimessage = handleMidiMessage;
          }
        };

        attachInputs();
        midi.onstatechange = () => attachInputs();
      } catch {
        setMidiStatus("denied");
      }
    } else {
      setMidiStatus("unavailable");
    }

    // Run demo after ~0.5s
    setTimeout(runDemo, 500);
  }, [started, playNote, stopNote, runDemo]);

  // ── QWERTY keyboard ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!started) return;
    const pressed = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (pressed.has(key)) return;
      const midi = QWERTY_KEYS[key];
      if (midi !== undefined) {
        pressed.add(key);
        playNote(midi, 90);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      pressed.delete(key);
      const midi = QWERTY_KEYS[key];
      if (midi !== undefined) stopNote(midi);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [started, playNote, stopNote]);

  // ── Canvas resize ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Capture refs at effect setup time to avoid stale-ref warning in cleanup
    const timeouts = demoTimeoutsRef;
    const renderer = rendererRef;
    const engine = engineRef;
    return () => {
      for (const id of timeouts.current) clearTimeout(id);
      if (renderer.current) stopRenderLoop(renderer.current);
      if (engine.current) disposeEngine(engine.current);
    };
  }, []);

  // ── Derived display ───────────────────────────────────────────────────────────

  const roughnessPct = Math.round(roughness * 100);
  const tensionLabel =
    roughness < 0.08 ? "Resolved" :
    roughness < 0.25 ? "Settling" :
    roughness < 0.5  ? "Tense" :
    roughness < 0.75 ? "Dissonant" : "Clashing";
  const tensionColor =
    roughness < 0.08 ? "text-violet-300" :
    roughness < 0.35 ? "text-violet-300" : "text-violet-300";

  // ── On-screen keyboard ────────────────────────────────────────────────────────

  const whiteKeys = SCREEN_KEYS.filter((k) => !k.black);
  const allKeys = SCREEN_KEYS;

  return (
    <div className="min-h-screen bg-[#06040e] text-foreground flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-2 flex flex-col gap-1 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Two Rooms Apart
        </h1>
        <p className="text-base text-muted-foreground">
          Two resonant rooms detuned a tritone apart — every note beats against
          its own echo. Only you can collapse them into agreement.
        </p>
        {!audioOk && (
          <p className="text-violet-300 text-base font-medium">
            Web Audio API unavailable in this browser. Audio will not play.
          </p>
        )}
        {started && (midiStatus === "denied" || midiStatus === "unavailable") && (
          <p className="text-violet-300 text-sm">
            {midiStatus === "denied"
              ? "MIDI access denied — use the on-screen keyboard or QWERTY keys."
              : "Web MIDI unavailable — use the on-screen keyboard or QWERTY keys."}
          </p>
        )}
        {started && midiStatus === "ok" && (
          <p className="text-violet-300/95 text-sm">MIDI connected.</p>
        )}
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-[260px] mx-4 rounded-xl overflow-hidden border border-border">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ background: "rgb(6,4,18)" }}
        />
        {/* Tap-to-begin overlay */}
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70">
            <p className="text-muted-foreground text-base text-center px-6">
              Two rooms, tuned a tritone apart. Play a note — hear the rooms
              fight. Drag the detune slider to zero to make peace.
            </p>
            <button
              onClick={handleStart}
              className="px-6 py-3 rounded-xl text-base font-semibold text-foreground bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all min-w-[44px] min-h-[44px]"
            >
              Tap to Begin
            </button>
          </div>
        )}
        {/* Room legend */}
        {started && (
          <div className="absolute top-3 right-3 flex flex-col gap-1 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-400 opacity-80" />
              <span className="text-muted-foreground">Room A (reference)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-400 opacity-80" />
              <span className="text-muted-foreground">Room B (detuned)</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="px-5 pt-4 pb-2 flex flex-col gap-4 shrink-0">
        {/* Detune + Tension */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground text-base font-medium">
              Room Detune
            </label>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm tabular-nums">
                {Math.round(detuneCents)} ¢
              </span>
              <span className="text-muted-foreground text-sm">
                {detuneCents < 10
                  ? "≈ Unison"
                  : detuneCents > 580
                  ? "≈ Tritone"
                  : `${(detuneCents / 100).toFixed(1)} semitones`}
              </span>
            </div>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={600}
              step={1}
              value={detuneCents}
              onChange={(e) => setDetuneCents(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #10b981 0%, #f59e0b ${(detuneCents / 600) * 50}%, #f43f5e ${(detuneCents / 600) * 100}%)`,
              }}
              disabled={!started}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground/70">
            <span>Unison (resolved)</span>
            <span>Tritone (clashing)</span>
          </div>
        </div>

        {/* Tension readout */}
        <div className="flex items-center gap-4 rounded-xl bg-muted px-4 py-3 border border-border">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-sm">Tension / Roughness</span>
            <span className={`text-xl font-bold ${tensionColor}`}>
              {tensionLabel}
            </span>
          </div>
          <div className="flex-1">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${roughnessPct}%`,
                  background:
                    roughness < 0.25
                      ? "#10b981"
                      : roughness < 0.5
                      ? "#f59e0b"
                      : "#f43f5e",
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground/70 mt-1">
              <span>Smooth</span>
              <span className="tabular-nums">{roughnessPct}%</span>
              <span>Rough</span>
            </div>
          </div>
        </div>
      </div>

      {/* On-screen keyboard */}
      <div className="px-4 pb-3 shrink-0">
        <p className="text-muted-foreground text-sm mb-2">
          Play: on-screen keys, QWERTY row (A–;), or MIDI keyboard
        </p>
        <div className="relative select-none overflow-x-auto">
          <div
            className="relative"
            style={{
              height: "80px",
              width: `${whiteKeys.length * 36}px`,
              minWidth: "100%",
            }}
          >
            {/* White keys */}
            {whiteKeys.map((k, i) => {
              const isActive = activeKeys.has(k.midi);
              return (
                <button
                  key={k.midi}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    playNote(k.midi, 90);
                  }}
                  onPointerUp={() => stopNote(k.midi)}
                  onPointerLeave={() => stopNote(k.midi)}
                  className="absolute top-0 rounded-b-md border border-border transition-colors"
                  style={{
                    left: `${i * 36}px`,
                    width: "34px",
                    height: "80px",
                    background: isActive
                      ? "rgb(167, 139, 250)"
                      : "rgba(255,255,255,0.92)",
                    zIndex: 1,
                  }}
                >
                  <span
                    className="absolute bottom-1 left-0 right-0 text-center text-[9px]"
                    style={{ color: isActive ? "white" : "#333" }}
                  >
                    {k.label}
                  </span>
                </button>
              );
            })}

            {/* Black keys */}
            {(() => {
              const blacks: ReactElement[] = [];
              let whiteIdx = -1;
              for (const k of allKeys) {
                if (!k.black) {
                  whiteIdx++;
                  continue;
                }
                const isActive = activeKeys.has(k.midi);
                blacks.push(
                  <button
                    key={k.midi}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      playNote(k.midi, 100);
                    }}
                    onPointerUp={() => stopNote(k.midi)}
                    onPointerLeave={() => stopNote(k.midi)}
                    className="absolute rounded-b-md border border-black/40 transition-colors"
                    style={{
                      left: `${whiteIdx * 36 + 23}px`,
                      width: "24px",
                      height: "50px",
                      top: 0,
                      background: isActive
                        ? "rgb(124, 58, 237)"
                        : "rgba(18,12,40,0.97)",
                      zIndex: 2,
                    }}
                  />,
                );
              }
              return blacks;
            })()}
          </div>
        </div>
      </div>

      {/* How to play */}
      <div className="px-5 pb-3 text-sm text-muted-foreground">
        <span className="font-medium text-muted-foreground">How to play: </span>
        Press keys or play MIDI. The two rooms ring at a tritone apart — hear
        the beating. Drag detune left to fuse them. Resolution is yours alone.
      </div>

      {/* Design notes toggle */}
      <div className="px-5 pb-6 shrink-0">
        <button
          onClick={() => setShowDesign((v) => !v)}
          className="text-violet-300 text-base underline underline-offset-2 hover:text-violet-200 transition-colors px-0 py-1 min-h-[44px] flex items-center"
        >
          {showDesign ? "Hide" : "Show"} Design Notes
        </button>
        {showDesign && (
          <div className="mt-3 rounded-xl bg-muted border border-border px-5 py-4 text-sm text-muted-foreground space-y-3 max-w-prose">
            <p className="text-foreground font-semibold text-base">
              Two Rooms Apart — Design Notes
            </p>
            <p>
              <strong className="text-foreground">Cycle 2 of the Resonant Room spine.</strong>{" "}
              Cycle 1 (475) was a single Feedback Delay Network reverb tuned
              in-key, resolving warmly to the tonic. Here the question is what
              happens when two such rooms disagree fundamentally.
            </p>
            <p>
              <strong className="text-foreground">Two tritone-detuned rooms.</strong>{" "}
              Room A holds the reference spectrum (harmonics of the played
              note). Room B holds the same spectrum shifted up by the detune
              amount (0–600 cents, default = tritone = 600 cents). At a tritone,
              every partial in Room A lands near-but-not-on a partial in Room B,
              producing dense beating. The rooms are panned left/right so the
              spatial disagreement is audible.
            </p>
            <p>
              <strong className="text-foreground">Beating and interference.</strong>{" "}
              Each resonator is a high-Q biquad bandpass filter. When two
              resonators at nearby frequencies ring simultaneously, their outputs
              summed at the ear produce amplitude modulation at the difference
              frequency — the classic &ldquo;beating&rdquo; of mistuned intervals. The
              canvas shows connective arcs between paired partials, pulsing at
              their beat frequency and colored rose (tense) to emerald (resolved).
            </p>
            <p>
              <strong className="text-foreground">Roughness engine.</strong>{" "}
              Real-time Plomp–Levelt / Sethares dyad model: for each partial
              pair (f₁,a₁),(f₂,a₂), roughness ≈ a₁·a₂·(exp(−b₁·s·Δf) −
              exp(−b₂·s·Δf)), where s = 0.24/(0.0207·f_min + 18.96). Summed
              across all cross-room pairs. This scalar drives the tension
              readout and canvas heat.
            </p>
            <p>
              <strong className="text-foreground">Player-driven resolution.</strong>{" "}
              The rooms do NOT auto-resolve. Only dragging the detune slider
              toward 0 collapses them. As the slider moves left, the beat
              frequencies drop to zero, the canvas fringes still, and the
              roughness readout falls to &ldquo;Resolved.&rdquo;
            </p>
            <p>
              <strong className="text-foreground">References.</strong>{" "}
              FDN lineage: Stautner & Puckette (CMJ 1982); Jot & Chaigne (AES
              1991). Roughness: Plomp &amp; Levelt (JASA 1965); Sethares, &ldquo;Local
              consonance and the relationship between timbre and scale&rdquo; (JASA
              94:3, 1993); MacCallum & Einbond (CMMR 2008).
            </p>
            <p>
              <strong className="text-foreground">Cycle 3 idea.</strong>{" "}
              Add a third room tuned a just fifth above Room A — so Room A and
              Room C agree on harmonics but Room B remains the tritone
              interloper. The player must find the &ldquo;pivot note&rdquo; where all three
              rooms momentarily align, then choose which two to collapse.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
