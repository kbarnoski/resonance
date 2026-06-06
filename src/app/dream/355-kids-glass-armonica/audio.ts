/**
 * audio.ts — Glass armonica synthesis engine
 *
 * Each glass voice is a continuously-excited "singing glass" tone:
 *  - 2 detuned sine partials (fundamental + 3rd partial for glass quality)
 *  - 1 very faint shimmer partial (7th harmonic at low gain)
 *  - A slow LFO on detune gives breathy "wet rim" vibrato
 *  - Amplitude envelope: 200ms attack, 800ms release
 *  - Gentle lowpass so high glasses never pierce
 *
 * More water = lower pitch (physically accurate: more mass → lower resonance).
 *
 * D-Dorian default scale: D3 E3 F3 G3 A3 B3 C4 D4
 * (MIDI 50 52 53 55 57 59 60 62)
 */

export interface GlassVoice {
  /** Currently excited (finger touching / passing over) */
  active: boolean;
  /** Current amplitude 0–1 (driven by envelope) */
  amplitude: number;
  /** Target amplitude (1 if active, 0 if released) */
  targetAmp: number;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  oscShimmer: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  envGain: GainNode;
  lpf: BiquadFilterNode;
}

export interface AudioRig {
  ctx: AudioContext;
  compressor: DynamicsCompressorNode;
  masterGain: GainNode;
  voices: GlassVoice[];
  pad: OscillatorNode[];
  padGain: GainNode;
}

// D-Dorian: D3 E3 F3 G3 A3 B3 C4 D4
const SCALE_MIDI = [50, 52, 53, 55, 57, 59, 60, 62];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Map water level (0=empty → 1=full) to frequency.
 *  More water → lower pitch. Water level is the visible pitch dial.
 *  At water=0 (empty): highest pitch (the scale note).
 *  At water=1 (full):  ~1.6x lower (glass is heavier, slower vibration).
 *  We use a gentle exponential so changes feel musical.
 */
export function waterToHz(baseHz: number, waterLevel: number): number {
  // water adds mass → pitch drops. Ratio up to 1.65x lower.
  const ratio = 1 + waterLevel * 0.65;
  return baseHz / ratio;
}

export function buildRig(numGlasses: number): AudioRig {
  const ctx = new AudioContext();

  // Brick-wall limiter / compressor on master
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.82;

  masterGain.connect(compressor);
  compressor.connect(ctx.destination);

  // Build one voice per glass
  const voices: GlassVoice[] = [];
  for (let i = 0; i < numGlasses; i++) {
    const baseHz = midiToHz(SCALE_MIDI[i] ?? 60);
    const voice = buildVoice(ctx, masterGain, baseHz, 0.5);
    voices.push(voice);
  }

  // Quiet ambient pad — D minor triad, barely audible
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  padGain.connect(masterGain);

  const padMidis = [50, 53, 57]; // D3, F3, A3
  const pad: OscillatorNode[] = padMidis.map((m) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToHz(m);
    osc.connect(padGain);
    osc.start();
    return osc;
  });

  // Fade pad in slowly
  padGain.gain.setTargetAtTime(0.018, ctx.currentTime, 2.5);

  return { ctx, compressor, masterGain, voices, pad, padGain };
}

function buildVoice(
  ctx: AudioContext,
  dest: AudioNode,
  baseHz: number,
  waterLevel: number,
): GlassVoice {
  const freq = waterToHz(baseHz, waterLevel);

  // Slow LFO for vibrato
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 4.8 + Math.random() * 1.2; // 4.8–6 Hz

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = freq * 0.008; // tiny detune ≈ 0.8% of freq

  lfo.connect(lfoGain);

  // Main oscillator (sine for glass purity)
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = freq;
  lfoGain.connect(osc1.frequency);

  // 2nd detuned partial — 3rd harmonic lightly
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = freq * 2.99 + 0.4;
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.07; // very quiet 3rd harmonic
  osc2.connect(osc2Gain);

  // Shimmer partial — 7th harmonic, barely there
  const oscShimmer = ctx.createOscillator();
  oscShimmer.type = "sine";
  oscShimmer.frequency.value = freq * 6.98;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.015;
  oscShimmer.connect(shimmerGain);

  // Envelope gain
  const envGain = ctx.createGain();
  envGain.gain.value = 0;

  // Lowpass — prevents shimmer from getting harsh
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = Math.min(freq * 5.5, 8000);
  lpf.Q.value = 0.8;

  // Wire: osc → envGain → lpf → dest
  osc1.connect(envGain);
  osc2Gain.connect(envGain);
  shimmerGain.connect(envGain);
  envGain.connect(lpf);
  lpf.connect(dest);

  osc1.start();
  osc2.start();
  oscShimmer.start();
  lfo.start();

  return {
    active: false,
    amplitude: 0,
    targetAmp: 0,
    osc1,
    osc2,
    oscShimmer,
    lfo,
    lfoGain,
    envGain,
    lpf,
  };
}

/** Retune a voice's oscillators after water level changes */
export function retuneVoice(
  voice: GlassVoice,
  ctx: AudioContext,
  baseHz: number,
  waterLevel: number,
): void {
  const freq = waterToHz(baseHz, waterLevel);
  const now = ctx.currentTime;
  voice.osc1.frequency.setTargetAtTime(freq, now, 0.08);
  voice.osc2.frequency.setTargetAtTime(freq * 2.99 + 0.4, now, 0.08);
  voice.oscShimmer.frequency.setTargetAtTime(freq * 6.98, now, 0.08);
  voice.lfoGain.gain.setTargetAtTime(freq * 0.008, now, 0.08);
  voice.lpf.frequency.setTargetAtTime(Math.min(freq * 5.5, 8000), now, 0.08);
}

/** Activate a glass (finger touching rim) */
export function activateVoice(voice: GlassVoice, ctx: AudioContext): void {
  if (voice.active) return;
  voice.active = true;
  voice.targetAmp = 1;
  voice.envGain.gain.cancelScheduledValues(ctx.currentTime);
  voice.envGain.gain.setTargetAtTime(0.55, ctx.currentTime, 0.2); // 200ms swell
}

/** Deactivate a glass (finger left rim) */
export function deactivateVoice(voice: GlassVoice, ctx: AudioContext): void {
  if (!voice.active) return;
  voice.active = false;
  voice.targetAmp = 0;
  voice.envGain.gain.cancelScheduledValues(ctx.currentTime);
  voice.envGain.gain.setTargetAtTime(0, ctx.currentTime, 0.9); // 900ms fade
}

export function teardownRig(rig: AudioRig): void {
  for (const v of rig.voices) {
    try {
      v.osc1.stop();
      v.osc2.stop();
      v.oscShimmer.stop();
      v.lfo.stop();
    } catch {
      // already stopped
    }
  }
  for (const p of rig.pad) {
    try { p.stop(); } catch { /* noop */ }
  }
  try { rig.ctx.close(); } catch { /* noop */ }
}

/** Approximate amplitude 0–1 by reading envGain (for CSS glow) */
export function getVoiceAmplitude(voice: GlassVoice): number {
  // envGain.gain.value is not always real-time accurate with scheduled
  // transitions; we track it manually in the component.
  return voice.active ? 1 : 0;
}

export { SCALE_MIDI };
