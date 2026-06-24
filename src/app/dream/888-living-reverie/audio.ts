/*
 * 888 · LIVING REVERIE — audio substrate
 *
 * This module owns the low-level Web Audio plumbing:
 *   - the proven fetch pattern for Karel's real piano recording,
 *   - the master chain (reverb convolver -> compressor -> destination),
 *   - the synthesized voices (FM-ish piano, detuned-saw pad, granular shimmer),
 *   - an analyser tap for per-frame RMS that drives both the engine and visuals.
 *
 * No external files: the convolution impulse response is rendered at runtime
 * from an exponentially-decaying noise burst via an OfflineAudioContext.
 */

// ---------------------------------------------------------------------------
// Karel's real piano — READ-ONLY existing route. Proven verbatim fetch pattern.
// ---------------------------------------------------------------------------
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }
    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Master chain
// ---------------------------------------------------------------------------
export interface MasterChain {
  ctx: AudioContext;
  // Voices connect here. dryGain + wetGain are the reverb send/return balance.
  voiceBus: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  compressor: DynamicsCompressorNode;
  master: GainNode;
  analyser: AnalyserNode;
}

/** Render an exponentially-decaying stereo noise burst into an AudioBuffer. */
async function renderImpulseResponse(
  ctx: AudioContext,
  seconds: number,
  decay: number,
): Promise<AudioBuffer> {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const offline = new OfflineAudioContext(2, length, rate);
  const ir = offline.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // exponential decay envelope on white noise
      const env = Math.pow(1 - t, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  // Run a trivial render just so the buffer is valid in this context's rate.
  const src = offline.createBufferSource();
  src.buffer = ir;
  src.connect(offline.destination);
  src.start();
  await offline.startRendering();
  return ir;
}

export async function buildMasterChain(ctx: AudioContext): Promise<MasterChain> {
  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.8;

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.25; // grows with age

  const convolver = ctx.createConvolver();
  convolver.buffer = await renderImpulseResponse(ctx, 4.5, 3.2);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 24;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.28;

  const master = ctx.createGain();
  master.gain.value = 0.0; // faded up on start to avoid clicks

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;

  // routing: voiceBus -> dry -> compressor
  //          voiceBus -> convolver -> wet -> compressor
  voiceBus.connect(dryGain).connect(compressor);
  voiceBus.connect(convolver);
  convolver.connect(wetGain).connect(compressor);
  compressor.connect(master);
  master.connect(analyser);
  analyser.connect(ctx.destination);

  return {
    ctx,
    voiceBus,
    dryGain,
    wetGain,
    convolver,
    compressor,
    master,
    analyser,
  };
}

// ---------------------------------------------------------------------------
// Voices — all frequencies arrive already mode-quantized from the engine.
// ---------------------------------------------------------------------------

/** FM-ish piano voice: carrier + modulator with a fast-decay amplitude env. */
export function playPianoNote(
  chain: MasterChain,
  freq: number,
  velocity: number,
  brightness: number, // 0..1, scales modulation depth + carrier brightness
) {
  const { ctx, voiceBus } = chain;
  const now = ctx.currentTime;

  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;

  const modulator = ctx.createOscillator();
  modulator.type = "sine";
  // inharmonic-ish ratio gives a struck, bell/piano timbre
  modulator.frequency.value = freq * 2.0;

  const modGain = ctx.createGain();
  const modDepth = freq * (1.5 + brightness * 4.5);
  modGain.gain.setValueAtTime(modDepth, now);
  modGain.gain.exponentialRampToValueAtTime(modDepth * 0.04 + 0.001, now + 0.6);

  const amp = ctx.createGain();
  const peak = Math.max(0.0001, velocity * 0.22);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + 1.2 + brightness * 1.6);

  modulator.connect(modGain).connect(carrier.frequency);
  carrier.connect(amp).connect(voiceBus);

  modulator.start(now);
  carrier.start(now);
  const stop = now + 3.2;
  modulator.stop(stop);
  carrier.stop(stop);
}

