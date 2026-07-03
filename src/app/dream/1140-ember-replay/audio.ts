// ─────────────────────────────────────────────────────────────────────────────
// Ember Replay — audio engine
//
// A drug-free embodiment of a 2026 eLife computational model of classical
// psychedelics: perception shifts from bottom-up sensory inference toward a
// TOP-DOWN generative REPLAY of a learned world, so a hallucination looks less
// like noise and more like recombined wake-time memory.
//
// Here the "learned world" is Karel's REAL recorded piano. Two phases:
//   1. LEARN   — decode a recording, then analyse it into a small vocabulary of
//                note-events / grains: onset time + a captured slice of the
//                ACTUAL audio + rough pitch/brightness/energy for each.
//   2. REPLAY  — a slow generative process replays those captured real grains in
//                RECOMBINED order (a similarity-weighted walk with drift), gently
//                overlapping, so you hear the real piano dissolving and
//                re-blooming as memory. Never a hard loop. A warm just-intonation
//                drone bed sits underneath.
//
// This is NOT synthesis of new notes (cf. 1135-deep-memory) and NOT time-stretch
// scrubbing (cf. 1130-spectral-scrub) — it is replay of the actual captured
// grains of the real recording, recombined.
//
// Three source tiers (self-contained, priority order):
//   1. A Path recording id  → GET /api/audio/:id → {url} → decode.
//   2. A user's own file    → decodeAudioData.
//   3. A built-in offline-rendered warm-piano demo (never blank / silent).
//
// Determinism: all choices come from a seeded mulberry32 PRNG + ctx.currentTime.
// No Math.random / Date.now anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

// ── seeded PRNG (mulberry32) ─────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPLAY_SEED = 0x1a2b3c4d;

// ── learned vocabulary ───────────────────────────────────────────────────────
export interface Grain {
  /** seconds into the source buffer where this captured grain begins */
  offset: number;
  /** captured grain length in seconds */
  dur: number;
  /** rough fundamental in Hz (0 = unvoiced / unknown) */
  pitch: number;
  /** normalized spectral brightness 0..1 (zero-crossing proxy) */
  brightness: number;
  /** normalized loudness 0..1 */
  energy: number;
  /** normalized log-pitch 0..1 across the vocabulary (register axis) */
  reg: number;
}

/** A single replayed grain, handed to the visual layer as it is scheduled. */
export interface ReplayEvent {
  grainIndex: number;
  pitch: number;
  brightness: number;
  energy: number;
  /** playback-rate applied (drift) — 1 = as recorded */
  rate: number;
  /** audible gain of this bloom 0..1 */
  gain: number;
}

// ── analysis: learn the world from the real audio ────────────────────────────

/** Onset-based grain capture. Energy-novelty peak picking with an adaptive
 *  threshold; each onset captures a short slice of the ACTUAL audio and gets a
 *  rough pitch (autocorrelation), brightness (zero-crossing rate) and energy. */
