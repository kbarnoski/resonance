// Voice of the murmuration: granular / bowed-glass pings synthesised entirely
// in Web Audio (no assets). Each cluster fires a short glassy harmonic burst —
// warm, transient, NOT a sustained drone. Polyphony is bounded by voice-steal
// so a busy flock never turns to mud.

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

const MAX_VOICES = 10;

export type AudioEngine = {
  ctx: AudioContext;
  now: () => number;
  ping: (midi: number, when: number, brightness: number, pan: number) => void;
  resume: () => Promise<void>;
};

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// A minor-pentatonic set spanning ~3 octaves, low (bottom of frame) to high.
export const SCALE: number[] = (() => {
  const degrees = [0, 3, 5, 7, 10];
  const root = 45; // A2
  const notes: number[] = [];
  for (let oct = 0; oct < 4; oct++) {
    for (const d of degrees) notes.push(root + oct * 12 + d);
  }
  return notes;
})();

function makeReverbImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export function createAudioEngine(): AudioEngine {
  const Ctor =
    window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.85;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  // gentle glassy space
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbImpulse(ctx, 2.4, 3.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  const dry = ctx.createGain();
  dry.gain.value = 0.9;

  master.connect(comp);
  comp.connect(dry).connect(ctx.destination);
  comp.connect(reverb).connect(wet).connect(ctx.destination);

  let active = 0;

  function ping(midi: number, when: number, brightness: number, pan: number) {
    const t = Math.max(when, ctx.currentTime + 0.001);
    if (active >= MAX_VOICES) return; // voice-steal by refusal (cheap + safe)
    active++;

    const f = mtof(midi);
    const bright = Math.min(1, Math.max(0, brightness));

    const voice = ctx.createGain();
    voice.gain.value = 0;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f * (1.6 + bright * 2.4);
    bp.Q.value = 1.4;

    // bowed-glass = fundamental + shimmering upper partials, slightly detuned
    const partials = [1, 2, 3, 4.02];
    const gains = [1, 0.42, 0.22 + bright * 0.2, 0.12 + bright * 0.18];
    const oscs: OscillatorNode[] = [];
    for (let p = 0; p < partials.length; p++) {
      const o = ctx.createOscillator();
      o.type = p === 0 ? "triangle" : "sine";
      o.frequency.value = f * partials[p];
      o.detune.value = (p - 1.5) * 4;
      const g = ctx.createGain();
      g.gain.value = gains[p];
      o.connect(g).connect(bp);
      oscs.push(o);
    }

    // a short noise-grain transient at the attack for the "pluck of glass"
    const grainLen = 0.05;
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * grainLen), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) {
      nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = nb;
    const nhp = ctx.createBiquadFilter();
    nhp.type = "highpass";
    nhp.frequency.value = f * 2;
    const ng = ctx.createGain();
    ng.gain.value = 0.12 + bright * 0.16;
    noise.connect(nhp).connect(ng).connect(voice);

    bp.connect(voice);
    voice.connect(panner).connect(master);

    // envelope — fast bowed attack, exponential glassy decay
    const attack = 0.012 + (1 - bright) * 0.02;
    const decay = 0.9 + bright * 0.8;
    const peak = 0.16 + bright * 0.1;
    voice.gain.setValueAtTime(0.0001, t);
    voice.gain.exponentialRampToValueAtTime(peak, t + attack);
    voice.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);

    for (const o of oscs) {
      o.start(t);
      o.stop(t + attack + decay + 0.05);
    }
    noise.start(t);

    const last = oscs[oscs.length - 1];
    last.onended = () => {
      active = Math.max(0, active - 1);
      voice.disconnect();
    };
  }

  return {
    ctx,
    now: () => ctx.currentTime,
    ping,
    resume: () => ctx.resume(),
  };
}
