// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — continuous data-sonification drone driven by the solar wind.
//
// This is NOT an event sequencer: there are no plucks or triggers. A fixed bank
// of sustained oscillators forms an overtone drone over a low fundamental, and
// the live solar-wind numbers continuously glide the harmony, brightness and
// thickness via setTargetAtTime — so the piece is always sounding and always
// morphing as the Sun's data drifts.
//
// Tuning is JUST INTONATION over a low D (~73.4 Hz, D2). Partials are stacked
// from the harmonic series (1, 3/2, 2, 5/2, 3, 4...) — a stacked-fifths /
// overtone drone, deliberately NOT a major-pentatonic. Southward Bz detunes a
// tension partial to introduce slow beating; northward Bz lets it settle to a
// pure ratio.
//
// Safety: master gain ~0.42 into a brick-wall DynamicsCompressor limiter, so a
// Kp-9 storm climax can never blast.
// ─────────────────────────────────────────────────────────────────────────────

import type { WindSample } from "./space-weather";

const FUNDAMENTAL = 73.42; // D2

// Just-intonation ratios above the fundamental for each voice in the drone.
// A stacked overtone / quartal feel: octave, fifth, octave+fifth, two-octaves,
// +major third (5/2 region) and a high fifth for shimmer.
const RATIOS = [1, 1.5, 2, 3, 4, 5, 6];

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
  isTension: boolean; // the partial that detunes under southward Bz
}

export interface DroneEngine {
  ctx: AudioContext;
  /** Push a new solar-wind reading; params glide smoothly toward it. */
  update: (s: WindSample) => void;
  /** Current analyser data for the visuals (overall energy 0..1). */
  getLevel: () => number;
  dispose: () => void;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function norm(x: number, lo: number, hi: number): number {
  return clamp((x - lo) / (hi - lo), 0, 1);
}

export function createDroneEngine(): DroneEngine {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  const now = ctx.currentTime;

  // ── master chain: bus -> tone-shaping lowpass -> limiter -> master ─────────
  const master = ctx.createGain();
  master.gain.value = 0.42;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 20; // brick wall
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  // Global brightness filter — solar-wind speed opens it up.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 900;
  tone.Q.value = 0.6;

  const bus = ctx.createGain();
  bus.gain.value = 1;

  // Slow tremolo for "shimmer" texture; depth follows density.
  const tremolo = ctx.createGain();
  tremolo.gain.value = 1;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0; // starts flat; density raises it
  lfo.connect(lfoDepth).connect(tremolo.gain);
  lfo.start();

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  bus.connect(tone).connect(tremolo).connect(limiter).connect(master);
  master.connect(ctx.destination);
  master.connect(analyser);

  // ── voices ─────────────────────────────────────────────────────────────────
  const voices: Voice[] = RATIOS.map((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : i % 2 === 0 ? "triangle" : "sine";
    osc.frequency.value = FUNDAMENTAL * ratio;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(bus);
    osc.start(now + 0.02);
    // the 5th partial (the major-third-ish 5/1 -> two octaves + maj third)
    // acts as the tension voice that detunes under southward Bz.
    return { osc, gain, ratio, isTension: ratio === 5 };
  });

  // Gentle fade-in of the fundamental + fifth so the start isn't abrupt.
  voices[0].gain.gain.setTargetAtTime(0.5, now, 1.2);
  voices[1].gain.gain.setTargetAtTime(0.32, now, 1.6);

  const GLIDE = 4.0; // seconds — long, never clicky

  function update(s: WindSample) {
    const t = ctx.currentTime;
    const speedN = norm(s.speed, 300, 750); // 0 slow .. 1 fast
    const densN = norm(s.density, 0, 25);
    const kpN = norm(s.kp, 0, 9);
    // Bz: -20 (deep south, tension) .. +15 (north, consonant)
    const south = clamp(-s.bz / 18, 0, 1); // 0 calm/north .. 1 deep south

    // Brightness: faster wind opens the tone filter (300 Hz .. 4.5 kHz).
    const cutoff = 320 + speedN * speedN * 4200 + kpN * 600;
    tone.frequency.setTargetAtTime(cutoff, t, GLIDE);

    // Register drift: fast wind nudges the whole drone up a little (a few %),
    // so a high-speed stream literally sits higher / brighter.
    const drift = 1 + speedN * 0.06;

    // Shimmer depth from density (subtle tremolo) + a touch from Kp.
    const shimmer = 0.08 + densN * 0.18 + kpN * 0.08;
    lfoDepth.gain.setTargetAtTime(shimmer, t, GLIDE);
    lfo.frequency.setTargetAtTime(0.12 + densN * 0.5 + kpN * 0.4, t, GLIDE);

    // Overall loudness rises modestly with Kp (storm = climax) but the limiter
    // guarantees it never blasts.
    const drive = 0.85 + kpN * 0.5;

    voices.forEach((v, i) => {
      const target = FUNDAMENTAL * v.ratio * drift;
      if (v.isTension) {
        // Detune the tension partial under southward Bz to create slow beats.
        // Up to ~ +5% sharp at deep south -> audible "wrongness" / shimmer beat.
        const detuned = target * (1 + south * 0.05);
        v.osc.frequency.setTargetAtTime(detuned, t, GLIDE);
        // and bring it forward only when there's tension to express.
        const g = (0.04 + south * 0.16) * drive;
        v.gain.gain.setTargetAtTime(g, t, GLIDE);
        return;
      }
      v.osc.frequency.setTargetAtTime(target, t, GLIDE);
      // Higher partials grow with density (thicker texture when dense) and a
      // little with speed (brighter); the low voices stay anchored.
      const heightN = i / (voices.length - 1); // 0 low .. 1 high
      const base = 0.5 * (1 - heightN * 0.6); // low voices loudest
      const add = heightN * (densN * 0.4 + speedN * 0.18);
      v.gain.gain.setTargetAtTime((base + add) * 0.6 * drive, t, GLIDE);
    });
  }

  function getLevel(): number {
    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
    return clamp(sum / (freqData.length * 255), 0, 1);
  }

  function dispose() {
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(0.0001, t, 0.3);
    setTimeout(() => {
      try {
        voices.forEach((v) => {
          try {
            v.osc.stop();
          } catch {}
        });
        try {
          lfo.stop();
        } catch {}
        void ctx.close();
      } catch {}
    }, 500);
  }

  return { ctx, update, getLevel, dispose };
}
