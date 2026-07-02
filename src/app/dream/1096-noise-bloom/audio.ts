// Web Audio graph + Stochastic Resonance (SR) engine for "Noise Bloom".
//
// The buried melody is rendered VERY quietly — on its own it sits at / below
// comfortable audibility. A tunable broadband noise source is added on top.
// The perceptual emergence is modelled explicitly as a resonance curve
// (an inverted-U / Gaussian in the noise-level control): too little noise and
// the signal stays sub-threshold (clarity ~0); at the drifting sweet-spot the
// melody phases into being (clarity ~1); too much noise masks it again.
// `clarity` both nudges the melody's amplitude (so the bloom is unmistakable)
// and drives the visual field.

export interface EngineState {
  /** Noise-level control currently applied to the graph, 0..1. */
  noiseLevel: number;
  /** Perceptual emergence from the resonance curve, 0..1. */
  clarity: number;
  /** The drifting resonance center ("sweet-spot"), 0..1. */
  sweetSpot: number;
  /** Melody onset envelope, gated by clarity, 0..1 (visual pulse). */
  pulse: number;
  running: boolean;
}

export interface NoiseBloomEngine {
  start(): Promise<void>;
  setNoiseLevel(x: number): void;
  getState(): EngineState;
  dispose(): void;
}

const TWO_PI = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// A slow, gentle phrase in D Dorian (D E F G A B C). Loops with small
// variation so minute 3 differs from minute 0.
const PHRASE: { midi: number; beats: number }[] = [
  { midi: 62, beats: 2 }, // D4
  { midi: 65, beats: 1 }, // F4
  { midi: 67, beats: 1 }, // G4
  { midi: 69, beats: 2 }, // A4
  { midi: 72, beats: 1 }, // C5
  { midi: 71, beats: 1 }, // B4
  { midi: 69, beats: 2 }, // A4
  { midi: 67, beats: 2 }, // G4
  { midi: 65, beats: 1 }, // F4
  { midi: 64, beats: 1 }, // E4
  { midi: 62, beats: 3 }, // D4 (breath)
];

/** The stochastic-resonance curve: clarity as a function of noise level.
 *  Inverted-U centered on the drifting sweet-spot, with a hard sub-threshold
 *  floor at very low noise (signal genuinely inaudible until noise arrives). */
function resonanceClarity(noise: number, center: number): number {
  const w = 0.15;
  const d = noise - center;
  const bell = Math.exp(-(d * d) / (2 * w * w));
  // Below ~0.1 noise the signal is sub-threshold regardless of the bell.
  const subThreshold = clamp01(noise / 0.1);
  return clamp01(bell * subThreshold);
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function makeEngine(): NoiseBloomEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let signalBus: GainNode | null = null;
  let noiseGain: GainNode | null = null;
  let noiseSrc: AudioBufferSourceNode | null = null;

  let running = false;
  let schedTimer: number | null = null;

  // Musical clock.
  const beatDur = 0.72;
  let nextNoteTime = 0;
  let phraseIdx = 0;
  let cycle = 0;

  // SR state, refreshed continuously.
  let appliedNoise = 0;
  let clarity = 0;
  let sweetSpot = 0.5;
  let lastOnset = -10;
  let onsetStrength = 0;

  const baseSignal = 0.11; // quiet on purpose — buried below the noise
  const maxNoise = 0.85;

  /** Slowly wandering sweet-spot — the threshold "breathes". */
  function centerAt(t: number): number {
    return 0.5 + 0.08 * Math.sin(t * 0.05) + 0.045 * Math.sin(t * 0.017 + 1.3);
  }

  function refreshSR(t: number) {
    sweetSpot = centerAt(t);
    clarity = resonanceClarity(appliedNoise, sweetSpot);
  }

  function makeNoiseBuffer(context: AudioContext): AudioBuffer {
    const len = Math.floor(context.sampleRate * 2);
    const buf = context.createBuffer(1, len, context.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playNote(midi: number, t: number, dur: number) {
    if (!ctx || !signalBus) return;
    const c = clarity;
    // clarity nudges the buried melody into audibility at the sweet-spot,
    // but keeps it faint elsewhere. Real noise does most of the unmasking.
    const peak = baseSignal * (0.16 + c * 1.2);

    const g = ctx.createGain();
    const atk = 0.32;
    const rel = Math.min(dur * 0.6, 1.1);
    const holdEnd = t + Math.max(atk, dur - rel);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak, holdEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(signalBus);

    const freq = midiToFreq(midi);
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    o1.connect(g);

    // faint octave partial for a soft bell/pad body
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    o2.connect(o2g);
    o2g.connect(g);

    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      o2g.disconnect();
      g.disconnect();
    };

    lastOnset = t;
    onsetStrength = c;
  }

  function nextNote(): { midi: number; beats: number } {
    const base = PHRASE[phraseIdx];
    // deterministic per-cycle variation: occasional octave lift / drop
    const key = (cycle * 7 + phraseIdx * 13) % 11;
    let midi = base.midi;
    if (key === 0) midi += 12;
    else if (key === 5) midi -= 12;
    return { midi, beats: base.beats };
  }

  function advance() {
    phraseIdx++;
    if (phraseIdx >= PHRASE.length) {
      phraseIdx = 0;
      cycle++;
    }
  }

  function scheduler() {
    if (!ctx) return;
    refreshSR(ctx.currentTime);
    while (nextNoteTime < ctx.currentTime + 0.2) {
      const n = nextNote();
      playNote(n.midi, nextNoteTime, n.beats * beatDur);
      nextNoteTime += n.beats * beatDur;
      advance();
    }
  }

  return {
    async start() {
      if (running) return;
      const w = window as WebkitWindow;
      const Ctor = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) throw new Error("no-audiocontext");
      ctx = new Ctor();
      await ctx.resume();

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(limiter);
      limiter.connect(ctx.destination);

      signalBus = ctx.createGain();
      signalBus.gain.value = 1;
      signalBus.connect(master);

      // Broadband noise, gently band-shaped around the melody's region so the
      // stochastic-resonance unmasking is stronger and more musical.
      noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = makeNoiseBuffer(ctx);
      noiseSrc.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 720;
      band.Q.value = 0.6;
      noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;
      noiseSrc.connect(band);
      band.connect(noiseGain);
      noiseGain.connect(master);
      noiseSrc.start();

      nextNoteTime = ctx.currentTime + 0.15;
      phraseIdx = 0;
      cycle = 0;
      running = true;
      schedTimer = window.setInterval(scheduler, 25);
    },

    setNoiseLevel(x: number) {
      appliedNoise = clamp01(x);
      if (ctx) refreshSR(ctx.currentTime);
      if (noiseGain && ctx) {
        const target = Math.pow(appliedNoise, 1.4) * maxNoise;
        noiseGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      }
    },

    getState() {
      if (ctx) refreshSR(ctx.currentTime);
      const now = ctx ? ctx.currentTime : 0;
      const dt = now - lastOnset;
      const pulse = dt >= 0 ? onsetStrength * Math.exp(-dt / 0.7) : 0;
      return {
        noiseLevel: appliedNoise,
        clarity,
        sweetSpot,
        pulse: clamp01(pulse),
        running,
      };
    },

    dispose() {
      if (schedTimer !== null) {
        clearInterval(schedTimer);
        schedTimer = null;
      }
      try {
        noiseSrc?.stop();
      } catch {
        /* already stopped */
      }
      noiseSrc?.disconnect();
      noiseGain?.disconnect();
      signalBus?.disconnect();
      master?.disconnect();
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctx = null;
      running = false;
    },
  };
}

export { TWO_PI, clamp01 };
