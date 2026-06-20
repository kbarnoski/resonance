// agent.ts — the AGENT: a second, SYNTHESIZED voice that listens and responds.
// Two layers:
//   (a) a warm harmonizing pad voiced to the detected chord, sitting UNDER him;
//   (b) a sparse answering melodic voice that plays only in his phrase gaps.
// It mostly RESTS. It supports, it never fights. No browser globals at module top.

import type { ChordEstimate } from "./listener";

const MAJ_INTERVALS = [0, 4, 7]; // root, major third, fifth
const MIN_INTERVALS = [0, 3, 7]; // root, minor third, fifth

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Voicing for the pad: chord tones around a warm middle register.
function chordMidis(chord: ChordEstimate): number[] {
  const ivs = chord.quality === "maj" ? MAJ_INTERVALS : MIN_INTERVALS;
  const base = 48 + chord.root; // C3-ish register for the root
  return ivs.map((iv) => base + iv).concat([base + 12 + ivs[1]]); // add an upper third
}

// Scale (for the answer) belonging to the detected chord's key.
function scaleMidis(chord: ChordEstimate): number[] {
  // Natural major or natural minor degrees relative to root.
  const degrees =
    chord.quality === "maj"
      ? [0, 2, 4, 5, 7, 9, 11]
      : [0, 2, 3, 5, 7, 8, 10];
  const base = 60 + chord.root; // C4-ish — the answer sings above the pad
  return degrees.map((d) => base + d);
}

export type Agent = {
  setChord(chord: ChordEstimate): void;
  // company 0..1 (shy ↔ talkative); energy 0..1 of his playing.
  setCompany(company: number): void;
  updatePad(energy: number, now: number): void;
  // Trigger a short answer phrase in a gap. lastRoot/contour shape the line.
  answer(chord: ChordEstimate, contour: number, now: number): number;
  isAnswering(now: number): boolean;
  dispose(): void;
};

export function buildAgent(ctx: AudioContext, out: GainNode): Agent {
  // ── Pad layer (continuous, lowpassed, gentle) ──
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.5;
  padGain.connect(padFilter).connect(out);

  // A small fixed pool of detuned oscillators we retune to chord tones.
  type Voice = { osc: OscillatorNode; g: GainNode };
  const voices: Voice[] = [];
  const VOICE_COUNT = 4;
  for (let i = 0; i < VOICE_COUNT; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.detune.value = (i - 1.5) * 5; // slight chorus
    const g = ctx.createGain();
    g.gain.value = 1 / VOICE_COUNT;
    osc.connect(g).connect(padGain);
    osc.start();
    voices.push({ osc, g });
  }

  let company = 0.5;
  let lastAnswerEnd = 0;

  function setChord(chord: ChordEstimate): void {
    const midis = chordMidis(chord);
    const now = ctx.currentTime;
    for (let i = 0; i < voices.length; i++) {
      const m = midis[i % midis.length];
      voices[i].osc.frequency.setTargetAtTime(midiToFreq(m), now, 0.25);
    }
  }

  function setCompany(c: number): void {
    company = Math.max(0, Math.min(1, c));
  }

  function updatePad(energy: number, now: number): void {
    // Pad swells gently with his energy but stays UNDER him.
    // Shyer company → quieter pad.
    const target = (0.05 + energy * 0.1) * (0.5 + company * 0.7);
    padGain.gain.setTargetAtTime(Math.min(0.16, target), now, 0.4);
  }

  // ── Answer layer (sparse, only in gaps) ──
  function answer(chord: ChordEstimate, contour: number, now: number): number {
    // Respect a minimum spacing so it never natters.
    const spacing = 1.6 - company * 0.9; // talkative → shorter spacing
    if (now - lastAnswerEnd < spacing) return 0;

    const scale = scaleMidis(chord);
    // A short complementary gesture: 2–4 notes, loosely inverting his contour.
    // contour high (he went up) → we answer descending, and vice versa.
    const noteCount = 2 + Math.round(company * 2); // 2..4 notes
    const descending = contour > 0.5;
    const startIdx = descending ? 4 : 0; // start high if we descend
    const dir = descending ? -1 : 1;

    let t = now + 0.04;
    for (let n = 0; n < noteCount; n++) {
      const idx = Math.max(
        0,
        Math.min(scale.length - 1, startIdx + dir * n * (1 + (n % 2))),
      );
      // Land the final note on a chord tone for consonant resolution.
      const isLast = n === noteCount - 1;
      const midi = isLast
        ? 60 + chord.root + (chord.quality === "maj" ? 4 : 3)
        : scale[idx];
      const dur = isLast ? 1.1 : 0.42;
      playBell(ctx, out, midiToFreq(midi), t, dur, 0.13 + company * 0.06);
      t += dur * 0.8;
    }
    lastAnswerEnd = t + 0.3;
    return lastAnswerEnd;
  }

  function isAnswering(now: number): boolean {
    return now < lastAnswerEnd;
  }

  function dispose(): void {
    const now = ctx.currentTime;
    padGain.gain.setTargetAtTime(0, now, 0.2);
    for (const v of voices) {
      try {
        v.osc.stop(now + 0.6);
      } catch {
        // already stopped
      }
    }
    setTimeout(() => {
      try {
        padGain.disconnect();
        padFilter.disconnect();
        for (const v of voices) v.g.disconnect();
      } catch {
        // nodes already gone
      }
    }, 800);
  }

  return {
    setChord,
    setCompany,
    updatePad,
    answer,
    isAnswering,
    dispose,
  };
}

// A soft FM-ish bell/pluck for the answering voice.
function playBell(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  t: number,
  dur: number,
  gain: number,
): void {
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * 2.01;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * 1.4, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.2, t + dur);
  mod.connect(modGain).connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;

  carrier.connect(env).connect(tone).connect(out);
  carrier.start(t);
  mod.start(t);
  carrier.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}
