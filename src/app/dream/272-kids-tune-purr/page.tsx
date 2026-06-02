"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── Just-intonation intervals against drone (A2 = 110 Hz) ──────────────────
// Creature 0 targets unison  1:1  → 110.000 Hz
// Creature 1 targets maj 3rd 5:4  → 137.500 Hz
// Creature 2 targets perf 5th 3:2 → 165.000 Hz
const DRONE_HZ = 110; // A2

interface CreatureConfig {
  label: string;         // interval name (decorative, not shown to kids)
  ratio: [number, number]; // numerator, denominator
  targetHz: number;      // pure freq
  startHz: number;       // detuned start (provides ~5-7 Hz beat)
  color: string;         // matte fill
  darkColor: string;     // shadow / border
  cx: number;            // initial X (fraction of width, 0-1)
  cy: number;            // initial Y (fraction of height, 0-1)
}

const CREATURE_CONFIGS: CreatureConfig[] = [
  {
    label: "unison",
    ratio: [1, 1],
    targetHz: DRONE_HZ * 1,         // 110 Hz
    startHz: DRONE_HZ * 1 + 6.5,   // 116.5 Hz → ~6.5 Hz beat
    color: "#c8a07a",               // dusty clay / terracotta
    darkColor: "#7a5c3a",
    cx: 0.2,
    cy: 0.4,
  },
  {
    label: "major third",
    ratio: [5, 4],
    targetHz: DRONE_HZ * 5 / 4,     // 137.5 Hz
    startHz: DRONE_HZ * 5 / 4 + 5.5, // 143 Hz → ~5.5 Hz beat
    color: "#8fb89a",               // sage green
    darkColor: "#4a7055",
    cx: 0.5,
    cy: 0.35,
  },
  {
    label: "perfect fifth",
    ratio: [3, 2],
    targetHz: DRONE_HZ * 3 / 2,    // 165 Hz
    startHz: DRONE_HZ * 3 / 2 + 7, // 172 Hz → ~7 Hz beat
    color: "#8aabe0",               // dusty blue
    darkColor: "#3a5a8a",
    cx: 0.78,
    cy: 0.42,
  },
];

const CREATURE_R = 58; // px radius — big for 4-year-old fingers
const LOCK_CENTS = 6;  // snap within ±6 cents
const BEAT_GAIN_DEPTH = 0.18; // amplitude modulation depth for beat reinforcement

// Y-drag maps: top of screen = max freq, bottom = min freq
const FREQ_MAX_RATIO = 1.18; // creature can go up to 1.18× its target
const FREQ_MIN_RATIO = 0.82; // creature can go down to 0.82× its target

// Compute beat frequency between creature tone and the nearest drone partial
function getBeatHz(creatureHz: number, targetHz: number): number {
  return Math.abs(creatureHz - targetHz);
}

// Cents difference between two frequencies
function toCents(f1: number, f2: number): number {
  return 1200 * Math.log2(f1 / f2);
}

// Map Y position (0=top, 1=bottom) to frequency for a creature
function yToFreq(yFrac: number, cfg: CreatureConfig): number {
  const lo = cfg.targetHz * FREQ_MIN_RATIO;
  const hi = cfg.targetHz * FREQ_MAX_RATIO;
  // invert: top = high freq
  return lo + (1 - yFrac) * (hi - lo);
}

// ─── Audio helpers ────────────────────────────────────────────────────────────
function makeDroneNode(ctx: AudioContext): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.setTargetAtTime(0.18, ctx.currentTime, 0.8);
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = DRONE_HZ;
  osc.connect(gain);
  osc.start();

  // Soft second partial (octave) at low level for warmth
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = DRONE_HZ * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.28;
  osc2.connect(g2).connect(gain);
  osc2.start();
}

interface CreatureAudio {
  osc: OscillatorNode;
  gainNode: GainNode;         // master gain for the creature tone
  beatGain: GainNode;         // AM gain driven by beat LFO
  beatOsc: OscillatorNode;    // LFO oscillator at beat frequency
  lfoGain: GainNode;          // scales LFO depth — set to 0 on lock
  purr: OscillatorNode | null;
  purrGain: GainNode | null;
}

