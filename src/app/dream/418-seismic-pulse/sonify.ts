// sonify.ts — seismic audification engine
// Maps USGS earthquake parameters to abrasive, non-tonal audio events.
// Design: Ryoji Ikeda / AGU "pops booms rumbles" aesthetic — NO scale quantization.

import type { QuakeFeature } from "./data";

export interface AudioEngine {
  ctx: AudioContext;
  master: DynamicsCompressorNode;
  droneGain: GainNode;
  stopDrone: () => void;
}

// ── Build the master audio graph ─────────────────────────────────────────────

export function buildAudioEngine(): AudioEngine {
  const ctx = new AudioContext();

  // Master limiter / compressor — prevents big booms from clipping
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -12;
  master.knee.value = 6;
  master.ratio.value = 20;
  master.attack.value = 0.003;
  master.release.value = 0.25;
  master.connect(ctx.destination);

  // Tectonic drone bed: two slightly-detuned sub oscillators that beat together
  // The beating interval is deliberately irrational (not tuned) — anti-consonance.
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(master);

  const DRONE_FREQ_A = 28.3; // Hz — sub-bass, not a musical pitch
  const DRONE_FREQ_B = 31.7; // Hz — creates ~3.4 Hz beating

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g1 = ctx.createGain();
  const g2 = ctx.createGain();

  // Add slow triangle wave for slight timbral motion
  osc1.type = "triangle";
  osc2.type = "sawtooth";
  osc1.frequency.value = DRONE_FREQ_A;
  osc2.frequency.value = DRONE_FREQ_B;
  g1.gain.value = 0.55;
  g2.gain.value = 0.45;

  osc1.connect(g1);
  osc2.connect(g2);
  g1.connect(droneGain);
  g2.connect(droneGain);
  osc1.start();
  osc2.start();

  function stopDrone() {
    try { osc1.stop(); } catch { /* ignore */ }
    try { osc2.stop(); } catch { /* ignore */ }
  }

  // Fade in the drone
  droneGain.gain.setValueAtTime(0, ctx.currentTime);
  droneGain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 3.0);

  return { ctx, master, droneGain, stopDrone };
}

// ── Map a single quake to sound ───────────────────────────────────────────────
// All frequency choices are data-mapped, not scale-quantized.
// Rules (from the brief):
//   magnitude  → loudness + duration + low-end weight
//   depth      → pitch/filter center (deep=low, shallow=bright)
//   longitude  → stereo pan (-180..+180 → -1..+1)
//   latitude   → filter Q (high-lat = narrower resonance)

export function fireQuakeSound(engine: AudioEngine, quake: QuakeFeature): void {
  const { ctx, master } = engine;
  const now = ctx.currentTime;

  const mag = quake.properties.mag ?? 1.0;
  const [lon, lat, depth] = quake.geometry.coordinates;
  const depthKm = Math.max(1, depth);

  // Pan: direct longitude mapping
  const pan = Math.max(-1, Math.min(1, lon / 180));

  // Filter center frequency: inversely proportional to depth
  // Shallow (1 km) → 2200 Hz; Deep (600 km) → 45 Hz
  // Use log scale for perceptual linearity
  const depthClamped = Math.min(Math.max(depthKm, 1), 700);
  const filterFreq = 2200 * Math.pow(45 / 2200, Math.log(depthClamped) / Math.log(700));

  // Filter Q: latitude-driven (higher abs-lat = more resonant / narrower)
  const q = 0.8 + (Math.abs(lat) / 90) * 6.5;

  // Magnitude-driven parameters
  const magClamped = Math.max(0.5, Math.min(mag, 8.0));
  // Gain: exponential — M6 is much louder than M3
  const gainVal = Math.min(0.9, 0.04 * Math.pow(10, magClamped * 0.22));
  // Duration: M1 → 0.06s; M6+ → 0.8s
  const dur = 0.03 + 0.12 * Math.pow(magClamped / 2.5, 1.8);

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(master);

  // ── 1. Filtered noise burst (always present) ──────────────────────────────
  const bufferSize = Math.ceil(ctx.sampleRate * (dur + 0.1));
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = filterFreq;
  bpf.Q.value = q;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(gainVal, now + 0.004);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  noiseSource.connect(bpf);
  bpf.connect(noiseGain);
  noiseGain.connect(panner);
  noiseSource.start(now);
  noiseSource.stop(now + dur + 0.05);

  // ── 2. Sub-bass boom for M4+ ──────────────────────────────────────────────
  if (magClamped >= 3.5) {
    // Frequency: data-driven, NOT a musical pitch
    // M3.5–8 maps to ~38–65 Hz raw, no scale snapping
    const subFreq = 38 + (magClamped - 3.5) * 5.9;
    const boomDur = dur * 1.4;

    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = subFreq;

    const subGain = ctx.createGain();
    const subGainVal = gainVal * 0.7;
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(subGainVal, now + 0.008);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + boomDur);

    subOsc.connect(subGain);
    subGain.connect(panner);
    subOsc.start(now);
    subOsc.stop(now + boomDur + 0.05);
  }

  // ── 3. High crack for shallow M<2.5 ──────────────────────────────────────
  if (depthClamped < 30 && magClamped < 2.5) {
    // Raw frequency from depth — not a note
    const crackFreq = 800 + (30 - depthClamped) * 28;
    const crackDur = 0.025 + mag * 0.008;

    const crackBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.1), ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackData.length; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.01));
    }

    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = crackFreq;
    hpf.Q.value = 1.2;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(gainVal * 1.3, now);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + crackDur);

    crackSrc.connect(hpf);
    hpf.connect(crackGain);
    crackGain.connect(panner);
    crackSrc.start(now);
    crackSrc.stop(now + crackDur + 0.01);
  }
}
