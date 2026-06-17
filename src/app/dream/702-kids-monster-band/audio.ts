// Local Web Audio synthesis for the monster band.
// Every voice is a short, gentle FM / noise burst. No samples, no network.
// Master chain: voices -> lowpass -> compressor -> masterGain (~0.3) -> out.

export type VoiceId = "boom" | "honk" | "pop" | "boing";

export type MonsterAudio = {
  ctx: AudioContext;
  master: GainNode;
  noiseBuf: AudioBuffer;
};

/** One bar of 16 sixteenth-notes at ~96 BPM. */
export const BPM = 96;
export const STEPS = 16;
export const SECONDS_PER_BEAT = 60 / BPM;
export const STEP_DUR = SECONDS_PER_BEAT / 4; // sixteenth note
export const BAR_DUR = STEP_DUR * STEPS;

/** Build the master chain. Must be called from inside a user gesture. */
export function makeAudio(): MonsterAudio {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();

  const master = ctx.createGain();
  master.gain.value = 0.3; // gentle for little ears

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 5200; // shave harshness
  lp.Q.value = 0.4;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  master.connect(lp).connect(comp).connect(ctx.destination);

  // shared short noise buffer for "pop" texture
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  return { ctx, master, noiseBuf };
}

/**
 * Play one monster voice at absolute audio time `t`.
 * `tint` (0..1) nudges pitch a touch so the two monsters sound like siblings,
 * not clones. `gain` scales the bead's loudness.
 */
export function runVoice(
  a: MonsterAudio,
  voice: VoiceId,
  t: number,
  tint: number,
  gain: number,
) {
  const { ctx, master } = a;
  const det = 1 + (tint - 0.5) * 0.12; // +-6% pitch sibling detune

  if (voice === "boom") {
    // belly drum: low FM thump
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150 * det, t);
    o.frequency.exponentialRampToValueAtTime(48 * det, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.34);
    return;
  }

  if (voice === "honk") {
    // silly mouth honk: square-ish FM with quick down-glide
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modG = ctx.createGain();
    const g = ctx.createGain();
    car.type = "triangle";
    mod.type = "sine";
    car.frequency.setValueAtTime(330 * det, t);
    car.frequency.exponentialRampToValueAtTime(225 * det, t + 0.18);
    mod.frequency.value = 110 * det;
    modG.gain.value = 140;
    mod.connect(modG).connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    car.connect(g).connect(master);
    car.start(t);
    mod.start(t);
    car.stop(t + 0.24);
    mod.stop(t + 0.24);
    return;
  }

  if (voice === "pop") {
    // bubble pop: tiny noise burst + blip
    const s = ctx.createBufferSource();
    s.buffer = a.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400 * det;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    s.connect(bp).connect(g).connect(master);
    s.start(t);
    s.stop(t + 0.1);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(700 * det, t);
    o.frequency.exponentialRampToValueAtTime(420 * det, t + 0.06);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.35 * gain, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g2).connect(master);
    o.start(t);
    o.stop(t + 0.09);
    return;
  }

  // boing / squeak: rubbery up-glide
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(240 * det, t);
  o.frequency.exponentialRampToValueAtTime(620 * det, t + 0.09);
  o.frequency.exponentialRampToValueAtTime(300 * det, t + 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4 * gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(lp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.26);
}
