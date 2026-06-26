// Web Audio engine for "Kids Come Home".
// Kids-safe master chain: gain <= 0.26 -> lowpass ~7000Hz -> compressor -> destination.
// Simple oscillators with ADSR. No granular synthesis, no mic.

// C major diatonic ladder do..ti across C4 -> B4 (Hz).
// do  re   mi   fa   sol  la   ti
export const LADDER_HZ = [
  261.63, // C4 do  (tonic / home)
  293.66, // D4 re
  329.63, // E4 mi
  349.23, // F4 fa
  392.0, // G4 sol
  440.0, // A4 la
  493.88, // B4 ti  (leading tone — pulled home)
];

// Tonic resolution lands one octave below the ladder top for a warm low "home".
export const TONIC_HOME_HZ = 261.63; // C4

// Chords (Hz). I = C E G ; V = G B D (dominant, wants to resolve to I).
const CHORD_I = [130.81, 164.81, 196.0]; // C3 E3 G3
const CHORD_V = [196.0, 246.94, 293.66]; // G3 B3 D4

export interface AudioEngine {
  ctx: AudioContext;
  // tension in 0..1 drives chord crossfade (I -> V), pad brightness, melody detune.
  setTension: (t: number) => void;
  // play a single melody note at the given hz with a soft attack (firefly position).
  setMelody: (hz: number | null) => void;
  // resolve: warm major bloom + soft "ahh" landing on the tonic.
  bloomHome: () => void;
  dispose: () => void;
}

function makeOsc(
  ctx: AudioContext,
  type: OscillatorType,
  hz: number,
  dest: AudioNode,
  level: number,
): { osc: OscillatorNode; gain: GainNode } {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = hz;
  const gain = ctx.createGain();
  gain.gain.value = level;
  osc.connect(gain).connect(dest);
  osc.start();
  return { osc, gain };
}

export function createAudio(ctx: AudioContext): AudioEngine {
  const now = () => ctx.currentTime;

  // ---- kids-safe master chain ----
  const master = ctx.createGain();
  master.gain.value = 0.24; // <= 0.26

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;
  lp.Q.value = 0.7;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.005;
  comp.release.value = 0.25;

  master.connect(lp).connect(comp).connect(ctx.destination);

  // ---- always-on soft pad (never silent) ----
  const padBus = ctx.createGain();
  padBus.gain.value = 0.5;
  padBus.connect(master);
  // gentle root drone, sine, octave + fifth shimmer
  makeOsc(ctx, "sine", 65.41, padBus, 0.22); // C2
  makeOsc(ctx, "sine", 98.0, padBus, 0.1); // G2

  // ---- harmony chord voices (I and V crossfaded by tension) ----
  const chordIGain = ctx.createGain();
  const chordVGain = ctx.createGain();
  chordIGain.gain.value = 0.5; // start home
  chordVGain.gain.value = 0.0;
  chordIGain.connect(master);
  chordVGain.connect(master);
  CHORD_I.forEach((hz) => makeOsc(ctx, "triangle", hz, chordIGain, 0.12));
  CHORD_V.forEach((hz) => makeOsc(ctx, "triangle", hz, chordVGain, 0.12));

  // ---- melody voice (firefly's current pitch) ----
  const melGain = ctx.createGain();
  melGain.gain.value = 0.0;
  const melFilt = ctx.createBiquadFilter();
  melFilt.type = "lowpass";
  melFilt.frequency.value = 4000;
  melGain.connect(melFilt).connect(master);
  const mel = ctx.createOscillator();
  mel.type = "triangle";
  mel.frequency.value = LADDER_HZ[0];
  // soft FM-ish brightness companion (sine an octave up, low level)
  const melHi = ctx.createOscillator();
  melHi.type = "sine";
  melHi.frequency.value = LADDER_HZ[0] * 2;
  const melHiGain = ctx.createGain();
  melHiGain.gain.value = 0.18;
  mel.connect(melGain);
  melHi.connect(melHiGain).connect(melGain);
  mel.start();
  melHi.start();

  // detune wobble LFO (the trembling at high tension) -> melody detune in cents
  const wobble = ctx.createOscillator();
  wobble.type = "sine";
  wobble.frequency.value = 6.5;
  const wobbleAmt = ctx.createGain();
  wobbleAmt.gain.value = 0; // scaled by tension
  wobble.connect(wobbleAmt);
  wobbleAmt.connect(mel.detune);
  wobbleAmt.connect(melHi.detune);
  wobble.start();

  // ---- "ahh" bloom voice for resolution ----
  const bloomBus = ctx.createGain();
  bloomBus.gain.value = 0;
  bloomBus.connect(master);

  let tension = 0;

  const setTension = (t: number) => {
    tension = Math.max(0, Math.min(1, t));
    const tt = now();
    const ease = tension * tension; // bias toward home until quite high
    chordIGain.gain.setTargetAtTime(0.5 * (1 - ease), tt, 0.12);
    chordVGain.gain.setTargetAtTime(0.5 * ease, tt, 0.12);
    // detune wobble grows with tension, strongest near the leading tone
    wobbleAmt.gain.setTargetAtTime(tension * tension * 22, tt, 0.1);
    // open the melody filter as it climbs (brighter = hotter)
    melFilt.frequency.setTargetAtTime(2600 + tension * 4200, tt, 0.12);
  };

  const setMelody = (hz: number | null) => {
    const tt = now();
    if (hz == null) {
      melGain.gain.setTargetAtTime(0.0, tt, 0.18);
      return;
    }
    mel.frequency.setTargetAtTime(hz, tt, 0.04);
    melHi.frequency.setTargetAtTime(hz * 2, tt, 0.04);
    melGain.gain.setTargetAtTime(0.22, tt, 0.05);
  };

  const bloomHome = () => {
    const tt = now();
    // calm the tension instantly: snap toward I chord, kill wobble
    chordIGain.gain.cancelScheduledValues(tt);
    chordVGain.gain.cancelScheduledValues(tt);
    chordIGain.gain.setTargetAtTime(0.55, tt, 0.18);
    chordVGain.gain.setTargetAtTime(0.0, tt, 0.12);
    wobbleAmt.gain.setTargetAtTime(0, tt, 0.08);
    melFilt.frequency.setTargetAtTime(3000, tt, 0.2);
    tension = 0;

    // warm major-chord bloom: C E G (home octave) with soft "ahh" sine swell
    const voices = [261.63, 329.63, 392.0]; // C4 E4 G4
    bloomBus.gain.cancelScheduledValues(tt);
    bloomBus.gain.setValueAtTime(0.0001, tt);
    bloomBus.gain.linearRampToValueAtTime(0.5, tt + 0.08);
    bloomBus.gain.setTargetAtTime(0.0001, tt + 0.5, 0.5);
    voices.forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.18 : 0.12;
      // a tiny "ahh" formant via a gentle lowpass
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1600;
      o.connect(g).connect(f).connect(bloomBus);
      o.start(tt);
      o.stop(tt + 1.8);
    });
  };

  const dispose = () => {
    try {
      mel.stop();
      melHi.stop();
      wobble.stop();
    } catch {
      // already stopped
    }
    try {
      master.disconnect();
    } catch {
      // ignore
    }
  };

  return { ctx, setTension, setMelody, bloomHome, dispose };
}
