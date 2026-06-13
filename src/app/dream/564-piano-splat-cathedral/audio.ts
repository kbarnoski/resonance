// audio.ts — 564-piano-splat-cathedral
//
// Audio engine for the cathedral Gaussian-splat prototype. Three jobs:
//   1. Source: fetch + decode Karel's real piano recording, OR synthesise a
//      warm evolving fallback that drives the cathedral-building simulation.
//   2. Analysis: AnalyserNode (fftSize 2048) → per-frame energy, brightness,
//      pitch, and onsets (spectral-flux vs adaptive EMA).
//   3. Master DynamicsCompressor limiter so nothing clips.

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

export interface Onset {
  /** 0..1 loudness — drives how many splats a structural element spawns. */
  loudness: number;
  /** 0..1 brightness (spectral centroid). */
  brightness: number;
  /** 0..1 pitch fraction → hue of the element raised. */
  pitch: number;
  /** Frequency in Hz. */
  hz: number;
}

export interface AudioFrame {
  /** Overall energy 0..1 — drives nave breathe + rose-window pulse. */
  energy: number;
  /** Spectral brightness 0..1. */
  brightness: number;
  /** Dominant pitch 0..1. */
  pitch: number;
  /** Fresh onset this frame, or null. */
  onset: Onset | null;
  /** Smoothed loudness 0..1 for sustained haze. */
  loudness: number;
}

export interface AudioEngineHandles {
  ctx: AudioContext;
  analyser: AnalyserNode;
  kind: AudioSourceKind;
  stop: () => void;
}

// ─── Piano fetch ──────────────────────────────────────────────────────────────

async function fetchPianoBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, { signal: controller.signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let bytes: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      bytes = await r2.arrayBuffer();
    } else { bytes = await res.arrayBuffer(); }
    return await ctx.decodeAudioData(bytes);
  } catch { return null; } finally { clearTimeout(timer); }
}

// ─── Fallback synth: warm solo-piano-like arpeggios ──────────────────────────

/** C-major + Lydian flavoured MIDI note pool — warm cathedral registers. */
const NOTE_POOL = [48, 52, 55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 79];

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function buildFallbackPiano(ctx: AudioContext, dest: AudioNode): () => void {
  const stopped = { value: false };
  const timers: ReturnType<typeof setTimeout>[] = [];
  const liveOsc: OscillatorNode[] = [];

  // Ambient warm pad
  const padGain = ctx.createGain();
  padGain.gain.value = 0.06;
  padGain.connect(dest);
  const padOsc = ctx.createOscillator();
  padOsc.type = "sine";
  padOsc.frequency.value = midiToHz(48);
  padOsc.connect(padGain);
  padOsc.start();

  function playNote(midi: number, when: number, dur: number) {
    if (stopped.value) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.28, when + 0.025);
    g.gain.setTargetAtTime(0.12, when + 0.025, dur * 0.18);
    g.gain.setTargetAtTime(0.0001, when + dur * 0.45, dur * 0.32);
    g.connect(dest);

    const hz = midiToHz(midi);
    // fundamental + 2nd harmonic (warmer timbre)
    [1, 2, 3].forEach((partial, pi) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz * partial;
      const hg = ctx.createGain();
      hg.gain.value = pi === 0 ? 1 : pi === 1 ? 0.38 : 0.12;
      osc.connect(hg);
      hg.connect(g);
      osc.start(when);
      osc.stop(when + dur + 0.8);
      liveOsc.push(osc);
    });
  }

  let step = 0;
  const patterns = [
    [0, 4, 7, 11], [0, 3, 7, 10], [0, 2, 5, 9], [0, 4, 7, 12]
  ];

  function schedule() {
    if (stopped.value) return;
    const now = ctx.currentTime;
    const base = NOTE_POOL[step % NOTE_POOL.length];
    const pattern = patterns[Math.floor(step / 4) % patterns.length];
    const spread = 0.14 + Math.random() * 0.08;
    pattern.forEach((interval, i) => {
      const m = base + interval;
      if (Math.random() < 0.82) {
        playNote(m, now + 0.04 + i * spread, 0.6 + Math.random() * 0.5);
      }
    });
    // Occasional bass note
    if (Math.random() < 0.45) {
      playNote(base - 12, now + 0.02, 1.2 + Math.random() * 0.6);
    }
    step++;
    const next = 800 + Math.random() * 600;
    timers.push(setTimeout(schedule, next));
  }
  schedule();

  return () => {
    stopped.value = true;
    timers.forEach(clearTimeout);
    try { padGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); } catch { /* noop */ }
    try { padOsc.stop(ctx.currentTime + 0.4); } catch { /* noop */ }
    liveOsc.forEach(o => { try { o.stop(ctx.currentTime + 0.5); } catch { /* noop */ } });
  };
}

