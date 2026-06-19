// audio.ts — Tape Erosion · Karel's real piano recording + fallback synth
// Routes everything through a shared AnalyserNode for the WebGL spectrogram.
// CLIENT-SIDE ONLY. Reads an existing public GET route; nothing is recorded or sent.

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

// ─── Fetch Karel's recording ──────────────────────────────────────────────────
export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, { signal: controller.signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else { arrayBuf = await res.arrayBuffer(); }
    return await ctx.decodeAudioData(arrayBuf);
  } catch { return null; } finally { clearTimeout(timer); }
}

// ─── Fallback synthesis ───────────────────────────────────────────────────────
// Renders ~12s of a soft, detuned piano-ish arpeggio offline so audio
// is NEVER empty when the live recording cannot be fetched.
export async function renderFallbackBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer> {
  const SR = 44100;
  const DURATION = 12;
  const offline = new OfflineAudioContext(2, SR * DURATION, SR);

  // Detuned chord: C3 E3 G3 B3 D4 (rich piano-ish voicing)
  const baseFreqs = [130.81, 164.81, 196.00, 246.94, 293.66];
  const detune = [0, 3, -4, 7, -2]; // cents detune for warmth

  for (let v = 0; v < baseFreqs.length; v++) {
    const freqHz = baseFreqs[v] * Math.pow(2, detune[v] / 1200);

    // Fundamental + 3 harmonics with gentle roll-off
    for (let h = 1; h <= 4; h++) {
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freqHz * h;

      const gain = offline.createGain();
      const peak = 0.15 / h;
      // Slow attack (arpeggiate entry)
      const entryT = v * 0.45;
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(peak, entryT + 0.35);
      // Long sustain then fade for looping feel
      gain.gain.setValueAtTime(peak, DURATION - 2.5);
      gain.gain.linearRampToValueAtTime(0, DURATION);

      osc.connect(gain);
      gain.connect(offline.destination);
      osc.start(entryT);
      osc.stop(DURATION);
    }
  }

  // Soft sub-bass drone
  const drone = offline.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 65.41; // C2
  const droneGain = offline.createGain();
  droneGain.gain.value = 0.08;
  drone.connect(droneGain);
  droneGain.connect(offline.destination);
  drone.start(0);
  drone.stop(DURATION);

  const rendered = await offline.startRendering();

  // Copy into a regular AudioBuffer if sample rates differ
  if (rendered.sampleRate === ctx.sampleRate) return rendered;
  const buf = ctx.createBuffer(
    rendered.numberOfChannels,
    rendered.length,
    rendered.sampleRate,
  );
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    buf.copyToChannel(rendered.getChannelData(c), c);
  }
  return buf;
}

// ─── Tape-erosion audio engine ────────────────────────────────────────────────
export interface ErosionParams {
  /** Grain playback rate drift (0 = no drift, 1 = heavy) */
  rateDrift: number;
  /** Low-pass cutoff Hz (200–20000) */
  lpCutoff: number;
  /** Dropout probability per grain trigger (0–1) */
  dropoutProb: number;
  /** Reverb wet mix (0–1) */
  reverbWet: number;
  /** Grain density: grains per second */
  grainDensity: number;
  /** Master gain multiplier (0–1) */
  masterGain: number;
}

export interface ErosionEngine {
  analyser: AnalyserNode;
  setParams(p: ErosionParams): void;
  dispose(): void;
}

function makeConvolutionReverb(ctx: AudioContext, durationSec: number): ConvolverNode {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * durationSec);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * durationSec * 0.3));
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

