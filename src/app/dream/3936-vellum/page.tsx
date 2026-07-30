"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 3936 · Vellum
//
//   ONE QUESTION
//   What if a recording surface could GROW like living tissue — and the geometry
//   of its growth WERE the music?
//
//   A single luminous closed curve on a Canvas2D field grows by DIFFERENTIAL
//   GROWTH (the "differential line" of Anders Hoff / inconvergent; recent
//   generative-art revival). Every node is pulled toward its two curve-neighbors
//   (keeps the filament smooth), pushed away from ALL nearby nodes (short-range
//   repulsion via a spatial hash), and whenever the membrane is FED a new node is
//   INSERTED — so the curve lengthens, buckles, and folds into brain-coral /
//   cortical-fold morphology that never self-intersects and never erases.
//
//   INPUT = the microphone. The visitor's voice/breath is the nutrient field:
//   louder → more insertions per frame; vocal pitch (spectral centroid) biases
//   WHERE growth concentrates by mapping to an angular sector of the curve, so
//   high notes grow the top and low notes the bottom. Silence → growth nearly
//   halts and the membrane rests, breathing subtly. No mic? A built-in synthetic
//   nutrient LFO drives it so the piece is alive and audible on load.
//
//   OUTPUT = the curve's own geometry, continuously. Each growth EVENT rings a
//   soft continuous-pitch grain: pitch from that node's local CURVATURE (tighter
//   fold → higher partial), pan from its x-position. Under it a slow drone pad
//   whose brightness tracks the curve's total LENGTH — as the membrane grows, the
//   drone opens up. Continuous log-frequency pitch, never quantized. No drums.
//
//   REF  Anders Hoff / inconvergent — "differential line" / differential growth
//   (see inconvergent.net; a technique enjoying a recent generative-art revival).
//   See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Tunables ──────────────────────────────────────────────────────────────────
const MAX_NODES = 1200;
const INIT_NODES = 64;
const INIT_RADIUS = 42; // px seed ring
const MAX_SEG = 11; // px — passive split threshold (keeps resolution even)
const REPULSION_RADIUS = 17; // px — short-range repulsion reach
const ATTRACTION = 0.2; // pull toward neighbour midpoint
const REPULSION = 1.05; // push from nearby nodes
const MAX_STEP = 5; // clamp per-node movement / frame (stability)
const BASELINE_GROWTH = 0.03; // insertions/frame while silent (breathing)
const GROWTH_GAIN = 6.5; // extra insertions/frame at full input
const MAX_INSERT_PER_FRAME = 8; // perf ceiling
const SECTOR_KAPPA = 2.2; // how tightly growth concentrates in the pitch sector
const GRAIN_MIN_INTERVAL = 0.05; // s between audible grains

// Violet art ramp (inlined from _shared/palette.ts so this folder is standalone)
const RAMP: [number, number, number][] = [
  [0x15, 0x0c, 0x26], // deep violet
  [0x3a, 0x1d, 0x78],
  [0x63, 0x66, 0xf1], // indigo
  [0x8b, 0x5c, 0xf6], // brand violet
  [0xb0, 0x43, 0xe0], // magenta
  [0xc4, 0xb5, 0xfd], // light
];

