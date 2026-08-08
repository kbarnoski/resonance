// ── Web Audio voices: emergent structure → sound ────────────────────────────
//
// Each species owns one detuned pentatonic voice. As that species condenses
// into tight clusters its voice blooms (louder + brighter); when dispersed it
// fades. A soft drone pad underneath keeps it from ever going silent. No
// libraries — just the Web Audio API. Must be created inside a user gesture.

import { S } from "./sim";
import { SPECIES_HZ } from "./matrix";

type Voice = {
  gain: GainNode;
  filter: BiquadFilterNode;
  level: number; // smoothed 0..1
};

export type AudioEngine = {
  ctx: AudioContext;
  setLevels: (levels: Float32Array) => void;
  close: () => void;
};

export function createAudioEngine(): AudioEngine | null {
  type WindowAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
  const AC = window.AudioContext || (window as WindowAudio).webkitAudioContext;
  if (!AC) return null;

  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = 0.0001;

  // gentle feedback delay for an organic wash
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.34;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  master.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  master.connect(ctx.destination);
  wet.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];

  // drone pad bed — a low fifth so it's never silent
  const padGain = ctx.createGain();
  padGain.gain.value = 0.06;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 320;
  padGain.connect(padFilter);
  padFilter.connect(master);
  for (const hz of [65.41, 98.0]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    const od = ctx.createOscillator();
    od.type = "sine";
    od.frequency.value = hz;
    od.detune.value = 6;
    o.connect(padGain);
    od.connect(padGain);
    o.start();
    od.start();
    oscs.push(o, od);
  }

  const voices: Voice[] = [];
  for (let s = 0; s < S; s++) {
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "triangle";
    oscB.type = "sine";
    oscA.frequency.value = SPECIES_HZ[s];
    oscB.frequency.value = SPECIES_HZ[s];
    oscB.detune.value = 7;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscA.start();
    oscB.start();
    oscs.push(oscA, oscB);
    voices.push({ gain, filter, level: 0 });
  }

  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.4);

  function setLevels(levels: Float32Array): void {
    const now = ctx.currentTime;
    for (let s = 0; s < S; s++) {
      const v = voices[s];
      const target = levels[s] ?? 0;
      v.level += (target - v.level) * 0.06; // breathe, don't flicker
      const lvl = v.level;
      const g = 0.0001 + lvl * lvl * 0.2; // squared → quiet when dispersed
      const cutoff = 240 + lvl * 2600;
      v.gain.gain.setTargetAtTime(g, now, 0.12);
      v.filter.frequency.setTargetAtTime(cutoff, now, 0.15);
    }
  }

  function close(): void {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      for (const o of oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      ctx.close();
    } catch {
      /* noop */
    }
  }

  return { ctx, setLevels, close };
}
