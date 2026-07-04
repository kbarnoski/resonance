// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the cavernous stone-cathedral drone.
//
// A just-intonation chord over A1 (55 Hz): root, 9/8, 5/4, 3/2, plus a sub an
// octave below. Every voice is a pair of slightly detuned sine/triangle oscils
// for a slow chorus beat. The mix runs through a lowpass whose cutoff is driven,
// each frame, by the gyroid field / gradient magnitude sampled at the camera —
// so the *architecture you fly through* opens and closes the drone's brightness.
// That geometry→sound coupling is grounded in real physics: gyroid lattices are
// genuine acoustic crystals with topological sound modes (PMC9951337, 2023).
//
// A synthesized noise-burst impulse response (built with OfflineAudioContext)
// feeds a ConvolverNode for a huge stone reverb, and a DynamicsCompressor on the
// master acts as a limiter. Everything is gesture-gated and fully torn down on
// stop().
// ─────────────────────────────────────────────────────────────────────────────

const A1 = 55; // Hz, root of the drone

// Just-intonation ratios above the root (unison, major second, major third, fifth).
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2];

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gain: GainNode;
}

export interface DroneEngine {
  /** Gesture-gated start. Resolves once audio is running. */
  start: () => Promise<void>;
  /** Feed the per-frame field sample from the scene. */
  update: (p: { field: number; gradMag: number }) => void;
  /** Stop all oscillators, disconnect, and close the context. Idempotent. */
  stop: () => void;
  readonly running: boolean;
}

/** Build a synthetic cathedral impulse response (exponential noise decay). */
async function makeImpulse(ctx: BaseAudioContext): Promise<AudioBuffer> {
  const seconds = 4.2;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const offline = new OfflineAudioContext(2, len, rate);

  // A short stereo noise burst...
  const noise = offline.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = noise.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = offline.createBufferSource();
  src.buffer = noise;

  // ...shaped by an exponential decay envelope for a long stone tail.
  const env = offline.createGain();
  env.gain.setValueAtTime(1, 0);
  env.gain.exponentialRampToValueAtTime(0.0001, seconds);

  // Gentle lowpass so the reverb tail is dark and cavernous.
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;

  src.connect(env).connect(lp).connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

export function createDrone(): DroneEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let lowpass: BiquadFilterNode | null = null;
  let subGain: GainNode | null = null;
  let sub: OscillatorNode | null = null;
  const voices: Voice[] = [];
  let running = false;

  const start = async () => {
    if (running) return;
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio API unavailable");
    ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();

    // master → limiter → destination
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 12;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(limiter);

    // reverb send: master also drives a convolver in parallel (wet)
    const wet = ctx.createGain();
    wet.gain.value = 0.85;
    try {
      const convolver = ctx.createConvolver();
      convolver.buffer = await makeImpulse(ctx);
      wet.connect(convolver).connect(limiter);
    } catch {
      // reverb is a luxury; drone still runs dry if IR build fails
    }

    // voice bus → lowpass → (dry master + wet reverb)
    lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 500;
    lowpass.Q.value = 0.7;
    lowpass.connect(master);
    lowpass.connect(wet);

    // sub oscillator (an octave below the root)
    sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = A1 / 2;
    subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    sub.connect(subGain).connect(lowpass);
    sub.start();

    // chord voices, each a detuned pair
    const voiceLevels = [0.9, 0.55, 0.6, 0.7];
    RATIOS.forEach((ratio, i) => {
      const freq = A1 * ratio;
      const g = ctx!.createGain();
      g.gain.value = voiceLevels[i] * 0.5;
      g.connect(lowpass!);

      const oscA = ctx!.createOscillator();
      oscA.type = i === 0 ? "triangle" : "sine";
      oscA.frequency.value = freq;
      oscA.detune.value = -5;

      const oscB = ctx!.createOscillator();
      oscB.type = "sine";
      oscB.frequency.value = freq;
      oscB.detune.value = 5;

      oscA.connect(g);
      oscB.connect(g);
      oscA.start();
      oscB.start();
      voices.push({ oscA, oscB, gain: g });
    });

    // fade the master up gently
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.5, now + 2.5);

    running = true;
  };

  const update = ({ field: f, gradMag }: { field: number; gradMag: number }) => {
    if (!running || !ctx || !lowpass || !subGain) return;
    const now = ctx.currentTime;

    // gradient magnitude (surface "steepness" nearby) opens the filter;
    // |field| (distance from the surface, roughly) tilts it too.
    const cutoff = 180 + gradMag * 820 + Math.abs(f) * 340;
    lowpass.frequency.setTargetAtTime(
      Math.max(120, Math.min(3200, cutoff)),
      now,
      0.18,
    );

    // sub swells when we are deep inside a pore (|field| large)
    const subLevel = 0.35 + Math.min(0.4, Math.abs(f) * 0.3);
    subGain.gain.setTargetAtTime(subLevel, now, 0.3);
  };

  const stop = () => {
    running = false;
    const kill = (o: OscillatorNode | null) => {
      if (!o) return;
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    };
    kill(sub);
    voices.forEach((v) => {
      kill(v.oscA);
      kill(v.oscB);
      v.gain.disconnect();
    });
    voices.length = 0;
    lowpass?.disconnect();
    subGain?.disconnect();
    master?.disconnect();
    sub = null;
    lowpass = null;
    subGain = null;
    master = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
    ctx = null;
  };

  return {
    start,
    update,
    stop,
    get running() {
      return running;
    },
  };
}
