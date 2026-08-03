// synth.ts — the 2-operator FM patch that the search is trying to become.
//
// A genuinely non-convex little instrument: a sine carrier whose frequency is
// modulated by a second sine (2-op FM, Chowning 1973), fed through a resonant
// 2-pole lowpass, shaped by an AR envelope. Five of its parameters set the
// steady-state timbre and are what the evolutionary strategy optimizes; the
// envelope (attack/release) shapes the audio you hear. The SAME model is used
// three ways: analytically (features.ts) to score thousands of candidates per
// second, and via Web Audio to actually play the best-so-far and the target.

export interface SynthParams {
  /** Carrier fundamental, Hz. */
  f0: number;
  /** Modulator : carrier frequency ratio (drives inharmonicity / clang). */
  ratio: number;
  /** FM modulation index (how much energy spills into sidebands). */
  index: number;
  /** Resonant lowpass cutoff, Hz. */
  cutoff: number;
  /** Lowpass resonance Q (peak at cutoff). */
  q: number;
}

/** Number of searched parameters. */
export const DIM = 5;

interface Range {
  min: number;
  max: number;
  log: boolean;
}

/** Search ranges. f0 and cutoff are searched in log-frequency (perceptually
 *  even); ratio / index / q are linear. */
export const RANGES: Record<keyof SynthParams, Range> = {
  f0: { min: 70, max: 660, log: true },
  ratio: { min: 0.5, max: 7, log: false },
  index: { min: 0, max: 9, log: false },
  cutoff: { min: 260, max: 9000, log: true },
  q: { min: 0.6, max: 8, log: false },
};

const KEYS: (keyof SynthParams)[] = ["f0", "ratio", "index", "cutoff", "q"];

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Map a normalized vector in [0,1]^DIM to real synth parameters. */
export function denorm(vec: number[]): SynthParams {
  const out = {} as SynthParams;
  for (let i = 0; i < DIM; i++) {
    const k = KEYS[i];
    const r = RANGES[k];
    const t = clamp01(vec[i] ?? 0.5);
    let v: number;
    if (r.log) {
      const lo = Math.log(r.min);
      const hi = Math.log(r.max);
      v = Math.exp(lo + (hi - lo) * t);
    } else {
      v = r.min + (r.max - r.min) * t;
    }
    out[k] = v;
  }
  return out;
}

/* ── Web Audio voice (used for A/B playback, not for scoring) ──────────── */

export interface FmVoice {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  filter: BiquadFilterNode;
  amp: GainNode;
}

/** Build one persistent FM voice wired carrier→filter→amp→dest, with the
 *  modulator feeding the carrier's frequency. */
export function buildFmVoice(ac: AudioContext, dest: AudioNode): FmVoice {
  const carrier = ac.createOscillator();
  const mod = ac.createOscillator();
  const modGain = ac.createGain();
  const filter = ac.createBiquadFilter();
  const amp = ac.createGain();
  carrier.type = "sine";
  mod.type = "sine";
  filter.type = "lowpass";
  modGain.gain.value = 0;
  amp.gain.value = 0;
  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(filter);
  filter.connect(amp);
  amp.connect(dest);
  carrier.start();
  mod.start();
  return { carrier, mod, modGain, filter, amp };
}

/** Retune a voice to `p` and trigger a short AR note starting at `now`. */
export function triggerFmVoice(
  v: FmVoice,
  p: SynthParams,
  now: number,
  peak = 0.28,
): void {
  const fm = p.f0 * p.ratio;
  const dev = p.index * fm; // peak frequency deviation
  v.carrier.frequency.setValueAtTime(p.f0, now);
  v.mod.frequency.setValueAtTime(fm, now);
  v.modGain.gain.setTargetAtTime(dev, now, 0.01);
  v.filter.frequency.setTargetAtTime(p.cutoff, now, 0.01);
  v.filter.Q.setTargetAtTime(p.q, now, 0.01);

  const A = 0.012;
  const R = 0.5;
  v.amp.gain.cancelScheduledValues(now);
  v.amp.gain.setValueAtTime(Math.max(0.0001, v.amp.gain.value), now);
  v.amp.gain.linearRampToValueAtTime(peak, now + A);
  v.amp.gain.setTargetAtTime(0.0001, now + A + 0.04, R);
}

/** Glide a sustained voice to new parameters without re-triggering its
 *  envelope — used to morph the best-so-far voice as the search improves,
 *  so you HEAR the timbre converge. */
export function setFmParams(
  v: FmVoice,
  p: SynthParams,
  now: number,
  glide = 0.12,
): void {
  const fm = p.f0 * p.ratio;
  v.carrier.frequency.setTargetAtTime(p.f0, now, glide);
  v.mod.frequency.setTargetAtTime(fm, now, glide);
  v.modGain.gain.setTargetAtTime(p.index * fm, now, glide);
  v.filter.frequency.setTargetAtTime(p.cutoff, now, glide);
  v.filter.Q.setTargetAtTime(p.q, now, glide);
}

/** Silence a voice smoothly. */
export function releaseFmVoice(v: FmVoice, now: number): void {
  v.amp.gain.cancelScheduledValues(now);
  v.amp.gain.setTargetAtTime(0.0001, now, 0.08);
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
}
