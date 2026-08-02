// ─────────────────────────────────────────────────────────────────────────────
// Tremorsong (5432) — Web Audio sonification engine
//
// Parameter-mapping sonification of real geophysical data:
//   DEPTH     → pitch, quantized to a just-intonation major-pentatonic scale
//               (shallow = high & bright, deep = low & sub — mirrors how deep
//               quakes radiate lower-frequency energy).
//   MAGNITUDE → loudness + decay length + partial richness; a low sub-thump is
//               added for M ≥ 5.
//   LONGITUDE → stereo pan (−1 west … +1 east).
// Every voice is a plucked/struck bell: an inharmonic partial stack with a
// noise-mallet click, decaying exponentially. A soft sustained drone bed keeps
// the space between events alive. Master runs through a limiter, gain ≤ 0.25.
// ─────────────────────────────────────────────────────────────────────────────

// just-intonation major pentatonic ratios, over a 55 Hz (A1) root, ~4 octaves.
const ROOT = 55;
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const SCALE: number[] = [];
for (let oct = 0; oct < 5; oct++) {
  for (const r of RATIOS) SCALE.push(ROOT * Math.pow(2, oct) * r);
}
// SCALE ascends low→high; index 0 = deepest, last = brightest.

const MAX_DEPTH = 650; // km — clamp for the depth→pitch map

/** normalized 0..1 magnitude across the useful M1–M7 window. */
export function magNorm(mag: number): number {
  return Math.max(0, Math.min(1, (mag - 1) / 6));
}

/** depth (km) → a frequency on the pentatonic scale; shallow = high. */
function depthToFreq(depth: number): number {
  const d = Math.max(0, Math.min(1, depth / MAX_DEPTH));
  const idx = Math.round((1 - d) * (SCALE.length - 1));
  return SCALE[idx];
}

export interface SeismicSynth {
  ctx: AudioContext;
  master: GainNode;
  droneGain: GainNode;
  resume(): Promise<void>;
  setDrone(on: boolean): void;
}

export function makeSynth(): SeismicSynth {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  // master chain: master gain → limiter → destination.
  const master = ctx.createGain();
  master.gain.value = 0.24;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── drone bed: two detuned saws through a soft lowpass, faint. ──────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 320;
  droneFilter.Q.value = 0.7;
  droneGain.connect(droneFilter);
  droneFilter.connect(master);
  for (const [freq, detune] of [
    [ROOT, -4],
    [ROOT * 1.5, 5],
    [ROOT * 2, -7],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    o.connect(g);
    g.connect(droneGain);
    o.start();
  }
  // slow shimmer LFO on the drone filter for a living, breathing bed.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain);
  lfoGain.connect(droneFilter.frequency);
  lfo.start();

  return {
    ctx,
    master,
    droneGain,
    async resume() {
      if (ctx.state === "suspended") await ctx.resume();
    },
    setDrone(on: boolean) {
      const t = ctx.currentTime;
      droneGain.gain.cancelScheduledValues(t);
      droneGain.gain.setTargetAtTime(on ? 0.09 : 0.0, t, 0.6);
    },
  };
}

// reusable short noise buffer for the mallet click.
let noiseBuf: AudioBuffer | null = null;
function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  noiseBuf = buf;
  return buf;
}

/**
 * Strike one quake as a bell voice at audio-time `when`.
 * `rand` is a seeded 0..1 jitter so the demo stays deterministic.
 */
export function strikeQuake(
  synth: SeismicSynth,
  quake: { mag: number; depth: number; lon: number },
  when: number,
  rand: number,
): void {
  const { ctx, master } = synth;
  const m = magNorm(quake.mag);
  const freq = depthToFreq(quake.depth) * (1 + (rand - 0.5) * 0.004);

  // bigger quakes: louder, longer, richer.
  const peak = 0.12 + m * 0.5;
  const decay = 0.6 + m * 3.2; // seconds
  const pan = Math.max(-1, Math.min(1, quake.lon / 180));

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  const voice = ctx.createGain();
  voice.gain.value = 0;
  voice.connect(panner);
  panner.connect(master);

  // inharmonic partial stack — struck-metal / marimba character.
  const partials = quake.mag >= 4 ? [1, 2.01, 2.76, 3.94] : [1, 2.0, 3.01];
  partials.forEach((mult, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "triangle" : "sine";
    o.frequency.value = freq * mult;
    const g = ctx.createGain();
    const level = (i === 0 ? 1 : 0.5 / (i + 1)) * peak;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay / (1 + i * 0.5));
    o.connect(g);
    g.connect(voice);
    o.start(when);
    o.stop(when + decay + 0.1);
  });
  // voice envelope gate (fully open — partials carry their own decay).
  voice.gain.setValueAtTime(1, when);

  // noise mallet click.
  const nsrc = ctx.createBufferSource();
  nsrc.buffer = getNoise(ctx);
  const nfilt = ctx.createBiquadFilter();
  nfilt.type = "bandpass";
  nfilt.frequency.value = Math.min(6000, freq * 8);
  nfilt.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.25 * peak, when);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
  nsrc.connect(nfilt);
  nfilt.connect(ng);
  ng.connect(panner);
  nsrc.start(when);
  nsrc.stop(when + 0.12);

  // sub-thump for the big ones (M ≥ 5).
  if (quake.mag >= 5) {
    const sub = ctx.createOscillator();
    sub.type = "sine";
    const subF = 44 + m * 24;
    sub.frequency.setValueAtTime(subF * 1.6, when);
    sub.frequency.exponentialRampToValueAtTime(subF, when + 0.4);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, when);
    sg.gain.linearRampToValueAtTime(0.5 * peak, when + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0001, when + 1.2 + m);
    sub.connect(sg);
    sg.connect(panner);
    sub.start(when);
    sub.stop(when + 2.6 + m);
  }
}
