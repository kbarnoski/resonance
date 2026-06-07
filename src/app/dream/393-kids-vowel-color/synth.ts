/**
 * synth.ts — Vowel sing-back resynthesis + ambient pad bed.
 *
 * Tonal world: just-intonation major triad on A3 (220 Hz).
 *   Root  A3  = 220 Hz  (ratio 4)
 *   Major 3rd C#4 = 275 Hz  (ratio 5 → 220 × 5/4)
 *   Perfect 5th E4 = 330 Hz  (ratio 6 → 220 × 6/4)
 *
 * NOT D-Dorian, NOT C-major pentatonic.
 *
 * Vowel sing-back: a warm oscillator stack passed through 2 bandpass filters
 * tuned to the detected F1 and F2 so the tone actually sounds like the vowel
 * the child made. Soft attack/release, never harsh.
 */

import type { VowelId } from "./formants";

// ── Just-intonation major triad on A3 ────────────────────────────────────────

const ROOT_HZ = 220; // A3

export const JI_TRIAD = {
  root: ROOT_HZ,             // ratio 4 : 220 Hz
  third: ROOT_HZ * 5 / 4,   // ratio 5 : 275 Hz (just major 3rd)
  fifth: ROOT_HZ * 6 / 4,   // ratio 6 : 330 Hz (just perfect 5th)
} as const;

// Ambient pad: triad + sub octave for warmth
const PAD_FREQS = [
  ROOT_HZ / 2,       // A2 = 110 Hz (sub)
  JI_TRIAD.root,     // A3 = 220 Hz
  JI_TRIAD.third,    // C#4 = 275 Hz
  JI_TRIAD.fifth,    // E4 = 330 Hz
] as const;

// ── Canonical formant frequencies per vowel (for bandpass filter tuning) ─────
// Mirrors Peterson–Barney centroids. Kept here so synth.ts is self-contained.

const VOWEL_FORMANTS: Record<VowelId, { f1: number; f2: number; f3: number }> = {
  a: { f1: 730, f2: 1090, f3: 2440 },
  e: { f1: 400, f2: 1990, f3: 2550 },
  i: { f1: 270, f2: 2290, f3: 3010 },
  o: { f1: 570, f2: 840,  f3: 2410 },
  u: { f1: 300, f2: 870,  f3: 2240 },
};

// ── Ambient pad ───────────────────────────────────────────────────────────────

export interface PadHandle {
  stop: () => void;
  setGain: (val: number, rampTime?: number) => void;
}

function safeStop(node: AudioNode): void {
  try {
    (node as OscillatorNode).stop();
  } catch {
    // already stopped or not an oscillator
  }
}

export function startAmbientPad(actx: AudioContext): PadHandle {
  const master = actx.createGain();
  master.gain.value = 0;
  master.connect(actx.destination);

  // Fade in gently over 2 s
  master.gain.linearRampToValueAtTime(0.028, actx.currentTime + 2.0);

  const allNodes: AudioNode[] = [master];

  PAD_FREQS.forEach((freq, i) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    const lfo = actx.createOscillator();
    const lg = actx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    lfo.type = "sine";
    lfo.frequency.value = 0.07 + i * 0.019;
    lg.gain.value = freq * 0.003;

    g.gain.value = i === 0 ? 0.45 : 0.28;

    lfo.connect(lg);
    lg.connect(osc.frequency);
    osc.connect(g);
    g.connect(master);

    osc.start();
    lfo.start();

    allNodes.push(osc, lfo, g, lg);
  });

  return {
    stop: () => {
      const t = actx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 1.8);
      setTimeout(() => {
        allNodes.forEach(safeStop);
        master.disconnect();
      }, 2200);
    },
    setGain: (val: number, ramp = 0.1) => {
      const t = actx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(val, t + ramp);
    },
  };
}

// ── Vowel sing-back tone ──────────────────────────────────────────────────────

export interface SingbackHandle {
  setVowel: (vowel: VowelId, f1?: number, f2?: number) => void;
  setAmplitude: (rms: number) => void;
  stop: () => void;
}

