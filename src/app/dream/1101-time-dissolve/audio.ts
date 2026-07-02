// ─────────────────────────────────────────────────────────────────────────────
// 1101-time-dissolve / audio.ts
//
// The carrier sound for a temporal-dissolution piece. It composes the shared
// psych kit into a slow ~4-minute stateful arc:
//
//   Shepard–Risset endless DESCENT  ┐
//   just-intoned drone bed          ├─► layers bus ─► closing/opening low-pass
//   internal granular time-smear    ┘        │
//                                            ▼
//                                   swelling convolution VOID reverb
//                                            │
//                                   master gain ─► limiter ─► ctx.destination
//
// A single global `timeScale` (time-dilation) stretches the Shepard glide rate
// and the granular playhead together. As depth rises the grains lengthen and
// overlap more, the reverb wet climbs until onset and echo merge, the low-pass
// closes, and the descent removes any pitch floor. Near minute ~3.3 a brief
// "clarity snap" opens the filter, drops the wet, shortens the grains and snaps
// timeScale back to 1 (the gamma-surge hyper-lucidity), then it softly returns.
//
// Everything is generative — no external files, no network.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

/** A read-only snapshot of the arc, for the visual layer. */
export interface DissolveState {
  /** Audio envelope 0..1 (drives the visual when re-bound). */
  env: number;
  /** Dissolution depth 0..1. */
  depth: number;
  /** Clarity-snap intensity 0..1 (peaks once, near the end of the arc). */
  clarity: number;
  /** Position through the ~4-minute arc, 0..1. */
  progress: number;
  /** Global time-dilation factor (1 = normal, lower = time stretched). */
  timeScale: number;
}

export interface DissolveAudio {
  /** Advance the arc + DSP. Call once per animation frame with real dt seconds. */
  step(dt: number): void;
  /** Deepen the dissolution for a while (tap-to-deepen). */
  deepen(): void;
  /** Latest arc snapshot for the renderer. */
  getState(): DissolveState;
  /** Fade out and release every node. */
  stop(): void;
}

const TOTAL = 240; // seconds — the full arc length (~4 min)

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// A soft, slowly-beating harmonic source the grains are resampled from. Built
// once, deterministically, so the smear texture is stable across runs.
function buildGrainSource(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  // E2 / A2 / E3 / B3 — a spacious open-fifths cluster under the drone root.
  const partials = [82.41, 110.0, 164.81, 246.94];
  const amps = [0.5, 0.42, 0.3, 0.16];
  let seed = 0x51ed270b;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  let noise = 0;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      // Very slow per-partial amplitude drift for a living, non-looping bed.
      const drift = 0.7 + 0.3 * Math.sin(2 * Math.PI * (0.03 + p * 0.017) * t);
      s += amps[p] * drift * Math.sin(2 * Math.PI * partials[p] * t);
    }
    // A whisper of low-passed noise for grain "air".
    noise += ((rnd() * 2 - 1) - noise) * 0.05;
    s = s * 0.4 + noise * 0.06;
    data[i] = s;
  }
  return buf;
}

// A shared Hann window (peak 1). setValueCurveAtTime rescales it over any grain
// length, so one array windows every grain click-free.
function makeHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return w;
}