function rampRGB(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(0.9999, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[i + 1] ?? RAMP[i];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

// Deterministic PRNG (mulberry32) — no Math.random for the seeded synthetic path
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Nutrient = { amp: number; pitch01: number };

export default function VellumPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [micState, setMicState] = useState<"idle" | "live" | "synthetic">(
    "synthetic"
  );
  const [micError, setMicError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [nodeCount, setNodeCount] = useState(INIT_NODES);

  // ── Simulation state (refs, not React state, for 60fps) ─────────────────────
  const xsRef = useRef<Float64Array>(new Float64Array(MAX_NODES));
  const ysRef = useRef<Float64Array>(new Float64Array(MAX_NODES));
  const countRef = useRef(0);
  const growthAccRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const seededRef = useRef(false);
  const totalLenRef = useRef(0);
  const rngRef = useRef<() => number>(makeRng(0x5eed));

  // ── Audio state ─────────────────────────────────────────────────────────────
  const audioRef = useRef<{
    ctx: AudioContext;
    master: GainNode;
    grainBus: GainNode;
    droneFilter: BiquadFilterNode;
    droneGain: GainNode;
    lastGrain: number;
  } | null>(null);

  // ── Mic analyser state ──────────────────────────────────────────────────────
  const micRef = useRef<{
    stream: MediaStream;
    analyser: AnalyserNode;
    freq: Uint8Array;
    time: Uint8Array;
  } | null>(null);

  // Seed the membrane as a small ring.
  const seedCurve = useCallback(() => {
    const xs = xsRef.current;
    const ys = ysRef.current;
    const cx = 0;
    const cy = 0; // filled in on first frame relative to canvas centre
    for (let i = 0; i < INIT_NODES; i++) {
      const a = (i / INIT_NODES) * Math.PI * 2;
      xs[i] = cx + Math.cos(a) * INIT_RADIUS;
      ys[i] = cy + Math.sin(a) * INIT_RADIUS;
    }
    countRef.current = INIT_NODES;
    seededRef.current = false;
  }, []);

  // ── Audio helpers ───────────────────────────────────────────────────────────
  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // Grain bus (the geometry voices)
    const grainBus = ctx.createGain();
    grainBus.gain.value = 0.85;
    grainBus.connect(master);

    // Slow evolving drone pad — brightness tracks total curve length.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 260;
    droneFilter.Q.value = 0.7;
    droneFilter.connect(droneGain);
    droneGain.connect(master);

    const base = 55; // A1 fundamental
    const partials = [1, 1.5, 2, 3.001];
    partials.forEach((p, idx) => {
      const o = ctx.createOscillator();
      o.type = idx % 2 === 0 ? "sawtooth" : "triangle";
      o.frequency.value = base * p;
      o.detune.value = (idx - 1.5) * 4;
      const og = ctx.createGain();
      og.gain.value = idx === 0 ? 0.5 : 0.22 / idx;
      o.connect(og);
      og.connect(droneFilter);
      // slow detune drift for movement
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + idx * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 3 + idx;
      lfo.connect(lfoGain);
      lfoGain.connect(o.detune);
      o.start();
      lfo.start();
    });
    // fade drone in gently
    droneGain.gain.setTargetAtTime(0.16, ctx.currentTime, 3);

    audioRef.current = { ctx, master, grainBus, droneFilter, droneGain, lastGrain: 0 };
    return audioRef.current;
  }, []);

  const fireGrain = useCallback((freq: number, pan: number, amp: number) => {
    const a = audioRef.current;
    if (!a) return;
    const { ctx } = a;
    const now = ctx.currentTime;
    if (now - a.lastGrain < GRAIN_MIN_INTERVAL) return;
    a.lastGrain = now;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = Math.min(freq * 5 + 400, 8000);
    filt.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    osc.connect(filt);
    filt.connect(g);
    g.connect(panner);
    panner.connect(a.grainBus);

    const atk = 0.015;
    const dec = 0.55 + rngRef.current() * 0.7;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, now + atk + dec);
    osc.start(now);
    osc.stop(now + atk + dec + 0.05);
    osc.onended = () => {
      osc.disconnect();
      filt.disconnect();
      g.disconnect();
      panner.disconnect();
    };
  }, []);

  // ── Read the nutrient field (mic or synthetic) ──────────────────────────────
  const readNutrient = useCallback((tSec: number): Nutrient => {
    const m = micRef.current;
    if (m) {
      const { analyser, freq, time } = m;
      analyser.getByteTimeDomainData(time as Uint8Array<ArrayBuffer>);
      analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
      // RMS amplitude
      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = (time[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);
      const amp = Math.max(0, Math.min(1, (rms - 0.012) * 9));
      // Spectral centroid → pitch
      let wsum = 0;
      let msum = 0;
      const sr = m.analyser.context.sampleRate;
      const binHz = sr / (analyser.fftSize);
      for (let i = 1; i < freq.length; i++) {
        const mag = freq[i] / 255;
        wsum += i * binHz * mag;
        msum += mag;
      }
      const centroid = msum > 0.0001 ? wsum / msum : 300;
      // log map 120..2400 Hz → 0..1
      const pitch01 = Math.max(
        0,
        Math.min(1, (Math.log2(centroid) - Math.log2(120)) / (Math.log2(2400) - Math.log2(120)))
      );
      return { amp, pitch01 };
    }
    // Synthetic nutrient: slow breathing LFO + seeded wander so the membrane
    // sculpts itself and stays audible on load with no mic.
    const rng = rngRef.current;
    const breath = 0.5 + 0.5 * Math.sin(tSec * 0.55);
    const gust = Math.pow(0.5 + 0.5 * Math.sin(tSec * 0.19 + 1.3), 3);
    const amp = 0.14 + 0.55 * breath * gust + rng() * 0.03;
    // pitch sweeps slowly through sectors
    const pitch01 = 0.5 + 0.42 * Math.sin(tSec * 0.083);
    return { amp: Math.min(1, amp), pitch01 };
  }, []);

  // ── Insert one node, biased to the pitch sector; ring its curvature grain ───
  const insertNode = useCallback(
    (targetAngle: number, canvasW: number, cx: number, cy: number) => {
      const xs = xsRef.current;
      const ys = ysRef.current;
      const n = countRef.current;
      if (n >= MAX_NODES) return;
      const rng = rngRef.current;

      // Choose an insertion segment among K candidates, weighted by length ×
      // sector affinity (von-Mises-like around the pitch target angle).
      let best = -1;
      let bestW = -1;
      const K = 10;
      for (let k = 0; k < K; k++) {
        const i = Math.floor(rng() * n);
        const j = (i + 1) % n;
        const mx = (xs[i] + xs[j]) * 0.5;
        const my = (ys[i] + ys[j]) * 0.5;
        const dx = xs[j] - xs[i];
        const dy = ys[j] - ys[i];
        const segLen = Math.hypot(dx, dy);
        const ang = Math.atan2(my - cy, mx - cx);
        const affinity = Math.exp(SECTOR_KAPPA * Math.cos(ang - targetAngle));
        const w = (segLen + 1.5) * affinity * (0.6 + rng() * 0.4);
        if (w > bestW) {
          bestW = w;
          best = i;
        }
      }
      if (best < 0) return;
      const i = best;
      const j = (i + 1) % n;

      // Midpoint + tiny perpendicular seed so the fold has something to buckle.
      const mx = (xs[i] + xs[j]) * 0.5;
      const my = (ys[i] + ys[j]) * 0.5;
      const dx = xs[j] - xs[i];
      const dy = ys[j] - ys[i];
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const jit = (rng() - 0.5) * 1.4;

      // Shift tail right by one to open a slot after i.
      for (let t = n; t > j; t--) {
        xs[t] = xs[t - 1];
        ys[t] = ys[t - 1];
      }
      const slot = i + 1;
      xs[slot] = mx + px * jit;
      ys[slot] = my + py * jit;
      countRef.current = n + 1;

      // Curvature at the new node → continuous pitch. Pan from x-position.
      const pa = i;
      const nb = (slot + 1) % (n + 1);
      const ax = xs[slot] - xs[pa];
      const ay = ys[slot] - ys[pa];
      const bx = xs[nb] - xs[slot];
      const by = ys[nb] - ys[slot];
      const cross = ax * by - ay * bx;
      const dot = ax * bx + ay * by;
      const turn = Math.abs(Math.atan2(cross, dot)); // 0..pi, tighter = larger
      const curv01 = Math.min(1, turn / Math.PI);
      // log-frequency: ~131 Hz (C3) up ~3.2 octaves. Continuous, unquantized.
      const freq = 130.8 * Math.pow(2, 3.2 * curv01 + 0.15);
      const pan = (xs[slot] / (canvasW * 0.5)) * 0.9;
      const amp = 0.05 + 0.06 * (1 - curv01);
      fireGrain(freq, pan, amp);
    },
    [fireGrain]
  );

  // ── The frame loop ──────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setUnsupported(true);
      return;
    }

    const t0 = performance.now();
    let lastFrame = t0;

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || 800;
      const cssH = canvas.clientHeight || 600;
      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      const xs = xsRef.current;
      const ys = ysRef.current;

      // On first frame, recentre the seed ring to canvas centre.
      if (!seededRef.current) {
        for (let i = 0; i < countRef.current; i++) {
          xs[i] += cx;
          ys[i] += cy;
        }
        seededRef.current = true;
      }

      const tSec = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const nut = readNutrient(tSec);
      // Pitch sector target angle: high pitch → top (−90°), low → bottom (+90°).
      const targetAngle = Math.PI / 2 - nut.pitch01 * Math.PI;

      // ── GROWTH: accumulate nutrient, insert nodes ─────────────────────────
      growthAccRef.current +=
        (BASELINE_GROWTH + nut.amp * GROWTH_GAIN) * (dt * 60);
      let inserts = 0;
      while (
        growthAccRef.current >= 1 &&
        inserts < MAX_INSERT_PER_FRAME &&
        countRef.current < MAX_NODES
      ) {
        insertNode(targetAngle, W, cx, cy);
        growthAccRef.current -= 1;
        inserts++;
      }
      if (countRef.current >= MAX_NODES) growthAccRef.current = 0;

      const n = countRef.current;

      // ── FORCES: attraction to neighbours + short-range repulsion ──────────
      const cell = REPULSION_RADIUS;
      const grid = new Map<number, number[]>();
      const gw = Math.ceil(W / cell) + 1;
      for (let i = 0; i < n; i++) {
        const gx = Math.floor(xs[i] / cell);
        const gy = Math.floor(ys[i] / cell);
        const key = gx + gy * gw * 4 + 100000;
        let arr = grid.get(key);
        if (!arr) {
          arr = [];
          grid.set(key, arr);
        }
        arr.push(i);
      }

      const dxA = new Float64Array(n);
      const dyA = new Float64Array(n);
      const r2 = REPULSION_RADIUS * REPULSION_RADIUS;
      for (let i = 0; i < n; i++) {
        const xi = xs[i];
        const yi = ys[i];
        const gx = Math.floor(xi / cell);
        const gy = Math.floor(yi / cell);
        let rx = 0;
        let ry = 0;
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const key = gx + ox + (gy + oy) * gw * 4 + 100000;
            const arr = grid.get(key);
            if (!arr) continue;
            for (let a = 0; a < arr.length; a++) {
              const j = arr[a];
              if (j === i) continue;
              const ddx = xi - xs[j];
              const ddy = yi - ys[j];
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 > r2 || d2 < 1e-6) continue;
              const d = Math.sqrt(d2);
              const f = (REPULSION_RADIUS - d) / REPULSION_RADIUS;
              rx += (ddx / d) * f;
              ry += (ddy / d) * f;
            }
          }
        }
        // attraction toward neighbour midpoint
        const prev = (i - 1 + n) % n;
        const next = (i + 1) % n;
        const mx = (xs[prev] + xs[next]) * 0.5;
        const my = (ys[prev] + ys[next]) * 0.5;
        let sx = (mx - xi) * ATTRACTION + rx * REPULSION;
        let sy = (my - yi) * ATTRACTION + ry * REPULSION;
        // soft containment so the membrane stays on-screen
        const distC = Math.hypot(xi - cx, yi - cy);
        const softR = Math.min(W, H) * 0.46;
        if (distC > softR) {
          const pull = (distC - softR) * 0.02;
          sx -= ((xi - cx) / distC) * pull;
          sy -= ((yi - cy) / distC) * pull;
        }
        // clamp step
        const sm = Math.hypot(sx, sy);
        if (sm > MAX_STEP) {
          sx = (sx / sm) * MAX_STEP;
          sy = (sy / sm) * MAX_STEP;
        }
        dxA[i] = sx;
        dyA[i] = sy;
      }
      // subtle breathing when at rest
      const breathe = 1 + 0.0022 * Math.sin(tSec * 0.7);
      for (let i = 0; i < n; i++) {
        let nx = xs[i] + dxA[i];
        let ny = ys[i] + dyA[i];
        nx = cx + (nx - cx) * breathe;
        ny = cy + (ny - cy) * breathe;
        xs[i] = nx;
        ys[i] = ny;
      }

      // ── passive split to keep node spacing even (no grain) ────────────────
      if (n < MAX_NODES) {
        let totalLen = 0;
        // find one over-long segment per frame to split gently
        let worst = -1;
        let worstLen = MAX_SEG * 1.7;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const l = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
          totalLen += l;
          if (l > worstLen) {
            worstLen = l;
            worst = i;
          }
        }
        if (worst >= 0) {
          const i = worst;
          const j = (i + 1) % n;
          const mx = (xs[i] + xs[j]) * 0.5;
          const my = (ys[i] + ys[j]) * 0.5;
          for (let t = n; t > j; t--) {
            xs[t] = xs[t - 1];
            ys[t] = ys[t - 1];
          }
          xs[i + 1] = mx;
          ys[i + 1] = my;
          countRef.current = n + 1;
        }
        totalLenRef.current = totalLen;
      }

      // ── DRONE brightness tracks total length ──────────────────────────────
      const a = audioRef.current;
      if (a) {
        const lengthNorm = Math.min(1, totalLenRef.current / 9000);
        const cutoff = 240 * Math.pow(2, lengthNorm * 4.6); // 240 → ~6k Hz
        a.droneFilter.frequency.setTargetAtTime(cutoff, a.ctx.currentTime, 0.4);
      }

      // ── RENDER: additive violet glow + faint interior tissue ──────────────
      const nn = countRef.current;
      // gentle persistence for organic afterglow
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(6,3,14,0.16)";
      ctx.fillRect(0, 0, W, H);

      if (nn > 2) {
        ctx.globalCompositeOperation = "lighter";
        const scale = dpr;

        // faint interior fill (tissue reads through the folds)
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < nn; i++) ctx.lineTo(xs[i], ys[i]);
        ctx.closePath();
        ctx.fillStyle = "rgba(90,46,201,0.035)";
        ctx.fill();

        // soft wide underglow
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < nn; i++) ctx.lineTo(xs[i], ys[i]);
        ctx.closePath();
        ctx.lineJoin = "round";
        ctx.lineWidth = 7 * scale;
        ctx.strokeStyle = "rgba(99,102,241,0.10)";
        ctx.stroke();

        // bright filament, colour by local curvature (fold tightness)
        ctx.lineWidth = 1.6 * scale;
        for (let i = 0; i < nn; i++) {
          const j = (i + 1) % nn;
          const prev = (i - 1 + nn) % nn;
          const ax = xs[i] - xs[prev];
          const ay = ys[i] - ys[prev];
          const bx = xs[j] - xs[i];
          const by = ys[j] - ys[i];
          const cr = ax * by - ay * bx;
          const dt2 = ax * bx + ay * by;
          const turn = Math.abs(Math.atan2(cr, dt2)) / Math.PI;
          const [r, g, b] = rampRGB(0.25 + turn * 1.4);
          ctx.beginPath();
          ctx.moveTo(xs[i], ys[i]);
          ctx.lineTo(xs[j], ys[j]);
          ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},0.9)`;
          ctx.stroke();
        }
      }

      // occasional cheap React sync for the node counter
      if ((now | 0) % 8 === 0) setNodeCount(countRef.current);
    };

    rafRef.current = requestAnimationFrame(frame);
  }, [insertNode, readNutrient]);

  // ── Start: create audio, try mic, kick the loop ─────────────────────────────
  const handleStart = useCallback(async () => {
    if (typeof window === "undefined") return;
    const audio = ensureAudio();
    if (audio && audio.ctx.state === "suspended") {
      try {
        await audio.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    setRunning(true);

    // try mic
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no getUserMedia");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const a = ensureAudio();
      if (!a) throw new Error("no audio context");
      const src = a.ctx.createMediaStreamSource(stream);
      const analyser = a.ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      src.connect(analyser); // NOT to destination — no feedback
      micRef.current = {
        stream,
        analyser,
        freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        time: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      };
      setMicState("live");
      setMicError(null);
    } catch (e) {
      setMicState("synthetic");
      setMicError(
        e instanceof Error && /denied|Permission/i.test(e.message)
          ? "Microphone denied — the membrane is feeding on a synthetic nutrient field instead."
          : "Microphone unavailable — the membrane is feeding on a synthetic nutrient field instead."
      );
    }
  }, [ensureAudio]);

  // ── Mount: seed + run visuals immediately (alive on load) ───────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("requestAnimationFrame" in window)) {
      setUnsupported(true);
      return;
    }
    seedCurve();
    startLoop();
    // Resume audio on first user gesture (autoplay policy) even if they never
    // press Start, so headless/idle visitors still eventually hear it.
    const resume = () => {
      const a = ensureAudio();
      if (a && a.ctx.state === "suspended") void a.ctx.resume();
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      micRef.current?.stream.getTracks().forEach((t) => t.stop());
      micRef.current = null;
      const a = audioRef.current;
      if (a) {
        try {
          a.master.disconnect();
          void a.ctx.close();
        } catch {
          /* ignore */
        }
        audioRef.current = null;
      }
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: "block" }}
      />

      {/* Hero / chrome overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
        <header className="pointer-events-auto max-w-xl">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · Dream Lab · 3936
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Vellum
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Your voice grows a living membrane that sings its own folds. A single
            luminous curve grows by differential growth — fed by your breath,
            sculpted by your pitch, and its geometry is the score.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {running ? "Listening…" : "Start / allow mic"}
            </button>
            <span className="rounded-md bg-primary/20 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {micState === "live"
                ? "mic live"
                : micState === "synthetic"
                  ? "synthetic nutrient"
                  : "idle"}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {nodeCount} / {MAX_NODES} nodes
            </span>
          </div>

          {micError && (
            <p className="mt-3 max-w-md text-sm text-destructive">{micError}</p>
          )}
          {unsupported && (
            <p className="mt-3 max-w-md text-sm text-destructive">
              This browser can’t provide Canvas2D / animation — the membrane
              can’t grow here.
            </p>
          )}

          <details className="mt-4 max-w-md">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
              Design notes
            </summary>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              <p>
                A closed curve grows by the differential-growth / “differential
                line” algorithm (Anders Hoff / inconvergent — enjoying a recent
                generative-art revival): each node is pulled toward its
                neighbours, pushed from all nearby nodes, and new nodes are
                inserted where the membrane is fed — so it buckles into
                cortical folds that never self-intersect.
              </p>
              <p>
                Loudness → growth rate. Pitch (spectral centroid) → the angular
                sector that grows, so high notes bloom the top, low notes the
                bottom. Each insertion rings a continuous-pitch grain (tighter
                fold → higher partial, x-position → pan); a drone pad opens its
                filter as the total curve length grows. Silence lets it rest and
                breathe.
              </p>
            </div>
          </details>
        </header>

        <footer className="pointer-events-auto flex items-center justify-between">
          <Link
            href="/dream"
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground flex items-center"
          >
            ← Dream lab
          </Link>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            differential growth · organic entoptic bloom
          </div>
        </footer>
      </div>
    </main>
  );
}