export function startSingback(actx: AudioContext): SingbackHandle {
  const masterGain = actx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(actx.destination);

  // Warm oscillator stack: root + octave + fifth (soft sines)
  const oscDefs: { freq: number; gain: number }[] = [
    { freq: JI_TRIAD.root,      gain: 0.55 },
    { freq: JI_TRIAD.root * 2,  gain: 0.18 }, // octave
    { freq: JI_TRIAD.fifth,     gain: 0.14 },
  ];

  const oscs: OscillatorNode[] = [];
  const preGain = actx.createGain();
  preGain.gain.value = 1;

  oscDefs.forEach(({ freq, gain: gval }) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = gval;
    osc.connect(g);
    g.connect(preGain);
    osc.start();
    oscs.push(osc);
  });

  // Two bandpass filters for F1 and F2 vowel colouring
  const bp1 = actx.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.frequency.value = VOWEL_FORMANTS.a.f1;
  bp1.Q.value = 8;

  const bp2 = actx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.value = VOWEL_FORMANTS.a.f2;
  bp2.Q.value = 7;

  // Third formant for extra vowel character
  const bp3 = actx.createBiquadFilter();
  bp3.type = "bandpass";
  bp3.frequency.value = VOWEL_FORMANTS.a.f3;
  bp3.Q.value = 5;

  // Mix: dry path + filtered path
  const dryGain = actx.createGain();
  dryGain.gain.value = 0.32;
  const filtMix = actx.createGain();
  filtMix.gain.value = 0.9;

  preGain.connect(dryGain);
  dryGain.connect(masterGain);

  preGain.connect(bp1);
  preGain.connect(bp2);
  preGain.connect(bp3);
  bp1.connect(filtMix);
  bp2.connect(filtMix);
  bp3.connect(filtMix);
  filtMix.connect(masterGain);

  let currentVowel: VowelId = "a";
  let targetAmp = 0;
  let currentAmp = 0;

  const ampInterval = setInterval(() => {
    currentAmp += (targetAmp - currentAmp) * 0.12;
    const t = actx.currentTime;
    masterGain.gain.setValueAtTime(Math.max(0, currentAmp), t);
  }, 16);

  function applyFormants(vowel: VowelId, detF1?: number, detF2?: number): void {
    const canon = VOWEL_FORMANTS[vowel];
    // Blend detected (noisy) with canonical (stable)
    const f1 = detF1 !== undefined ? detF1 * 0.3 + canon.f1 * 0.7 : canon.f1;
    const f2 = detF2 !== undefined ? detF2 * 0.3 + canon.f2 * 0.7 : canon.f2;
    const t = actx.currentTime;
    bp1.frequency.setTargetAtTime(f1, t, 0.08);
    bp2.frequency.setTargetAtTime(f2, t, 0.08);
    bp3.frequency.setTargetAtTime(canon.f3, t, 0.12);
  }

  return {
    setVowel: (vowel: VowelId, f1?: number, f2?: number) => {
      if (vowel !== currentVowel) {
        currentVowel = vowel;
        applyFormants(vowel, f1, f2);
      }
    },
    setAmplitude: (rms: number) => {
      // Map RMS 0.018–0.3 → amplitude 0–0.38, gently capped
      targetAmp = rms < 0.018 ? 0 : Math.min(0.38, (rms - 0.018) / 0.18);
    },
    stop: () => {
      clearInterval(ampInterval);
      const t = actx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0, t + 0.4);
      setTimeout(() => {
        oscs.forEach(safeStop);
        masterGain.disconnect();
      }, 600);
    },
  };
}

// ── Attract-mode chime ────────────────────────────────────────────────────────

export function playAttractChime(actx: AudioContext, vowelIndex: number): void {
  const chimeFreqs = [JI_TRIAD.root, JI_TRIAD.third, JI_TRIAD.fifth];
  const freq = chimeFreqs[vowelIndex % chimeFreqs.length];
  const t = actx.currentTime;

  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq * 2; // octave up for a light chime
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
  osc.connect(g);
  g.connect(actx.destination);
  osc.start(t);
  osc.stop(t + 1.1);
}
