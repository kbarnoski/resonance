/**
 * audio.ts — Synth voices for 353-collapse-score
 *
 * Two layered voices per note:
 *   1. Warm FM pad — a sine carrier modulated by a sine at ratio ~2.0
 *      with envelope attack~50ms, release~1.2s
 *   2. Bell / plucked click — a short sine burst at 2× frequency
 *      with near-instant attack and fast exponential decay (~0.4s)
 *
 * A DynamicsCompressor (limiter) sits at the master bus.
 */

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  resume(): Promise<void>;
  playNote(midi: number, velocity?: number): void;
  dispose(): void;
}

/** Convert MIDI note number to frequency (Hz). */
function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudioEngine(): AudioEngine {
  const ctx = new AudioContext();

  // Master gain (keep gentle)
  const master = ctx.createGain();
  master.gain.value = 0.55;

  // Limiter
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  function resume(): Promise<void> {
    if (ctx.state === "suspended") return ctx.resume();
    return Promise.resolve();
  }

  /**
   * Play a warm FM pad + bell click for the given MIDI note.
   * velocity: 0-1
   */
  function playNote(midi: number, velocity = 0.7): void {
    const freq = midiToHz(midi);
    const t = ctx.currentTime;
    const vel = Math.max(0, Math.min(1, velocity));

    // ── Voice 1: FM pad ─────────────────────────────────────────────────────
    // Carrier
    const carOsc = ctx.createOscillator();
    carOsc.type = "sine";
    carOsc.frequency.value = freq;

    // Modulator → carrier frequency
    const modOsc = ctx.createOscillator();
    modOsc.type = "sine";
    modOsc.frequency.value = freq * 2.01; // slight detuning adds warmth

    const modGain = ctx.createGain();
    const modDepth = freq * 0.9 * vel;
    modGain.gain.setValueAtTime(0, t);
    modGain.gain.linearRampToValueAtTime(modDepth, t + 0.06);
    modGain.gain.exponentialRampToValueAtTime(modDepth * 0.3, t + 0.4);
    modGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);

    modOsc.connect(modGain);
    modGain.connect(carOsc.frequency);

    // Carrier envelope
    const padEnv = ctx.createGain();
    padEnv.gain.setValueAtTime(0, t);
    padEnv.gain.linearRampToValueAtTime(0.22 * vel, t + 0.05);
    padEnv.gain.setValueAtTime(0.22 * vel, t + 0.3);
    padEnv.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);

    // Soft lowpass to tame FM harshness
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = Math.min(4000, freq * 6);
    lpf.Q.value = 0.7;

    carOsc.connect(lpf);
    lpf.connect(padEnv);
    padEnv.connect(master);

    // ── Voice 2: Bell click ──────────────────────────────────────────────────
    const bellOsc = ctx.createOscillator();
    bellOsc.type = "sine";
    bellOsc.frequency.value = freq * 4; // upper partial

    const bellEnv = ctx.createGain();
    bellEnv.gain.setValueAtTime(0.14 * vel, t);
    bellEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

    // Second partial for richness
    const bell2 = ctx.createOscillator();
    bell2.type = "sine";
    bell2.frequency.value = freq * 7.1; // inharmonic shimmer

    const bell2Env = ctx.createGain();
    bell2Env.gain.setValueAtTime(0.06 * vel, t);
    bell2Env.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

    bellOsc.connect(bellEnv);
    bellEnv.connect(master);
    bell2.connect(bell2Env);
    bell2Env.connect(master);

    // ── Start / stop ─────────────────────────────────────────────────────────
    const stopT = t + 1.55;
    modOsc.start(t); modOsc.stop(stopT);
    carOsc.start(t); carOsc.stop(stopT);
    bellOsc.start(t); bellOsc.stop(t + 0.5);
    bell2.start(t); bell2.stop(t + 0.3);
  }

  function dispose(): void {
    ctx.close().catch(() => undefined);
  }

  return { ctx, master, limiter, resume, playNote, dispose };
}
