// synth.ts — the seeded warm-piano fallback for 9368-afterglow.
//
// When Karel's real *Welcome Home* recording cannot be fetched/decoded
// (network, CORS, timeout, 404, no decodeAudioData) the piece must still SOUND
// and still disintegrate. So instead of a live oscillator graph we synthesise a
// short, warm, major "welcome-home" arpeggio directly into an AudioBuffer,
// sample by sample. That buffer then feeds the EXACT same disintegration +
// grain path as the real recording — the rest of the engine never knows which
// source it is playing.
//
// Direct-sample additive synthesis (no OfflineAudioContext dependency) keeps the
// fallback bulletproof: it needs nothing but `ctx.createBuffer`, so it works
// even where offline rendering is unavailable. Every timing / velocity nudge is
// drawn from a mulberry32 stream, so two runs render an identical buffer.

import { mulberry32, SEED } from "./rng";

const LEN_SEC = 18; // one warm phrase; the engine loops it
const A4 = 440;

// A warm, consonant "coming home" progression: I – IV – vi – V in C major.
// Semitone offsets from C. Each chord is arpeggiated as a slow bloom.
const CHORDS: number[][] = [
  [0, 4, 7, 12], // C major   (I)   — home
  [5, 9, 12, 17], // F major   (IV)  — opening out
  [9, 12, 16, 21], // A minor  (vi)  — the ache
  [7, 11, 14, 19], // G major  (V)   — the turn back
];

// C3 as the arpeggio anchor (MIDI 48). midi->Hz.
function midiHz(midi: number): number {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Synthesise a warm felt-piano welcome-home phrase into an AudioBuffer.
 * Deterministic: identical output for a given seed and sampleRate.
 */
export function synthesizeWelcomeHome(
  ctx: BaseAudioContext,
  seed: number = SEED
): AudioBuffer {
  const rand = mulberry32(seed ^ 0x5eed);
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * LEN_SEC);
  const buf = ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  // Felt-piano voice: a few low harmonics with fast-decaying upper partials,
  // a soft attack and a long exponential tail. Warm = weak high harmonics.
  const PARTIALS: { mult: number; amp: number; decay: number }[] = [
    { mult: 1, amp: 1.0, decay: 2.6 },
    { mult: 2, amp: 0.42, decay: 3.2 },
    { mult: 3, amp: 0.2, decay: 4.0 },
    { mult: 4, amp: 0.1, decay: 5.0 },
    { mult: 6, amp: 0.05, decay: 6.5 },
  ];

  const chordDur = LEN_SEC / CHORDS.length; // ~4.5s per chord

  // Schedule note events across the phrase.
  type Note = { start: number; freq: number; vel: number; detune: number };
  const notes: Note[] = [];
  for (let c = 0; c < CHORDS.length; c++) {
    const chord = CHORDS[c];
    const base = c * chordDur;
    // Arpeggiate up, then let a couple of notes bloom together.
    for (let i = 0; i < chord.length; i++) {
      const semis = chord[i];
      const midi = 48 + semis; // anchor at C3
      const jitter = (rand() - 0.5) * 0.06;
      const start = base + i * (chordDur / (chord.length + 1)) + jitter;
      const vel = 0.16 + rand() * 0.1;
      const detune = (rand() - 0.5) * 6; // cents, gentle chorus width
      notes.push({ start, freq: midiHz(midi), vel, detune });
    }
    // A soft sustained root an octave down for body under each chord.
    notes.push({
      start: base + 0.02,
      freq: midiHz(36 + chord[0]),
      vel: 0.12 + rand() * 0.05,
      detune: 0,
    });
  }

  const twoPi = Math.PI * 2;
  for (const note of notes) {
    const startSample = Math.floor(note.start * sr);
    const ratioL = Math.pow(2, -note.detune / 1200);
    const ratioR = Math.pow(2, note.detune / 1200);
    // Note rings until the end of the buffer (long felt tail), capped.
    const tailSec = 6.5;
    const endSample = Math.min(n, startSample + Math.floor(tailSec * sr));
    const attack = 0.03; // soft felt attack

    for (let s = startSample; s < endSample; s++) {
      const t = (s - startSample) / sr;
      // Attack ramp then per-partial exponential decay handled below.
      const env = t < attack ? t / attack : 1;
      let sampL = 0;
      let sampR = 0;
      for (const p of PARTIALS) {
        const decayAmp = Math.exp(-t / p.decay) * p.amp;
        if (decayAmp < 0.0008) continue;
        const fL = note.freq * p.mult * ratioL;
        const fR = note.freq * p.mult * ratioR;
        sampL += Math.sin(twoPi * fL * t) * decayAmp;
        sampR += Math.sin(twoPi * fR * t) * decayAmp;
      }
      const g = note.vel * env * 0.5;
      L[s] += sampL * g;
      R[s] += sampR * g;
    }
  }

  // Gentle global normalisation guard so summed notes never clip the buffer.
  let peak = 0;
  for (let s = 0; s < n; s++) {
    const a = Math.abs(L[s]);
    const b = Math.abs(R[s]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  if (peak > 0.9) {
    const k = 0.9 / peak;
    for (let s = 0; s < n; s++) {
      L[s] *= k;
      R[s] *= k;
    }
  }

  return buf;
}
