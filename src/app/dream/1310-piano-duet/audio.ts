// audio.ts — Karel's real solo-piano recording loader + a mandatory fallback
// synth for 1310-piano-duet ("Sing Into His Piano").
//
// Client-side only. Fetches Karel's real solo-piano recording (his album
// *Welcome Home*) into an AudioBuffer to serve as the CARRIER / excitation for
// the cross-synthesis engine. On ANY failure it synthesizes a ~12s gentle
// looping solo-piano-like buffer via OfflineAudioContext so there is ALWAYS a
// piano to duet with — a cold 06:30 glance must never be silent.
//
// Copied (not imported) from the shared fetch pattern on purpose: dream
// prototypes are self-contained and never cross-import their audio helpers.

/** Karel's real solo-piano recording id (read-only existing GET API route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

/** Which audio source ended up as the carrier. */
export type SourceKind = "piano" | "fallback";

/**
 * Fetch Karel's recording into an AudioBuffer.
 * - 5s abort timeout.
 * - If the response is JSON: parse {url}, fetch that for the bytes.
 * - Else: the response body itself is the audio bytes.
 * Returns null on ANY failure (the caller then synthesizes a fallback).
 */
export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
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

// ─── Fallback synthesis ──────────────────────────────────────────────────────

// A slow lydian phrase (semitone offsets from a low root) so the fallback has
// clear, moving harmonic content across the whole formant-relevant range for
// the cross-synthesis filter bank to sculpt.
const ROOT_HZ = 196; // ~G3
const PHRASE_SEMITONES = [0, 4, 7, 11, 12, 9, 7, 4, 5, 9, 12, 14, 12, 9, 5, 2];

/**
 * Render a ~12s gentle solo-piano-like carrier with an OfflineAudioContext.
 * Each note = a few detuned harmonic partials with a piano-ish decay, plus a
 * short filtered-noise hammer transient, plus a faint sub drone so the low
 * bands always have a floor. This is the carrier when the network is down —
 * so the duet still plays and Karel still hears his sound being sculpted.
 */
export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 12;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, sampleRate);

  const noteSecs = durationSecs / PHRASE_SEMITONES.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  PHRASE_SEMITONES.forEach((semi, i) => {
    const start = i * noteSecs;
    const freq = ROOT_HZ * Math.pow(2, semi / 12);

    // Harmonic body: a few detuned partials with a slow piano-like decay.
    const partials = [
      { mult: 1, gain: 0.5, detune: 0 },
      { mult: 2, gain: 0.24, detune: 4 },
      { mult: 3, gain: 0.13, detune: -5 },
      { mult: 4, gain: 0.07, detune: 7 },
      { mult: 5, gain: 0.04, detune: -8 },
    ];
    const bodyGain = offline.createGain();
    bodyGain.connect(master);
    const a = 0.006;
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.3, start + a);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, start + noteSecs * 1.9);

    for (const p of partials) {
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const g = offline.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(bodyGain);
      osc.start(start);
      osc.stop(start + noteSecs * 2.1);
    }

    // Percussive hammer: short broadband noise burst at note onset.
    const hammerLen = Math.floor(0.04 * sampleRate);
    const hammerBuf = offline.createBuffer(1, hammerLen, sampleRate);
    const hd = hammerBuf.getChannelData(0);
    for (let n = 0; n < hammerLen; n++) {
      const t = n / hammerLen;
      hd[n] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
    }
    const hammer = offline.createBufferSource();
    hammer.buffer = hammerBuf;
    const hammerFilt = offline.createBiquadFilter();
    hammerFilt.type = "bandpass";
    hammerFilt.frequency.value = Math.min(4000, freq * 6);
    hammerFilt.Q.value = 0.6;
    const hammerGain = offline.createGain();
    hammerGain.gain.value = 0.35;
    hammer.connect(hammerFilt);
    hammerFilt.connect(hammerGain);
    hammerGain.connect(master);
    hammer.start(start);
  });

  // A faint sustained sub drone so the low bands always have a floor.
  const drone = offline.createOscillator();
  drone.type = "sine";
  drone.frequency.value = ROOT_HZ / 2;
  const droneGain = offline.createGain();
  droneGain.gain.value = 0.05;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start(0);
  drone.stop(durationSecs);

  return offline.startRendering();
}