function makeCreatureAudio(ctx: AudioContext, cfg: CreatureConfig): CreatureAudio {
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.setTargetAtTime(0.22, ctx.currentTime, 0.6);
  masterGain.connect(ctx.destination);

  // Beat reinforcement AM: gain node whose gain oscillates at beat frequency
  const beatGain = ctx.createGain();
  beatGain.gain.value = 1.0;
  beatGain.connect(masterGain);

  // LFO to modulate beatGain.gain
  const beatOsc = ctx.createOscillator();
  beatOsc.type = "sine";
  const beatHz = getBeatHz(cfg.startHz, cfg.targetHz);
  beatOsc.frequency.value = beatHz;

  // Scale LFO: it will add ±BEAT_GAIN_DEPTH to the gain
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = BEAT_GAIN_DEPTH;
  beatOsc.connect(lfoGain).connect(beatGain.gain);
  beatOsc.start();

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = cfg.startHz;
  // Soft second partial for warmth
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = cfg.startHz * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  osc2.connect(g2).connect(beatGain);
  osc.connect(beatGain);
  osc.start();
  osc2.start();

  return { osc, gainNode: masterGain, beatGain, beatOsc, lfoGain, purr: null, purrGain: null };
}

function startCreaturePurr(ctx: AudioContext, audio: CreatureAudio, freq: number): void {
  if (audio.purr) return;
  // A soft, detuned-pair purr tone (two sines 2 Hz apart for gentle chorus)
  const purr = ctx.createOscillator();
  purr.type = "sine";
  purr.frequency.value = freq * 1.5 + 1; // fifth above + 1 Hz for shimmer
  const purrGain = ctx.createGain();
  purrGain.gain.setValueAtTime(0, ctx.currentTime);
  purrGain.gain.setTargetAtTime(0.09, ctx.currentTime, 0.4);
  purr.connect(purrGain).connect(ctx.destination);
  purr.start();
  audio.purr = purr;
  audio.purrGain = purrGain;
}