export function analyzeGrains(buffer: AudioBuffer): Grain[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const frame = 1024;
  const hop = 512;
  const nFrames = Math.max(0, Math.floor((data.length - frame) / hop));

  const rms = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    let s = 0;
    const start = i * hop;
    for (let j = 0; j < frame; j++) {
      const v = data[start + j];
      s += v * v;
    }
    rms[i] = Math.sqrt(s / frame);
  }

  // Positive novelty (rise in energy).
  const novelty = new Float32Array(nFrames);
  for (let i = 1; i < nFrames; i++) {
    const d = rms[i] - rms[i - 1];
    novelty[i] = d > 0 ? d : 0;
  }

  // Adaptive threshold: local moving average scaled up.
  const win = 12;
  const minGapFrames = Math.max(1, Math.floor((0.11 * sr) / hop));
  const onsets: number[] = [];
  let lastOnset = -minGapFrames;
  for (let i = 1; i < nFrames - 1; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = i - win; k <= i + win; k++) {
      if (k >= 0 && k < nFrames) {
        sum += novelty[k];
        cnt++;
      }
    }
    const avg = cnt > 0 ? sum / cnt : 0;
    const thresh = avg * 1.8 + 1e-4;
    if (
      novelty[i] > thresh &&
      novelty[i] >= novelty[i - 1] &&
      novelty[i] >= novelty[i + 1] &&
      i - lastOnset >= minGapFrames
    ) {
      onsets.push(i * hop);
      lastOnset = i;
    }
  }

  // Fallback: too few onsets → regular slicing so the vocabulary is never empty.
  if (onsets.length < 6) {
    onsets.length = 0;
    const step = Math.floor(0.33 * sr);
    for (let p = 0; p + step < data.length; p += step) onsets.push(p);
  }

  // Cap the vocabulary so replay stays legible & light.
  const MAX = 56;
  if (onsets.length > MAX) {
    const trimmed: number[] = [];
    const stride = onsets.length / MAX;
    for (let i = 0; i < MAX; i++) trimmed.push(onsets[Math.floor(i * stride)]);
    onsets.length = 0;
    onsets.push(...trimmed);
  }

  const grains: Grain[] = [];
  for (let i = 0; i < onsets.length; i++) {
    const startSamp = onsets[i];
    const nextSamp = i + 1 < onsets.length ? onsets[i + 1] : data.length;
    const rawDur = (nextSamp - startSamp) / sr;
    const dur = Math.min(0.5, Math.max(0.18, rawDur));
    const lenSamp = Math.min(data.length - startSamp, Math.floor(dur * sr));

    grains.push({
      offset: startSamp / sr,
      dur,
      pitch: estimatePitch(data, startSamp, lenSamp, sr),
      brightness: zeroCrossRate(data, startSamp, lenSamp),
      energy: frameEnergy(data, startSamp, lenSamp),
      reg: 0, // filled below
    });
  }

  // Normalize energy and compute the register axis (log-pitch 0..1).
  let maxE = 1e-6;
  for (const g of grains) maxE = Math.max(maxE, g.energy);
  const pitched = grains.filter((g) => g.pitch > 0).map((g) => Math.log2(g.pitch));
  const loP = pitched.length ? Math.min(...pitched) : 6;
  const hiP = pitched.length ? Math.max(...pitched) : 9;
  const span = Math.max(0.5, hiP - loP);
  for (const g of grains) {
    g.energy = Math.min(1, g.energy / maxE);
    g.reg = g.pitch > 0 ? Math.min(1, Math.max(0, (Math.log2(g.pitch) - loP) / span)) : 0.5;
  }

  return grains;
}

function frameEnergy(data: Float32Array, start: number, len: number): number {
  let s = 0;
  const n = Math.min(len, 4096);
  for (let i = 0; i < n; i++) {
    const v = data[start + i];
    s += v * v;
  }
  return Math.sqrt(s / Math.max(1, n));
}

/** Zero-crossing rate → cheap brightness proxy, normalized to ~0..1. */
function zeroCrossRate(data: Float32Array, start: number, len: number): number {
  const n = Math.min(len, 2048);
  let cross = 0;
  let prev = data[start];
  for (let i = 1; i < n; i++) {
    const v = data[start + i];
    if ((prev < 0 && v >= 0) || (prev >= 0 && v < 0)) cross++;
    prev = v;
  }
  const rate = cross / Math.max(1, n); // 0..~0.5
  return Math.min(1, rate / 0.25);
}

/** Autocorrelation fundamental estimate over the grain head (70–1000 Hz). */
function estimatePitch(
  data: Float32Array,
  start: number,
  len: number,
  sr: number,
): number {
  const n = Math.min(len, 2048);
  if (n < 256) return 0;
  // Remove DC.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += data[start + i];
  mean /= n;

  const minLag = Math.floor(sr / 1000);
  const maxLag = Math.min(n - 1, Math.floor(sr / 70));
  let bestLag = -1;
  let bestVal = 0;
  let energy0 = 0;
  for (let i = 0; i < n; i++) {
    const v = data[start + i] - mean;
    energy0 += v * v;
  }
  if (energy0 < 1e-6) return 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) {
      s += (data[start + i] - mean) * (data[start + i + lag] - mean);
    }
    if (s > bestVal) {
      bestVal = s;
      bestLag = lag;
    }
  }
  // Confidence gate: correlation must be a real periodicity, not noise.
  const conf = bestVal / energy0;
  if (bestLag <= 0 || conf < 0.3) return 0;
  return sr / bestLag;
}

// ── replay engine (the generative top-down process) ──────────────────────────

const LOOKAHEAD = 0.16; // schedule this far ahead (s)
const SCHED_MS = 30; // scheduler wakeup

export interface ReplayEngine {
  grainCount: number;
  setDensity(v: number): void; // 0..1 — replay rate
  setDrift(v: number): void; // 0..1 — mutation / detune of the walk
  setRegister(v: number): void; // 0..1 — low → high grain bias
  setBloom(v: number): void; // 0..1 — audible level of each bloom
  getLevel(): number; // 0..1 output level
  onGrain(cb: (e: ReplayEvent) => void): void;
  start(): void;
  stop(): void;
}

