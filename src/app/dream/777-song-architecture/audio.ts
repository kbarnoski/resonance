// Audio loading + synthesized fallback for the Song Architecture SSM prototype.

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export async function fetchPianoBuffer(
  ctx: BaseAudioContext
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }
    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Equal-temperament frequency for a MIDI-like note number (A4 = 69 = 440Hz).
function noteHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Render a single decaying piano-ish note (a few harmonics) into a channel.
function renderNote(
  data: Float32Array,
  sampleRate: number,
  startSec: number,
  durSec: number,
  midi: number,
  gain: number
): void {
  const f = noteHz(midi);
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(durSec * sampleRate);
  const harmonics = [1, 2, 3, 4, 5];
  const hGain = [1, 0.5, 0.32, 0.18, 0.1];
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= data.length) break;
    const t = i / sampleRate;
    // Percussive attack + exponential decay, like a struck string.
    const attack = Math.min(1, t / 0.006);
    const env = attack * Math.exp(-t * 4.0);
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) {
      s += hGain[h] * Math.sin(2 * Math.PI * f * harmonics[h] * t);
    }
    data[idx] += s * env * gain;
  }
}

// Build a clear A–B–A phrase so the SSM shows genuine off-diagonal recurrence.
// Returns an AudioBuffer rendered offline.
export async function makeFallbackBuffer(
  OfflineCtor: typeof OfflineAudioContext
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const totalSec = 36;
  const ctx = new OfflineCtor(1, Math.ceil(totalSec * sampleRate), sampleRate);
  const data = ctx.createBuffer(1, ctx.length, sampleRate).getChannelData(0);

  // Phrase A: a rising C-major arpeggio + melody (C E G C, then a turn).
  const aMelody = [60, 64, 67, 72, 71, 67, 64, 60];
  // Phrase B: a contrasting A-minor descent (A F E C ...).
  const bMelody = [69, 65, 64, 60, 62, 64, 65, 67];

  const beat = 0.5; // seconds per note

  const playPhrase = (
    melody: number[],
    offsetSec: number,
    bassRoot: number
  ): number => {
    let t = offsetSec;
    for (let n = 0; n < melody.length; n++) {
      renderNote(data, sampleRate, t, beat * 1.6, melody[n], 0.22);
      // a sustained bass note under every two melody notes
      if (n % 2 === 0) {
        renderNote(data, sampleRate, t, beat * 2.2, bassRoot, 0.16);
        renderNote(data, sampleRate, t, beat * 2.2, bassRoot + 7, 0.1);
      }
      t += beat;
    }
    return t;
  };

  // Form: A  B  A  (the final A is an exact recurrence of the first).
  let cursor = 0.5;
  cursor = playPhrase(aMelody, cursor, 48); // A
  cursor += 0.4;
  cursor = playPhrase(bMelody, cursor, 45); // B
  cursor += 0.4;
  cursor = playPhrase(aMelody, cursor, 48); // A (repeat)
  cursor += 0.4;
  // A short coda echoing A's opening.
  renderNote(data, sampleRate, cursor, 1.2, 60, 0.2);
  renderNote(data, sampleRate, cursor, 1.2, 64, 0.16);
  renderNote(data, sampleRate, cursor, 1.2, 67, 0.14);

  // Write our composed mono channel into a real rendered buffer.
  const src = ctx.createBufferSource();
  const composed = ctx.createBuffer(1, ctx.length, sampleRate);
  composed.getChannelData(0).set(data);
  src.buffer = composed;
  src.connect(ctx.destination);
  src.start();
  return await ctx.startRendering();
}
