// audio.ts — the voice for 2590-tremor.
//
// A source–filter vocal synth played by motion. This is the deliberate
// inversion of the audio→body frontier (EchoAvatar / DiscoForcing): here the
// arrow runs motion→sound. The mapping is intentionally dissonance-capable with
// NO safety net — pitch is continuous Hz straight from the motion centroid and
// is never snapped to a scale, chord, pentatonic, or JI lattice.
//
//   centroid height  → continuous, microtonal f0 (log scale, + horizontal drift)
//   spread/openness  → formant sweep (a vowel opening: oo → ah)
//   energy           → gain (still hands settle the voice toward rest)
//   velocity/spread  → roughness: detuned beating + an inharmonic growl partial
//                      + amplitude jitter, so fast/wide motion genuinely clashes

import type { MotionState } from "./motion";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const F_MIN = 90;
const F_MAX = 880;

/** Continuous, microtonal f0 from the motion centroid. Never quantized. */
export function motionToF0(s: MotionState): number {
  const height = clamp01(1 - s.cy); // raise the body → higher voice
  const base = F_MIN * Math.pow(F_MAX / F_MIN, height);
  // Horizontal position adds a continuous ± ~2-semitone microtonal drift.
  return base * Math.pow(2, (s.cx - 0.5) * 0.16);
}

/** Roughness/growl amount from how fast and wide the motion is. */
export function motionToRoughness(s: MotionState): number {
  return clamp01(0.72 * s.velocity + 0.32 * s.spread - 0.06);
}

export interface VocalSynth {
  update(s: MotionState): void;
  stop(): void;
}

export function startVocalSynth(): VocalSynth {
  type Ctor = typeof AudioContext;
  const Ac: Ctor | undefined =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ac) throw new Error("Web Audio unavailable");
  const ctx = new Ac();
  void ctx.resume();

  // Browsers keep the context suspended until a user gesture. Resume on the
  // first interaction anywhere so the zero-interaction auto-demo becomes audible
  // the moment the visitor touches the page.
  let gestureBound = true;
  const resumeOnGesture = () => {
    void ctx.resume();
    unbindGesture();
  };
  const unbindGesture = () => {
    if (!gestureBound) return;
    gestureBound = false;
    for (const ev of ["pointerdown", "keydown", "touchstart"] as const) {
      window.removeEventListener(ev, resumeOnGesture);
    }
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(ev, resumeOnGesture, { once: false, passive: true });
  }

  const now = ctx.currentTime;

  // ── Master chain: voice → tremolo → limiter → out ──────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // Tremolo / amplitude jitter (roughness).
  const trem = ctx.createGain();
  trem.gain.value = 1;
  trem.connect(master);
  const tremLfo = ctx.createOscillator();
  tremLfo.type = "sine";
  tremLfo.frequency.value = 6;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0;
  tremLfo.connect(tremDepth);
  tremDepth.connect(trem.gain);
  tremLfo.start();

  // ── Formant filters (the vocal tract) ──────────────────────────────────────
  const makeFormant = (freq: number, q: number, gain: number) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    bp.connect(g);
    g.connect(trem);
    return bp;
  };
  const f1 = makeFormant(500, 7, 1.0);
  const f2 = makeFormant(1200, 9, 0.7);
  const f3 = makeFormant(2600, 11, 0.35);

  // ── Glottal source ─────────────────────────────────────────────────────────
  const sourceGain = ctx.createGain();
  sourceGain.gain.value = 0.5;
  sourceGain.connect(f1);
  sourceGain.connect(f2);
  sourceGain.connect(f3);

  const oscA = ctx.createOscillator();
  oscA.type = "sawtooth";
  oscA.frequency.value = 160;
  oscA.connect(sourceGain);

  const oscB = ctx.createOscillator();
  oscB.type = "sawtooth";
  oscB.frequency.value = 160;
  oscB.detune.value = 0;
  oscB.connect(sourceGain);

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 80;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.4;
  sub.connect(subGain);
  subGain.connect(sourceGain);

  // Inharmonic growl partial — emerges with roughness, clashes on purpose.
  const growl = ctx.createOscillator();
  growl.type = "sawtooth";
  growl.frequency.value = 440;
  const growlGain = ctx.createGain();
  growlGain.gain.value = 0;
  growl.connect(growlGain);
  growlGain.connect(f2);

  oscA.start();
  oscB.start();
  sub.start();
  growl.start();

  const glide = (p: AudioParam, v: number, tc = 0.06) =>
    p.setTargetAtTime(v, ctx.currentTime, tc);

  const update = (s: MotionState) => {
    const t = ctx.currentTime;
    const f0 = motionToF0(s);
    const rough = motionToRoughness(s);
    const open = clamp01(s.spread);

    // Pitch — continuous portamento, no quantization.
    glide(oscA.frequency, f0, 0.05);
    glide(oscB.frequency, f0, 0.05);
    glide(sub.frequency, f0 * 0.5, 0.05);
    glide(growl.frequency, f0 * 2.76, 0.05); // inharmonic

    // Roughness: beating between the two saws + growl partial.
    glide(oscB.detune, rough * 42, 0.08);
    glide(growlGain.gain, rough * rough * 0.55, 0.08);

    // Amplitude jitter: faster + deeper tremolo as motion quickens.
    tremLfo.frequency.setTargetAtTime(4 + s.velocity * 34, t, 0.1);
    tremDepth.gain.setTargetAtTime(rough * 0.5, t, 0.1);

    // Formants sweep from a closed "oo" to an open "ah" with openness.
    glide(f1.frequency, 300 + open * 620, 0.08);
    glide(f2.frequency, 720 + open * 900, 0.08);
    glide(f3.frequency, 2500 + open * 400, 0.1);

    // Gain: energy drives it; still hands settle toward near-silence.
    const target = Math.pow(clamp01(s.energy), 0.7) * 0.85 + 0.0003;
    glide(master.gain, target, 0.09);
  };

  // Gentle fade-in so the auto-demo doesn't click on.
  master.gain.setTargetAtTime(0.02, now, 0.3);

  const stop = () => {
    unbindGesture();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(0.0001, t, 0.08);
    window.setTimeout(() => {
      for (const o of [oscA, oscB, sub, growl, tremLfo]) {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      }
      void ctx.close();
    }, 260);
  };

  return { update, stop };
}
