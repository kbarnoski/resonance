/**
 * Built-in gritty generative carrier for the Fracture prototype.
 *
 * When no file is dropped this MUST auto-play so the piece is never silent —
 * it is the sound the headless review box hears. It is deliberately
 * DISSONANT: detuned beating saws + a sub + filtered noise voiced on minor
 * 2nds, tritones and major 7ths, never a consonant drone.
 *
 * DETERMINISM: the whole pattern is a pure function of an integer frame
 * counter + Math.sin + a fixed-seed mulberry32. No wall-clock anywhere.
 * `audioCtx.currentTime` is used ONLY for click-free gain/param smoothing.
 */

import { midiToHz, mulberry32 } from "./dsp";

const CARRIER_SEED = 0x51ac7; // fixed literal → identical everywhere
const STEP_FRAMES = 26; // frames per pattern step (~0.43s at 60fps)

/** Dissonant interval sets (semitones over the root). m2 / tritone / M7. */
const CHORDS: number[][] = [
  [0, 1, 6], // root + minor 2nd + tritone
  [0, 6, 11], // root + tritone + major 7th
  [0, 1, 11], // root + minor 2nd + major 7th
  [0, 6, 13], // root + tritone + minor 9th
];

/** Low, brooding root walk (MIDI). */
const ROOTS = [40, 43, 41, 45, 40, 38, 44, 42];

export interface Carrier {
  output: GainNode;
  /** Advance the deterministic pattern to the given integer frame. */
  step(frame: number): void;
  /** Fade the carrier in/out (e.g. muted when a file takes over). */
  setActive(on: boolean, t: number): void;
  stop(): void;
}

export function createCarrier(ctx: AudioContext): Carrier {
  const rnd = mulberry32(CARRIER_SEED);
  const output = ctx.createGain();
  output.gain.value = 1;

  // three saw voices, each with its own gain, gently detuned for beating
  const voices = [0, 1, 2].map((i) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    osc.detune.value = (i - 1) * 6; // static spread → constant beating
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(output);
    osc.start();
    return { osc, g };
  });

  // sub sine an octave below the root
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = 55;
  const subGain = ctx.createGain();
  subGain.gain.value = 0;
  subOsc.connect(subGain).connect(output);
  subOsc.start();

  // looping deterministic noise → bandpass → its own gain
  const noiseLen = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = rnd() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 1400;
  noiseFilter.Q.value = 4;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseFilter).connect(noiseGain).connect(output);
  noise.start();

  let lastStep = -1;
  const chordFreqs: number[] = [110, 116, 156];

  function retune(stepIndex: number): void {
    const root = ROOTS[stepIndex % ROOTS.length];
    const chord = CHORDS[stepIndex % CHORDS.length];
    for (let i = 0; i < voices.length; i++) {
      const semis = chord[i % chord.length] + (i >= chord.length ? 12 : 0);
      chordFreqs[i] = midiToHz(root + 12 + semis);
    }
    subGain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.08);
    // re-aim the noise bandpass to a dissonant partial
    noiseFilter.frequency.setTargetAtTime(
      800 + (stepIndex % 5) * 520,
      ctx.currentTime,
      0.1,
    );
  }

  function step(frame: number): void {
    const stepIndex = Math.floor(frame / STEP_FRAMES);
    if (stepIndex !== lastStep) {
      lastStep = stepIndex;
      retune(stepIndex);
    }
    const now = ctx.currentTime;
    const t = frame;

    // per-voice: base freq + slow sinusoidal beating on the detune
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      const beat = Math.sin(t * 0.017 + i * 2.1) * 7 + (i - 1) * 6;
      v.osc.frequency.setTargetAtTime(chordFreqs[i], now, 0.05);
      v.osc.detune.setTargetAtTime(beat, now, 0.05);
      // rhythmic, phase-offset gate per voice
      const gate = 0.5 + 0.5 * Math.sin(t * 0.19 + i * 1.7);
      const accent = 0.18 + 0.16 * gate * gate;
      v.g.gain.setTargetAtTime(accent, now, 0.04);
    }

    // sub tremolo
    subOsc.frequency.setTargetAtTime(midiToHz(ROOTS[stepIndex % ROOTS.length]), now, 0.06);
    subGain.gain.setTargetAtTime(0.32 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.05)), now, 0.05);

    // noise swells on a slow triangle-ish envelope
    const swell = 0.5 + 0.5 * Math.sin(t * 0.031 + 1.1);
    noiseGain.gain.setTargetAtTime(0.04 + 0.09 * swell * swell, now, 0.06);
  }

  function setActive(on: boolean, t: number): void {
    output.gain.setTargetAtTime(on ? 1 : 0.0001, t, 0.08);
  }

  function stop(): void {
    try {
      voices.forEach((v) => v.osc.stop());
      subOsc.stop();
      noise.stop();
    } catch {
      /* already stopped */
    }
  }

  return { output, step, setActive, stop };
}
