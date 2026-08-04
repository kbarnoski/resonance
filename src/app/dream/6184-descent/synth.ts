// synth.ts — the low-dimensional FM instrument whose parameters descend.
//
// A sine carrier frequency-modulated by a second sine (2-op FM, Chowning
// 1973), through a resonant 2-pole lowpass. FIVE continuous parameters set
// the steady-state timbre; those five are the coordinates the gradient chase
// slides downhill. The SAME model is scored analytically (features.ts) to
// build a live loss landscape and played through Web Audio so you HEAR the
// descent. Keeping the model differentiable-by-finite-difference and cheap is
// the whole point — cf. DDSP (Engel et al. 2020) and ADAC (DAFx26).

/** Continuous synth parameters — the vector the optimizer descends. */
export interface SynthParams {
  /** Carrier fundamental, Hz. */
  f0: number;
  /** Modulator : carrier frequency ratio (inharmonicity / clang). */
  ratio: number;
  /** FM modulation index (how much energy spills into sidebands / brightness). */
  index: number;
  /** Resonant lowpass cutoff, Hz. */
  cutoff: number;
  /** Lowpass resonance Q (peak at cutoff). */
  q: number;
}

/** Number of descended parameters. */
export const DIM = 5;

interface Range {
  min: number;
  max: number;
  log: boolean;
}

/** Search ranges. f0 and cutoff live in log-frequency (perceptually even);
 *  ratio / index / q are linear. */
export const RANGES: Range[] = [
  { min: 90, max: 520, log: true }, // f0
  { min: 0.5, max: 6, log: false }, // ratio
  { min: 0, max: 8, log: false }, // index
  { min: 300, max: 8000, log: true }, // cutoff
  { min: 0.6, max: 7, log: false }, // q
];

const KEYS: (keyof SynthParams)[] = ["f0", "ratio", "index", "cutoff", "q"];

/** Index of the two most timbrally-salient params — the axes of the loss
 *  landscape you watch the point roll across. X = modulator ratio
 *  (inharmonicity), Y = FM index (sideband richness). */
export const AXIS_X = 1; // ratio
export const AXIS_Y = 2; // index

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Map one normalized coord in [0,1] to a real parameter value. */
export function denorm1(i: number, t: number): number {
  const r = RANGES[i];
  const u = clamp01(t);
  if (r.log) {
    const lo = Math.log(r.min);
    const hi = Math.log(r.max);
    return Math.exp(lo + (hi - lo) * u);
  }
  return r.min + (r.max - r.min) * u;
}

/** Map a normalized vector in [0,1]^DIM to real synth parameters. */
export function denorm(vec: Float32Array): SynthParams {
  const out = {} as SynthParams;
  for (let i = 0; i < DIM; i++) out[KEYS[i]] = denorm1(i, vec[i]);
  return out;
}

/* ── Web Audio voice ─────────────────────────────────────────────────────── */

export interface FmVoice {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  filter: BiquadFilterNode;
  amp: GainNode;
  pan: StereoPannerNode;
}

/** Build a persistent FM voice wired mod→carrier.frequency,
 *  carrier→filter→amp→pan→dest. Oscillators start immediately (silent, amp 0)
 *  so parameter glides never re-trigger — you hear a continuous slide. */
export function buildFmVoice(
  ac: AudioContext,
  dest: AudioNode,
  panValue: number,
): FmVoice {
  const carrier = ac.createOscillator();
  const mod = ac.createOscillator();
  const modGain = ac.createGain();
  const filter = ac.createBiquadFilter();
  const amp = ac.createGain();
  const pan = ac.createStereoPanner();
  carrier.type = "sine";
  mod.type = "sine";
  filter.type = "lowpass";
  modGain.gain.value = 0;
  amp.gain.value = 0;
  pan.pan.value = panValue;
  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(filter);
  filter.connect(amp);
  amp.connect(pan);
  pan.connect(dest);
  carrier.start();
  mod.start();
  return { carrier, mod, modGain, filter, amp, pan };
}

/** Glide a sustained voice toward new parameters without re-triggering — the
 *  audible manifestation of one descent step. Short time-constants keep it
 *  smooth (no zipper), long enough to read as a slide. */
export function setFmParams(
  v: FmVoice,
  p: SynthParams,
  now: number,
  glide = 0.08,
): void {
  const fm = p.f0 * p.ratio;
  v.carrier.frequency.setTargetAtTime(p.f0, now, glide);
  v.mod.frequency.setTargetAtTime(fm, now, glide);
  v.modGain.gain.setTargetAtTime(p.index * fm, now, glide);
  v.filter.frequency.setTargetAtTime(p.cutoff, now, glide);
  v.filter.Q.setTargetAtTime(p.q, now, glide);
}

/** Fade a voice's level smoothly toward `level`. */
export function setLevel(v: FmVoice, level: number, now: number): void {
  v.amp.gain.setTargetAtTime(Math.max(0.0001, level), now, 0.12);
}

/** Tear down a voice's nodes. */
export function disposeFmVoice(v: FmVoice): void {
  try {
    v.carrier.stop();
    v.mod.stop();
  } catch {
    /* already stopped */
  }
  v.carrier.disconnect();
  v.mod.disconnect();
  v.modGain.disconnect();
  v.filter.disconnect();
  v.amp.disconnect();
  v.pan.disconnect();
}
