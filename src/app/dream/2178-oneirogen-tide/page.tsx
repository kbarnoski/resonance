"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SafeFlicker } from "../_shared/psych/safeFlicker";

// ── Oneirogen II · Tide ──────────────────────────────────────────────────────
// Cycle-2 of 2074-oneirogen. Cycle-1 let you WATCH a single dial α hand the
// wheel from world → dream. Tide adds the interaction model it lacked:
//
//   1. ENGAGEMENT DRIVES α (embodied handoff). α is a slew-limited follower of
//      your engagement. While you move / interact, engagement is high and α is
//      pulled toward 0 (wake). Go still, engagement decays, α drifts up toward 1
//      (sleep). Attention holds you awake; letting go lets the dream take over —
//      the real hypnagogic mechanic. (A manual α slider stays as an override.)
//   2. SPATIAL INCUBATION SEEDING (Dormio / targeted dream incubation). While
//      awake you DRAG on the field to paint a glowing seed. At the moment you
//      plant it, its (x,y) locus + the live spectral signature (bass/mid/high)
//      are written into a TAGGED, higher-weight slot of the memory ring. As α
//      rises into sleep, the autonomous replay preferentially REACTIVATES your
//      seed: the field blooms brighter from its location and its signature
//      recurs in the replay, recombined with the ambient memory motif.
//
// Everything is Web Audio + Canvas 2D. Deterministic (mulberry32, no Math.random
// / Date.now); rAF timestamp for all timing; self-demos hands-free via a seeded
// autopilot that plants a seed and lets α drift. No strobe: all luminance change
// is slow drift (the global breath is routed through SafeFlicker, ≤3 Hz clamp).

type Phase = "idle" | "running" | "error";
type Drive = "engagement" | "manual";

// A single drifting phosphene stream.
interface Stream {
  x: number;
  y: number;
  hue: number;
  life: number;
  seed: number;
}

// Live per-frame band energies read from the analyser (the "world").
interface Bands {
  bass: number;
  mid: number;
  high: number;
  overall: number;
}

// An incubated seed — a planted locus + the spectral signature captured with it.
interface Seed {
  nx: number; // normalized location [0,1] (resize-safe)
  ny: number;
  bass: number;
  mid: number;
  high: number;
  overall: number;
  weight: number; // newest strongest; older seeds are demoted on each new plant
  rate: number; // sub-Hz reactivation clock
  phase: number;
  born: number;
}

// The engine's mutable state, kept out of React so rAF never re-renders.
interface Engine {
  raf: number;
  last: number;
  t: number;
  streams: Stream[];
  bands: Bands;
  // Circular memory of recent band energies — recorded at wake, replayed at sleep.
  memory: Float32Array;
  tag: Float32Array; // >0 where a seed tagged the ring — stands out in replay
  memWrite: number;
  memRead: number;
  // Slowly drifting phases for the autonomous ("dream") potential field.
  ph1: number;
  ph2: number;
  ph3: number;
  // Engagement / handoff.
  engagement: number;
  humanEngaged: boolean;
  autoSeeded: boolean;
  autoNx: number;
  autoNy: number;
  // Seeds + the one currently being painted.
  seeds: Seed[];
  draft: { nx: number; ny: number; intensity: number } | null;
  // Pointer bookkeeping (single pointer).
  pointerId: number | null;
  painting: boolean;
  lastNx: number;
  lastNy: number;
}

interface AudioRig {
  ctx: AudioContext;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  liveBus: GainNode; // world sound → faded out by α
  replayBus: GainNode; // dream sound → faded in by α
  builtinGain: GainNode; // autonomous ambient pad
  fileGain: GainNode; // dropped track (optional)
  fileSource: AudioBufferSourceNode | null;
  replayOscs: OscillatorNode[];
  stop: () => void;
}

const MEM_LEN = 256;
const STREAM_COUNT = 220;
const SEED = 0x2178;
const MAX_SEEDS = 2;

