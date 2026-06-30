// audio.ts — 1064-carrier-melt.
// Karel's REAL solo-piano recording is the carrier wave. We fetch it client-side
// from the read-only /api/audio route, and if the network is unavailable we
// synthesize a slow detuned-piano-ish arpeggio drone so the piece ALWAYS sounds.
// The playing buffer is routed through an AnalyserNode (FFT 2048) plus a gentle
// lowpass + feedback "underwater" tail, so the visuals are genuinely driven by
// the music's spectral energy.

/** Karel's real solo-piano recording id (read-only existing API route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

/** Which carrier ended up playing. Surfaced in the UI. */
export type AudioSourceKind = "piano" | "fallback";

/**
 * Fetch Karel's recording into an AudioBuffer.
 * - 4s abort timeout.
 * - If the response is JSON: parse {url}, fetch that for the bytes.
 * - Else: the body itself is the audio bytes.
 * Returns null on ANY failure (caller falls back to synthesis).
 */
export async function fetchPianoBuffer(ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
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

const ROOT_HZ = 196; // G3-ish — a warm low root for the drone.
// A slow, mostly-consonant arpeggio (semitone offsets) that loops gracefully.
const PHRASE_SEMITONES = [0, 7, 12, 16, 19, 16, 12, 7, 4, 11, 16, 7];

/**
 * Render a ~12s slow detuned-piano-ish arpeggio drone with an OfflineAudioContext.
 * Each note = a few detuned partials with a soft piano-like decay over a faint
 * sustained sub, so an FFT analyser has genuine bass/mid/high structure to read.
 * Looped by the caller so the carrier never stops.
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
  master.gain.value = 0.85;
  master.connect(offline.destination);

  PHRASE_SEMITONES.forEach((semi, i) => {
    const start = i * noteSecs * 0.92; // slight overlap → flowing arpeggio.
    const freq = ROOT_HZ * Math.pow(2, semi / 12);

    const partials = [
      { mult: 1, gain: 0.5, detune: -3 },
      { mult: 2, gain: 0.24, detune: 5 },
      { mult: 3, gain: 0.13, detune: -6 },
      { mult: 4, gain: 0.06, detune: 8 },
    ];
    const bodyGain = offline.createGain();
    bodyGain.connect(master);
    const a = 0.008;
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.3, start + a);
    bodyGain.gain.exponentialRampToValueAtTime(0.0006, start + noteSecs * 2.2);

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
      osc.stop(start + noteSecs * 2.4);
    }

    // Soft hammer transient so highs have onset energy.
    const hammerLen = Math.floor(0.03 * sampleRate);
    const hammerBuf = offline.createBuffer(1, hammerLen, sampleRate);
    const hd = hammerBuf.getChannelData(0);
    for (let n = 0; n < hammerLen; n++) {
      const t = n / hammerLen;
      hd[n] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
    }
    const hammer = offline.createBufferSource();
    hammer.buffer = hammerBuf;
    const hf = offline.createBiquadFilter();
    hf.type = "bandpass";
    hf.frequency.value = Math.min(3500, freq * 5);
    hf.Q.value = 0.6;
    const hg = offline.createGain();
    hg.gain.value = 0.22;
    hammer.connect(hf);
    hf.connect(hg);
    hg.connect(master);
    hammer.start(start);
  });

  // Sustained sub drone → continuous bass for the analyser's bass band.
  const drone = offline.createOscillator();
  drone.type = "sine";
  drone.frequency.value = ROOT_HZ / 2;
  const droneGain = offline.createGain();
  droneGain.gain.value = 0.07;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start(0);
  drone.stop(durationSecs);

  return offline.startRendering();
}

// ─── Playback graph ──────────────────────────────────────────────────────────

/** Everything the render loop needs to read live spectral energy. */
export interface CarrierGraph {
  ctx: AudioContext;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>; // reused FFT magnitude scratch (length = analyser.frequencyBinCount)
  source: AudioBufferSourceNode;
  master: GainNode;
  kind: AudioSourceKind;
}

/**
 * Build the playback graph: looped carrier buffer → lowpass ("underwater melt")
 * → analyser → master → destination. Starts the source immediately.
 */
export function startCarrier(
  ctx: AudioContext,
  buffer: AudioBuffer,
  kind: AudioSourceKind,
): CarrierGraph {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Gentle lowpass for the underwater feel; a touch of resonance for warmth.
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 5200;
  lowpass.Q.value = 0.7;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.78;

  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.25;

  source.connect(lowpass);
  lowpass.connect(analyser);
  analyser.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);

  const t = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.9, t + 1.4); // soft fade-in.

  source.start(t + 0.03);

  return {
    ctx,
    analyser,
    freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
    source,
    master,
    kind,
  };
}

/** Live spectral energy, all in [0,1], read from the analyser each frame. */
export interface SpectralEnergy {
  bass: number;
  mid: number;
  high: number;
  loudness: number;
}

/** Read & band-average the FFT magnitudes into bass / mid / high / loudness. */
export function readEnergy(graph: CarrierGraph): SpectralEnergy {
  const { analyser, freq } = graph;
  analyser.getByteFrequencyData(freq);
  const n = freq.length;
  // Bands as fractions of the (Nyquist) bin range — log-ish split.
  const bassEnd = Math.max(1, Math.floor(n * 0.06));
  const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.28));
  const highEnd = Math.max(midEnd + 1, Math.floor(n * 0.7));

  let bSum = 0;
  let mSum = 0;
  let hSum = 0;
  let all = 0;
  for (let i = 0; i < n; i++) {
    const v = freq[i] / 255;
    all += v;
    if (i < bassEnd) bSum += v;
    else if (i < midEnd) mSum += v;
    else if (i < highEnd) hSum += v;
  }
  const bass = bSum / bassEnd;
  const mid = mSum / (midEnd - bassEnd);
  const high = hSum / (highEnd - midEnd);
  const loudness = all / n;
  // Mild shaping so quiet passages still register without clipping loud ones.
  const shape = (x: number) => Math.min(1, Math.pow(Math.min(1, x * 1.25), 0.85));
  return {
    bass: shape(bass),
    mid: shape(mid),
    high: shape(high * 1.4),
    loudness: shape(loudness * 1.6),
  };
}