function stopCreaturePurr(ctx: AudioContext, audio: CreatureAudio): void {
  if (!audio.purr || !audio.purrGain) return;
  audio.purrGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  const p = audio.purr;
  setTimeout(() => {
    try { p.stop(); }
    catch { /* oscillator may already be stopped */ }
  }, 1200);
  audio.purr = null;
  audio.purrGain = null;
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

function drawCreatureBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  darkColor: string,
  shiver: number,    // 0-1 current shiver displacement (absolute pixels)
  locked: boolean,
  t: number,         // time for animation
  beatHz: number,    // for body pulse
): void {
  ctx.save();

  // Shiver: jitter the position
  const jx = locked ? 0 : shiver * Math.sin(t * beatHz * Math.PI * 2) * 0.7;
  const jy = locked ? 0 : shiver * Math.cos(t * beatHz * Math.PI * 2 * 0.73) * 0.5;

  const cx = x + jx;
  const cy = y + jy;

  // Soft drop shadow (matte, not glow)
  ctx.shadowColor = darkColor + "55";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  // Body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Soft inner highlight (matte specular)
  ctx.beginPath();
  ctx.arc(cx - r * 0.22, cy - r * 0.22, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();

  // Soft border
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = darkColor + "66";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (locked) {
    // Open eyes: two small arcs
    drawEyesOpen(ctx, cx, cy, r, darkColor);
    // Smile
    drawSmile(ctx, cx, cy, r, darkColor);
  } else {
    // Closed/sleepy eyes — squiggly when wobbling
    drawEyesClosed(ctx, cx, cy, r, darkColor, shiver);
  }

  ctx.restore();
}

function drawEyesOpen(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  darkColor: string,
): void {
  const eyeY = cy - r * 0.12;
  const eyeOff = r * 0.3;
  const eyeR = r * 0.13;

  for (const ex of [cx - eyeOff, cx + eyeOff]) {
    // White sclera
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fill();
    // Pupil
    ctx.beginPath();
    ctx.arc(ex, eyeY + eyeR * 0.15, eyeR * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = darkColor;
    ctx.fill();
  }
}

function drawEyesClosed(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  darkColor: string,
  shiver: number,
): void {
  const eyeY = cy - r * 0.12;
  const eyeOff = r * 0.3;
  const eyeW = r * 0.26;

  ctx.strokeStyle = darkColor + "cc";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  for (const ex of [cx - eyeOff, cx + eyeOff]) {
    // Curved line eye — wobble amplitude wiggles its arc
    const wobble = shiver * 0.5;
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, eyeY + wobble);
    ctx.quadraticCurveTo(ex, eyeY - r * 0.08 - wobble * 0.5, ex + eyeW, eyeY + wobble);
    ctx.stroke();
  }
}

function drawSmile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  darkColor: string,
): void {
  ctx.strokeStyle = darkColor + "cc";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.15, r * 0.32, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawAllLockedRings(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
): void {
  // Soft expanding matte petal-rings — NOT glowing, just translucent
  const cx = W / 2;
  const cy = H / 2;
  const ringCount = 4;
  for (let i = 0; i < ringCount; i++) {
    const phase = (t * 0.4 + i / ringCount) % 1;
    const baseR = Math.min(W, H) * 0.1;
    const maxR = Math.min(W, H) * 0.52;
    const rr = baseR + phase * (maxR - baseR);
    const alpha = (1 - phase) * 0.14;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,190,160,${alpha})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawDroneCircle(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
): void {
  // A gentle, slow-breathing circle for the drone (center bottom)
  const cx = W / 2;
  const cy = H - 70;
  const breathe = 1 + 0.04 * Math.sin(t * 1.1);
  const r = 28 * breathe;

  ctx.save();
  ctx.shadowColor = "#7a6a5a44";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#c4a882";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#7a6a5a44";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Tiny music note shape inside
  ctx.fillStyle = "#5c4a2a88";
  ctx.font = `${14}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", cx, cy);
  ctx.restore();
}

// ─── React component ──────────────────────────────────────────────────────────

interface CreatureState {
  x: number;     // px
  y: number;     // px
  hz: number;
  locked: boolean;
  dragging: boolean;
}

export default function KidsTunePurr() {
  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [audioError, setAudioError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const actxRef = useRef<AudioContext | null>(null);

  // Creature audio nodes
  const creatureAudioRef = useRef<CreatureAudio[]>([]);

  // Mutable creature state (kept in refs for rAF, mirrored to React only for start)
  const creaturesRef = useRef<CreatureState[]>([]);

  // Pointer tracking: pointerId → creature index
  const pointerMapRef = useRef<Map<number, number>>(new Map());
  // Pointer Y-start for drag
  const pointerStartRef = useRef<Map<number, { py: number; creatureY: number }>>(new Map());

  // All-locked celebration timer
  const allLockedRef = useRef(false);
  const allLockedTRef = useRef(0);

  // Init creature positions based on canvas size
  const initCreatures = useCallback((W: number, H: number) => {
    creaturesRef.current = CREATURE_CONFIGS.map((cfg) => ({
      x: cfg.cx * W,
      y: cfg.cy * H,
      hz: cfg.startHz,
      locked: false,
      dragging: false,
    }));
  }, []);

  // Update creature frequency and audio
  const setCreatureHz = useCallback((idx: number, hz: number) => {
    const cfg = CREATURE_CONFIGS[idx];
    const creature = creaturesRef.current[idx];
    const audio = creatureAudioRef.current[idx];
    const ctx = actxRef.current;
    if (!creature || !audio || !ctx) return;

    const clamped = Math.max(cfg.targetHz * FREQ_MIN_RATIO, Math.min(cfg.targetHz * FREQ_MAX_RATIO, hz));
    const cents = Math.abs(toCents(clamped, cfg.targetHz));
    const wasLocked = creature.locked;

    if (cents <= LOCK_CENTS) {
      // LOCK — snap to pure ratio
      creature.hz = cfg.targetHz;
      creature.locked = true;
      audio.osc.frequency.setTargetAtTime(cfg.targetHz, ctx.currentTime, 0.08);
      // Stop beating: fade LFO depth to 0 so AM stops
      audio.lfoGain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      if (!wasLocked) {
        startCreaturePurr(ctx, audio, cfg.targetHz);
      }
    } else {
      // UNLOCK / DETUNE
      creature.hz = clamped;
      creature.locked = false;
      audio.osc.frequency.setTargetAtTime(clamped, ctx.currentTime, 0.04);
      const beatHz = getBeatHz(clamped, cfg.targetHz);
      audio.beatOsc.frequency.setTargetAtTime(beatHz, ctx.currentTime, 0.06);
      // Restore LFO depth
      audio.lfoGain.gain.setTargetAtTime(BEAT_GAIN_DEPTH, ctx.currentTime, 0.1);
      if (wasLocked) {
        stopCreaturePurr(ctx, audio);
      }
    }
  }, []);

  // ── Audio setup ────────────────────────────────────────────────────────────
  const startAudio = useCallback(() => {
    try {
      const ctx = new AudioContext();
      actxRef.current = ctx;
      makeDroneNode(ctx);
      creatureAudioRef.current = CREATURE_CONFIGS.map((cfg) => makeCreatureAudio(ctx, cfg));
    } catch {
      setAudioError("Audio unavailable — try a different browser or device.");
    }
  }, []);

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    let startT = -1;

    const drawFrame = (now: number) => {
      if (startT < 0) startT = now;
      const t = (now - startT) / 1000;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth;
      const H = window.innerHeight;

      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        c.scale(dpr, dpr);
        // Re-init positions proportionally if not already set sensibly
        const cur = creaturesRef.current;
        if (cur.length === 0 || cur[0].x < 1) {
          initCreatures(W, H);
        }
      }

      // Background: warm deep dusk matte
      c.fillStyle = "#2a2018";
      c.fillRect(0, 0, W, H);

      // Subtle background texture gradient
      const bg = c.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
      bg.addColorStop(0, "rgba(80,60,40,0.25)");
      bg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);

      const creatures = creaturesRef.current;

      // Check all-locked
      const allLocked = creatures.length === 3 && creatures.every((cr) => cr.locked);
      if (allLocked && !allLockedRef.current) {
        allLockedRef.current = true;
        allLockedTRef.current = t;
      }
      if (!allLocked) {
        allLockedRef.current = false;
      }

      // Draw all-locked celebration rings
      if (allLocked) {
        drawAllLockedRings(c, W, H, t - allLockedTRef.current);
      }

      // Draw drone circle
      drawDroneCircle(c, W, H, t);

      // Draw creatures
      for (let i = 0; i < creatures.length; i++) {
        const cr = creatures[i];
        const cfg = CREATURE_CONFIGS[i];
        if (!cr) continue;

        const beatHz = cr.locked ? 0 : getBeatHz(cr.hz, cfg.targetHz);
        // Shiver amplitude: proportional to beat frequency (max 10 px at ~8 Hz, 0 at lock)
        const shiverAmp = cr.locked ? 0 : Math.min(10, beatHz * 1.2);

        drawCreatureBody(c, cr.x, cr.y, CREATURE_R, cfg.color, cfg.darkColor, shiverAmp, cr.locked, t, beatHz);

        // Drag indicator: a small up-arrow hinting at drag
        if (!cr.locked && !cr.dragging) {
          c.save();
          c.globalAlpha = 0.35 + 0.15 * Math.sin(t * 1.8 + i);
          c.fillStyle = cfg.color;
          c.font = "20px serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("↕", cr.x, cr.y + CREATURE_R + 18);
          c.restore();
        }
      }

      // Header text
      c.save();
      c.fillStyle = "rgba(220,205,185,0.75)";
      c.font = "bold 18px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "top";
      c.fillText("slide up or down to tune", W / 2, 14);
      c.restore();

      // All-locked message
      if (allLocked) {
        const elapsed = t - allLockedTRef.current;
        const alpha = Math.min(1, elapsed * 1.5);
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = "rgba(210,220,200,0.92)";
        c.font = "bold 28px system-ui, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("♪ in tune ♪", W / 2, H * 0.18);
        c.restore();
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, initCreatures]);

  // ── Start handler ──────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    startAudio();
    setPhase("playing");
    const canvas = canvasRef.current;
    if (canvas) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      initCreatures(W, H);
    }
  }, [startAudio, initCreatures]);

  // ── Pointer events ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (phase !== "playing") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);

      const r = canvas.getBoundingClientRect();
      const px = (e.clientX - r.left);
      const py = (e.clientY - r.top);

      // Find closest creature within touch radius
      let closest = -1;
      let closestDist = Infinity;
      const creatures = creaturesRef.current;
      for (let i = 0; i < creatures.length; i++) {
        const cr = creatures[i];
        const dist = Math.hypot(px - cr.x, py - cr.y);
        if (dist < CREATURE_R * 1.4 && dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }

      if (closest >= 0) {
        pointerMapRef.current.set(e.pointerId, closest);
        pointerStartRef.current.set(e.pointerId, { py, creatureY: creatures[closest].y });
        creatures[closest].dragging = true;
      }
    },
    [phase],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (phase !== "playing") return;
      const creatureIdx = pointerMapRef.current.get(e.pointerId);
      if (creatureIdx === undefined) return;

      const start = pointerStartRef.current.get(e.pointerId);
      if (!start) return;

      const canvas2 = canvasRef.current;
      if (!canvas2) return;
      const r = canvas2.getBoundingClientRect();
      const H = r.height;
      const py = e.clientY - r.top;

      // Move creature Y
      const newY = Math.max(CREATURE_R + 30, Math.min(H - CREATURE_R - 80, start.creatureY + (py - start.py)));
      const creature = creaturesRef.current[creatureIdx];
      if (!creature) return;
      creature.y = newY;

      // Map Y to frequency
      const yFrac = newY / H;
      const cfg = CREATURE_CONFIGS[creatureIdx];
      const newHz = yToFreq(yFrac, cfg);
      setCreatureHz(creatureIdx, newHz);
    },
    [phase, setCreatureHz],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const creatureIdx = pointerMapRef.current.get(e.pointerId);
      if (creatureIdx !== undefined && creaturesRef.current[creatureIdx]) {
        creaturesRef.current[creatureIdx].dragging = false;
      }
      pointerMapRef.current.delete(e.pointerId);
      pointerStartRef.current.delete(e.pointerId);
    },
    [],
  );

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const ctx = actxRef.current;
      if (ctx) {
        ctx.close().catch(() => { /* ignore close error */ });
      }
    };
  }, []);

  // ── Idle / pre-start screen ────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-8"
        style={{ background: "#2a2018" }}
      >
        {/* Preview: three sleeping creatures */}
        <div className="flex items-center gap-8" aria-hidden="true">
          {CREATURE_CONFIGS.map((cfg, i) => (
            <div
              key={i}
              className="rounded-full flex items-center justify-center text-2xl"
              style={{
                width: 72,
                height: 72,
                background: cfg.color,
                boxShadow: `0 4px 10px ${cfg.darkColor}44`,
              }}
            >
              {["˘ ˘", "~ ~", "· ·"][i] ?? "~ ~"}
            </div>
          ))}
        </div>

        <div>
          <h1 className="text-3xl font-bold text-white mb-3">Tune the Hummers</h1>
          <p className="text-base text-white/80 max-w-sm leading-relaxed">
            Slide each creature up or down until it stops wobbling and starts to purr.
          </p>
        </div>

        {audioError && (
          <p className="text-rose-300 text-base">{audioError}</p>
        )}

        <button
          onClick={handleStart}
          className="min-h-[64px] px-10 py-4 rounded-2xl text-xl font-bold text-white transition-colors"
          style={{ background: "#8aabe0", color: "#1a1008" }}
        >
          ▶ tap to begin
        </button>

        <p className="text-base text-white/60">
          slide up · slide down · feel the purr
        </p>

        <Link
          href="/dream"
          className="text-base text-white/50 hover:text-white/70 transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    );
  }

  // ── Play screen ────────────────────────────────────────────────────────────
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "100dvh", background: "#2a2018" }}
    >
      {audioError && (
        <div className="absolute top-4 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <p className="text-rose-300 text-base bg-black/60 px-4 py-2 rounded-xl">{audioError}</p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Corner link — design notes */}
      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/272-kids-tune-purr/README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 text-white/40 hover:text-white/65 transition-colors z-10"
        style={{ fontSize: 12 }}
      >
        design notes
      </Link>
    </div>
  );
}