// mulberry32 — a tiny seeded PRNG. Deterministic: NO Math.random anywhere.
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStream(w: number, h: number, rnd: () => number): Stream {
  return {
    x: rnd() * w,
    y: rnd() * h,
    hue: 250 + rnd() * 45, // indigo → violet → soft lilac
    life: rnd(),
    seed: rnd() * 1000,
  };
}

// Scalar potential for the SENSORY field — its amplitudes swell with the
// live audio bands, so the flow visibly answers to the sound at α≈0.
function sensoryPotential(nx: number, ny: number, t: number, b: Bands): number {
  return (
    Math.sin(nx * 1.3 + t * 0.06 + b.bass * 5) * (0.5 + b.bass * 2.4) +
    Math.sin(ny * 1.7 - t * 0.05 + b.mid * 5) * (0.45 + b.mid * 2.2) +
    Math.sin((nx + ny) * 0.9 + t * 0.04 + b.high * 6) * (0.4 + b.high * 1.8)
  );
}

// Scalar potential for the AUTONOMOUS field — phases drift on their own and
// its swell is fed by the replayed MEMORY, not by any live input.
function autoPotential(
  nx: number,
  ny: number,
  t: number,
  e: number,
  ph1: number,
  ph2: number,
  ph3: number,
): number {
  return (
    Math.sin(nx * 1.05 + t * 0.014 + ph1) * (0.55 + e * 1.6) +
    Math.sin(ny * 1.35 + t * 0.011 + ph2) * (0.5 + e * 1.4) +
    Math.sin((nx - ny) * 0.8 + t * 0.009 + ph3) * 0.5
  );
}

// Blended potential at a point (world → dream by α), sampled to derive a
// divergence-free curl flow (perpendicular gradient of the scalar field).
function potentialAt(
  x: number,
  y: number,
  eng: Engine,
  memEnergy: number,
  alpha: number,
): number {
  const nx = x * 0.0038;
  const ny = y * 0.0038;
  const s = sensoryPotential(nx, ny, eng.t, eng.bands);
  const a = autoPotential(nx, ny, eng.t, memEnergy, eng.ph1, eng.ph2, eng.ph3);
  return s * (1 - alpha) + a * alpha;
}

// Plant an incubated seed: capture the live spectral signature + this locus,
// demote older seeds, and TAG a run of memory-ring slots so the seed's motif
// stands out (recurs louder) during the sleep replay.
function commitSeed(eng: Engine, nx: number, ny: number, rnd: () => number): void {
  const b = eng.bands;
  for (const s of eng.seeds) s.weight *= 0.55; // newest is strongest
  eng.seeds.push({
    nx,
    ny,
    bass: b.bass,
    mid: b.mid,
    high: b.high,
    overall: b.overall,
    weight: 1,
    rate: 0.05 + rnd() * 0.05, // sub-Hz reactivation clock
    phase: rnd() * 6.28318530718,
    born: eng.t,
  });
  while (eng.seeds.length > MAX_SEEDS) eng.seeds.shift();
  // Write an elevated, tagged run into the ring — the recorded seed spike.
  const elevated = Math.min(1, b.overall + 0.35);
  for (let k = 0; k < 8; k++) {
    const idx = (eng.memWrite + k) % MEM_LEN;
    eng.memory[idx] = elevated;
    eng.tag[idx] = 1;
  }
}

