// audio.ts — audio intake, playback, and FFT band analysis.
//
// Three responsibilities:
//   1. Build the built-in generative tape-piano arpeggio (an OfflineAudioContext
//      render → AudioBuffer) so the piece is demoable with zero interaction.
//   2. Decode a dropped/picked file into an AudioBuffer via decodeAudioData.
//   3. Play an AudioBuffer through an AnalyserNode and expose ~8 spectral bands
//      plus an onset/energy estimate each frame.

// ── band layout ────────────────────────────────────────────────────────────────
// 8 logarithmic-ish bands from sub-bass to "air". Edges are in Hz.
export const BAND_EDGES = [20, 60, 150, 350, 800, 1800, 4000, 9000, 18000];
export const NUM_BANDS = BAND_EDGES.length - 1;

export interface AudioFrame {
  bands: Float32Array; // length NUM_BANDS, each 0..~1 (smoothed)
  energy: number; // overall normalised energy 0..1
  onset: boolean; // true on a transient spike this frame
  onsetEnv: number; // decaying onset envelope 0..1
}

// ── built-in piece: generative tape-piano arpeggio ──────────────────────────────
// Synthesised offline. Soft mallet attacks (fast attack, long exponential decay),
// long convolution-free reverb via feedback delays, gentle wow/flutter via a slow
// detune LFO baked into per-note pitch. Warm, evolving, reverberant.

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// A wandering minor/lydian-ish palette that evolves over the piece.
const SCALES: number[][] = [
  [0, 3, 5, 7, 10], // A minor pentatonic-ish
  [0, 2, 3, 7, 9], // dorian colour
  [0, 2, 5, 7, 11], // major7 lydian colour
  [0, 3, 7, 10, 14], // open spread
];

export async function buildBuiltInPiece(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const duration = 48; // seconds, loops seamlessly enough for a demo
  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // Master chain: notes → reverb (parallel delays) → soft master gain → dest.
  const master = ctx.createGain();
  master.gain.value = 0.9;

  // Simple algorithmic reverb: a few feedback comb delays + a lowpass to keep it warm.
  const reverbIn = ctx.createGain();
  reverbIn.gain.value = 0.45;
  const reverbLP = ctx.createBiquadFilter();
  reverbLP.type = "lowpass";
  reverbLP.frequency.value = 3200;
  const combTimes = [0.0297, 0.0371, 0.0411, 0.0437];
  combTimes.forEach((t) => {
    const d = ctx.createDelay(1.0);
    d.delayTime.value = t;
    const fb = ctx.createGain();
    fb.gain.value = 0.78;
    reverbIn.connect(d);
    d.connect(fb);
    fb.connect(d); // feedback loop
    d.connect(reverbLP);
  });
  reverbLP.connect(master);
  master.connect(ctx.destination);

  // dry path
  const dryBus = ctx.createGain();
  dryBus.gain.value = 0.75;
  dryBus.connect(master);
  dryBus.connect(reverbIn);

  // One piano-ish note: two detuned oscillators (a soft triangle + a sine partial)
  // through a per-note lowpass that opens on attack, with an exponential amp decay.
  function playNote(start: number, midi: number, vel: number) {
    const baseHz = midiToHz(midi);
    // wow/flutter: slow random pitch wander baked per note
    const flutter = 1 + (Math.sin(start * 1.7) * 0.0009 + (Math.random() - 0.5) * 0.0012);
    const hz = baseHz * flutter;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(vel, start + 0.012); // soft mallet attack
    const decay = 2.6 + Math.random() * 1.8;
    amp.gain.exponentialRampToValueAtTime(0.0001, start + decay); // long decay

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(Math.min(7000, hz * 8), start);
    tone.frequency.exponentialRampToValueAtTime(Math.max(600, hz * 2.5), start + decay);
    tone.Q.value = 0.6;

    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = hz;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz * 2.001; // octave partial, slightly detuned for shimmer
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;

    o1.connect(tone);
    o2.connect(o2g);
    o2g.connect(tone);
    tone.connect(amp);
    amp.connect(dryBus);

    o1.start(start);
    o2.start(start);
    o1.stop(start + decay + 0.1);
    o2.stop(start + decay + 0.1);
  }

  // Compose: an evolving arpeggio over slowly shifting roots, with occasional
  // low pedal tones for the bass band to breathe.
  let t = 0.4;
  const roots = [45, 48, 43, 50, 41]; // A2, C3, G2, D3, F2
  let phrase = 0;
  while (t < duration - 4) {
    const scale = SCALES[phrase % SCALES.length];
    const root = roots[phrase % roots.length];
    // a low pedal at the phrase start
    playNote(t, root - 12, 0.22);
    const noteCount = 10 + Math.floor(Math.random() * 6);
    const step = (1.6 + Math.random() * 1.2) / noteCount; // a flowing line per phrase
    for (let n = 0; n < noteCount; n++) {
      const deg = scale[Math.floor(Math.random() * scale.length)];
      const oct = 12 * (1 + Math.floor(Math.random() * 2));
      const vel = 0.16 + Math.random() * 0.18;
      playNote(t + n * step + (Math.random() - 0.5) * 0.01, root + deg + oct, vel);
      // sparse high glints
      if (Math.random() < 0.25) {
        playNote(t + n * step + step * 0.5, root + deg + oct + 12, vel * 0.45);
      }
    }
    t += noteCount * step + 0.5 + Math.random() * 0.6;
    phrase++;
  }

  return ctx.startRendering();
}