export function startAudio(ctx: AudioContext): DissolveAudio {
  // ── Master chain: gain → soft limiter → speakers ──────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 22;
  limiter.ratio.value = 9;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.28;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 3.5);
  master.connect(limiter);

  // ── Swelling void reverb (long tail; onset & echo merge as wet rises) ──────
  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 7.5,
    decay: 2.2,
    wet: 0.24,
  });
  verb.output.connect(master);

  // ── Global low-pass that closes with depth and re-opens at the snap ───────
  const globalLP = ctx.createBiquadFilter();
  globalLP.type = "lowpass";
  globalLP.frequency.value = 2200;
  globalLP.Q.value = 0.6;
  globalLP.connect(verb.input);

  // ── The layers bus feeds the filter → reverb ─────────────────────────────
  const layers = ctx.createGain();
  layers.gain.value = 0.9;
  layers.connect(globalLP);

  // Shepard endless DESCENT (dir: -1) — removes any felt pitch floor.
  const shepard: ShepardEngine = startShepard(ctx, layers, {
    dir: -1,
    partials: 9,
    centerOct: 3.4,
    sigmaOct: 1.5,
    peakGain: 0.3,
  });

  // Just-intoned drone bed.
  const drone: DroneBank = startDroneBank(ctx, layers, {
    root: 55,
    ratios: [1, 3 / 2, 2, 5 / 2],
    cutoffLow: 170,
    cutoffHigh: 1500,
    peakGain: 0.24,
  });

  // ── Granular time-smear layer ─────────────────────────────────────────────
  const grainBus = ctx.createGain();
  grainBus.gain.value = 0.0;
  grainBus.gain.setTargetAtTime(0.11, ctx.currentTime, 3.0);
  grainBus.connect(layers);

  const grainBuf = buildGrainSource(ctx, 4.0);
  const bufDur = grainBuf.duration;
  const hann = makeHann(64);

  // Mutable grain parameters, updated each frame by step().
  const P = {
    grainLen: 0.11,
    overlap: 0.5,
    stretch: 0.45,
    timeScale: 1,
    rate: 1,
  };

  let playhead = 0.02;
  let nextGrain = ctx.currentTime + 0.12;
  let grainSeed = 0x2f6a1c9d;
  const grnd = () => {
    grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
    return grainSeed / 0xffffffff;
  };

  let stopped = false;

  const scheduleGrain = (when: number) => {
    const L = P.grainLen;
    const src = ctx.createBufferSource();
    src.buffer = grainBuf;
    src.playbackRate.value = P.rate * (1 + (grnd() - 0.5) * 0.012);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(grainBus);
    try {
      g.gain.setValueCurveAtTime(hann, when, L);
    } catch {
      g.gain.setValueAtTime(0, when);
    }
    const off = Math.min(bufDur - L - 0.02, Math.max(0, playhead));
    src.start(when, off, L + 0.03);
    src.stop(when + L + 0.05);
    src.onended = () => {
      try {
        g.disconnect();
        src.disconnect();
      } catch {
        /* already gone */
      }
    };
  };

  // Lookahead grain scheduler (real-time interval, immune to frame stalls).
  const scheduler = window.setInterval(() => {
    if (stopped || ctx.state !== "running") return;
    const ahead = ctx.currentTime + 0.18;
    let guard = 0;
    while (nextGrain < ahead && guard < 48) {
      scheduleGrain(nextGrain);
      const hop = Math.max(0.02, P.grainLen * (1 - P.overlap));
      nextGrain += hop;
      // Playhead crawls forward → heavy time-stretch smear. timeScale dilates it.
      playhead += hop * P.stretch * P.timeScale;
      if (playhead > bufDur - P.grainLen - 0.05 || playhead < 0.01) {
        playhead = 0.02;
      }
      guard++;
    }
    if (nextGrain < ctx.currentTime) nextGrain = ctx.currentTime + 0.05;
  }, 45);

  // ── Arc state ─────────────────────────────────────────────────────────────
  let arcT = 0;
  let boost = 0; // tap-to-deepen, decays over time
  const state: DissolveState = {
    env: 0.2,
    depth: 0.15,
    clarity: 0,
    progress: 0,
    timeScale: 1,
  };

  const step = (dt: number) => {
    if (stopped) return;
    const cdt = Math.min(0.1, Math.max(0, dt));
    arcT += cdt;
    boost *= Math.exp(-cdt / 14); // ~14s tap memory

    // Base dissolution arc: rise → plateau → clarity dip → soft return.
    const rise = smoothstep(0, 150, arcT);
    const fall = smoothstep(210, 246, arcT);
    let base = 0.15 + 0.78 * rise - 0.5 * fall;
    base += 0.045 * Math.sin(arcT * 0.15); // gentle breathing so it's never static
    const clarity = Math.exp(-Math.pow((arcT - 196) / 10, 2));
    let depth = base * (1 - 0.5 * clarity) + boost;
    depth = clamp01(depth);

    const progress = clamp01(arcT / TOTAL);

    // Global time-dilation: time stretches as we sink, snaps back at clarity.
    const timeScale = clamp01(1 - 0.55 * depth * (1 - clarity));
    const ts = Math.max(0.35, timeScale);

    // Envelope for the visual (what the ears "should" see).
    const env = clamp01(
      0.18 + 0.62 * depth * (0.85 + 0.15 * Math.sin(arcT * 0.4)) + 0.25 * clarity,
    );

    // ── Drive the engines ────────────────────────────────────────────────
    shepard.setDrive(clamp01(0.15 + 0.6 * depth));
    shepard.step(cdt * ts); // dilated dt → the endless fall slows as time stretches
    drone.setDrive(clamp01(0.2 + 0.55 * depth));

    const wet = clamp01(0.22 + 0.52 * depth - 0.5 * clarity);
    verb.setWet(Math.max(0.1, wet));

    // Low-pass closes with depth, then blooms open at the clarity snap.
    const closed = lerp(2200, 460, depth);
    const cutoff = lerp(closed, 8500, clarity);
    globalLP.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.25);
    globalLP.Q.setTargetAtTime(0.6 + 1.6 * depth * (1 - clarity), ctx.currentTime, 0.3);

    // Grains: longer & more overlapped when deep; short & sparse at clarity.
    P.grainLen = (0.09 + 0.55 * depth) * (1 - 0.6 * clarity);
    P.overlap = clamp01(0.42 + 0.42 * depth - 0.5 * clarity);
    P.stretch = lerp(0.55, 0.16, depth) + 0.35 * clarity;
    P.rate = 1 - 0.09 * depth * (1 - clarity);
    P.timeScale = ts;

    state.env = env;
    state.depth = depth;
    state.clarity = clarity;
    state.progress = progress;
    state.timeScale = ts;
  };

  return {
    step,
    deepen() {
      boost = Math.min(0.4, boost + 0.22);
    },
    getState() {
      return state;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(scheduler);
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      } catch {
        /* ctx closing */
      }
      shepard.stop();
      drone.stop();
      try {
        grainBus.gain.setTargetAtTime(0.0001, now, 0.4);
      } catch {
        /* ignore */
      }
    },
  };
}
