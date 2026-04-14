import type { NoteEvent } from "./types";

/** Reset the TensorFlow.js WebGL backend. After several consecutive
 *  transcriptions the shader cache / context leaks and the next run fails
 *  with "Failed to complete fragment shader". Calling this between batched
 *  runs fully rebuilds the backend and clears the WebGL state. */
export async function resetTranscribeBackend(): Promise<void> {
  try {
    const tf = await import("@tensorflow/tfjs");
    tf.disposeVariables();
    tf.engine().reset();
    // Force the backend to be torn down and re-initialized on the next run.
    await tf.setBackend("cpu");
    await tf.ready();
    await tf.setBackend("webgl");
    await tf.ready();
  } catch {
    // Best-effort — if tfjs is unavailable the next run just retries fresh
  }
}

export async function transcribeAudio(
  audioUrl: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<NoteEvent[]> {
  onProgress?.("Loading audio...", 10);

  // Resolve signed URL if needed (the audio API now returns JSON with a URL)
  let finalUrl = audioUrl;
  if (audioUrl.startsWith("/api/")) {
    const res = await fetch(audioUrl);
    const data = await res.json();
    if (data.url) {
      finalUrl = data.url;
    }
  }

  const audioContext = new AudioContext({ sampleRate: 22050 });
  let audioBuffer: AudioBuffer;

  // Try decoding the signed URL first; if it fails (ALAC on Chrome), use server transcoding
  try {
    const response = await fetch(finalUrl);
    const arrayBuffer = await response.arrayBuffer();
    onProgress?.("Decoding audio...", 20);
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch {
    // ALAC decode failed — fall back to server-side transcoding
    onProgress?.("Transcoding audio (this may take a minute)...", 15);
    const transcodeUrl = audioUrl.startsWith("/api/") ? audioUrl + "?transcode=1" : audioUrl;
    const response = await fetch(transcodeUrl);
    const arrayBuffer = await response.arrayBuffer();
    onProgress?.("Decoding audio...", 20);
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  }

  // Get mono audio data — cap at 10 minutes to avoid memory issues
  const maxSamples = 22050 * 60 * 10; // 10 minutes at 22050 Hz
  const fullData = audioBuffer.getChannelData(0);
  const audioData = fullData.length > maxSamples ? fullData.slice(0, maxSamples) : fullData;

  if (fullData.length > maxSamples) {
    onProgress?.("Analyzing first 10 minutes...", 25);
  }

  onProgress?.("Loading AI model...", 30);

  // Dynamic import to avoid loading TensorFlow.js on other pages
  const { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } =
    await import("@spotify/basic-pitch");

  const basicPitch = new BasicPitch("/model/model.json");

  onProgress?.("Transcribing notes...", 50);

  let frames: number[][] = [];
  let onsets: number[][] = [];
  let contours: number[][] = [];

  await basicPitch.evaluateModel(
    audioData,
    (f: number[][], o: number[][], c: number[][]) => {
      frames = [...frames, ...f];
      onsets = [...onsets, ...o];
      contours = [...contours, ...c];
    },
    (progress: number) => {
      onProgress?.("Transcribing notes...", 50 + progress * 30);
    }
  );

  onProgress?.("Extracting notes (may take a moment)...", 82);

  const rawNotes = outputToNotesPoly(frames, onsets, 0.25, 0.25, 5);
  onProgress?.("Processing pitch bends...", 87);
  const bentNotes = addPitchBendsToNoteEvents(contours, rawNotes);
  onProgress?.("Finalizing...", 90);
  const notes = noteFramesToTime(bentNotes);

  await audioContext.close();

  onProgress?.("Processing complete", 100);

  return notes.map((note) => ({
    midi: note.pitchMidi,
    time: note.startTimeSeconds,
    duration: note.durationSeconds,
    velocity: Math.round(note.amplitude * 127),
  }));
}
