// audio.ts — slendro footstep tones for 402-kids-steady-walk
// ────────────────────────────────────────────────────────────
// Slendro is an Indonesian 5-tone gamelan scale with roughly
// equal steps (≈240 cents each) — very different from Western
// pentatonic. Frequencies below approximate one octave of slendro
// anchored to ~196 Hz (G3), then an upper octave.
//
// Root ~196 Hz → [196, 226, 258, 296, 342] (ratio ≈1.00, 1.15, 1.32, 1.51, 1.75)
// Upper octave: [392, 452, 516, 592, 684]

const SLENDRO_LOW = [196, 226, 258, 296, 342];
const SLENDRO_HIGH = [392, 452, 516, 592, 684];
const SLENDRO = [...SLENDRO_LOW, ...SLENDRO_HIGH]; // 10 tones

export interface SteadyAudio {
  playFootstep: (stepIndex: number) => void;
  playHop: () => void;
  playFlower: () => void;
  dispose: () => void;
}

export function createSteadyAudio(): SteadyAudio {
  let ctx: AudioContext | null = null;
  let compressor: DynamicsCompressorNode | null = null;

  function getCtx(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 6;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function masterOut(): AudioNode {
    getCtx();
    return compressor!;
  }

  function playTone(
    freq: number,
    gainPeak: number,
    attackS: number,
    decayS: number,
    type: OscillatorType = "sine"
  ) {
    const c = getCtx();
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, c.currentTime);
    env.gain.linearRampToValueAtTime(gainPeak, c.currentTime + attackS);
    env.gain.exponentialRampToValueAtTime(0.001, c.currentTime + attackS + decayS);
    osc.connect(env);
    env.connect(masterOut());
    osc.start(c.currentTime);
    osc.stop(c.currentTime + attackS + decayS + 0.05);
  }

  return {
    playFootstep(stepIndex: number) {
      const freq = SLENDRO[stepIndex % SLENDRO.length];
      // Soft wooden mallet sound: sine + a touch of triangle for warmth
      playTone(freq, 0.22, 0.005, 0.45, "sine");
      playTone(freq * 2, 0.06, 0.003, 0.18, "triangle");
    },

    playHop() {
      // Rising glide — celebratory
      const c = getCtx();
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(SLENDRO[0], c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(SLENDRO[9], c.currentTime + 0.18);
      env.gain.setValueAtTime(0, c.currentTime);
      env.gain.linearRampToValueAtTime(0.25, c.currentTime + 0.04);
      env.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.55);
      osc.connect(env);
      env.connect(masterOut());
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 0.6);
    },

    playFlower() {
      // Gentle sparkle chord: 3 slendro tones staggered
      [SLENDRO[2], SLENDRO[5], SLENDRO[8]].forEach((f, i) => {
        const c = getCtx();
        const osc = c.createOscillator();
        const env = c.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        const t = c.currentTime + i * 0.06;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.18, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        osc.connect(env);
        env.connect(masterOut());
        osc.start(t);
        osc.stop(t + 0.75);
      });
    },

    dispose() {
      ctx?.close();
      ctx = null;
      compressor = null;
    },
  };
}
