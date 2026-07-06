export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export async function fetchPianoBuffer(ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, { signal: controller.signal });
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

/**
 * MANDATORY fallback: a ~12s gentle solo-piano-like buffer rendered offline.
 * Detuned partials per note, a slow pentatonic phrase, soft attack / long decay.
 * Guarantees the grain corpus always has real harmonic content — never silence.
 */
export async function renderFallbackBuffer(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const duration = 12;
  const offline = new OfflineAudioContext(1, sampleRate * duration, sampleRate);

  // Slow pentatonic phrase (A minor pentatonic across two octaves).
  const midiPhrase = [57, 60, 64, 67, 69, 67, 64, 62, 60, 57, 60, 64, 69, 72];
  const step = duration / (midiPhrase.length + 1);

  midiPhrase.forEach((midi, i) => {
    const t0 = 0.4 + i * step;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const partials = [
      { mult: 1, gain: 1.0, detune: 0 },
      { mult: 2, gain: 0.42, detune: 1.5 },
      { mult: 3, gain: 0.18, detune: -2 },
      { mult: 4, gain: 0.08, detune: 3 },
    ];
    const noteGain = offline.createGain();
    noteGain.gain.setValueAtTime(0.0001, t0);
    noteGain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.0004, t0 + 2.6);
    noteGain.connect(offline.destination);

    partials.forEach((p) => {
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * p.mult, t0);
      osc.detune.setValueAtTime(p.detune, t0);
      const g = offline.createGain();
      g.gain.setValueAtTime(p.gain, t0);
      osc.connect(g).connect(noteGain);
      osc.start(t0);
      osc.stop(t0 + 3);
    });
  });

  return offline.startRendering();
}
