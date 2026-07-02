// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Schumann-cavity harmonic synthesis for 1110-earth-hum.
//
// The Schumann Resonance is the real ELF electromagnetic standing wave in the
// Earth–ionosphere cavity, excited by ~44 lightning strikes/sec worldwide. Its
// harmonics SR1–SR5 sit at ~7.83, 14.3, 20.8, 27.3, 33.8 Hz — below/at the edge
// of hearing. We make it audible two ways at once:
//
//   1. A PITCHED DRONE BED: the five true harmonics transposed UP four octaves
//      (×16) into a warm register (~125, 229, 333, 437, 541 Hz). Each is a soft
//      sine/triangle voice with a faintly detuned partner so it BEATS and
//      shimmers; amplitudes taper SR1 > SR2 > … > SR5.
//   2. The TRUE sub-frequencies kept as FELT elements: a 7.83 Hz amplitude
//      tremolo on the whole bed (the cavity's real fundamental as a breathing
//      pulse) plus a gentle gated 7.83 Hz sub-oscillator you feel more than hear.
//
// Everything passes through a DynamicsCompressor acting as a limiter before the
// destination, so the piece is never harsh and never silent. Live geomagnetic
// data (Kp) and solar-wind speed reshape it via applyData().
// ─────────────────────────────────────────────────────────────────────────────

import type { SpaceWeather } from "./data";

/** True Schumann harmonics SR1–SR5, in Hz. */
const SCHUMANN_HZ = [7.83, 14.3, 20.8, 27.3, 33.8];
/** Transpose up four octaves into a warm audible register. */
const OCTAVE_UP = 16;
/** Audible drone frequencies (~125, 229, 333, 437, 541 Hz). */
const VOICE_HZ = SCHUMANN_HZ.map((f) => f * OCTAVE_UP);
/** Amplitude taper: SR1 loudest, fading up the ladder. */
const VOICE_AMP = [1.0, 0.64, 0.44, 0.3, 0.2];
/** Slow, incommensurate beat rates (Hz) per voice for individual shimmer. */
const BEAT_RATE = [0.05, 0.071, 0.061, 0.083, 0.093];
/** Detune of each voice's shimmer partner, in cents (creates real beating). */
const DETUNE_CENTS = [5, -6, 7, -8, 9];

export interface HumAudio {
  /** Advance the modeled beating/shimmer. Call once per animation frame. */
  step(dt: number): void;
  /** Push the latest (live or simulated) sample into the sound. */
  applyData(d: SpaceWeather): void;
  /** Current per-voice levels (0..1), for driving the visual harmonic ladder. */
  getLevels(): number[];
  /** Tear everything down. */
  stop(): void;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Kp 0–9 → 0..1. */
function kpDrive(kp: number): number {
  return clamp01(kp / 9);
}

/** Wind speed km/s ~[300,650] → 0..1. */
function windDrive(speed: number): number {
  return clamp01((speed - 300) / (650 - 300));
}

export function startHumAudio(
  ctx: AudioContext,
  master: GainNode,
): HumAudio {
  // ── limiter → destination is wired by the caller (master → compressor). ─────

  // Warm lowpass the whole bed passes through; brightens with Kp.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.6;
  filter.connect(master);

  // The pitched bed's gain — a 7.83 Hz tremolo rides on top of this base.
  const bed = ctx.createGain();
  bed.gain.value = 0.5;
  bed.connect(filter);

  // ── 7.83 Hz tremolo LFO (the felt heartbeat) modulating the bed gain ────────
  const tremOsc = ctx.createOscillator();
  tremOsc.type = "sine";
  tremOsc.frequency.value = SCHUMANN_HZ[0]; // 7.83 Hz, the real fundamental
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.08;
  tremOsc.connect(tremDepth);
  tremDepth.connect(bed.gain);
  tremOsc.start();

  // ── the five pitched voices, each with a detuned shimmer partner ────────────
  const voiceGains: GainNode[] = [];
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < VOICE_HZ.length; i++) {
    const vg = ctx.createGain();
    vg.gain.value = VOICE_AMP[i] * 0.16;
    vg.connect(bed);

    const main = ctx.createOscillator();
    main.type = i === 0 ? "sine" : "triangle"; // SR1 pure, higher voices warmer
    main.frequency.value = VOICE_HZ[i];
    main.connect(vg);
    main.start();

    const partner = ctx.createOscillator();
    partner.type = "sine";
    partner.frequency.value = VOICE_HZ[i];
    partner.detune.value = DETUNE_CENTS[i];
    const pg = ctx.createGain();
    pg.gain.value = 0.5; // partner slightly quieter -> gentle beating, not chorus
    partner.connect(pg);
    pg.connect(vg);
    partner.start();

    voiceGains.push(vg);
    oscs.push(main, partner);
  }

  // ── gentle gated 7.83 Hz sub-oscillator (felt more than heard) ──────────────
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = SCHUMANN_HZ[0];
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  // Slow fade-in so it settles rather than thumps.
  subGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 8);
  subOsc.connect(subGain);
  subGain.connect(filter);
  subOsc.start();

  // ── modeled per-voice levels (kept in sync with the audible beating) ────────
  const levels = VOICE_AMP.map((a) => a * 0.8);
  const beatPhase = VOICE_HZ.map(() => 0);

  // Smoothed drive values from the data feed.
  let kp = 0.4;
  let wind = 0.4;
  let t = 0;

  return {
    step(dt: number) {
      const cdt = Math.min(0.05, Math.max(0, dt));
      t += cdt;
      const now = ctx.currentTime;
      // Wind speeds up the shimmer; Kp adds a faster storm flutter.
      const shimmer = 0.6 + 1.1 * wind;
      const flutterAmt = 0.06 + 0.22 * kp;
      for (let i = 0; i < voiceGains.length; i++) {
        beatPhase[i] += cdt * BEAT_RATE[i] * shimmer * 2 * Math.PI;
        const beat = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(beatPhase[i]));
        // Storm flutter: incommensurate wobble that grows with Kp.
        const flutter =
          1 + flutterAmt * Math.sin(t * (1.7 + i * 0.6) + i * 1.3);
        const lvl = clamp01(VOICE_AMP[i] * beat * flutter);
        levels[i] = lvl;
        voiceGains[i].gain.setTargetAtTime(lvl * 0.16, now, 0.08);
      }
    },
    applyData(d: SpaceWeather) {
      const now = ctx.currentTime;
      kp = kpDrive(d.kp);
      wind = windDrive(d.windSpeed);
      // Storms brighten the cavity: open the filter with Kp.
      filter.frequency.setTargetAtTime(700 + 2200 * kp, now, 1.5);
      // Storms deepen the felt heartbeat tremolo.
      tremDepth.gain.setTargetAtTime(0.06 + 0.16 * kp, now, 1.5);
      // Faster wind lends a touch more sub presence (more excitation).
      subGain.gain.setTargetAtTime(0.04 + 0.04 * wind, now, 2.0);
    },
    getLevels() {
      return levels;
    },
    stop() {
      try {
        tremOsc.stop();
        subOsc.stop();
        for (const o of oscs) o.stop();
      } catch {
        // already stopped
      }
    },
  };
}
