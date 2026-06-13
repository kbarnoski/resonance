// audio.ts — warm just-intonation drone, breathed by the real swell
// NO onset/beat detection, NO pentatonic tapping. One sustained chord.

import type { MarineData } from "./marine";

// Root: D2 ≈ 73.416 Hz
const ROOT_HZ = 73.416;

// Just-intonation ratios for a warm, full chord
// Root, P5 (3/2), Octave (2/1), Major 3rd + octave (5/2),
// P5 + octave (3/1), Natural 7th (7/2)
const JI_RATIOS = [1, 3 / 2, 2, 5 / 2, 3, 7 / 4];

// Slight detuning per voice pair (cents) for warmth / chorusing
const DETUNE_A = [0, 2, -1, 3, -2, 1];
const DETUNE_B = [-3, -1, 2, -2, 1, -3];

// Relative voice amplitudes — lower voices louder
const VOICE_GAIN = [0.55, 0.42, 0.32, 0.26, 0.20, 0.16];

export interface DroneHandle {
  setMarine: (d: MarineData) => void;
  stop: () => void;
}

export function buildDrone(): DroneHandle {
  // webkit fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AudioCtxClass: typeof AudioContext = (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext;
  const ac = new AudioCtxClass();

  // Master chain: mixGain → lowpass → compressor → destination
  const mixGain = ac.createGain();
  mixGain.gain.value = 0.0; // start silent, will breath in

  const masterLowpass = ac.createBiquadFilter();
  masterLowpass.type = "lowpass";
  masterLowpass.frequency.value = 900;
  masterLowpass.Q.value = 0.7;

  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 10;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.05;
  compressor.release.value = 0.3;

  mixGain.connect(masterLowpass);
  masterLowpass.connect(compressor);
  compressor.connect(ac.destination);

  // Per-voice oscillator pairs
  interface VoicePair {
    oscA: OscillatorNode;
    oscB: OscillatorNode;
    voiceGain: GainNode;
    voiceLowpass: BiquadFilterNode;
  }

  const voices: VoicePair[] = JI_RATIOS.map((ratio, i) => {
    const hz = ROOT_HZ * ratio;

    const oscA = ac.createOscillator();
    oscA.type = i < 2 ? "sine" : "triangle";
    oscA.frequency.value = hz;
    oscA.detune.value = DETUNE_A[i];

    const oscB = ac.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = hz;
    oscB.detune.value = DETUNE_B[i];

    const voiceLowpass = ac.createBiquadFilter();
    voiceLowpass.type = "lowpass";
    voiceLowpass.frequency.value = 1200;
    voiceLowpass.Q.value = 0.5;

    const voiceGain = ac.createGain();
    voiceGain.gain.value = VOICE_GAIN[i];

    oscA.connect(voiceLowpass);
    oscB.connect(voiceLowpass);
    voiceLowpass.connect(voiceGain);
    voiceGain.connect(mixGain);

    oscA.start();
    oscB.start();

    return { oscA, oscB, voiceGain, voiceLowpass };
  });

  // LFO state — driven by setMarine
  let breathPeriod = 11.0;   // swell_wave_period seconds
  let breathDepth = 0.55;    // scaled from wave_height
  let cutoffCenter = 900;    // scaled from sea_surface_temperature

  // Breath LFO driven by requestAnimationFrame
  let rafId = 0;
  let alive = true;
  const startTime = ac.currentTime;

  function runBreath() {
    if (!alive) return;

    const elapsed = ac.currentTime - startTime;
    // Smooth sine breath: 0..1
    const breathPhase = (Math.sin((elapsed / breathPeriod) * 2 * Math.PI - Math.PI / 2) + 1) / 2;

    // Inhale (breathPhase → 1) = louder, brighter
    // Exhale (breathPhase → 0) = quieter, darker
    const gainVal = 0.18 + breathDepth * 0.55 * breathPhase;
    const cutoffVal = cutoffCenter * (0.65 + 0.55 * breathPhase);

    mixGain.gain.setTargetAtTime(gainVal, ac.currentTime, 0.4);
    masterLowpass.frequency.setTargetAtTime(Math.min(cutoffVal, 3500), ac.currentTime, 0.6);

    rafId = requestAnimationFrame(runBreath);
  }

  runBreath();

  function setMarine(d: MarineData) {
    // swell_wave_period → breath tempo (clamp 6–18s)
    breathPeriod = Math.max(6, Math.min(18, d.swell_wave_period || d.wave_period));

    // wave_height → breath depth (normalise 0.3–4m → 0.2–1.0)
    breathDepth = Math.max(0.2, Math.min(1.0, (d.wave_height - 0.3) / 3.7 + 0.2));

    // sea_surface_temperature → cutoff center (warmer = brighter)
    // typical range 8°C–28°C → cutoff 500Hz–1800Hz
    const tempNorm = Math.max(0, Math.min(1, (d.sea_surface_temperature - 8) / 20));
    cutoffCenter = 500 + tempNorm * 1300;

    // Adjust upper voice brightness for temperature
    voices.forEach((v, i) => {
      const voiceCutoff = (cutoffCenter * (1 + i * 0.18));
      v.voiceLowpass.frequency.setTargetAtTime(Math.min(voiceCutoff, 4000), ac.currentTime, 1.5);
    });
  }

  function stop() {
    alive = false;
    cancelAnimationFrame(rafId);
    voices.forEach(v => { v.oscA.stop(); v.oscB.stop(); });
    ac.close();
  }

  return { setMarine, stop };
}
