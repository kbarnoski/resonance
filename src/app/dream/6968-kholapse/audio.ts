// ─────────────────────────────────────────────────────────────────────────────
// 6968-kholapse · audio.ts — ONE granular time-freeze engine for both the
// dropped recording AND the seeded fallback arpeggio.
//
//   A cloud of overlapping windowed grains reads a playhead that advances at
//   (1 − d) of real time — so at depth the slice FREEZES. Each grain's
//   playbackRate droops below 1 as d rises, so pitch and tempo DECOUPLE
//   (a k-hole tell). As d rises:
//     · grain length grows           → feedforward detail blurs
//     · a lowpass rolls off the highs → feedforward (HF) suppression
//     · a cross-coupled ping-pong DelayNode echo opens
//     · the shared void reverb + drone bed swell  (feedback / context persists)
//   At d→1 the real audio thins and the drone/echo/reverb — the persistent
//   feedback context — dominate: "internally-driven patterns without input"
//   (Bera, Looger, Proekt & Cichon, The Neuroscientist 32(1), 2026).
//
//   All randomness is seeded with mulberry32(0x6968) — no Math.random / Date.now
//   so the lab's build/resume determinism holds. Master ≤ 0.26 behind a
//   DynamicsCompressor limiter. Full teardown on dispose().
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

export interface AudioAnalysis {
  amp: number; // 0..1 RMS (time domain)
  centroid: number; // 0..1 normalized spectral centroid
  bass: number; // 0..1 low-band energy
  mid: number; // 0..1 mid-band energy
  treble: number; // 0..1 high-band energy
}

const SEED = 0x6968;

/** Deterministic PRNG — the ONLY source of randomness in this file. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a deterministic just-intonation arpeggio buffer for the no-file case.
 *  Alive-on-load & demoable headless: additive sine partials with a soft pluck
 *  envelope, note choice driven purely by the seeded PRNG. */
function buildSeededBuffer(ctx: AudioContext): AudioBuffer {
  const rnd = mulberry32(SEED);
  const sr = ctx.sampleRate;
  const seconds = 24;
  const len = sr * seconds;
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  const root = 220; // A3
  const ratios = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2]; // just major
  const noteDur = 0.55; // seconds per pluck
  const notes = Math.floor(seconds / noteDur);

  for (let n = 0; n < notes; n++) {
    const degree = Math.floor(rnd() * ratios.length);
    const octave = rnd() < 0.32 ? 2 : 1;
    const freq = root * ratios[degree] * octave;
    const start = Math.floor(n * noteDur * sr);
    const amp = 0.18 + rnd() * 0.1;
    const decay = 2.6 + rnd() * 1.4;
    const nlen = Math.min(len - start, Math.floor(noteDur * 2.2 * sr));
    for (let i = 0; i < nlen; i++) {
      const t = i / sr;
      const env = Math.exp(-t * decay) * Math.min(1, t / 0.006);
      const s =
        Math.sin(2 * Math.PI * freq * t) +
        0.4 * Math.sin(2 * Math.PI * freq * 2 * t) +
        0.18 * Math.sin(2 * Math.PI * freq * 3 * t);
      data[start + i] += amp * env * s * 0.5;
    }
  }
  // Soft normalize to keep headroom before the granular stage.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) {
    const g = 0.7 / peak;
    for (let i = 0; i < len; i++) data[i] *= g;
  }
  return buf;
}

export interface KholeAudio {
  /** Resume the context (needs a user gesture) and begin grain scheduling. */
  start(): Promise<void>;
  /** Set the effective dissociation depth 0..1 (from slider + live nudge). */
  setDepth(d: number): void;
  /** Decode an encoded audio file through the engine's own AudioContext so the
   *  sample rate matches, then swap it in as the grain source. */
  decode(data: ArrayBuffer): Promise<void>;
  /** Swap in an already-decoded recording; granular engine reads it seamlessly. */
  loadBuffer(buf: AudioBuffer): void;
  /** Read live amplitude / centroid / band energies for visual coupling. */
  analyse(): AudioAnalysis;
  /** True until the first successful start()/resume(). */
  readonly started: boolean;
  /** Whether a real recording (not the seeded fallback) is loaded. */
  readonly hasUserBuffer: boolean;
  /** Full teardown: stop sources, cancel timers, disconnect, close. */
  dispose(): void;
}