// ─── Engine construction ──────────────────────────────────────────────────────

export async function makeAudioEngine(): Promise<AudioEngineHandles> {
  const Ctor = window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.88;

  master.connect(analyser);
  analyser.connect(limiter);
  limiter.connect(ctx.destination);

  const buffer = await fetchPianoBuffer(ctx);

  if (buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(master);
    try { src.start(); } catch { /* noop */ }
    const stop = () => {
      try { src.stop(); } catch { /* noop */ }
      void ctx.close();
    };
    return { ctx, analyser, kind: "piano", stop };
  }

  const stopFallback = buildFallbackPiano(ctx, master);
  const stop = () => {
    stopFallback();
    void ctx.close();
  };
  return { ctx, analyser, kind: "fallback", stop };
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

const HZ_LO = 55;
const HZ_HI = 2100;

export function makeAnalysis(analyser: AnalyserNode, sampleRate: number) {
  const bins = analyser.frequencyBinCount; // 1024
  const mag = new Float32Array(bins);
  const linNow = new Float32Array(bins);
  const linPrev = new Float32Array(bins);

  let fluxAvg = 0;
  let fluxVar = 1;
  let cooldown = 0;
  let smoothedLoudness = 0;

  const hzPerBin = (sampleRate / 2) / bins;

  function read(): AudioFrame {
    analyser.getFloatFrequencyData(mag);

    let energy = 0;
    let centroidNum = 0;
    let centroidDen = 0;
    let flux = 0;
    let peakVal = 0;
    let peakBin = 1;

    for (let i = 0; i < bins; i++) {
      const db = mag[i];
      const lin = db > -140 ? Math.pow(10, db / 20) : 0;
      linNow[i] = lin;
      energy += lin;
      centroidNum += lin * i;
      centroidDen += lin;
      const d = lin - linPrev[i];
      if (d > 0) flux += d;
      if (i > 2 && lin > peakVal) { peakVal = lin; peakBin = i; }
      linPrev[i] = lin;
    }

    energy /= bins;
    const centroidBin = centroidDen > 1e-6 ? centroidNum / centroidDen : 0;
    const brightness = Math.min(1, centroidBin / (bins * 0.45));
    const loudnessRaw = Math.min(1, energy * 28);
    smoothedLoudness += 0.12 * (loudnessRaw - smoothedLoudness);

    let refinedBin = peakBin;
    if (peakBin > 1 && peakBin < bins - 1) {
      const a = linNow[peakBin - 1];
      const b = linNow[peakBin];
      const c = linNow[peakBin + 1];
      const denom = a - 2 * b + c;
      if (Math.abs(denom) > 1e-9) refinedBin = peakBin + (0.5 * (a - c)) / denom;
    }
    const hz = Math.max(1, refinedBin * hzPerBin);
    const pitch = Math.min(1, Math.max(0, Math.log(hz / HZ_LO) / Math.log(HZ_HI / HZ_LO)));

    const alpha = 0.06;
    const diff = flux - fluxAvg;
    fluxAvg += alpha * diff;
    fluxVar += alpha * (diff * diff - fluxVar);
    const std = Math.sqrt(Math.max(fluxVar, 1e-9));
    const threshold = fluxAvg + 1.6 * std + 0.002;

    let onset: Onset | null = null;
    if (cooldown > 0) cooldown--;
    if (flux > threshold && cooldown === 0 && loudnessRaw > 0.02) {
      cooldown = 5;
      onset = {
        loudness: Math.min(1, loudnessRaw * 1.3 + 0.1),
        brightness,
        pitch,
        hz,
      };
    }

    return { energy: loudnessRaw, brightness, pitch, onset, loudness: smoothedLoudness };
  }

  return { read };
}
