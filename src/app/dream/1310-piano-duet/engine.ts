// engine.ts — Spectral cross-synthesis engine for 1310-piano-duet.
//
// THE ONE QUESTION: "What if you could sing INTO Karel's *recorded* piano —
// your live voice reshaping his harmonics in real time, a duet with a
// recording?"
//
// Karel's real solo piano is the CARRIER / excitation. A bank of parallel
// bandpass BiquadFilters splits his piano into ~20 log-spaced bands. Each
// band's gain is driven, in real time, by the corresponding band's energy in
// YOUR live mic — a legitimate channel-vocoder-style cross-synthesis. Sing
// "ahh" vs "ooo" and his chord audibly morphs its timbre toward your vowel.
// Gains are steered with setTargetAtTime (a one-pole, ~50ms) so the sculpt is
// click-free (no zipper noise).
//
// The raw mic is NEVER routed to the speakers — only its ANALYSIS drives the
// filter gains. That is the feedback guard.
//
// Lineage cited in the README: Trevor Wishart (cross-synthesis / *Vox* /
// spectral morphing) and Robert Henke / Monolake (live spectral practice).

import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  type SourceKind,
} from "./audio";

/** Number of parallel bandpass bands in the vocoder filter bank. */
export const N_BANDS = 20;
const F_LO = 130; // Hz — bottom of the sculpt range
const F_HI = 6000; // Hz — top of the sculpt range (formant-relevant)

/** Log-spaced center frequency of band i. */
function bandCenterHz(i: number): number {
  return F_LO * Math.pow(F_HI / F_LO, i / (N_BANDS - 1));
}

/** Per-frame readout handed to the visualizer. Buffers are reused — copy if
 *  you need to retain them. */
export interface EngineFrame {
  /** Envelope actually APPLIED to the piano bands, 0..1 (the sculpt shape). */
  applied: number[];
  /** Raw mic band shape scaled by loudness, 0..1 (the amber/rose voice ridge). */
  voice: number[];
  /** Piano (carrier) magnitude spectrum, bytes 0..255 (violet filaments). */
  pianoSpectrum: Uint8Array;
  /** Cross-synthesized OUTPUT magnitude spectrum, bytes 0..255 (bright ridge). */
  outputSpectrum: Uint8Array;
  /** Mic RMS loudness 0..1. */
  loudness: number;
  /** Singing amount 0..1 (smoothed gate). */
  singing: number;
  /** True once a live mic is analysing. */
  usingMic: boolean;
}

/** What the caller can nudge each frame. */
export interface TickParams {
  /** Sculpt intensity 0..1 (on-screen slider). */
  mix: number;
  /** Manual formant peak from an XY pad when there is NO mic. null = auto. */
  manual: { peak: number; width: number; energy: number } | null;
}

export interface CrossSynthEngine {
  /** Build the graph, start the looping piano, ramp master from 0, and try the
   *  mic. Resolves with which carrier is playing. Always leaves audio running. */
  start(): Promise<{ source: SourceKind }>;
  /** Advance analysis + steer the filter-bank gains. Returns a viz frame. */
  tick(params: TickParams): EngineFrame | null;
  usingMic(): boolean;
  micError(): string | null;
  sampleRate(): number;
  /** Frequency (Hz) of band i — for the visualizer's log x-axis. */
  bandHz(i: number): number;
  /** Full teardown: ramp master to 0, stop source + mic, close context. */
  stop(): Promise<void>;
}

/** A fresh Uint8Array backed by its own ArrayBuffer — keeps the TS 5 lib.dom
 *  typed-array narrowing happy for getByte* analyser calls. */
function makeByteBuf(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(n));
}