export function makeKholeAudio(): KholeAudio {
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtor();

  // ── master chain: → limiter → analyser → destination ──────────────────
  const master = ctx.createGain();
  master.gain.value = 0.26;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;

  master.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  // ── feedback / context bed: void reverb + drone (persist, deepen w/ d) ──
  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 5, decay: 3 });
  reverb.setWet(0);
  reverb.output.connect(master);

  const drone: DroneBank = startDroneBank(ctx, master, { root: 55 });
  drone.setDrive(0.3);

  // ── granular signal path: grainBus → lowpass → preFx → reverb.input ─────
  const grainBus = ctx.createGain();
  grainBus.gain.value = 1;

  const grainLP = ctx.createBiquadFilter();
  grainLP.type = "lowpass";
  grainLP.frequency.value = 16000;
  grainLP.Q.value = 0.6;

  const preFx = ctx.createGain();
  preFx.gain.value = 0.9;

  grainBus.connect(grainLP);
  grainLP.connect(preFx);
  preFx.connect(reverb.input);
  preFx.connect(master); // dry granular also reaches master

  // ── cross-coupled ping-pong echo (feedback context, opens with d) ───────
  const delayL = ctx.createDelay(1.5);
  const delayR = ctx.createDelay(1.5);
  delayL.delayTime.value = 0.28;
  delayR.delayTime.value = 0.41;
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  fbL.gain.value = 0.5;
  fbR.gain.value = 0.5;
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0;

  preFx.connect(delayL);
  delayL.connect(fbL);
  fbL.connect(delayR); // cross-couple
  delayR.connect(fbR);
  fbR.connect(delayL); // cross-couple
  delayL.connect(echoWet);
  delayR.connect(echoWet);
  echoWet.connect(reverb.input);

  // ── state ───────────────────────────────────────────────────────────────
  const rnd = mulberry32(SEED ^ 0x51ed);
  let sourceBuffer: AudioBuffer = buildSeededBuffer(ctx);
  let hasUserBuffer = false;
  let started = false;
  let disposed = false;
  let depth = 0;

  // Playhead in seconds through sourceBuffer; advances at (1 − d) of real time.
  let playhead = 0;
  let lastSchedTime = 0; // ctx time of the previous scheduler tick
  let nextGrainTime = 0; // ctx time the next grain should fire
  let timer: number | null = null;

  const analysisFreq = new Uint8Array(analyser.frequencyBinCount);
  const analysisTime = new Uint8Array(analyser.fftSize);

  function grainParams() {
    // grain length grows with depth (feedforward blur): 70ms → 460ms
    const len = 0.07 + 0.39 * depth;
    // playbackRate droops below 1 with depth → pitch/tempo decouple
    const rate = 1 - 0.42 * depth;
    return { len, rate };
  }

  function spawnGrain(when: number) {
    if (disposed) return;
    const { len, rate } = grainParams();
    const src = ctx.createBufferSource();
    src.buffer = sourceBuffer;
    src.playbackRate.value = rate;

    const g = ctx.createGain();
    // Windowed (raised-cosine-ish) envelope built from linear ramps.
    const peak = 0.6 + 0.4 * (1 - depth); // quieter grains as detail dissolves
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + len * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, when + len);

    src.connect(g);
    g.connect(grainBus);

    // Read offset around the frozen playhead, with a little seeded jitter so
    // the freeze shimmers instead of buzzing on one exact sample.
    const jitter = (rnd() - 0.5) * 0.03 * (0.3 + 0.7 * depth);
    let offset = playhead + jitter;
    const dur = sourceBuffer.duration;
    offset = ((offset % dur) + dur) % dur;

    const grainReadLen = Math.min(len * rate, dur - offset - 0.001);
    try {
      src.start(when, offset, Math.max(0.01, grainReadLen));
      src.stop(when + len + 0.05);
    } catch {
      /* context closing */
    }
  }

  function schedule() {
    if (disposed) return;
    const now = ctx.currentTime;
    const lookahead = 0.12;

    // Advance the frozen playhead by real elapsed × (1 − d).
    const elapsed = now - lastSchedTime;
    lastSchedTime = now;
    playhead += elapsed * (1 - depth);
    if (playhead >= sourceBuffer.duration) playhead -= sourceBuffer.duration;

    const { len } = grainParams();
    // Overlap density: ~3 grains overlapping. Interval shrinks as grains grow.
    const interval = Math.max(0.03, len * 0.33);

    while (nextGrainTime < now + lookahead) {
      if (nextGrainTime < now) nextGrainTime = now + 0.005;
      spawnGrain(nextGrainTime);
      nextGrainTime += interval;
    }
  }

  function applyDepthToNodes() {
    const now = ctx.currentTime;
    // HF rolls off with depth (feedforward suppression): 16k → 900Hz.
    const cutoff = 16000 * Math.pow(900 / 16000, depth);
    grainLP.frequency.setTargetAtTime(cutoff, now, 0.15);
    // Echo opens with depth.
    echoWet.gain.setTargetAtTime(0.15 + 0.45 * depth, now, 0.2);
    fbL.gain.setTargetAtTime(0.35 + 0.3 * depth, now, 0.2);
    fbR.gain.setTargetAtTime(0.35 + 0.3 * depth, now, 0.2);
    // Feedback/context bed deepens with depth.
    reverb.setWet(depth * 0.7);
    drone.setDrive(0.3 + 0.5 * depth);
    // Dry granular thins as the real audio surrenders (d→1).
    preFx.gain.setTargetAtTime(0.9 * (1 - 0.55 * depth), now, 0.25);
  }

  return {
    async start() {
      if (disposed) return;
      try {
        await ctx.resume();
      } catch {
        /* already running or blocked */
      }
      if (!started) {
        started = true;
        lastSchedTime = ctx.currentTime;
        nextGrainTime = ctx.currentTime + 0.02;
        applyDepthToNodes();
        timer = window.setInterval(schedule, 25);
      }
    },
    setDepth(d: number) {
      depth = Math.min(1, Math.max(0, d));
      if (started) applyDepthToNodes();
    },
    async decode(data: ArrayBuffer) {
      const decoded = await ctx.decodeAudioData(data.slice(0));
      sourceBuffer = decoded;
      hasUserBuffer = true;
      playhead = 0;
    },
    loadBuffer(buf: AudioBuffer) {
      sourceBuffer = buf;
      hasUserBuffer = true;
      playhead = 0;
    },
    analyse(): AudioAnalysis {
      analyser.getByteTimeDomainData(analysisTime);
      analyser.getByteFrequencyData(analysisFreq);

      let sumSq = 0;
      for (let i = 0; i < analysisTime.length; i++) {
        const v = (analysisTime[i] - 128) / 128;
        sumSq += v * v;
      }
      const amp = Math.min(1, Math.sqrt(sumSq / analysisTime.length) * 2.4);

      const bins = analysisFreq.length;
      let weighted = 0;
      let total = 0;
      let bass = 0;
      let mid = 0;
      let treble = 0;
      for (let i = 0; i < bins; i++) {
        const m = analysisFreq[i] / 255;
        weighted += m * i;
        total += m;
        const f = i / bins;
        if (f < 0.12) bass += m;
        else if (f < 0.45) mid += m;
        else treble += m;
      }
      const centroid = total > 0 ? weighted / total / bins : 0;
      const bassBins = Math.max(1, bins * 0.12);
      const midBins = Math.max(1, bins * 0.33);
      const trebBins = Math.max(1, bins * 0.55);
      return {
        amp,
        centroid: Math.min(1, centroid * 1.6),
        bass: Math.min(1, bass / bassBins),
        mid: Math.min(1, mid / midBins),
        treble: Math.min(1, treble / trebBins),
      };
    },
    get started() {
      return started;
    },
    get hasUserBuffer() {
      return hasUserBuffer;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      try {
        drone.stop();
      } catch {
        /* noop */
      }
      try {
        master.disconnect();
        limiter.disconnect();
        analyser.disconnect();
        grainBus.disconnect();
        grainLP.disconnect();
        preFx.disconnect();
        delayL.disconnect();
        delayR.disconnect();
        fbL.disconnect();
        fbR.disconnect();
        echoWet.disconnect();
        reverb.input.disconnect();
        reverb.output.disconnect();
      } catch {
        /* noop */
      }
      // Give the drone fade a beat, then close.
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 800);
    },
  };
}
