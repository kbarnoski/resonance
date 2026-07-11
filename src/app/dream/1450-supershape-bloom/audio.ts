/* ── 1450-supershape-bloom · audio DERIVED from the shape ─────────────────────
 *
 *  The played axis is (in)harmonicity, and it is driven by the symmetry number
 *  m — NOT by a fixed consonant scale (that crutch is banned this cycle).
 *
 *  An additive drone of ~9 partials sits over a slow sub. For each partial k
 *  the frequency is
 *
 *      f_k = f0 · ( k · (1 + inharm · off_k) )
 *
 *  where `inharm` rises with how "irrational" the symmetry is:
 *    • integer, low, even m  → inharm ≈ 0 → partials land on the harmonic
 *      series → the shape rings a clean, consonant chord.
 *    • fractional m (mid-morph) or PRIME m → inharm large → partials are
 *      stretched/beating → the organism sounds alien and unsettling on purpose.
 *
 *  `off_k` is a fixed per-partial detune pattern from a seeded PRNG (deterministic
 *  — no Math.random). Morphing the shape audibly re-tunes the whole chord.
 *  The n-parameters ("bloom") gently push amplitude toward the upper partials.
 *
 *  Gesture-gated: the AudioContext is created/resumed only from the Begin click.
 *  Master ramps up from silence; a DynamicsCompressor limits before destination.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N_PARTIALS = 9;

// fixed per-partial detune pattern in roughly [-1, 1]
const OFF: number[] = (() => {
  const rnd = mulberry32(0x5b00b);
  const arr: number[] = [];
  for (let k = 0; k < N_PARTIALS; k++) arr.push(rnd() * 2 - 1);
  return arr;
})();

const SMALL_PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23]);

/** How "wrong" a symmetry sounds: 0 = clean harmonic, 1 = maximally beating. */
export function inharmonicity(m: number): number {
  const nearest = Math.round(m);
  const frac = Math.abs(m - nearest); // 0 at integers, up to 0.5 mid-morph
  let inh = frac * 1.6; // fractional symmetry beats
  if (SMALL_PRIMES.has(nearest)) inh += 0.28; // primes ring inharmonic
  if (nearest % 2 === 1) inh += 0.08; // odd lobes a touch more tense
  // very high symmetry adds a shimmering edge
  inh += Math.min(0.18, Math.max(0, (nearest - 12) * 0.02));
  return Math.min(1, inh);
}

export interface ShapeAudio {
  /** Drive per frame. m1 = symmetry spectrum, m2 = base-pitch shift, bloom 0..1. */
  update(m1: number, m2: number, bloom: number): void;
  /** A gentle 0..1 loudness proxy for driving visual glow. */
  level(): number;
  /** Smoothly silence, then fully tear down. */
  stop(): void;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export function makeShapeAudio(ac: AudioContext, masterTarget = 0.2): ShapeAudio {
  const now = ac.currentTime;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(masterTarget, now + 4);

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 12;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;

  // gentle low shelf warmth
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 4200;
  tone.Q.value = 0.5;

  master.connect(tone);
  tone.connect(limiter);
  limiter.connect(ac.destination);

  // slow sub oscillator
  const sub = ac.createOscillator();
  sub.type = "sine";
  const subGain = ac.createGain();
  subGain.gain.value = 0.5;
  sub.connect(subGain);
  subGain.connect(master);
  sub.start();

  // amplitude LFO for the "breathing" of the bloom
  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 0.12;
  lfo.connect(lfoGain);
  lfo.start();

  const voices: Voice[] = [];
  for (let k = 0; k < N_PARTIALS; k++) {
    const osc = ac.createOscillator();
    osc.type = k < 3 ? "triangle" : "sine";
    const g = ac.createGain();
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(master);
    lfoGain.connect(g.gain); // shared slow breathing
    osc.start();
    voices.push({ osc, gain: g });
  }

  let lvl = 0;

  function update(m1: number, m2: number, bloom: number): void {
    const t = ac.currentTime;
    const inh = inharmonicity(m1);

    // m2 shifts the fundamental across a comfortable low range (musical but
    // shape-driven, not snapped to a scale)
    const f0 = 46 * Math.pow(2, (m2 % 12) / 12);
    sub.frequency.setTargetAtTime(f0 * 0.5, t, 0.12);

    let sumAmp = 0;
    for (let k = 0; k < N_PARTIALS; k++) {
      const kk = k + 1;
      const ratio = kk * (1 + inh * 0.16 * OFF[k]);
      const freq = f0 * ratio;
      voices[k].osc.frequency.setTargetAtTime(freq, t, 0.09);
      // amplitude: 1/k roll-off, bloom lifts the upper partials
      const roll = 1 / (kk * 0.9);
      const upper = bloom * 0.5 * (k / N_PARTIALS);
      const amp = (roll * (0.55 + upper)) * (0.9 - 0.25 * inh);
      voices[k].gain.gain.setTargetAtTime(Math.max(0.0001, amp * 0.5), t, 0.15);
      sumAmp += amp;
    }
    lvl = Math.min(1, sumAmp * 0.35 + bloom * 0.2);
  }

  function level(): number {
    return lvl;
  }

  function stop(): void {
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const stopAt = t + 0.5;
    try {
      sub.stop(stopAt);
      lfo.stop(stopAt);
      for (const v of voices) v.osc.stop(stopAt);
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => {
      try {
        master.disconnect();
        tone.disconnect();
        limiter.disconnect();
        subGain.disconnect();
        lfoGain.disconnect();
        for (const v of voices) v.gain.disconnect();
      } catch {
        /* noop */
      }
      if (ac.state !== "closed") ac.close().catch(() => {});
    }, 650);
  }

  return { update, level, stop };
}