export default function OneirogenTidePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const audioRef = useRef<AudioRig | null>(null);
  const rngRef = useRef<() => number>(mulberry32(SEED));
  const breathRef = useRef<SafeFlicker | null>(null);
  const alphaRef = useRef(0);
  const driveRef = useRef<Drive>("engagement");
  const manualAlphaRef = useRef(0);
  const stateThrottleRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [alpha, setAlpha] = useState(0);
  const [engagement, setEngagement] = useState(1);
  const [drive, setDrive] = useState<Drive>("engagement");
  const [manualAlpha, setManualAlpha] = useState(0);
  const [seedCount, setSeedCount] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── Build the audio graph (called from inside the Begin click handler) ────
  const startAudio = useCallback((): AudioRig | null => {
    if (typeof window === "undefined") return null;
    let ctx: AudioContext;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
    } catch {
      return null;
    }

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

    // World bus: the live sound the wake-field tracks. Fades out with α.
    const liveBus = ctx.createGain();
    liveBus.gain.value = 1;
    liveBus.connect(master);
    liveBus.connect(analyser); // analyser always reads the actual world sound

    // Dream bus: the internally generated replay. Fades in with α.
    const replayBus = ctx.createGain();
    replayBus.gain.value = 0;
    replayBus.connect(master);

    // Built-in autonomous ambient pad — soft evolving chord (the default world).
    const builtinGain = ctx.createGain();
    builtinGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.6;
    builtinGain.connect(padFilter);
    padFilter.connect(liveBus);
    builtinGain.gain.setTargetAtTime(0.16, ctx.currentTime, 3);

    const padFreqs = [110, 164.81, 220, 277.18];
    padFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      // Slow detune LFO so the pad drifts (sub-Hz — never rhythmic).
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 4 + i;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      osc.connect(g);
      g.connect(builtinGain);
      osc.start();
      lfo.start();
    });

    // Optional dropped track routes here (ducks the built-in pad when present).
    const fileGain = ctx.createGain();
    fileGain.gain.value = 0;
    fileGain.connect(liveBus);

    // Generative replay pad — a slightly-detuned voicing of the same harmony,
    // its detune nudged by the memory buffer + reactivating seeds.
    const replayOscs: OscillatorNode[] = [];
    const replayFreqs = [82.41, 123.47, 164.81, 246.94];
    const replayFilter = ctx.createBiquadFilter();
    replayFilter.type = "lowpass";
    replayFilter.frequency.value = 700;
    replayFilter.connect(replayBus);
    replayFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.019 + i * 0.013;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 6 + i * 2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      osc.connect(g);
      g.connect(replayFilter);
      osc.start();
      lfo.start();
      replayOscs.push(osc);
    });

    const stop = () => {
      try {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      } catch {
        /* context may be closing */
      }
    };

    return {
      ctx,
      analyser,
      freq,
      liveBus,
      replayBus,
      builtinGain,
      fileGain,
      fileSource: null,
      replayOscs,
      stop,
    };
  }, []);

  // ── The render + audio-crossfade loop ─────────────────────────────────────
  const step = useCallback((now: number) => {
    const eng = engineRef.current;
    const canvas = canvasRef.current;
    if (!eng || !canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    if (eng.last === 0) eng.last = now; // seed timing from the first rAF frame
    const dt = Math.min(0.05, (now - eng.last) / 1000 || 0.016);
    eng.last = now;
    eng.t += dt;

    // ── Autopilot (self-demo): plant a seed and release, so a hands-free
    //    viewer sees the wake → incubate → dream arc within ~15 s. Yields the
    //    moment a real hand engages.
    if (!eng.humanEngaged) {
      if (eng.t < 3.2) eng.engagement = 1; // hold awake while "moving"
      if (!eng.autoSeeded && eng.t > 3.0) {
        commitSeed(eng, eng.autoNx, eng.autoNy, rngRef.current);
        eng.autoSeeded = true;
      }
    }
    // Engagement always decays; pointer handlers add to it between frames.
    eng.engagement = Math.max(0, eng.engagement - dt * 0.2);

    // ── Engagement drives α (slew-limited follower). Manual slider overrides. ─
    const target =
      driveRef.current === "manual"
        ? manualAlphaRef.current
        : 1 - eng.engagement;
    const maxStep = 0.12 * dt; // gentle: full sweep ≈ 8 s, never a jump (≪3 Hz)
    let a = alphaRef.current;
    a += Math.max(-maxStep, Math.min(maxStep, target - a));
    a = Math.min(1, Math.max(0, a));
    alphaRef.current = a;

    // Decay the seed-paint draft when not actively painting.
    if (eng.draft && !eng.painting) {
      eng.draft.intensity -= dt * 1.2;
      if (eng.draft.intensity <= 0) eng.draft = null;
    }

    // ── Read the world (analyser) into three bands ─────────────────────────
    const rig = audioRef.current;
    if (rig) {
      rig.analyser.getByteFrequencyData(rig.freq);
      const n = rig.freq.length;
      let bass = 0;
      let mid = 0;
      let high = 0;
      const bassEnd = Math.floor(n * 0.08);
      const midEnd = Math.floor(n * 0.35);
      for (let i = 0; i < n; i++) {
        const v = rig.freq[i] / 255;
        if (i < bassEnd) bass += v;
        else if (i < midEnd) mid += v;
        else high += v;
      }
      bass /= bassEnd || 1;
      mid /= midEnd - bassEnd || 1;
      high /= n - midEnd || 1;
      eng.bands.bass += (bass - eng.bands.bass) * 0.2;
      eng.bands.mid += (mid - eng.bands.mid) * 0.2;
      eng.bands.high += (high - eng.bands.high) * 0.2;
      eng.bands.overall = (eng.bands.bass + eng.bands.mid + eng.bands.high) / 3;

      // Crossfade sound: world out, dream in, smoothed.
      const tc = rig.ctx.currentTime;
      rig.liveBus.gain.setTargetAtTime(1 - a * 0.92, tc, 0.3);
      rig.replayBus.gain.setTargetAtTime(a * 0.85, tc, 0.3);
    }

    // ── Memory: record at wake, replay (with seed tags) at sleep ────────────
    let memEnergy: number;
    if (a < 0.5) {
      eng.memory[eng.memWrite] = eng.bands.overall;
      eng.tag[eng.memWrite] = 0; // ordinary (untagged) recording
      eng.memWrite = (eng.memWrite + 1) % MEM_LEN;
      memEnergy = eng.bands.overall;
    } else {
      eng.memRead = (eng.memRead + 0.35) % MEM_LEN;
      const idx = Math.floor(eng.memRead);
      let m = eng.memory[idx] || 0.15;
      const tg = eng.tag[idx];
      if (tg > 0.01) m = m * (1 + tg * 1.2) + tg * 0.2; // tagged seed stands out
      memEnergy = m;

      // Seed reactivation nudges the replay pad's detune (recombined with memory).
      let seedDetune = 0;
      for (const sd of eng.seeds) {
        const react = 0.45 + 0.55 * Math.sin(eng.t * sd.rate + sd.phase);
        seedDetune += sd.weight * react * (sd.high - sd.bass) * 30;
      }
      seedDetune = Math.max(-40, Math.min(40, seedDetune * a));
      if (rig) {
        const detune = (memEnergy - 0.2) * 40 + seedDetune;
        rig.replayOscs.forEach((osc, i) => {
          osc.detune.setTargetAtTime(
            detune + (i - 1.5) * 3,
            rig.ctx.currentTime,
            1.5,
          );
        });
      }
    }
    const driveEnergy = eng.bands.overall * (1 - a) + memEnergy * a;

    // Drift the autonomous phases (slow — sub-Hz, safe).
    eng.ph1 += dt * 0.05;
    eng.ph2 += dt * 0.037;
    eng.ph3 += dt * 0.028;

    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(w, h) / 700;

    // Gentle trail fade (never clears — phosphenes dissolve softly).
    ctx2d.globalCompositeOperation = "source-over";
    ctx2d.fillStyle = "rgba(8, 6, 18, 0.10)";
    ctx2d.fillRect(0, 0, w, h);

    // Slow global luminance breath — routed through SafeFlicker (≤3 Hz clamp,
    // reduced-motion aware). It is a drift, never a strobe.
    const lum = breathRef.current ? breathRef.current.value(eng.t) : 0.8;

    ctx2d.globalCompositeOperation = "lighter";
    const eps = 3;
    const flowScale = 26 + a * 10;
    const sigma = 95 * scale; // seed bloom radius

    for (const s of eng.streams) {
      // Curl of the blended potential = perpendicular gradient.
      const p = potentialAt(s.x, s.y, eng, memEnergy, a);
      const px = potentialAt(s.x + eps, s.y, eng, memEnergy, a);
      const py = potentialAt(s.x, s.y + eps, eng, memEnergy, a);
      const gx = (px - p) / eps;
      const gy = (py - p) / eps;
      const vx = gy;
      const vy = -gx;

      s.x += vx * flowScale * dt * 6;
      s.y += vy * flowScale * dt * 6;
      s.life -= dt * 0.14;

      if (s.x < -20) s.x = w + 20;
      if (s.x > w + 20) s.x = -20;
      if (s.y < -20) s.y = h + 20;
      if (s.y > h + 20) s.y = -20;

      if (s.life <= 0) {
        const rnd = rngRef.current;
        s.x = rnd() * w;
        s.y = rnd() * h;
        s.hue = 250 + rnd() * 45;
        s.life = 0.6 + rnd() * 0.6;
        s.seed = rnd() * 1000;
      }

      // Seed reactivation bloom: streams near a seed brighten as α rises into
      // sleep — the dream preferentially replays exactly what you planted.
      let seedBoost = 0;
      let seedHue = 0;
      for (const sd of eng.seeds) {
        const react = 0.45 + 0.55 * Math.sin(eng.t * sd.rate + sd.phase);
        const dx = s.x - sd.nx * w;
        const dy = s.y - sd.ny * h;
        const fall = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        const contrib = sd.weight * react * fall;
        seedBoost += contrib;
        seedHue += contrib * (sd.high - sd.bass) * 30;
      }
      seedBoost *= a; // only blooms in sleep

      const emerge = Math.sin(s.life * Math.PI);
      const bright = (0.06 + driveEnergy * 0.85 + seedBoost * 0.9) * emerge * lum;
      if (bright <= 0.004) continue;

      const hue = s.hue + a * 18 + Math.sin(eng.t * 0.1 + s.seed) * 6 + seedHue;
      const radius = 14 + driveEnergy * 40 + a * 10 + seedBoost * 26;
      const g = ctx2d.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
      g.addColorStop(0, `hsla(${hue}, 85%, 72%, ${bright})`);
      g.addColorStop(0.5, `hsla(${hue + 10}, 80%, 55%, ${bright * 0.4})`);
      g.addColorStop(1, "hsla(265, 80%, 40%, 0)");
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.arc(s.x, s.y, radius, 0, Math.PI * 2);
      ctx2d.fill();
    }

    // ── Seed markers: faint while awake, blooming in sleep ──────────────────
    for (const sd of eng.seeds) {
      const react = 0.45 + 0.55 * Math.sin(eng.t * sd.rate + sd.phase);
      const bright = (0.05 + sd.weight * 0.08 + react * sd.weight * a * 0.8) * lum;
      if (bright <= 0.004) continue;
      const sx = sd.nx * w;
      const sy = sd.ny * h;
      const radius = (22 + react * 42 * a + a * 18) * scale;
      const hue = 262 + sd.high * 30 + a * 10;
      const g = ctx2d.createRadialGradient(sx, sy, 0, sx, sy, radius);
      g.addColorStop(0, `hsla(${hue}, 90%, 78%, ${bright})`);
      g.addColorStop(0.4, `hsla(${hue + 8}, 82%, 58%, ${bright * 0.45})`);
      g.addColorStop(1, "hsla(268, 80%, 42%, 0)");
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx2d.fill();
    }

    // ── The seed currently being painted (bright locus under your hand) ─────
    if (eng.draft) {
      const sx = eng.draft.nx * w;
      const sy = eng.draft.ny * h;
      const bright = (0.18 + eng.draft.intensity * 0.6) * lum;
      const radius = (26 + eng.draft.intensity * 46) * scale;
      const hue = 275 + eng.bands.high * 25;
      const g = ctx2d.createRadialGradient(sx, sy, 0, sx, sy, radius);
      g.addColorStop(0, `hsla(${hue}, 92%, 82%, ${bright})`);
      g.addColorStop(0.4, `hsla(${hue + 6}, 84%, 60%, ${bright * 0.5})`);
      g.addColorStop(1, "hsla(270, 80%, 44%, 0)");
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx2d.fill();
    }

    // Throttled state → React (for the readouts) so rAF stays cheap.
    stateThrottleRef.current += dt;
    if (stateThrottleRef.current > 0.12) {
      stateThrottleRef.current = 0;
      setAlpha(a);
      setEngagement(eng.engagement);
      setSeedCount(eng.seeds.length);
    }

    eng.raf = requestAnimationFrame(step);
  }, []);

  // ── Canvas sizing (device-pixel-ratio aware) ──────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }, []);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext("2d")) {
      setPhase("error");
      return;
    }

    sizeCanvas();

    // Fresh deterministic PRNG each start so the piece replays identically.
    rngRef.current = mulberry32(SEED);
    const rnd = rngRef.current;

    // Global luminance breath through the safe engine (slow drift, clamped).
    breathRef.current = new SafeFlicker({ maxHz: 1, defaultHz: 0.16, floor: 0.62 });
    breathRef.current.enable();

    // Audio is optional — the visual field must run even with no audio device.
    const rig = startAudio();
    if (rig) {
      audioRef.current = rig;
      try {
        if (rig.ctx.state === "suspended") await rig.ctx.resume();
      } catch {
        /* headless / no device — visuals still run */
      }
    }

    const w = canvas.width;
    const h = canvas.height;
    engineRef.current = {
      raf: 0,
      last: 0,
      t: 0,
      streams: Array.from({ length: STREAM_COUNT }, () => makeStream(w, h, rnd)),
      bands: { bass: 0.1, mid: 0.1, high: 0.1, overall: 0.1 },
      memory: new Float32Array(MEM_LEN).fill(0.15),
      tag: new Float32Array(MEM_LEN),
      memWrite: 0,
      memRead: 0,
      ph1: rnd() * 10,
      ph2: rnd() * 10,
      ph3: rnd() * 10,
      engagement: 1, // start awake
      humanEngaged: false,
      autoSeeded: false,
      autoNx: 0.62 + (rnd() - 0.5) * 0.16,
      autoNy: 0.44 + (rnd() - 0.5) * 0.16,
      seeds: [],
      draft: null,
      pointerId: null,
      painting: false,
      lastNx: 0.5,
      lastNy: 0.5,
    };

    alphaRef.current = 0;
    driveRef.current = "engagement";
    setDrive("engagement");
    setAlpha(0);
    setEngagement(1);
    setPhase("running");
    engineRef.current.raf = requestAnimationFrame(step);
  }, [phase, sizeCanvas, startAudio, step]);

  // ── Pointer: engagement + seed painting (single pointer, mouse + touch) ────
  const pointerNorm = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { nx: 0.5, ny: 0.5 };
    const rect = canvas.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (clientX - rect.left) / (rect.width || 1)));
    const ny = Math.min(1, Math.max(0, (clientY - rect.top) / (rect.height || 1)));
    return { nx, ny };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (eng.pointerId !== null) return; // single pointer only
      eng.pointerId = e.pointerId;
      eng.humanEngaged = true; // autopilot yields to the real hand
      eng.painting = true;
      const { nx, ny } = pointerNorm(e.clientX, e.clientY);
      eng.lastNx = nx;
      eng.lastNy = ny;
      eng.draft = { nx, ny, intensity: 0.35 };
      eng.engagement = Math.min(1, eng.engagement + 0.4);
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* capture optional */
      }
    },
    [pointerNorm],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const eng = engineRef.current;
      if (!eng) return;
      const { nx, ny } = pointerNorm(e.clientX, e.clientY);
      const dist = Math.hypot(nx - eng.lastNx, ny - eng.lastNy);
      if (dist > 0.0005) eng.humanEngaged = true;
      // Motion feeds engagement → holds you awake (pulls α toward 0).
      eng.engagement = Math.min(1, eng.engagement + dist * 3.2);
      eng.lastNx = nx;
      eng.lastNy = ny;
      if (eng.painting && eng.pointerId === e.pointerId && eng.draft) {
        eng.draft.nx = nx;
        eng.draft.ny = ny;
        eng.draft.intensity = Math.min(1, eng.draft.intensity + dist * 4 + 0.01);
      }
    },
    [pointerNorm],
  );

  const endPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const eng = engineRef.current;
      if (!eng || eng.pointerId !== e.pointerId) return;
      if (eng.painting && eng.draft) {
        // Plant it: capture location + the live spectral signature into a
        // tagged, higher-weight memory slot.
        commitSeed(eng, eng.draft.nx, eng.draft.ny, rngRef.current);
        eng.draft = null;
        setSeedCount(eng.seeds.length);
      }
      eng.painting = false;
      eng.pointerId = null;
    },
    [],
  );

  // Handle a dropped / picked audio file — fully client-side, no network.
  const loadFile = useCallback(async (file: File) => {
    setFileError(null);
    const rig = audioRef.current;
    if (!rig) {
      setFileError("Press Begin first, then drop a track.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const decoded = await rig.ctx.decodeAudioData(buf.slice(0));
      if (rig.fileSource) {
        try {
          rig.fileSource.stop();
        } catch {
          /* already stopped */
        }
      }
      const src = rig.ctx.createBufferSource();
      src.buffer = decoded;
      src.loop = true;
      src.connect(rig.fileGain);
      src.start();
      rig.fileSource = src;
      const t = rig.ctx.currentTime;
      rig.fileGain.gain.setTargetAtTime(0.9, t, 1.2);
      rig.builtinGain.gain.setTargetAtTime(0.03, t, 1.2); // duck the pad
      setFileName(file.name);
    } catch {
      setFileError("Could not decode that file. Try a WAV, MP3, or OGG.");
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const onSlider = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    driveRef.current = "manual";
    setDrive("manual");
    const v = Number(e.target.value);
    manualAlphaRef.current = v;
    setManualAlpha(v);
  }, []);

  const selectEngagementDrive = useCallback(() => {
    driveRef.current = "engagement";
    setDrive("engagement");
  }, []);

  // Keep the canvas sized to its box while running.
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, sizeCanvas]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng?.raf) cancelAnimationFrame(eng.raf);
      breathRef.current?.kill();
      const rig = audioRef.current;
      if (rig) {
        rig.stop();
        if (rig.fileSource) {
          try {
            rig.fileSource.stop();
          } catch {
            /* already stopped */
          }
        }
        const ctx = rig.ctx;
        window.setTimeout(() => {
          if (ctx.state !== "closed") ctx.close().catch(() => undefined);
        }, 600);
      }
      audioRef.current = null;
      engineRef.current = null;
    };
  }, []);

  const pct = Math.round(alpha * 100);
  const engPct = Math.round(engagement * 100);
  const stateLabel =
    alpha < 0.15 ? "wake" : alpha > 0.85 ? "sleep" : "hypnagogia";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* The phosphene field. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#08060f" }}
      />

      {/* Stage overlay: seed painting (pointer) + audio-file drop (native DnD). */}
      {phase === "running" && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`absolute inset-0 touch-none transition-colors ${
            dragOver ? "bg-primary/20" : "bg-transparent"
          }`}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Oneirogen II — Tide
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          Plant a seed of attention as you drift off — then watch the dream
          preferentially replay and recombine exactly what you planted.
        </p>
      </div>

      {/* Read the design notes — corner affordance. */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-6 top-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* ── Idle: primary Begin ────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => void begin()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Starts silent. Begin resumes audio and lights a soft ambient pad.
            Then move to stay awake, be still to dream, and drag to plant a seed.
          </p>
          {phase === "error" && (
            <p className="text-sm text-destructive">
              This device could not provide a 2D canvas.
            </p>
          )}
        </div>
      )}

      {/* ── Running: readouts + controls ───────────────────────────────── */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-4 p-6">
          <div className="pointer-events-none mx-auto w-full max-w-2xl">
            <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              move to stay awake · be still to dream · drag to plant a seed
            </p>
          </div>
          <div className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-background/70 p-5 backdrop-blur-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {drive === "engagement"
                  ? "Engagement drives the handoff"
                  : "Manual α override"}
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                engage {engPct}% · α {pct}% · {stateLabel} · seeds {seedCount}
              </span>
            </div>

            {/* Engagement / α indicator (read-only meter). */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>wake · sensory</span>
              <span>sleep · replay</span>
            </div>

            {/* Accessibility / override: a manual α slider. */}
            <div className="mt-4">
              <label
                htmlFor="alpha"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                manual α (override)
              </label>
              <input
                id="alpha"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={drive === "manual" ? manualAlpha : alpha}
                onChange={onSlider}
                className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={selectEngagementDrive}
                aria-pressed={drive === "engagement"}
                className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                  drive === "engagement"
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {drive === "engagement" ? "Engagement drive on" : "Return to engagement"}
              </button>

              <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                {fileName ? "Change track" : "Drop a track (optional)"}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={onPick}
                  className="hidden"
                />
              </label>

              <span className="text-sm text-muted-foreground">
                {fileName ? `Tracking: ${fileName}` : "or drop an audio file anywhere"}
              </span>
            </div>
            {fileError && (
              <p className="mt-2 text-sm text-destructive">{fileError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Design notes modal ─────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Cycle-1 (<span className="text-foreground">Oneirogen</span>) let you
                watch a single dial <span className="text-foreground">α</span>{" "}
                interpolate the field from{" "}
                <span className="text-foreground">wake</span> (α=0, bottom-up,
                sensory-driven) to <span className="text-foreground">sleep</span>{" "}
                (α=1, top-down, internally-generated replay) — the{" "}
                <span className="text-primary">oneirogen hypothesis</span> (eLife
                105968, Version of Record 2026-04-21) and the Wake–Sleep algorithm.
              </p>
              <p>
                <span className="text-foreground">Tide</span> makes it embodied.
                Your <span className="text-foreground">engagement</span> drives α: a
                slew-limited follower pulled toward wake while you move, drifting
                toward sleep when you go still. Attention holds you awake; letting go
                lets the dream take over.
              </p>
              <p>
                And you <span className="text-foreground">incubate</span> it: drag to
                paint a glowing seed. Planting captures its location and the live
                spectral signature into a tagged, higher-weight slot of a 256-slot
                memory ring. As α rises, the autonomous replay preferentially
                reactivates your seed — the field blooms from its locus and its
                signature recurs, recombined with the ambient memory — the{" "}
                <span className="text-primary">Targeted Dream Incubation</span>{" "}
                mechanic (Frontiers in Sleep, 2026-06-24; MIT Media Lab{" "}
                <span className="text-primary">Dormio</span>).
              </p>
              <p className="text-foreground">
                Safety: no strobe, no flicker. All luminance change is slow drift —
                the global breath runs through the shared SafeFlicker engine (≤3 Hz
                clamp, honors reduced-motion); phosphenes fade gently and the trail
                dissolves rather than clears.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
