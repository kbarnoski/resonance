// audio.ts — Atmosphere Veil sustained spectral drone
//
// Design (reference: Éliane Radigue's slow sustained beating drones, plus
// spectral-tension thinking à la Gérard Grisey — see README):
//
//   • A stack of detuned sine "voices" forming an evolving harmonic cloud.
//   • AT REST (global tension → 0): open fifths + octaves over a drone root =
//     consonance. Beating is near-zero; the chord is calm but never quite a
//     warm V–I cadence — it simply opens.
//   • AS TENSION RISES (driven ONLY by live atmospheric instability): voices
//     (a) detune into audible beating intervals, (b) tension tones fade in
//     (minor 2nd, tritone, b9), (c) a tremolo/roughness LFO deepens.
//   • Tension relaxes back toward consonance ONLY because the data calmed —
//     never on a timer, never on a tap.
//
// Long-form memory: a slowly-mutating "voicing pool" + a drifting tonal-center
// offset means minute 8 differs from minute 1 at equal tension. It does NOT
// loop. Each city contributes a faint voice panned by longitude.
//
// Everything routes through a brick-wall DynamicsCompressor limiter + master
// gain so it can never clip or blast. This is a calm/tense adult ambient piece.

import { CITIES } from "./weather";

const A0 = 27.5;
// Drone root drifts slowly within a low register (memory / non-looping).
const BASE_ROOT_HZ = A0 * 2; // ~55 Hz (A1)

// Just-intonation-ish ratios for the consonant skeleton (root, 5th, octave,
// octave+5th, double octave). These are the "at rest" voicing.
const CONSONANT_RATIOS = [1, 1.5, 2, 3, 4];
// Tension ratios faded in as instability rises:
//   minor 2nd (16/15), tritone (45/32), flat 9 (≈ octave + minor 2nd).
const TENSION_RATIOS = [16 / 15, 45 / 32, 2 * (16 / 15)];

type Voice = {
  osc: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  baseRatio: number;
  isTension: boolean;
};

export class AtmosphereAudio {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  // Tremolo / roughness
  tremLfo: OscillatorNode;
  tremDepth: GainNode;
  tremBase: GainNode; // sums to a 0..1 amplitude env that voices read
  voices: Voice[] = [];
  cityVoices: Voice[] = [];

  // Long-form drifting state
  private rootDriftPhase = Math.random() * Math.PI * 2;
  private voicingMutPhase = Math.random() * Math.PI * 2;
  private t = 0;
  private smoothTension = 0;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // ── Master chain: sum → limiter (brick wall) → master gain → out ────────
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in after start
    this.limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    // ── Tremolo bus: a shared amplitude LFO for "roughness" ────────────────
    // We model roughness by multiplying nothing globally; instead each voice's
    // gain is modulated. Simpler: a single tremolo gain node the harmonic
    // skeleton passes through is avoided (would mono-sum panning). Instead we
    // drive per-voice tremolo via a shared LFO connected to each voice gain's
    // AudioParam through a depth node.
    this.tremLfo = this.ctx.createOscillator();
    this.tremLfo.frequency.value = 4.5; // roughness flutter rate
    this.tremDepth = this.ctx.createGain();
    this.tremDepth.gain.value = 0; // 0 at rest → no flutter
    this.tremBase = this.ctx.createGain();
    this.tremBase.gain.value = 1;
    this.tremLfo.connect(this.tremDepth);
    this.tremLfo.start();

    // ── Build the consonant skeleton voices ────────────────────────────────
    for (const r of CONSONANT_RATIOS) {
      this.voices.push(this.makeVoice(r, false, 0));
    }
    // Tension voices (start silent).
    for (const r of TENSION_RATIOS) {
      this.voices.push(this.makeVoice(r, true, 0));
    }

