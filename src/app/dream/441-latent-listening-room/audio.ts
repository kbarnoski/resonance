// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — generative ambient/cinematic pad + arpeggio synthesizer for
// "Latent Listening Room". Runs entirely in-browser via Web Audio API —
// no file upload, no mic.
//
// Architecture:
//   Oscillator bank (pads + arpeggio) → reverb send → master compressor/limiter
//   Each chord lasts 15-25 s; the arpeggios walk the chord tones in slow triplets.
//   An AnalyserNode is tapped for spectral analysis (FFT 2048).
//   Image feedback bends: filter cutoff, reverb wet, shimmer depth.
// ─────────────────────────────────────────────────────────────────────────────

// Chord progression — expressive equal-temperament chromatic palette
// (NOT just-intonation / pure-ratio — tuning is standard 12-TET throughout)
// Each chord is [root(Hz), ...additional tones in stack]
// Using cinematic minor / modal / chromatic motion
export const CHORDS: Array<{ hz: number[]; name: string }> = [
  { hz: [138.59, 174.61, 220.00, 261.63, 329.63], name: "C#m9" },
  { hz: [155.56, 195.99, 246.94, 293.66, 369.99], name: "Eb m7" },
  { hz: [130.81, 164.81, 207.65, 261.63, 311.13], name: "C maj9(#11)" },
  { hz: [146.83, 185.00, 233.08, 293.66, 349.23], name: "D m(maj7)" },
  { hz: [123.47, 155.56, 196.00, 246.94, 311.13], name: "Bm9" },
  { hz: [138.59, 164.81, 207.65, 261.63, 329.63], name: "C#m(maj9)" },
  { hz: [146.83, 174.61, 220.00, 277.18, 349.23], name: "Dm(add11)" },
  { hz: [130.81, 155.56, 196.00, 246.94, 311.13], name: "C6/9" },
];

export interface SpectralFrame {
  /** Overall energy 0-1 (smoothed RMS) */
  energy: number;
  /** Spectral centroid 0-1 (0=dark/bass, 1=bright/treble) */
  centroid: number;
  /** Dominant pitch-class 0-11 (A=0…G#=11) */
  pitchClass: number;
  /** Raw band energies (8 bands, each 0-1) */
  bands: number[];
  /** Current chord name */
  chordName: string;
  /** Chord index 0-7 */
  chordIndex: number;
}

export interface AudioEngine {
  ctx: AudioContext;
  analyser: AnalyserNode;
  /** Call once per animation frame to get current spectral state. */
  readFrame: () => SpectralFrame;
  /** Apply image color feedback: brightness [0-1], hue [0-360], warmth [0-1]. */
  applyImageFeedback: (brightness: number, hue: number, warmth: number) => void;
  /** Fully stop and clean up. */
  stop: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FFT_SIZE = 2048;
const CHORD_MIN_S = 15;
const CHORD_MAX_S = 25;
const ARP_INTERVAL_S = 0.38; // arpeggiation step period (slightly irregular)
const SAMPLERATE = 44100;

// ── Offline buffer helpers ────────────────────────────────────────────────────

/** Create a reverb impulse response via exponentially decaying noise. */
function buildReverb(ctx: AudioContext | OfflineAudioContext, decaySec: number): AudioBuffer {
  const len = Math.floor(SAMPLERATE * decaySec);
  const buf = ctx.createBuffer(2, len, SAMPLERATE);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  return buf;
}

// ── Main entry: build live audio engine ──────────────────────────────────────

export function buildAudioEngine(): AudioEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new AC();

  // ── Analyser ──────────────────────────────────────────────────────────────
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.72;
  const freqBuf = new Uint8Array(analyser.frequencyBinCount);

  // ── Master chain ──────────────────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;

  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type = "lowpass";
  masterFilter.frequency.value = 3800;
  masterFilter.Q.value = 0.5;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  masterGain.connect(masterFilter);
  masterFilter.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  // ── Reverb ────────────────────────────────────────────────────────────────
  const reverb = ctx.createConvolver();
  reverb.buffer = buildReverb(ctx, 4.5);
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0.52;
  const reverbDry = ctx.createGain();
  reverbDry.gain.value = 0.76;
  reverb.connect(reverbWet);
  reverbWet.connect(masterGain);
  reverbDry.connect(masterGain);

  // source signal feeds both dry and reverb
  const preFx = ctx.createGain();
  preFx.gain.value = 1.0;
  preFx.connect(reverbDry);
  preFx.connect(reverb);