// ── decode user file ─────────────────────────────────────────────────────────────
export async function decodeFile(file: File, ctx: AudioContext): Promise<AudioBuffer> {
  const arr = await file.arrayBuffer();
  // decodeAudioData wants its own copy of the ArrayBuffer.
  return ctx.decodeAudioData(arr.slice(0));
}

// ── player + analyser ────────────────────────────────────────────────────────────
export interface Player {
  start(): void;
  stop(): void;
  getFrame(): AudioFrame;
  ctx: AudioContext;
}

// Build a looping playback graph with an AnalyserNode and a band reader.
export function buildPlayer(ctx: AudioContext, buffer: AudioBuffer): Player {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.78;
  const bins = analyser.frequencyBinCount;
  const freqData = new Uint8Array(bins);
  const nyquist = ctx.sampleRate / 2;

  const out = ctx.createGain();
  out.gain.value = 0.9;
  analyser.connect(out);
  out.connect(ctx.destination);

  let src: AudioBufferSourceNode | null = null;

  // Precompute the bin range for each band.
  const bandBins: Array<[number, number]> = [];
  for (let b = 0; b < NUM_BANDS; b++) {
    const lo = Math.floor((BAND_EDGES[b] / nyquist) * bins);
    const hi = Math.min(bins - 1, Math.ceil((BAND_EDGES[b + 1] / nyquist) * bins));
    bandBins.push([Math.max(0, lo), Math.max(lo + 1, hi)]);
  }

  const bands = new Float32Array(NUM_BANDS);
  const smoothed = new Float32Array(NUM_BANDS);
  let prevEnergy = 0;
  let onsetEnv = 0;

  function start() {
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(analyser);
    src.start();
  }

  function stop() {
    if (src) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
      src = null;
    }
  }

  function getFrame(): AudioFrame {
    analyser.getByteFrequencyData(freqData);
    let energy = 0;
    for (let b = 0; b < NUM_BANDS; b++) {
      const [lo, hi] = bandBins[b];
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += freqData[i];
      const raw = sum / ((hi - lo) * 255); // 0..1
      // perceptual boost for high bands (they're naturally quieter)
      const boost = 1 + b * 0.35;
      bands[b] = Math.min(1, raw * boost);
      // temporal smoothing per band
      smoothed[b] += (bands[b] - smoothed[b]) * 0.35;
      energy += smoothed[b];
    }
    energy = Math.min(1, energy / NUM_BANDS);

    // onset: rising energy edge
    const flux = energy - prevEnergy;
    prevEnergy = energy;
    let onset = false;
    if (flux > 0.06 && energy > 0.12) {
      onsetEnv = Math.min(1, onsetEnv + flux * 3);
      onset = true;
    }
    onsetEnv *= 0.9;

    return { bands: smoothed, energy, onset, onsetEnv };
  }

  return { start, stop, getFrame, ctx };
}
