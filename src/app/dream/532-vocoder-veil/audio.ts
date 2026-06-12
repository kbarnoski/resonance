// audio.ts — Channel vocoder DSP for 532-vocoder-veil
// All logic runs inside the Web Audio API graph (client-side only).

// ─── Band geometry ────────────────────────────────────────────────────────────

/** Number of vocoder bands (log-spaced 120 Hz – 7 kHz). */
export const NUM_BANDS = 16;

/** Low cut frequency (Hz). */
const F_LOW = 120;

/** High cut frequency (Hz). */
const F_HIGH = 7000;

/** Compute log-spaced center frequencies for each band. */
export function makeBandFreqs(): number[] {
  const freqs: number[] = [];
  for (let i = 0; i < NUM_BANDS; i++) {
    const t = i / (NUM_BANDS - 1);
    freqs.push(F_LOW * Math.pow(F_HIGH / F_LOW, t));
  }
  return freqs;
}

/** Q factor for each bandpass filter (higher = narrower). */
export function bandQ(centerHz: number, nextHz: number): number {
  // Q ≈ center / bandwidth, where bandwidth ≈ (next – center) * 0.85
  const bw = (nextHz - centerHz) * 0.85;
  return Math.max(0.5, centerHz / Math.max(bw, 1));
}

// ─── Vowel auto-demo formants ──────────────────────────────────────────────

/**
 * Classic vowel formant pairs [F1, F2] in Hz.
 * Used by the auto-demo modulator when no mic is available.
 */
export const VOWELS: { name: string; f1: number; f2: number }[] = [
  { name: 'ah', f1: 800,  f2: 1200 },
  { name: 'ee', f1: 270,  f2: 2300 },
  { name: 'oh', f1: 570,  f2: 840  },
  { name: 'oo', f1: 300,  f2: 870  },
  { name: 'mm', f1: 280,  f2: 900  },
];

/**
 * Build a per-band energy envelope from vowel formants.
 * Each band gets energy based on Gaussian proximity to the two formants.
 */
export function vowelBandEnvelopes(
  f1: number,
  f2: number,
  freqs: number[],
): number[] {
  return freqs.map((fc) => {
    const logFc = Math.log(fc);
    const logF1 = Math.log(f1);
    const logF2 = Math.log(f2);
    const sigma = 0.35; // spread in log-frequency space
    const e1 = Math.exp(-0.5 * ((logFc - logF1) / sigma) ** 2);
    const e2 = Math.exp(-0.5 * ((logFc - logF2) / sigma) ** 2) * 0.7;
    return Math.min(1, e1 + e2);
  });
}

// ─── Carrier synthesis fallback ────────────────────────────────────────────

/**
 * Build a harmonically-rich synthesized carrier (sawtooth + detuned pulse)
 * for when the piano audio fetch fails.
 */
export function buildSynthCarrier(ctx: AudioContext): AudioNode {
  // Three oscillators: detuned sawtooths + a sub pulse
  const params: Array<{ type: OscillatorType; freq: number; detune: number; gain: number }> = [
    { type: 'sawtooth', freq: 130.81, detune: 0,   gain: 0.28 }, // C3
    { type: 'sawtooth', freq: 196.00, detune: +8,  gain: 0.22 }, // G3
    { type: 'sawtooth', freq: 261.63, detune: -6,  gain: 0.18 }, // C4
    { type: 'sawtooth', freq: 130.81, detune: +14, gain: 0.16 }, // C3 detuned
    { type: 'square',   freq:  65.41, detune: 0,   gain: 0.10 }, // C2 sub
    { type: 'sawtooth', freq: 392.00, detune: -5,  gain: 0.12 }, // G4
  ];

  const carrierGain = ctx.createGain();
  carrierGain.gain.value = 1.0;

  for (const p of params) {
    const osc = ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.value = p.freq;
    osc.detune.value = p.detune;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    osc.connect(g);
    g.connect(carrierGain);
    osc.start();
  }

  // Sibilance noise (broadband high-frequency content for consonants)
  const noiseBuffer = buildNoiseBuffer(ctx, 2);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'highpass';
  noiseFilt.frequency.value = 2800;
  noiseFilt.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.08;
  noiseSource.connect(noiseFilt);
  noiseFilt.connect(noiseGain);
  noiseGain.connect(carrierGain);
  noiseSource.start();

  return carrierGain;
}