  // ── Shimmer layer (high-freq sparkle, subtle) ─────────────────────────────
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0;
  const shimmerFilter = ctx.createBiquadFilter();
  shimmerFilter.type = "highpass";
  shimmerFilter.frequency.value = 3000;
  shimmerGain.connect(shimmerFilter);
  shimmerFilter.connect(masterGain);

  // ── Pads: detuned sawtooth/triangle stacks ────────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0; // fades in
  padGain.connect(preFx);
  padGain.connect(shimmerGain);

  const padOscs: OscillatorNode[] = [];

  function buildPad(chordHz: number[]): void {
    // Stop old pads with a quick fade
    const t = ctx.currentTime;
    padGain.gain.cancelScheduledValues(t);
    padGain.gain.setValueAtTime(padGain.gain.value, t);
    padGain.gain.linearRampToValueAtTime(0.0, t + 1.0);
    const oldOscs = padOscs.splice(0);
    setTimeout(() => {
      for (const o of oldOscs) {
        try { o.stop(); } catch { /* already stopped */ }
        try { o.disconnect(); } catch { /* ignore */ }
      }
    }, 1200);

    // Build new pads after the fade
    setTimeout(() => {
      const now = ctx.currentTime;
      for (const hz of chordHz) {
        const voiceCount = hz > 220 ? 2 : 3; // fewer voices for higher notes
        for (let v = 0; v < voiceCount; v++) {
          const osc = ctx.createOscillator();
          osc.type = v === 0 ? "sawtooth" : v === 1 ? "triangle" : "sine";
          osc.frequency.value = hz * (v === 2 ? 2 : 1); // octave doubler on voice 2
          osc.detune.value = (v === 0 ? -7 : v === 1 ? 8 : -3) + (Math.random() - 0.5) * 4;
          const vg = ctx.createGain();
          vg.gain.value = v === 0 ? 0.06 : v === 1 ? 0.05 : 0.03;
          osc.connect(vg);
          vg.connect(padGain);
          osc.start(now);
          padOscs.push(osc);
        }
      }
      padGain.gain.cancelScheduledValues(now);
      padGain.gain.setValueAtTime(0.0, now);
      padGain.gain.linearRampToValueAtTime(0.55, now + 2.0);
    }, 1100);
  }

  // ── Arpeggio: plucked sine/triangle note stream ───────────────────────────
  const arpGain = ctx.createGain();
  arpGain.gain.value = 0.22;
  arpGain.connect(preFx);

  let arpChord: number[] = [];
  let arpStep = 0;
  let arpTimerId: ReturnType<typeof setTimeout> | null = null;
  let arpRunning = false;

  function scheduleArpNote(): void {
    if (!arpRunning || arpChord.length === 0) return;
    const hz = arpChord[arpStep % arpChord.length];
    arpStep++;

    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    o.detune.value = (Math.random() - 0.5) * 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.19, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    o.connect(g);
    g.connect(arpGain);
    o.start(now);
    o.stop(now + 0.5);

    // Slightly vary the interval for organic feel
    const jitter = (Math.random() - 0.5) * 0.06;
    const interval = ARP_INTERVAL_S + jitter;
    arpTimerId = setTimeout(scheduleArpNote, interval * 1000);
  }

  // ── LFO for slow modulation ───────────────────────────────────────────────
  const lfoRate = ctx.createOscillator();
  lfoRate.type = "sine";
  lfoRate.frequency.value = 0.05; // very slow, ~20s cycle
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 180; // ±180 Hz on filter
  lfoRate.connect(lfoDepth);
  lfoDepth.connect(masterFilter.frequency);
  lfoRate.start();

  // ── Chord scheduler ───────────────────────────────────────────────────────
  let chordIndex = 0;
  let chordTimer: ReturnType<typeof setTimeout> | null = null;
  let currentChord = CHORDS[0];

  function scheduleNextChord(): void {
    const dur = CHORD_MIN_S + Math.random() * (CHORD_MAX_S - CHORD_MIN_S);
    currentChord = CHORDS[chordIndex % CHORDS.length];
    arpChord = [...currentChord.hz];
    arpStep = 0; // restart arp pattern on chord change
    buildPad(currentChord.hz);
    chordIndex++;
    chordTimer = setTimeout(scheduleNextChord, dur * 1000);
  }

  // ── Spectral analysis ──────────────────────────────────────────────────────
  let smoothEnergy = 0;
  let smoothCentroid = 0.35;
  const smoothBands = new Array(8).fill(0);

