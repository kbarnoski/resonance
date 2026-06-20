// agent.ts — the AGENT: a second, SYNTHESIZED voice that listens and responds.
// Two layers:
//   (a) a warm harmonizing pad voiced to the detected chord, sitting UNDER him;
//   (b) a sparse answering melodic voice that plays only in his phrase gaps.
// It mostly RESTS. It supports, it never fights. No browser globals at module top.
//
// Adapted from 770-answering-room. cycle-2 change: the answer is no longer a
// contour-inversion of his last gesture — it SOUNDS a motif drawn from the
// SWARM (the strongest self-organized memory-agent), snapped to the detected
// key. The played-back material therefore self-organizes out of his own
// fragments. The pad + soft FM bell timbre are reused verbatim from 770.

import { scalePitchClasses, type ChordEstimate } from "./listener";
import type { MotifAgent } from "./swarm";

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

// Snap a pitch-class into a singable MIDI note in the answer register,
// pulling it onto the nearest scale tone of the detected key.
function pcToAnswerMidi(pc: number, chord: ChordEstimate): number {
  const scale = scalePitchClasses(chord);
  // If the harvested pc is outside the current key, nudge it to a near scale
  // tone (so old motifs still sound consonant in a new harmony).
  let usePc = pc;
  if (!scale.has(pc)) {
    for (let d = 1; d <= 6; d++) {
      if (scale.has((pc + d) % 12)) {
        usePc = (pc + d) % 12;
        break;
      }
      if (scale.has((pc - d + 12) % 12)) {
        usePc = (pc - d + 12) % 12;
        break;
      }
    }
  }
  // Place it in a C4-ish octave (the answer sings above the pad).
  return 60 + usePc;
}

export type Agent = {
  setChord(chord: ChordEstimate): void;
  // company 0..1 (shy ↔ talkative); energy 0..1 of his playing.
  setCompany(company: number): void;
  updatePad(energy: number, now: number): void;
  // Sound a swarm motif as the answer, snapped to the detected key.
  // `extended` lengthens it (the "trading fours" swell). Returns answer-end time.
  answerWithMotif(
    motif: MotifAgent,
    chord: ChordEstimate,
    now: number,
    extended: boolean,
  ): number;
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

  // ── Answer layer (sparse, only in gaps) — now sounds a SWARM motif ──
  function answerWithMotif(
    motif: MotifAgent,
    chord: ChordEstimate,
    now: number,
    extended: boolean,
  ): number {
    // Respect a minimum spacing so it never natters.
    const spacing = 1.6 - company * 0.9; // talkative → shorter spacing
    if (now - lastAnswerEnd < spacing) return 0;

    // Build the line from the motif's harvested pitch-classes + its rhythm,
    // snapped into the current key. For the trading-fours swell, repeat the
    // motif (a second pass an octave-mixed register) for a longer turn.
    const passes = extended ? 2 : 1;
    let t = now + 0.04;
    const gain = 0.13 + company * 0.06;

    for (let pass = 0; pass < passes; pass++) {
      for (let n = 0; n < motif.pcs.length; n++) {
        const isLastOverall =
          pass === passes - 1 && n === motif.pcs.length - 1;
        // Land the final note on a chord tone for consonant resolution.
        const midi = isLastOverall
          ? 60 + chord.root + (chord.quality === "maj" ? 4 : 3)
          : pcToAnswerMidi(motif.pcs[n], chord);
        // Rhythm comes from the harvested inter-onset gaps (rough but his).
        const gapMs = motif.gapsMs[n] ?? 360;
        const dur = Math.max(0.28, Math.min(1.2, gapMs / 1000));
        const noteDur = isLastOverall ? Math.max(dur, 1.0) : dur;
        playBell(ctx, out, midiToFreq(midi), t, noteDur, gain);
        t += dur * 0.82;
      }
      if (passes > 1 && pass === 0) t += 0.18; // a small breath between passes
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
    answerWithMotif,
    isAnswering,
    dispose,
  };
}

// A soft FM-ish bell/pluck for the answering voice. (Verbatim from 770.)
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