export function buildErosionEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
): ErosionEngine {
  // ── Nodes ─────────────────────────────────────────────────────────────────
  const masterGainNode = ctx.createGain();
  masterGainNode.gain.value = 0.7;

  const lpFilter = ctx.createBiquadFilter();
  lpFilter.type = "lowpass";
  lpFilter.frequency.value = 8000;
  lpFilter.Q.value = 0.8;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;

  const reverb = makeConvolutionReverb(ctx, 4.5);

  // Dry/wet for reverb
  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.85;
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.15;

  // Sub-bass drone so there is ALWAYS some signal
  const droneOsc = ctx.createOscillator();
  droneOsc.type = "sine";
  droneOsc.frequency.value = 65.41; // C2
  const droneGainNode = ctx.createGain();
  droneGainNode.gain.value = 0.04;
  droneOsc.connect(droneGainNode);
  droneGainNode.connect(masterGainNode);
  droneOsc.start();

  // ── Routing ───────────────────────────────────────────────────────────────
  // grainBus → lpFilter → dryGain → masterGainNode → analyser → dest
  //                     → wetGain → reverb → masterGainNode
  const grainBus = ctx.createGain();
  grainBus.gain.value = 1;
  grainBus.connect(lpFilter);
  lpFilter.connect(dryGain);
  lpFilter.connect(wetGain);
  dryGain.connect(masterGainNode);
  wetGain.connect(reverb);
  reverb.connect(masterGainNode);
  masterGainNode.connect(analyser);
  analyser.connect(ctx.destination);

  // ── Grain scheduler ───────────────────────────────────────────────────────
  let currentParams: ErosionParams = {
    rateDrift: 0,
    lpCutoff: 8000,
    dropoutProb: 0,
    reverbWet: 0.15,
    grainDensity: 6,
    masterGain: 0.7,
  };

  const bufDuration = buffer.duration;
  let scrubPos = 0;
  let scrubRate = 1.0;
  let lastGrainTime = 0;
  let startAudioTime = 0;

  let rafId = 0;

  function scheduleGrains() {
    const now = ctx.currentTime;
    if (lastGrainTime === 0) {
      lastGrainTime = now;
      startAudioTime = now;
    }

    const elapsed = now - startAudioTime;
    // Very slowly scrub through the recording (2–4 minutes to traverse full buffer)
    scrubPos = (elapsed * scrubRate * 0.4) % bufDuration;

    const interval = 1 / Math.max(1, currentParams.grainDensity);
    const lookahead = 0.15;

    while (lastGrainTime < now + lookahead) {
      if (Math.random() > currentParams.dropoutProb) {
        const offset = scrubPos + (Math.random() - 0.5) * 0.8;
        const clampedOffset = Math.max(0, Math.min(bufDuration - 0.15, offset));
        const grainDur = 0.08 + Math.random() * 0.06; // 80–140ms

        // Rate drift: 1 ± rateDrift*0.15
        const rate = 1 + (Math.random() * 2 - 1) * currentParams.rateDrift * 0.15;

        try {
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.playbackRate.value = rate;

          const env = ctx.createGain();
          env.gain.setValueAtTime(0, lastGrainTime);
          env.gain.linearRampToValueAtTime(0.6, lastGrainTime + grainDur * 0.1);
          env.gain.setValueAtTime(0.6, lastGrainTime + grainDur * 0.9);
          env.gain.linearRampToValueAtTime(0, lastGrainTime + grainDur);

          src.connect(env);
          env.connect(grainBus);
          src.start(lastGrainTime, clampedOffset, grainDur);
        } catch {
          // ignore grain scheduling errors (e.g. context closed)
        }
      }
      lastGrainTime += interval;
    }
  }

  function tick() {
    scheduleGrains();
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  function setParams(p: ErosionParams) {
    currentParams = p;
    scrubRate = 1 + p.rateDrift * 0.4;

    lpFilter.frequency.setTargetAtTime(
      Math.max(200, Math.min(20000, p.lpCutoff)),
      ctx.currentTime,
      0.5,
    );

    dryGain.gain.setTargetAtTime(1 - p.reverbWet * 0.8, ctx.currentTime, 0.8);
    wetGain.gain.setTargetAtTime(p.reverbWet * 0.8, ctx.currentTime, 0.8);

    masterGainNode.gain.setTargetAtTime(p.masterGain, ctx.currentTime, 0.3);
  }

  function dispose() {
    cancelAnimationFrame(rafId);
    try {
      droneOsc.stop();
    } catch { /* already stopped */ }
    try {
      droneOsc.disconnect();
      droneGainNode.disconnect();
      grainBus.disconnect();
      lpFilter.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      reverb.disconnect();
      masterGainNode.disconnect();
      analyser.disconnect();
    } catch { /* ignore */ }
  }

  return { analyser, setParams, dispose };
}