export function createEngine(): CrossSynthEngine {
  let ctx: AudioContext | null = null;
  let pianoSource: AudioBufferSourceNode | null = null;
  let masterGain: GainNode | null = null;
  let dryGain: GainNode | null = null;
  const bandGains: GainNode[] = [];
  const bandFilters: BiquadFilterNode[] = [];

  let pianoAnalyser: AnalyserNode | null = null;
  let outputAnalyser: AnalyserNode | null = null;
  let micAnalyser: AnalyserNode | null = null;
  let micStream: MediaStream | null = null;
  let micErr: string | null = null;
  let hasMic = false;

  // Precomputed mic-analyser bin ranges per band (filled once mic is up).
  let bandBins: Array<[number, number]> = [];

  // Reusable analysis buffers.
  let pianoBytes: Uint8Array<ArrayBuffer> | null = null;
  let outputBytes: Uint8Array<ArrayBuffer> | null = null;
  let micFreqBytes: Uint8Array<ArrayBuffer> | null = null;
  let micTimeBytes: Uint8Array<ArrayBuffer> | null = null;

  // Smoothed state carried across frames.
  const appliedSmooth = new Array<number>(N_BANDS).fill(0);
  const voiceOut = new Array<number>(N_BANDS).fill(0);
  let singingSmooth = 0;
  let autoPhase = Math.random() * Math.PI * 2;
  let lastTime = 0;

  function computeBandBins(analyser: AnalyserNode) {
    const binHz = (ctx as AudioContext).sampleRate / analyser.fftSize;
    bandBins = [];
    for (let i = 0; i < N_BANDS; i++) {
      const center = bandCenterHz(i);
      // Half-band edges in log space for a clean, slightly overlapping split.
      const ratio = Math.pow(F_HI / F_LO, 1 / (N_BANDS - 1));
      const lo = center / Math.sqrt(ratio);
      const hi = center * Math.sqrt(ratio);
      const loBin = Math.max(0, Math.floor(lo / binHz));
      const hiBin = Math.max(loBin + 1, Math.ceil(hi / binHz));
      bandBins.push([loBin, hiBin]);
    }
  }

  async function tryMic(): Promise<void> {
    if (!ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStream = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      // Sink only — NEVER connected to destination. This is the feedback guard.
      src.connect(analyser);
      micAnalyser = analyser;
      micFreqBytes = makeByteBuf(analyser.frequencyBinCount);
      micTimeBytes = makeByteBuf(analyser.fftSize);
      computeBandBins(analyser);
      hasMic = true;
      micErr = null;
    } catch (e) {
      hasMic = false;
      micErr =
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone blocked — the duet runs on an auto-morph. Drag the canvas to sculpt his piano by hand, or allow the mic and reload to sing."
          : "Microphone unavailable — the duet runs on an auto-morph. Drag the canvas to sculpt his piano by hand.";
    }
  }

  async function start(): Promise<{ source: SourceKind }> {
    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();

    // Load Karel's carrier (or synthesize the fallback).
    let buffer = await fetchPianoBuffer(ctx);
    let source: SourceKind = "piano";
    if (!buffer) {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      source = "fallback";
    }

    // ── Build the graph ──────────────────────────────────────────────────
    pianoSource = ctx.createBufferSource();
    pianoSource.buffer = buffer;
    pianoSource.loop = true;

    // Carrier tap (pre-filter) so we can draw the piano's own spectrum.
    pianoAnalyser = ctx.createAnalyser();
    pianoAnalyser.fftSize = 2048;
    pianoAnalyser.smoothingTimeConstant = 0.72;
    pianoBytes = makeByteBuf(pianoAnalyser.frequencyBinCount);
    pianoSource.connect(pianoAnalyser);

    // Mix bus collects dry + wet; limiter then master (ramped from 0).
    const mixBus = ctx.createGain();
    mixBus.gain.value = 1;

    outputAnalyser = ctx.createAnalyser();
    outputAnalyser.fftSize = 2048;
    outputAnalyser.smoothingTimeConstant = 0.72;
    outputBytes = makeByteBuf(outputAnalyser.frequencyBinCount);
    mixBus.connect(outputAnalyser); // tap only

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    masterGain = ctx.createGain();
    masterGain.gain.value = 0;

    mixBus.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Dry path — keep the piano clearly audible so it stays a DUET, not a gate.
    dryGain = ctx.createGain();
    dryGain.gain.value = 0.5;
    pianoSource.connect(dryGain);
    dryGain.connect(mixBus);

    // Wet path — the parallel bandpass vocoder bank.
    const q = 4.0; // slight overlap between adjacent bands for smooth timbre
    for (let i = 0; i < N_BANDS; i++) {
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = bandCenterHz(i);
      filt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      pianoSource.connect(filt);
      filt.connect(g);
      g.connect(mixBus);
      bandFilters.push(filt);
      bandGains.push(g);
    }

    pianoSource.start();

    // Master ramps up gently from 0 — no click, no jump-scare at 06:30.
    const now = ctx.currentTime;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.92, now + 1.4);

    lastTime = now;

    // Try the mic (still inside the user-gesture call chain). The piano +
    // auto-morph already run regardless of the outcome.
    await tryMic();

    return { source };
  }

  function tick(params: TickParams): EngineFrame | null {
    if (!ctx || !pianoAnalyser || !outputAnalyser || !pianoBytes || !outputBytes) {
      return null;
    }
    const now = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0.001, now - lastTime));
    lastTime = now;

    pianoAnalyser.getByteFrequencyData(pianoBytes);
    outputAnalyser.getByteFrequencyData(outputBytes);

    // ── Extract the mic's spectral envelope (formant shape) ────────────────
    let loudness = 0;
    const micShape = new Array<number>(N_BANDS).fill(0);
    if (hasMic && micAnalyser && micFreqBytes && micTimeBytes) {
      micAnalyser.getByteFrequencyData(micFreqBytes);
      micAnalyser.getByteTimeDomainData(micTimeBytes);

      // RMS loudness from the time domain (robust singing detection).
      let sumSq = 0;
      for (let n = 0; n < micTimeBytes.length; n++) {
        const v = (micTimeBytes[n] - 128) / 128;
        sumSq += v * v;
      }
      loudness = Math.min(1, Math.sqrt(sumSq / micTimeBytes.length) * 3.2);

      // Per-band energy → normalized SHAPE (formant peaks stand out).
      let maxE = 1e-3;
      for (let i = 0; i < N_BANDS; i++) {
        const [lo, hi] = bandBins[i];
        let s = 0;
        for (let b = lo; b < hi; b++) s += micFreqBytes[b];
        const e = s / (hi - lo) / 255;
        micShape[i] = e;
        if (e > maxE) maxE = e;
      }
      for (let i = 0; i < N_BANDS; i++) {
        micShape[i] = Math.pow(micShape[i] / maxE, 1.4); // contrast the vowel
      }
    }

    // Singing gate (smoothed) so silence never snaps the sculpt on/off.
    const singingTarget = Math.max(0, Math.min(1, (loudness - 0.02) / 0.09));
    singingSmooth += (singingTarget - singingSmooth) * Math.min(1, dt * 8);

    // ── Baseline auto-morph so a hands-off, mic-less view is never static ──
    autoPhase += dt * 0.7;
    const autoPeakA = 0.5 + 0.4 * Math.sin(autoPhase);
    const autoPeakB = 0.28 + 0.18 * Math.sin(autoPhase * 0.61 + 1.3);
    const auto = new Array<number>(N_BANDS);
    for (let i = 0; i < N_BANDS; i++) {
      const x = i / (N_BANDS - 1);
      const g1 = Math.exp(-Math.pow((x - autoPeakA) / 0.16, 2));
      const g2 = 0.6 * Math.exp(-Math.pow((x - autoPeakB) / 0.14, 2));
      auto[i] = Math.min(1, g1 + g2);
    }

    // ── Choose the envelope + intensity that sculpts Karel's piano ─────────
    let s: number; // "singing / driving" amount 0..1 for dry ducking
    let wetScale: number; // overall wet contribution 0..1+
    const envTarget = new Array<number>(N_BANDS);

    if (!hasMic && params.manual) {
      // MIC FALLBACK: an XY pad drives a synthetic voice envelope by hand.
      const { peak, width, energy } = params.manual;
      for (let i = 0; i < N_BANDS; i++) {
        const x = i / (N_BANDS - 1);
        envTarget[i] = Math.exp(-Math.pow((x - peak) / Math.max(0.06, width), 2));
      }
      s = 0.9;
      wetScale = params.mix * (0.5 + 0.7 * energy);
      loudness = Math.max(loudness, energy);
    } else {
      // Live (or hands-off auto) path: blend auto → your voice by how much you
      // are singing, so the piano is always being shaped by SOMETHING.
      for (let i = 0; i < N_BANDS; i++) {
        envTarget[i] = auto[i] * (1 - singingSmooth) + micShape[i] * singingSmooth;
      }
      s = singingSmooth;
      // Louder voice = stronger sculpt. Keep a floor so the auto-morph is heard.
      const base = hasMic ? 0.35 + 0.85 * loudness : 0.5;
      wetScale = params.mix * base;
    }

    // ── Steer the filter-bank gains — click-free via setTargetAtTime ───────
    for (let i = 0; i < N_BANDS; i++) {
      appliedSmooth[i] += (envTarget[i] - appliedSmooth[i]) * Math.min(1, dt * 10);
      const target = Math.max(0.0001, wetScale * appliedSmooth[i] * 0.75);
      bandGains[i]?.gain.setTargetAtTime(target, now, 0.05);
      // Voice ridge for the viz: the shape scaled by how loud you are.
      const raw = hasMic ? micShape[i] * loudness : envTarget[i] * (params.manual ? loudness : 0.35);
      voiceOut[i] = raw;
    }

    // Dry piano ducks a little under a strong voice but stays clearly present.
    dryGain?.gain.setTargetAtTime(0.5 * (1 - 0.32 * s), now, 0.08);

    return {
      applied: appliedSmooth.slice(),
      voice: voiceOut.slice(),
      pianoSpectrum: pianoBytes,
      outputSpectrum: outputBytes,
      loudness,
      singing: s,
      usingMic: hasMic,
    };
  }

  async function stop(): Promise<void> {
    const c = ctx;
    // Ramp master to 0 in ~60ms, then tear everything down.
    if (c && masterGain) {
      const now = c.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0, now + 0.06);
    }
    await new Promise((r) => setTimeout(r, 80));

    try {
      pianoSource?.stop();
    } catch {
      /* already stopped */
    }
    pianoSource?.disconnect();
    dryGain?.disconnect();
    bandGains.forEach((g) => g.disconnect());
    bandFilters.forEach((f) => f.disconnect());
    pianoAnalyser?.disconnect();
    outputAnalyser?.disconnect();
    micAnalyser?.disconnect();
    micStream?.getTracks().forEach((t) => t.stop());

    if (c) {
      if (c.state !== "closed") await c.suspend().catch(() => {});
      await c.close().catch(() => {});
    }

    ctx = null;
    pianoSource = null;
    masterGain = null;
    dryGain = null;
    bandGains.length = 0;
    bandFilters.length = 0;
    pianoAnalyser = null;
    outputAnalyser = null;
    micAnalyser = null;
    micStream = null;
    hasMic = false;
  }

  return {
    start,
    tick,
    usingMic: () => hasMic,
    micError: () => micErr,
    sampleRate: () => ctx?.sampleRate ?? 44100,
    bandHz: (i: number) => bandCenterHz(i),
    stop,
  };
}
