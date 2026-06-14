// Warm just-intonation drone-organ driven by live ocean swell.
// The sea, not a synth knob, holds the tension: wave period breathes the
// texture, height stacks voices, swell period sets the root, direction pans.

import type { SwellState } from "./ocean";

// Just-intonation ratios over a low root — a warm harmonium chord.
// 1/1, 9/8, 5/4, 3/2, 7/4, 2/1
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 7 / 4, 2] as const;

type Voice = {
  oscA: OscillatorNode;
  oscB: OscillatorNode; // detuned partner for chorus warmth
  gain: GainNode;
  pan: StereoPannerNode;
  ratio: number;
};

export type OrganHandle = {
  ctx: AudioContext;
  setSwell: (s: SwellState) => void;
  // Smoothed master level 0..1 for visual reactivity.
  level: () => number;
  dispose: () => void;
};

// Map swell period (6..16s) to a root frequency (deeper = longer period).
function rootFromPeriod(swellPeriod: number): number {
  const t = Math.max(0, Math.min(1, (swellPeriod - 6) / 10));
  // longer period => lower root. 110 Hz (short) down to 55 Hz (long groundswell).
  return 110 - t * 55;
}

export function runOrgan(ctx: AudioContext): OrganHandle {
  const now = ctx.currentTime;

  // Master chain: voices -> masterGain -> lowpass -> soft limiter -> out.
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 900;
  lowpass.Q.value = 0.4;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.0001;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 18;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.25;

  masterGain.connect(lowpass);
  lowpass.connect(limiter);
  limiter.connect(ctx.destination);

  // The breath: a slow LFO that modulates masterGain + filter, its rate set
  // by the wave period.
  const breathOsc = ctx.createOscillator();
  breathOsc.type = "sine";
  breathOsc.frequency.value = 1 / 11;

  const breathGain = ctx.createGain(); // depth into masterGain
  breathGain.gain.value = 0.18;
  breathOsc.connect(breathGain);
  breathGain.connect(masterGain.gain);

  const breathToFilter = ctx.createGain();
  breathToFilter.gain.value = 300;
  breathOsc.connect(breathToFilter);
  breathToFilter.connect(lowpass.frequency);
  breathOsc.start(now);

  // Build the full stack of voices (we fade voices in/out by count).
  const voices: Voice[] = RATIOS.map((ratio, i) => {
    const oscA = ctx.createOscillator();
    oscA.type = i < 2 ? "triangle" : "sine";
    const oscB = ctx.createOscillator();
    oscB.type = "sine";

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;

    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(pan);
    pan.connect(masterGain);

    oscA.start(now);
    oscB.start(now);
    return { oscA, oscB, gain, pan, ratio };
  });

  // Soft swell-in of the master so first tap isn't a click.
  masterGain.gain.setTargetAtTime(0.6, now, 2.5);

  let smoothedLevel = 0;

  function setSwell(s: SwellState) {
    const t = ctx.currentTime;
    const root = rootFromPeriod(s.swellPeriod);

    // Breath rate from wave period. Longer period = slower, grander breath.
    const breathHz = 1 / Math.max(6, Math.min(16, s.wavePeriod));
    breathOsc.frequency.setTargetAtTime(breathHz, t, 1.5);

    // Fullness from wave height: how many voices are present (always >= 2).
    const heightN = Math.max(0, Math.min(1, (s.waveHeight - 0.5) / 3.5));
    const activeVoices = 2 + Math.round(heightN * (RATIOS.length - 2));

    // Brightness from height too: open the lowpass for bigger seas.
    lowpass.frequency.setTargetAtTime(700 + heightN * 1600, t, 2.0);
    masterGain.gain.setTargetAtTime(0.4 + heightN * 0.35, t, 3.0);

    // Direction → stereo spread. Map compass to -1..1 and spread voices around it.
    const dirNorm = (s.waveDir / 360) * 2 - 1; // -1..1
    const spread = 0.25 + heightN * 0.45;

    voices.forEach((v, i) => {
      const freq = root * v.ratio;
      v.oscA.frequency.setTargetAtTime(freq, t, 1.2);
      // gentle detune partner — warmer as seas build
      v.oscB.frequency.setTargetAtTime(freq * (1 + 0.004 + heightN * 0.004), t, 1.2);

      const on = i < activeVoices;
      // per-voice level: lower voices louder, taper upper partials
      const voiceLevel = on ? 0.22 / (1 + i * 0.45) : 0.0001;
      v.gain.gain.setTargetAtTime(voiceLevel, t, on ? 3.0 : 4.0);

      // pan around the direction centre, alternating sides for width
      const offset = (i % 2 === 0 ? 1 : -1) * spread * ((i + 1) / RATIOS.length);
      const pan = Math.max(-1, Math.min(1, dirNorm * 0.6 + offset));
      v.pan.pan.setTargetAtTime(pan, t, 2.0);
    });
  }

  // Approximate audible level for visuals: master target + breath phase.
  function level(): number {
    const m = masterGain.gain.value;
    const breathPhase =
      0.5 + 0.5 * Math.sin(ctx.currentTime * breathOsc.frequency.value * Math.PI * 2);
    const target = Math.max(0, Math.min(1, m * (0.55 + 0.45 * breathPhase)));
    smoothedLevel += (target - smoothedLevel) * 0.08;
    return smoothedLevel;
  }

  function dispose() {
    const t = ctx.currentTime;
    masterGain.gain.setTargetAtTime(0.0001, t, 0.3);
    try {
      breathOsc.stop(t + 0.8);
      voices.forEach((v) => {
        v.oscA.stop(t + 0.8);
        v.oscB.stop(t + 0.8);
      });
    } catch {
      // already stopped
    }
  }

  return { ctx, setSwell, level, dispose };
}