  function readFrame(): SpectralFrame {
    analyser.getByteFrequencyData(freqBuf);
    const binCount = freqBuf.length;
    const nyquist = ctx.sampleRate / 2;
    const binHz = nyquist / binCount;

    // 8 logarithmically-spaced bands: 20-80, 80-200, 200-500, 500-1k, 1k-2k, 2k-5k, 5k-10k, 10k-20k
    const bandEdges = [20, 80, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const rawBands: number[] = [];
    for (let b = 0; b < 8; b++) {
      const loHz = bandEdges[b];
      const hiHz = Math.min(bandEdges[b + 1], nyquist);
      const loBin = Math.max(0, Math.floor(loHz / binHz));
      const hiBin = Math.min(binCount - 1, Math.ceil(hiHz / binHz));
      let sum = 0;
      let count = 0;
      for (let i = loBin; i <= hiBin; i++) {
        sum += freqBuf[i] / 255;
        count++;
      }
      rawBands.push(count > 0 ? sum / count : 0);
    }

    // Smooth bands
    for (let i = 0; i < 8; i++) {
      smoothBands[i] = smoothBands[i] * 0.8 + rawBands[i] * 0.2;
    }

    // RMS energy
    let rms = 0;
    for (const v of smoothBands) rms += v * v;
    rms = Math.sqrt(rms / 8);
    smoothEnergy = smoothEnergy * 0.88 + rms * 0.12;

    // Spectral centroid
    let centNum = 0;
    let centDen = 0;
    for (let i = 0; i < binCount; i++) {
      const mag = freqBuf[i] / 255;
      const hz = i * binHz;
      centNum += mag * hz;
      centDen += mag;
    }
    const rawCentroid = centDen > 0.001 ? Math.min(1, centNum / centDen / 5000) : 0.35;
    smoothCentroid = smoothCentroid * 0.92 + rawCentroid * 0.08;

    // Dominant pitch-class via chromagram (simplified)
    // Map high-energy bins to nearest pitch-class
    const pitchAccum = new Float32Array(12);
    for (let i = 1; i < binCount; i++) {
      const hz = i * binHz;
      if (hz < 80 || hz > 4000) continue;
      const midi = 12 * Math.log2(hz / 440) + 69;
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      pitchAccum[pc] += freqBuf[i] / 255;
    }
    let maxPc = 0;
    let maxV = -1;
    for (let i = 0; i < 12; i++) {
      if (pitchAccum[i] > maxV) {
        maxV = pitchAccum[i];
        maxPc = i;
      }
    }

    return {
      energy: smoothEnergy,
      centroid: smoothCentroid,
      pitchClass: maxPc,
      bands: [...smoothBands],
      chordName: currentChord.name,
      chordIndex: (chordIndex - 1 + CHORDS.length) % CHORDS.length,
    };
  }

  // ── Image feedback ─────────────────────────────────────────────────────────
  function applyImageFeedback(brightness: number, hue: number, warmth: number): void {
    const t = ctx.currentTime;

    // brighter image → open the master lowpass
    const targetCutoff = 1800 + brightness * 5000;
    masterFilter.frequency.cancelScheduledValues(t);
    masterFilter.frequency.setValueAtTime(masterFilter.frequency.value, t);
    masterFilter.frequency.linearRampToValueAtTime(targetCutoff, t + 1.8);

    // brighter → more shimmer sparkle
    const targetShimmer = brightness * 0.15;
    shimmerGain.gain.cancelScheduledValues(t);
    shimmerGain.gain.setValueAtTime(shimmerGain.gain.value, t);
    shimmerGain.gain.linearRampToValueAtTime(targetShimmer, t + 1.2);

    // warmer hue (reds/oranges 0-60°, 300-360°) → longer reverb tail (gain boost)
    const isWarm = (hue < 60 || hue > 300);
    const warmBoost = isWarm ? warmth * 0.18 : 0;
    const targetRevWet = 0.45 + warmBoost;
    reverbWet.gain.cancelScheduledValues(t);
    reverbWet.gain.setValueAtTime(reverbWet.gain.value, t);
    reverbWet.gain.linearRampToValueAtTime(targetRevWet, t + 2.5);
  }

  // ── Startup ────────────────────────────────────────────────────────────────
  async function start(): Promise<void> {
    await ctx.resume();
    arpRunning = true;
    arpChord = [...CHORDS[0].hz];
    scheduleArpNote();
    scheduleNextChord();
  }
  void start();

  // ── Stop / teardown ────────────────────────────────────────────────────────
  function stop(): void {
    arpRunning = false;
    if (arpTimerId !== null) clearTimeout(arpTimerId);
    if (chordTimer !== null) clearTimeout(chordTimer);
    for (const o of padOscs) {
      try { o.stop(); } catch { /* ignore */ }
    }
    try { lfoRate.stop(); } catch { /* ignore */ }
    ctx.close().catch(() => { /* ignore */ });
  }

  return { ctx, analyser, readFrame, applyImageFeedback, stop };
}