/** A sustained detuned-saw pad chord tone with slow swell. */
export function playPadNote(
  chain: MasterChain,
  freq: number,
  level: number,
  durationSec: number,
) {
  const { ctx, voiceBus } = chain;
  const now = ctx.currentTime;

  const oscA = ctx.createOscillator();
  const oscB = ctx.createOscillator();
  oscA.type = "sawtooth";
  oscB.type = "sawtooth";
  oscA.frequency.value = freq;
  oscB.frequency.value = freq;
  oscA.detune.value = -7;
  oscB.detune.value = 7;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(6000, freq * 6 + 400);
  lp.Q.value = 0.3;

  const amp = ctx.createGain();
  const peak = Math.max(0.0001, level * 0.05);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.linearRampToValueAtTime(peak, now + durationSec * 0.4);
  amp.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  oscA.connect(lp);
  oscB.connect(lp);
  lp.connect(amp).connect(voiceBus);

  oscA.start(now);
  oscB.start(now);
  oscA.stop(now + durationSec + 0.1);
  oscB.stop(now + durationSec + 0.1);
}

/** Granular shimmer: a tiny grain of a sine high above, soft attack/decay. */
export function playShimmerGrain(
  chain: MasterChain,
  freq: number,
  level: number,
) {
  const { ctx, voiceBus } = chain;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;

  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;

  const amp = ctx.createGain();
  const dur = 0.18 + Math.random() * 0.3;
  const peak = Math.max(0.0001, level * 0.03);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(peak, now + dur * 0.3);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(amp).connect(pan).connect(voiceBus);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

// ---------------------------------------------------------------------------
// The recording, played quietly UNDER the generative voices as a soft seed.
// Returns the source node + a dedicated analyser to read chroma + energy.
// ---------------------------------------------------------------------------
export interface SeedPlayback {
  source: AudioBufferSourceNode;
  seedAnalyser: AnalyserNode;
  seedGain: GainNode;
}

export function startSeedPlayback(
  chain: MasterChain,
  buffer: AudioBuffer,
): SeedPlayback {
  const { ctx, voiceBus } = chain;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const seedGain = ctx.createGain();
  seedGain.gain.value = 0.18; // quietly UNDER the generative voices

  const seedAnalyser = ctx.createAnalyser();
  seedAnalyser.fftSize = 2048;

  source.connect(seedAnalyser);
  seedAnalyser.connect(seedGain).connect(voiceBus);
  source.start();

  return { source, seedAnalyser, seedGain };
}

/** Read RMS energy [0..1-ish] from an analyser via time-domain samples. */
export function readRms(
  analyser: AnalyserNode,
  scratch: Float32Array<ArrayBuffer>,
): number {
  analyser.getFloatTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) {
    const v = scratch[i];
    sum += v * v;
  }
  return Math.sqrt(sum / scratch.length);
}

/**
 * Chroma-fold: read the frequency spectrum, accumulate magnitude into 12
 * pitch-class bins, return them normalized. Used to seed the memory bank from
 * Karel's live recording.
 */
export function readChroma(
  analyser: AnalyserNode,
  freqScratch: Float32Array<ArrayBuffer>,
  sampleRate: number,
): number[] {
  analyser.getFloatFrequencyData(freqScratch); // dB values
  const bins = new Array(12).fill(0);
  const n = freqScratch.length;
  const nyquist = sampleRate / 2;
  for (let i = 1; i < n; i++) {
    const freq = (i / n) * nyquist;
    if (freq < 60 || freq > 4000) continue;
    const db = freqScratch[i];
    const mag = Math.pow(10, db / 20); // dB -> linear
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    bins[pc] += mag;
  }
  const max = Math.max(...bins, 1e-9);
  return bins.map((b) => b / max);
}