/** Build a short white-noise AudioBuffer (seconds). */
export function buildNoiseBuffer(ctx: AudioContext, durationSecs: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * durationSecs);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

// ─── Vocoder graph construction ────────────────────────────────────────────

export interface VocoderBand {
  /** Bandpass on the modulator path. */
  modBP: BiquadFilterNode;
  /** Bandpass on the carrier path. */
  carBP: BiquadFilterNode;
  /**
   * GainNode whose .gain AudioParam is driven by the envelope signal
   * extracted from the modulator band.
   */
  outGain: GainNode;
  /** Envelope smoothing lowpass. */
  envLP: BiquadFilterNode;
}

export interface VocoderGraph {
  bands: VocoderBand[];
  /** Sum/output node — connect to masterGain. */
  output: GainNode;
  /** Carrier input splitter — connect your carrier source here. */
  carrierInput: GainNode;
  /** Modulator input — connect mic or demo source here. */
  modulatorInput: GainNode;
  /** Per-band AnalyserNodes for visualisation. */
  analysers: AnalyserNode[];
  freqs: number[];
}

/**
 * Build the full N-band channel vocoder graph in the given AudioContext.
 * Returns both the graph and a flat list of per-band level read nodes.
 */
export function buildVocoderGraph(ctx: AudioContext): VocoderGraph {
  const freqs = makeBandFreqs();
  const output = ctx.createGain();
  output.gain.value = 1.0;

  const carrierInput = ctx.createGain();
  carrierInput.gain.value = 1.0;

  const modulatorInput = ctx.createGain();
  modulatorInput.gain.value = 1.0;

  // Small bias: ensures unvoiced sounds still pass some carrier signal
  const BIAS = 0.03;

  const bands: VocoderBand[] = [];
  const analysers: AnalyserNode[] = [];

  // Sibilance noise injected into carrier for consonant intelligibility
  const sibilanceNoise = buildNoiseBuffer(ctx, 1.5);
  const sibSrc = ctx.createBufferSource();
  sibSrc.buffer = sibilanceNoise;
  sibSrc.loop = true;
  sibSrc.start();

  const sibHPF = ctx.createBiquadFilter();
  sibHPF.type = 'highpass';
  sibHPF.frequency.value = 3500;
  sibHPF.Q.value = 0.5;
  sibSrc.connect(sibHPF);

  const sibGain = ctx.createGain();
  sibGain.gain.value = 0.04;
  sibHPF.connect(sibGain);
  // sibGain feeds into carrier input path
  sibGain.connect(carrierInput);

  for (let i = 0; i < NUM_BANDS; i++) {
    const fc = freqs[i];
    const nextFc = freqs[Math.min(i + 1, NUM_BANDS - 1)];
    const q = i < NUM_BANDS - 1 ? bandQ(fc, nextFc) : 6.0;

    // ── Modulator path ────────────────────────────────────────────────────
    const modBP = ctx.createBiquadFilter();
    modBP.type = 'bandpass';
    modBP.frequency.value = fc;
    modBP.Q.value = q;
    modulatorInput.connect(modBP);

    // Envelope follower: square the signal (abs approximation) via WaveShaperNode
    const squarer = ctx.createWaveShaper();
    squarer.curve = buildSquareCurve();
    modBP.connect(squarer);

    // Smooth with a lowpass at ~20 Hz to get the amplitude envelope
    const envLP = ctx.createBiquadFilter();
    envLP.type = 'lowpass';
    envLP.frequency.value = 20;
    envLP.Q.value = 0.5;
    squarer.connect(envLP);

    // ── Carrier path ──────────────────────────────────────────────────────
    const carBP = ctx.createBiquadFilter();
    carBP.type = 'bandpass';
    carBP.frequency.value = fc;
    carBP.Q.value = q;
    carrierInput.connect(carBP);

    // Output gain for this band — its .gain is modulated by the envelope
    const outGain = ctx.createGain();
    outGain.gain.value = BIAS;
    carBP.connect(outGain);

    // Connect envelope → gain param (audio-rate modulation)
    envLP.connect(outGain.gain);

    outGain.connect(output);

    // AnalyserNode taps the output of the outGain for visualisation
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    outGain.connect(analyser);
    analysers.push(analyser);

    bands.push({ modBP, carBP, outGain, envLP });
  }

  return { bands, output, carrierInput, modulatorInput, analysers, freqs };
}