function hannGain(
  ctx: AudioContext,
  when: number,
  dur: number,
  peak: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + dur * 0.4);
  g.gain.setTargetAtTime(0.0001, when + dur * 0.55, dur * 0.5);
  return g;
}

export function makeReplayEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  grains: Grain[],
): ReplayEngine {
  // Graph: grains → grainBus → gentle lowpass → master → limiter → analyser → out
  const grainBus = ctx.createGain();
  grainBus.gain.value = 0.9;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 5200;
  filter.Q.value = 0.6;

  const master = ctx.createGain();
  master.gain.value = 0.85;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.28;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const bins = analyser.frequencyBinCount;
  const specBuf = new Uint8Array(bins);

  grainBus.connect(filter);
  filter.connect(master);
  master.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  // Warm just-intonation drone bed underneath (routed into the same limiter).
  let drone: DroneBank | null = null;

  // Median pitch → a warm root for the drone so the bed agrees with the piano.
  const voiced = grains.filter((g) => g.pitch > 0).map((g) => g.pitch);
  let root = 55;
  if (voiced.length) {
    voiced.sort((a, b) => a - b);
    const med = voiced[Math.floor(voiced.length / 2)];
    // fold the median down two octaves into a warm sub range (~48–72 Hz)
    let r = med;
    while (r > 72) r /= 2;
    while (r < 40) r *= 2;
    root = r;
  }

  const rng = mulberry32(REPLAY_SEED);

  let density = 0.45;
  let drift = 0.35;
  let register = 0.5;
  let bloom = 0.6;

  let running = false;
  let timer: number | null = null;
  let nextTime = 0;
  let cur = grains.length ? Math.floor(rng() * grains.length) : 0;
  const active = new Set<AudioBufferSourceNode>();
  let grainCb: ((e: ReplayEvent) => void) | null = null;

  function registerBias(g: Grain): number {
    // Prefer grains whose register sits near the Register control.
    const d = g.reg - register;
    return Math.exp(-(d * d) / (2 * 0.32 * 0.32)) + 0.05;
  }

  /** Similarity-weighted recombination walk — top-down replay of the learned
   *  world. Mostly steps to a grain like the current one (smooth memory),
   *  sometimes jumps (drift/mutation). Never a fixed loop. */
  function pickNext(): number {
    if (grains.length <= 1) return 0;
    const jump = rng() < 0.12 + drift * 0.55;
    const from = grains[cur];
    let total = 0;
    const weights = new Float32Array(grains.length);
    for (let j = 0; j < grains.length; j++) {
      if (j === cur) {
        weights[j] = 0;
        continue;
      }
      const g = grains[j];
      let w: number;
      if (jump) {
        // recombine freely, still biased by register
        w = registerBias(g) * (0.4 + 0.6 * g.energy);
      } else {
        // step to something similar: close pitch + close brightness
        const dp = Math.abs(g.reg - from.reg);
        const db = Math.abs(g.brightness - from.brightness);
        w = (1 / (0.15 + dp * 3 + db * 1.5)) * registerBias(g);
      }
      weights[j] = w;
      total += w;
    }
    if (total <= 0) return Math.floor(rng() * grains.length);
    let r = rng() * total;
    for (let j = 0; j < grains.length; j++) {
      r -= weights[j];
      if (r <= 0) return j;
    }
    return grains.length - 1;
  }

  function scheduleGrain(when: number) {
    if (!grains.length) return;
    const g = grains[cur];

    // Micro pitch drift (a few semitones at most) + a gentle register tilt.
    const semi = (rng() * 2 - 1) * drift * 2.5 + (register - 0.5) * 1.2;
    const rate = Math.pow(2, semi / 12);
    const playDur = g.dur / rate;

    const gain = 0.28 + 0.55 * g.energy * (0.4 + 0.6 * bloom);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const env = hannGain(ctx, when, g.dur, gain);
    src.connect(env);
    env.connect(grainBus);
    const safeOffset = Math.min(buffer.duration - 0.02, Math.max(0, g.offset));
    const safeDur = Math.min(buffer.duration - safeOffset - 0.005, playDur + 0.05);
    src.start(when, safeOffset, Math.max(0.03, safeDur));
    active.add(src);
    src.onended = () => {
      try {
        src.disconnect();
        env.disconnect();
      } catch {
        /* ignore */
      }
      active.delete(src);
    };

    if (grainCb) {
      grainCb({
        grainIndex: cur,
        pitch: g.pitch,
        brightness: g.brightness,
        energy: g.energy,
        rate,
        gain,
      });
    }
  }

  function tick() {
    if (!running) return;
    const now = ctx.currentTime;
    while (nextTime < now + LOOKAHEAD) {
      scheduleGrain(nextTime);
      // Interval between blooms: dense → ~0.32s, sparse → ~1.5s, with jitter.
      const base = 1.5 - density * 1.18;
      const jitter = 1 + (rng() * 2 - 1) * 0.28;
      nextTime += Math.max(0.16, base * jitter);
      cur = pickNext();
    }
    drone?.setDrive(0.22 + density * 0.3);
    timer = window.setTimeout(tick, SCHED_MS);
  }

  return {
    grainCount: grains.length,
    setDensity: (v) => {
      density = Math.min(1, Math.max(0, v));
    },
    setDrift: (v) => {
      drift = Math.min(1, Math.max(0, v));
    },
    setRegister: (v) => {
      register = Math.min(1, Math.max(0, v));
    },
    setBloom: (v) => {
      bloom = Math.min(1, Math.max(0, v));
    },
    getLevel: () => {
      analyser.getByteFrequencyData(specBuf);
      let s = 0;
      for (let i = 0; i < bins; i++) s += specBuf[i];
      return s / (bins * 255);
    },
    onGrain: (cb) => {
      grainCb = cb;
    },
    start: () => {
      if (running) return;
      running = true;
      drone = startDroneBank(ctx, limiter, {
        root,
        ratios: [1, 3 / 2, 2, 5 / 2],
        cutoffLow: 200,
        cutoffHigh: 1600,
        peakGain: 0.16,
      });
      nextTime = ctx.currentTime + 0.12;
      tick();
    },
    stop: () => {
      running = false;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      drone?.stop();
      drone = null;
      for (const s of active) {
        try {
          s.stop();
          s.disconnect();
        } catch {
          /* ignore */
        }
      }
      active.clear();
      try {
        grainBus.disconnect();
        filter.disconnect();
        master.disconnect();
        limiter.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

// ── loaders (three tiers) ────────────────────────────────────────────────────

/** Tier 1: fetch a Path recording by id, decode to an AudioBuffer. Read-only
 *  GET — no side effects, no api route of our own. */
export async function loadTrackById(
  ctx: AudioContext,
  id: string,
): Promise<AudioBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`/api/audio/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "No recording found for that id."
          : `Server returned ${res.status}.`,
      );
    }
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.error) throw new Error(json.error);
      if (!json.url) throw new Error("Recording response had no url.");
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) throw new Error("Could not fetch the recording audio.");
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }
    try {
      return await ctx.decodeAudioData(arrayBuf.slice(0));
    } catch {
      throw new Error("Could not decode that recording (codec / CORS).");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Tier 2: decode a user-chosen file. */
export async function loadFile(ctx: AudioContext, file: File): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer();
  return ctx.decodeAudioData(buf);
}

/** Tier 3: render a short, wistful detuned-piano phrase offline so the learned
 *  world is NEVER empty. Clearly a placeholder — load a real track. */
export async function renderDemoBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const seconds = 14;
  const length = Math.floor(seconds * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitOfflineAudioContext;
  const off = new OfflineCtx(1, length, sampleRate);
  const master = off.createGain();
  master.gain.value = 0.9;
  master.connect(off.destination);

  const root = 174.6; // ~F3
  const phrase = [0, 7, 12, 16, 12, 7, 3, 10, 15, 19, 15, 12, 7, 3, 0, 5, 12, 10, 7, 0];
  const noteSecs = seconds / phrase.length;

  phrase.forEach((semi, i) => {
    const t0 = i * noteSecs;
    const freq = root * Math.pow(2, semi / 12);
    const partials = [
      { mult: 1, gain: 1, detune: 0 },
      { mult: 2, gain: 0.32, detune: 2 },
      { mult: 3, gain: 0.14, detune: -3 },
    ];
    const noteGain = off.createGain();
    noteGain.gain.setValueAtTime(0.0001, t0);
    noteGain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(0.0004, t0 + noteSecs * 1.9);
    noteGain.connect(master);
    for (const p of partials) {
      const osc = off.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const g = off.createGain();
      g.gain.value = p.gain * 0.5;
      osc.connect(g);
      g.connect(noteGain);
      osc.start(t0);
      osc.stop(t0 + noteSecs * 2.1);
    }
  });

  return off.startRendering();
}
