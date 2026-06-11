/**
 * Audio engine for Accord Call.
 *
 * Each voice (yours + peer) is a continuous oscillator with:
 *   - A fundamental sine wave
 *   - 4 additional harmonic overtones (at diminishing amplitude)
 *   - A slow tremolo for organic presence
 *
 * The master chain ends with a DynamicsCompressor brick-wall limiter.
 *
 * iOS note: create this ONLY inside a user gesture (Start button click).
 */

export interface VoiceNodes {
  oscs: OscillatorNode[];
  gains: GainNode[];
  masterGain: GainNode;
  tremoloOsc: OscillatorNode;
  tremoloGain: GainNode;
}

export interface AccordAudio {
  ctx: AudioContext;
  limiter: DynamicsCompressorNode;
  shimmerGain: GainNode; // blooms when consonant
  voiceA: VoiceNodes; // your voice (warm-gold, left-ish)
  voiceB: VoiceNodes; // peer voice (cool-teal, right-ish)
}

const N_HARMONICS = 5; // fundamental + 4 overtones
const HARMONIC_AMPS = [0.6, 0.25, 0.12, 0.06, 0.03];

function buildVoice(
  ctx: AudioContext,
  destination: AudioNode,
  pan: number,
  tremoloRate: number,
): VoiceNodes {
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.35;

  // Tremolo
  const tremoloOsc = ctx.createOscillator();
  tremoloOsc.type = "sine";
  tremoloOsc.frequency.value = tremoloRate;
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.value = 0.04; // very gentle
  tremoloOsc.connect(tremoloGain);

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  for (let k = 0; k < N_HARMONICS; k++) {
    const osc = ctx.createOscillator();
    osc.type = k === 0 ? "sine" : "sine";
    osc.frequency.value = 220; // will be set immediately

    const g = ctx.createGain();
    g.gain.value = HARMONIC_AMPS[k];

    // Route tremolo into each harmonic gain
    tremoloGain.connect(g.gain);

    osc.connect(g);
    g.connect(masterGain);

    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  tremoloOsc.start();

  masterGain.connect(panner);
  panner.connect(destination);

  return { oscs, gains, masterGain, tremoloOsc, tremoloGain };
}

export function createAccordAudio(): AccordAudio {
  const ctx = new AudioContext({ latencyHint: "interactive" });

  // Brick-wall limiter ≈ −6 dB, fast attack
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.connect(ctx.destination);

  // Shimmer pad — a lush reverb-like pad that blooms on consonance
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0; // starts silent

  // Simple shimmer: two slightly detuned sine-wave pairs through a short delay
  const shimmerFreqs = [262, 330, 392, 523];
  for (const sf of shimmerFreqs) {
    const so = ctx.createOscillator();
    so.type = "sine";
    so.frequency.value = sf;
    const sg = ctx.createGain();
    sg.gain.value = 0.08;
    so.connect(sg);
    sg.connect(shimmerGain);
    so.start();
  }
  shimmerGain.connect(limiter);

  const voiceA = buildVoice(ctx, limiter, -0.3, 2.7);
  const voiceB = buildVoice(ctx, limiter, 0.3, 3.1);

  return { ctx, limiter, shimmerGain, voiceA, voiceB };
}

/** Set a voice's fundamental (Hz). All harmonics track. */
export function setVoicePitch(voice: VoiceNodes, freqHz: number, ctx: AudioContext): void {
  const now = ctx.currentTime;
  for (let k = 0; k < voice.oscs.length; k++) {
    const targetFreq = freqHz * (k + 1);
    if (targetFreq < 22000) {
      voice.oscs[k].frequency.setTargetAtTime(Math.min(targetFreq, 21000), now, 0.02);
    }
  }
}

/** Fade shimmer pad in/out based on consonance (0=rough, 1=consonant). */
export function applyConsonance(audio: AccordAudio, consonance: number): void {
  const now = audio.ctx.currentTime;
  // Shimmer blooms softly when consonance is high
  const targetShimmer = consonance * consonance * 0.4;
  audio.shimmerGain.gain.setTargetAtTime(targetShimmer, now, 0.5);

  // Voice gains: pull back slightly when dissonant (adds to the tense feeling)
  const voiceLevel = 0.28 + consonance * 0.12;
  audio.voiceA.masterGain.gain.setTargetAtTime(voiceLevel, now, 0.3);
  audio.voiceB.masterGain.gain.setTargetAtTime(voiceLevel, now, 0.3);
}

export function disposeAccordAudio(audio: AccordAudio): void {
  const disposeVoice = (v: VoiceNodes) => {
    for (const o of v.oscs) {
      try { o.stop(); o.disconnect(); } catch { /* already stopped */ }
    }
    for (const g of v.gains) {
      try { g.disconnect(); } catch { /* ok */ }
    }
    try { v.tremoloOsc.stop(); v.tremoloOsc.disconnect(); } catch { /* ok */ }
    try { v.tremoloGain.disconnect(); } catch { /* ok */ }
    try { v.masterGain.disconnect(); } catch { /* ok */ }
  };
  disposeVoice(audio.voiceA);
  disposeVoice(audio.voiceB);
  try { audio.shimmerGain.disconnect(); } catch { /* ok */ }
  try { audio.limiter.disconnect(); } catch { /* ok */ }
  audio.ctx.close().catch(() => { /* ignore */ });
}
