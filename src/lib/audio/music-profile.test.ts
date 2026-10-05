import { describe, expect, it } from "vitest";
import { buildMusicProfile, chordFamily, computeAudioFeatures, estimateTempoFromEnvelope } from "./music-profile";
import { detectKey } from "./analyze";
import type { NoteEvent } from "./types";

const SR = 22050;

/** Decaying piano-ish plucks at a fixed BPM (+ an off-beat ghost note). */
function clickTrack(bpm: number, seconds: number, jitter = 0): Float32Array {
  const out = new Float32Array(SR * seconds);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const beat = 60 / bpm;
  for (let t = 0.2, k = 0; t < seconds - 1; t += beat, k++) {
    const at = t + rnd() * jitter;
    const accent = k % 4 === 0 ? 1 : 0.6;
    for (const [off, amp, f] of [[0, accent, 220 * 2 ** ((k % 5) / 12)], [beat / 2, 0.25, 440]] as const) {
      const s0 = Math.floor((at + off) * SR);
      for (let i = 0; i < SR * 0.6 && s0 + i < out.length; i++) {
        out[s0 + i] += amp * Math.exp(-i / (SR * 0.12)) * Math.sin((2 * Math.PI * f * i) / SR);
      }
    }
  }
  return out;
}

describe("tempo estimation (audio onset envelope)", () => {
  it.each([60, 72, 96])("recovers a steady %i BPM pulse", (bpm) => {
    const af = computeAudioFeatures(clickTrack(bpm, 40), SR);
    const t = estimateTempoFromEnvelope(af.onsetEnv, af.frameRate)!;
    // the tactus or one metrical level away — never an unrelated tempo
    const ratio = t.bpm / bpm;
    expect([0.5, 1, 2].some((r) => Math.abs(ratio / r - 1) < 0.04)).toBe(true);
    expect(t.steadiness).toBeGreaterThan(0.7);
    expect(t.pulse).toBe("steady pulse");
  });

  it("scales with a 1.25x tempo change (no octave flip)", () => {
    const a = computeAudioFeatures(clickTrack(64, 40), SR);
    const b = computeAudioFeatures(clickTrack(80, 40), SR);
    const ta = estimateTempoFromEnvelope(a.onsetEnv, a.frameRate)!.bpm;
    const tb = estimateTempoFromEnvelope(b.onsetEnv, b.frameRate)!.bpm;
    expect(tb / ta).toBeGreaterThan(1.2);
    expect(tb / ta).toBeLessThan(1.3);
  });

  it("reports rubato as lower steadiness than a metronome", () => {
    const steady = computeAudioFeatures(clickTrack(70, 40), SR);
    const loose = computeAudioFeatures(clickTrack(70, 40, 0.18), SR);
    const s1 = estimateTempoFromEnvelope(steady.onsetEnv, steady.frameRate)!;
    const s2 = estimateTempoFromEnvelope(loose.onsetEnv, loose.frameRate)!;
    expect(s2.confidence).toBeLessThan(s1.confidence);
  });
});

describe("key detection", () => {
  const scaleNotes = (pcs: number[], tonicWeight: number[]): NoteEvent[] =>
    pcs.flatMap((pc, i) => Array.from({ length: tonicWeight[i] }, (_, k) => ({ midi: 48 + pc, time: i + k * 0.01, duration: 0.5, velocity: 80 })));
  // G natural minor, tonic/fifth weighted
  const gMinor = scaleNotes([7, 9, 10, 0, 2, 3, 5], [8, 2, 5, 3, 6, 3, 2]);
  // F major
  const fMajor = scaleNotes([5, 7, 9, 10, 0, 2, 4], [8, 2, 5, 3, 6, 3, 2]);

  it("labels G minor as G minor (regression: mis-rotated profile said F minor)", () => {
    expect(detectKey(gMinor)?.key).toBe("G Minor");
    expect(buildMusicProfile({ notes: gMinor, chords: [] }).key.detected).toBe("G Minor");
  });
  it("labels F major as F major (regression: said G major)", () => {
    expect(detectKey(fMajor)?.key).toBe("F Major");
  });
});

describe("chord families", () => {
  it("classifies transcription chord names", () => {
    expect(chordFamily("GMadd9")).toBe("major");
    expect(chordFamily("Gm9")).toBe("minor");
    expect(chordFamily("Csus4")).toBe("suspended");
    expect(chordFamily("Csus2/F")).toBe("suspended");
    // a 13sus4 is a suspended DOMINANT (function over colour)
    expect(chordFamily("C13sus4/F")).toBe("dominant");
    expect(chordFamily("C9")).toBe("dominant");
    expect(chordFamily("Fmaj9")).toBe("major");
  });
});
