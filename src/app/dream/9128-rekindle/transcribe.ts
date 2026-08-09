/**
 * Neural audio → note transcription for `9128-rekindle`.
 *
 * Wraps Spotify's `@spotify/basic-pitch` (a small TF.js model, Bittner et al.,
 * ICASSP 2022) to turn a decoded piano recording into discrete note events.
 * Both `@spotify/basic-pitch` and `@tensorflow/tfjs` are heavy and browser-only,
 * so they are imported DYNAMICALLY inside `runTranscription` — the page renders
 * (with the seeded fallback phrase) even if these imports never run.
 */

export interface NoteEvent {
  /** MIDI pitch number (60 = middle C). */
  midi: number;
  /** Onset time in seconds. */
  start: number;
  /** Duration in seconds. */
  dur: number;
  /** Velocity / amplitude in [0, 1]. */
  vel: number;
}

/** The sample rate basic-pitch's model expects. */
const MODEL_SAMPLE_RATE = 22050;

/**
 * Model weights are fetched from a CDN at transcribe time. If the network
 * blocks this (offline, CSP, corporate proxy) we fall back to the built-in
 * phrase — the piece never hard-fails on a missing model.
 */
const MODEL_URL =
  "https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json";

/**
 * Built-in fallback phrase — a gentle diatonic piano line in C major that
 * doubles as the seeded auto-demo. Used verbatim when the model can't load so
 * the reharmonizer and piano-roll always have something to chew on. Times are
 * in seconds; the phrase is ~7s long.
 */
export const FALLBACK_PHRASE: NoteEvent[] = [
  { midi: 67, start: 0.0, dur: 0.55, vel: 0.8 }, // G4
  { midi: 72, start: 0.55, dur: 0.55, vel: 0.85 }, // C5
  { midi: 71, start: 1.1, dur: 0.45, vel: 0.7 }, // B4
  { midi: 72, start: 1.55, dur: 0.4, vel: 0.75 }, // C5
  { midi: 74, start: 1.95, dur: 0.8, vel: 0.9 }, // D5
  { midi: 72, start: 2.75, dur: 0.5, vel: 0.7 }, // C5
  { midi: 69, start: 3.25, dur: 0.85, vel: 0.75 }, // A4
  { midi: 67, start: 4.1, dur: 0.55, vel: 0.7 }, // G4
  { midi: 65, start: 4.65, dur: 0.55, vel: 0.7 }, // F4
  { midi: 64, start: 5.2, dur: 0.55, vel: 0.72 }, // E4
  { midi: 62, start: 5.75, dur: 0.55, vel: 0.7 }, // D4
  { midi: 60, start: 6.3, dur: 1.1, vel: 0.85 }, // C4
];

export type TranscribeMode = "fallback" | "model";

export interface TranscribeResult {
  notes: NoteEvent[];
  mode: TranscribeMode;
  /** Human-readable note about how the transcription was produced. */
  info: string;
}

/**
 * Resample a decoded AudioBuffer to mono @ 22050 Hz using an OfflineAudioContext,
 * returning a fresh AudioBuffer shaped the way basic-pitch expects.
 */
async function resampleForModel(buffer: AudioBuffer): Promise<AudioBuffer> {
  const durationSec = buffer.duration;
  const length = Math.max(1, Math.ceil(durationSec * MODEL_SAMPLE_RATE));
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, MODEL_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

/**
 * Transcribe a decoded AudioBuffer into note events with basic-pitch. Throws if
 * the model can't be loaded or evaluated — callers should catch and fall back
 * to {@link FALLBACK_PHRASE}.
 */
export async function runTranscription(
  buffer: AudioBuffer,
  onProgress?: (frac: number) => void,
): Promise<NoteEvent[]> {
  // Heavy, browser-only deps — imported here so they never touch SSR or the
  // initial client bundle. basic-pitch pulls in @tensorflow/tfjs itself, so
  // both stay out of the initial bundle until this handler runs.
  const { BasicPitch, noteFramesToTime, outputToNotesPoly, addPitchBendsToNoteEvents } =
    await import("@spotify/basic-pitch");

  const mono = await resampleForModel(buffer);

  const basicPitch = new BasicPitch(MODEL_URL);

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await basicPitch.evaluateModel(
    mono,
    (f: number[][], o: number[][], c: number[][]) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p: number) => onProgress?.(p),
  );

  // Onset threshold, frame threshold, minimum note length (frames).
  const rawNotes = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(frames, onsets, 0.25, 0.25, 5),
    ),
  );

  const notes: NoteEvent[] = rawNotes
    .map(
      (n: {
        startTimeSeconds: number;
        durationSeconds: number;
        pitchMidi: number;
        amplitude: number;
      }): NoteEvent => ({
        midi: n.pitchMidi,
        start: n.startTimeSeconds,
        dur: Math.max(0.08, n.durationSeconds),
        vel: Math.min(1, Math.max(0.05, n.amplitude)),
      }),
    )
    .sort((a: NoteEvent, b: NoteEvent) => a.start - b.start);

  if (notes.length === 0) {
    throw new Error("Model returned no notes");
  }
  return notes;
}

/**
 * Decode an ArrayBuffer of encoded audio into an AudioBuffer using the given
 * AudioContext. Returns null on failure (unsupported codec, corrupt file).
 */
export async function decodeAudio(
  ctx: AudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer | null> {
  try {
    return await ctx.decodeAudioData(data.slice(0));
  } catch {
    return null;
  }
}

/**
 * Keep only the melody line: at any moment prefer a single voice. basic-pitch is
 * polyphonic, but the reharmonizer wants a monophonic melody to re-voice, so we
 * greedily keep the highest active note and drop overlaps beneath it.
 */
export function extractMelody(notes: NoteEvent[]): NoteEvent[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || b.midi - a.midi);
  const out: NoteEvent[] = [];
  let lastEnd = -Infinity;
  for (const n of sorted) {
    if (n.start >= lastEnd - 0.03) {
      out.push(n);
      lastEnd = n.start + n.dur;
    }
  }
  return out;
}