/** Build a wave shaper curve that approximates x² (full-wave rectify + square). */
function buildSquareCurve(): Float32Array<ArrayBuffer> {
  const N = 4096;
  const curve = new Float32Array(new ArrayBuffer(N * 4));
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1; // -1 to +1
    curve[i] = x * x; // x² — absolute value squared
  }
  return curve;
}

// ─── Auto-demo modulator ────────────────────────────────────────────────────

export interface DemoModulator {
  /** The output of the demo modulator — connect to vocoderGraph.modulatorInput. */
  output: GainNode;
  /** Stop and clean up the demo. */
  stop: () => void;
}

/**
 * Build an auto-demo modulator that cycles through vowel shapes using
 * oscillators shaped to approximate vowel formant structure.
 * Returns an output gain node to be patched into the vocoder modulator input.
 */
export function buildDemoModulator(ctx: AudioContext): DemoModulator {
  const output = ctx.createGain();
  output.gain.value = 1.0;

  // Carrier oscillator: sawtooth at a singing pitch
  const fundamental = ctx.createOscillator();
  fundamental.type = 'sawtooth';
  fundamental.frequency.value = 196; // G3

  // Add harmonics to make it richer
  const harmonics: OscillatorNode[] = [];
  const harmRatios = [1, 2, 3, 4, 5, 6, 7, 8];
  const harmAmps =   [1, 0.5, 0.33, 0.25, 0.18, 0.14, 0.11, 0.09];

  const oscMix = ctx.createGain();
  oscMix.gain.value = 1.0; // this feeds the modulator path — must be non-zero

  for (let k = 0; k < harmRatios.length; k++) {
    const h = ctx.createOscillator();
    h.type = 'sine';
    h.frequency.value = 196 * harmRatios[k];
    const hg = ctx.createGain();
    hg.gain.value = (harmAmps[k] ?? 0.1) * 0.5;
    h.connect(hg);
    hg.connect(oscMix);
    h.start();
    harmonics.push(h);
  }

  fundamental.connect(oscMix);
  fundamental.start();

  // Formant filters to shape the spectrum into vowel formants
  const f1Filter = ctx.createBiquadFilter();
  f1Filter.type = 'peaking';
  f1Filter.frequency.value = VOWELS[0].f1;
  f1Filter.Q.value = 3;
  f1Filter.gain.value = 12;

  const f2Filter = ctx.createBiquadFilter();
  f2Filter.type = 'peaking';
  f2Filter.frequency.value = VOWELS[0].f2;
  f2Filter.Q.value = 3;
  f2Filter.gain.value = 10;

  oscMix.connect(f1Filter);
  f1Filter.connect(f2Filter);
  f2Filter.connect(output);

  // Cycle through vowels
  let vowelIdx = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const advanceVowel = () => {
    if (stopped || !ctx) return;
    vowelIdx = (vowelIdx + 1) % VOWELS.length;
    const v = VOWELS[vowelIdx];
    const t = ctx.currentTime;
    f1Filter.frequency.setTargetAtTime(v.f1, t, 0.15);
    f2Filter.frequency.setTargetAtTime(v.f2, t, 0.15);
    timer = setTimeout(advanceVowel, 650);
  };

  timer = setTimeout(advanceVowel, 650);

  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    try { fundamental.stop(); } catch { /* noop */ }
    harmonics.forEach(h => { try { h.stop(); } catch { /* noop */ } });
  };

  return { output, stop };
}

// ─── Piano carrier fetch ────────────────────────────────────────────────────

export const PIANO_RECORDING_ID = '549fc519-f7fc-4c38-a771-adaad2edbc81';

/**
 * Fetch and decode Karel's piano recording. Returns decoded AudioBuffer or null.
 * Handles both direct audio response and JSON {url:...} indirection.
 */
export async function fetchPianoBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`);
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') ?? '';
    let arrayBuf: ArrayBuffer;

    if (ct.includes('application/json')) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url);
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }

    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  }
}