    // ── Faint per-city voices, panned by longitude ─────────────────────────
    // Each city sings a high partial of the root; panned L↔R by longitude.
    CITIES.forEach((c) => {
      const ratio = 6 + ((Math.abs(c.lat) % 12) | 0) * 0.5; // sparse high partials
      const v = this.makeVoice(ratio, false, c.lon / 180);
      v.gain.gain.value = 0;
      this.cityVoices.push(v);
    });
  }

  private makeVoice(ratio: number, isTension: boolean, panPos: number): Voice {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = BASE_ROOT_HZ * ratio;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, panPos));

    // tremolo: depth LFO modulates this voice's gain
    this.tremDepth.connect(gain.gain);

    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.limiter);
    osc.start();

    return { osc, gain, pan, baseRatio: ratio, isTension };
  }

  resume() {
    if (this.ctx.state === "suspended") this.ctx.resume();
    // Gentle fade in over 4s.
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.5, now + 4);
  }

  // ── Per-frame update: tension 0..1 drives the whole spectral cloud ───────
  applyTension(tension: number, dt: number) {
    this.t += dt;
    // Smooth so audio glides; the DATA decides direction, this just removes
    // zipper noise. Asymmetric: rises a touch faster than it relaxes, so a
    // building storm is felt promptly but calm returns slowly (sustained).
    const target = Math.max(0, Math.min(1, tension));
    const k = target > this.smoothTension ? 0.6 : 0.25;
    this.smoothTension += (target - this.smoothTension) * Math.min(1, k * dt);
    const T = this.smoothTension;

    const now = this.ctx.currentTime;

    // Drifting tonal center: slow ± up to ~1.5 semitones, never resolving.
    this.rootDriftPhase += dt * 0.012;
    const rootCents = Math.sin(this.rootDriftPhase) * 70; // ±70 cents
    const root = BASE_ROOT_HZ * Math.pow(2, rootCents / 1200);

    // Voicing mutation: a slow wander that re-weights which partials are loud,
    // so equal tension sounds different over time (long-form memory).
    this.voicingMutPhase += dt * 0.02;

    // Beating amount scales with tension: detune partials by up to ±~12 cents
    // → audible beats. At rest detune ≈ 0 → pure consonance.
    const maxDetuneCents = 14 * T;

    this.voices.forEach((v, i) => {
      const mut = 0.5 + 0.5 * Math.sin(this.voicingMutPhase + i * 1.7);
      let targetGain: number;
      let freq = root * v.baseRatio;

      if (v.isTension) {
        // Tension tones fade in only as T rises (quadratic so they stay hidden
        // when calm). Capped low — they color, not dominate.
        targetGain = Math.pow(T, 1.8) * 0.16 * (0.6 + 0.4 * mut);
      } else {
        // Consonant skeleton: always present, gently re-weighted by mutation.
        targetGain = (0.07 + 0.05 * mut) * (1 - 0.25 * T);
        // Apply beating detune (alternating sign per partial) only here.
        const sign = i % 2 === 0 ? 1 : -1;
        freq = freq * Math.pow(2, (sign * maxDetuneCents) / 1200);
      }

      v.osc.frequency.setTargetAtTime(freq, now, 0.3);
      v.gain.gain.setTargetAtTime(targetGain, now, 0.4);
    });

    // City voices: faint, brighten slightly with tension.
    this.cityVoices.forEach((v) => {
      const freq = root * v.baseRatio;
      v.osc.frequency.setTargetAtTime(freq, now, 0.5);
      v.gain.gain.setTargetAtTime(0.012 + 0.02 * T, now, 0.6);
    });

    // Roughness / tremolo: depth and rate climb with tension.
    this.tremDepth.gain.setTargetAtTime(0.05 * T * (0.04 + 0.96 * T), now, 0.4);
    this.tremLfo.frequency.setTargetAtTime(3 + 6 * T, now, 0.4);
  }

  get tension() {
    return this.smoothTension;
  }

  dispose() {
    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    } catch {
      /* noop */
    }
    try {
      this.ctx.close();
    } catch {
      /* noop */
    }
  }
}
