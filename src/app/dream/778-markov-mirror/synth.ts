// synth.ts — warm triangle+sine ADSR piano voice with reverb bus

export interface SynthVoice {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  reverbGain: GainNode;
  reverbDelay: DelayNode;
}

export function buildSynth(ctx: AudioContext): SynthVoice {
  // Master chain: gain → lowpass → compressor → destination
  const master = ctx.createGain();
  master.gain.value = 0.28;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 6800;
  lowpass.Q.value = 0.7;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 10;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.15;

  master.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(ctx.destination);

  // Algorithmic reverb bus: a multi-tap delay network fed back lightly
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.22;

  const reverbDelay = ctx.createDelay(2.0);
  reverbDelay.delayTime.value = 0.035;

  const reverbFeedback = ctx.createGain();
  reverbFeedback.gain.value = 0.38;

  const reverbLP = ctx.createBiquadFilter();
  reverbLP.type = "lowpass";
  reverbLP.frequency.value = 3000;

  // Reverb routing: reverbGain → reverbDelay → reverbLP → feedback → reverbDelay (loop)
  // and also reverbLP → master
  reverbGain.connect(reverbDelay);
  reverbDelay.connect(reverbLP);
  reverbLP.connect(reverbFeedback);
  reverbFeedback.connect(reverbDelay);
  reverbLP.connect(master);

  return { ctx, master, lowpass, compressor, reverbGain, reverbDelay };
}

export interface PlayNoteOptions {
  midi: number;
  when: number;        // AudioContext time
  duration?: number;   // seconds, default 0.55
  velocity?: number;   // 0..1, default 0.7
  isBass?: boolean;    // bass notes slightly different tone
}

export function playNote(synth: SynthVoice, opts: PlayNoteOptions): void {
  const { ctx, master, reverbGain } = synth;
  const { midi, when, duration = 0.55, velocity = 0.7, isBass = false } = opts;

  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = velocity * 0.6;

  // Triangle oscillator (primary warm body)
  const tri = ctx.createOscillator();
  tri.type = "triangle";
  tri.frequency.value = freq;

  // Sine at octave below for warmth (piano fundamental reinforcement)
  const sine = ctx.createOscillator();
  sine.type = "sine";
  sine.frequency.value = isBass ? freq * 0.5 : freq;

  // Per-voice envelope gain
  const envGain = ctx.createGain();
  envGain.gain.setValueAtTime(0, when);
  envGain.gain.linearRampToValueAtTime(peak, when + 0.012);     // attack
  envGain.gain.setTargetAtTime(peak * 0.55, when + 0.012, 0.08); // decay
  envGain.gain.setTargetAtTime(0, when + duration * 0.7, 0.12);  // release

  // Mix: 70% triangle, 30% sine
  const triGain = ctx.createGain();
  triGain.gain.value = 0.7;
  const sineGain = ctx.createGain();
  sineGain.gain.value = 0.3;

  tri.connect(triGain);
  sine.connect(sineGain);
  triGain.connect(envGain);
  sineGain.connect(envGain);

  envGain.connect(master);
  envGain.connect(reverbGain); // send to reverb bus

  const stop = when + duration + 0.35;
  tri.start(when);
  tri.stop(stop);
  sine.start(when);
  sine.stop(stop);
}

export function teardownSynth(synth: SynthVoice): void {
  try {
    synth.master.disconnect();
    synth.lowpass.disconnect();
    synth.compressor.disconnect();
    synth.reverbGain.disconnect();
    synth.reverbDelay.disconnect();
  } catch {
    // ignore — already disconnected
  }
}
