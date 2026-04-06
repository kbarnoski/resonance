import { Chord } from "tonal";
import type { NoteEvent, ChordEvent, AnalysisResult } from "./types";
import { detectEvents } from "./detect-events";

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(midi: number): string {
  return PITCH_CLASSES[midi % 12];
}

function midiToFullName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASSES[midi % 12]}${octave}`;
}

/**
 * Group notes into adaptive time windows and detect chords.
 * Uses bass note for inversion detection and tries multiple voicings.
 */
function detectChords(notes: NoteEvent[], baseTempo: number | null): ChordEvent[] {
  if (notes.length === 0) return [];

  // Adaptive window: use beat duration if tempo known, else 0.5s
  const windowSize = baseTempo ? 60 / baseTempo : 0.5;
  const maxTime = Math.max(...notes.map((n) => n.time + n.duration));
  const chords: ChordEvent[] = [];

  for (let t = 0; t < maxTime; t += windowSize) {
    const windowEnd = t + windowSize;

    const activeNotes = notes.filter(
      (n) => n.time < windowEnd && n.time + n.duration > t
    );

    if (activeNotes.length === 0) continue;

    // Sort by pitch — bass note matters for inversions
    const notesByPitch = [...activeNotes].sort((a, b) => a.midi - b.midi);
    const pitchClasses = [...new Set(notesByPitch.map((n) => midiToNoteName(n.midi)))];
    const bassNote = midiToNoteName(notesByPitch[0].midi);

    if (pitchClasses.length < 2) continue;

    let chordName: string | null = null;

    // Try with bass note first for better inversion detection
    const withBassFirst = [bassNote, ...pitchClasses.filter((p) => p !== bassNote)];
    const detected = Chord.detect(withBassFirst);
    if (detected.length > 0) {
      chordName = detected[0];
    } else {
      const allDetected = Chord.detect(pitchClasses);
      chordName = allDetected.length > 0 ? allDetected[0] : null;
    }

    if (!chordName) {
      // Try with just the strongest notes by velocity
      const strongest = [...activeNotes]
        .sort((a, b) => b.velocity - a.velocity)
        .slice(0, 4);
      const strongPCs = [...new Set(strongest.map((n) => midiToNoteName(n.midi)))];
      if (strongPCs.length >= 2) {
        const strongDetected = Chord.detect(strongPCs);
        chordName = strongDetected.length > 0 ? strongDetected[0] : strongPCs.join("/");
      } else {
        continue;
      }
    }

    // Merge with previous chord if same
    const last = chords[chords.length - 1];
    if (last && last.chord === chordName && Math.abs(last.time + last.duration - t) < 0.01) {
      last.duration += windowSize;
    } else {
      chords.push({ chord: chordName, time: t, duration: windowSize });
    }
  }

  return chords;
}

/**
 * Detect key using Krumhansl-Schmuckler algorithm with CORRECT profile rotation.
 * The profile gets rotated to match each candidate tonic, not the histogram.
 */
function detectKey(notes: NoteEvent[]): { key: string; confidence: number } | null {
  if (notes.length === 0) return null;

  // Build duration-weighted pitch class histogram (velocity excluded — it's unreliable from transcription)
  const histogram = new Array(12).fill(0);
  for (const note of notes) {
    const pc = note.midi % 12;
    histogram[pc] += note.duration;
  }

  const total = histogram.reduce((a: number, b: number) => a + b, 0);
  if (total === 0) return null;
  const normalized = histogram.map((v: number) => v / total);

  // Krumhansl-Kessler profiles
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function correlate(profile: number[]): number {
    const meanP = profile.reduce((a, b) => a + b) / 12;
    const meanH = normalized.reduce((a: number, b: number) => a + b) / 12;
    let num = 0, denP = 0, denH = 0;
    for (let i = 0; i < 12; i++) {
      const dp = profile[i] - meanP;
      const dh = normalized[i] - meanH;
      num += dp * dh;
      denP += dp * dp;
      denH += dh * dh;
    }
    return denP * denH > 0 ? num / Math.sqrt(denP * denH) : 0;
  }

  let bestKey = "C Major";
  let bestCorr = -Infinity;

  for (let i = 0; i < 12; i++) {
    // ROTATE THE PROFILE to test each possible tonic against the fixed histogram
    const rotatedMajor = [...majorProfile.slice(i), ...majorProfile.slice(0, i)];
    const rotatedMinor = [...minorProfile.slice(i), ...minorProfile.slice(0, i)];

    const majCorr = correlate(rotatedMajor);
    if (majCorr > bestCorr) {
      bestCorr = majCorr;
      bestKey = `${PITCH_CLASSES[i]} Major`;
    }
    const minCorr = correlate(rotatedMinor);
    if (minCorr > bestCorr) {
      bestCorr = minCorr;
      bestKey = `${PITCH_CLASSES[i]} Minor`;
    }
  }

  return { key: bestKey, confidence: Math.max(0, Math.min(1, (bestCorr + 1) / 2)) };
}

/**
 * Estimate tempo using autocorrelation with beat subdivision awareness
 */
function estimateTempo(notes: NoteEvent[]): number | null {
  if (notes.length < 4) return null;

  const onsets = notes.map((n) => n.time).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i] - onsets[i - 1];
    if (interval > 0.05 && interval < 2.0) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) return null;

  const minBeatDuration = 60 / 240;
  const maxBeatDuration = 60 / 40;
  const step = 0.005;

  let bestBeat = 0;
  let bestScore = -Infinity;

  for (let beat = minBeatDuration; beat <= maxBeatDuration; beat += step) {
    let score = 0;
    for (const interval of intervals) {
      for (let mult = 0.5; mult <= 4; mult *= 2) {
        const ratio = interval / (beat * mult);
        const nearestInt = Math.round(ratio);
        if (nearestInt > 0 && nearestInt <= 8) {
          const deviation = Math.abs(ratio - nearestInt);
          score += Math.exp(-deviation * deviation * 50);
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestBeat = beat;
    }
  }

  if (bestBeat === 0) return null;

  let bpm = 60 / bestBeat;
  while (bpm < 50) bpm *= 2;
  while (bpm > 200) bpm /= 2;

  return Math.round(bpm);
}

/**
 * Detect time signature by analyzing accent patterns
 */
function detectTimeSignature(notes: NoteEvent[], tempo: number | null): string {
  if (!tempo || notes.length < 8) return "4/4";

  const beatDuration = 60 / tempo;
  const onsets = notes.map((n) => n.time).sort((a, b) => a - b);
  const totalDuration = Math.max(...onsets) - Math.min(...onsets);

  let score3 = 0;
  let score4 = 0;

  for (const note of notes) {
    const beatPos3 = (note.time / beatDuration) % 3;
    const beatPos4 = (note.time / beatDuration) % 4;
    const dist3 = Math.min(beatPos3, 3 - beatPos3);
    const dist4 = Math.min(beatPos4, 4 - beatPos4);
    score3 += note.velocity * Math.exp(-dist3 * dist3 * 10);
    score4 += note.velocity * Math.exp(-dist4 * dist4 * 10);
  }

  score3 /= Math.max(1, totalDuration / (beatDuration * 3));
  score4 /= Math.max(1, totalDuration / (beatDuration * 4));

  if (score3 > score4 * 1.15) return "3/4";
  return "4/4";
}

/**
 * Extract melody (top voice)
 */
function extractMelody(notes: NoteEvent[]): NoteEvent[] {
  if (notes.length === 0) return [];

  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const melody: NoteEvent[] = [];
  const windowSize = 0.1;
  const maxTime = Math.max(...notes.map((n) => n.time + n.duration));

  for (let t = 0; t < maxTime; t += windowSize) {
    const active = sorted.filter(
      (n) => n.time <= t + windowSize && n.time + n.duration > t
    );
    if (active.length === 0) continue;

    const highest = active.reduce((a, b) => (a.midi > b.midi ? a : b));

    const last = melody[melody.length - 1];
    if (last && last.midi === highest.midi && Math.abs(last.time + last.duration - t) < 0.01) {
      last.duration += windowSize;
    } else {
      melody.push({ ...highest, time: t, duration: windowSize });
    }
  }

  return melody;
}

/**
 * Extract bass line (bottom voice)
 */
function extractBassLine(notes: NoteEvent[]): NoteEvent[] {
  if (notes.length === 0) return [];

  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const bass: NoteEvent[] = [];
  const windowSize = 0.25;
  const maxTime = Math.max(...notes.map((n) => n.time + n.duration));

  for (let t = 0; t < maxTime; t += windowSize) {
    const active = sorted.filter(
      (n) => n.time <= t + windowSize && n.time + n.duration > t
    );
    if (active.length === 0) continue;

    const lowest = active.reduce((a, b) => (a.midi < b.midi ? a : b));

    const last = bass[bass.length - 1];
    if (last && last.midi === lowest.midi && Math.abs(last.time + last.duration - t) < 0.01) {
      last.duration += windowSize;
    } else {
      bass.push({ ...lowest, time: t, duration: windowSize });
    }
  }

  return bass;
}

/**
 * Analyze harmonic rhythm
 */
function analyzeHarmonicRhythm(chords: ChordEvent[]): string {
  if (chords.length < 2) return "static";

  const durations = chords.map((c) => c.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  if (avgDuration < 0.75) return "fast (chord per beat or faster)";
  if (avgDuration < 1.5) return "moderate (1-2 beats per chord)";
  if (avgDuration < 3) return "slow (1-2 bars per chord)";
  return "very slow (multi-bar)";
}

/**
 * Detect recurring chord progressions
 */
function detectProgressions(chords: ChordEvent[]): string[] {
  if (chords.length < 3) return [];

  const patterns: string[] = [];
  for (let i = 0; i < chords.length - 2; i++) {
    const seq3 = [chords[i].chord, chords[i + 1].chord, chords[i + 2].chord].join(" → ");
    patterns.push(seq3);
    if (i < chords.length - 3) {
      const seq4 = [chords[i].chord, chords[i + 1].chord, chords[i + 2].chord, chords[i + 3].chord].join(" → ");
      patterns.push(seq4);
    }
  }

  const counts = new Map<string, number>();
  for (const p of patterns) {
    counts.set(p, (counts.get(p) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => `${pattern} (×${count})`);
}

export function analyzeNotes(notes: NoteEvent[]): AnalysisResult {
  const tempo = estimateTempo(notes);
  const keyResult = detectKey(notes);
  const key_signature = keyResult?.key ?? null;
  const chords = detectChords(notes, tempo);
  const time_signature = detectTimeSignature(notes, tempo);
  const melody = extractMelody(notes);
  const bassLine = extractBassLine(notes);
  const harmonicRhythm = analyzeHarmonicRhythm(chords);
  const progressions = detectProgressions(chords);
  const events = detectEvents(notes, chords, tempo);

  return {
    status: "completed",
    key_signature,
    key_confidence: keyResult?.confidence ?? 0,
    tempo,
    time_signature,
    chords,
    notes,
    melody,
    bass_line: bassLine,
    harmonic_rhythm: harmonicRhythm,
    progressions,
    events,
    midi_data: null,
  };
}

export { detectChords, detectKey, estimateTempo, extractMelody, extractBassLine, midiToNoteName, midiToFullName };
