// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — audio source (3 tiers) + per-frame analysis for 1188-welcome-sky.
//
//   Tier 1: Karel's real "Welcome Home" solo-piano recording, fetched through the
//           EXISTING read-only route GET /api/audio/<id> (handles both response
//           shapes: JSON {url} or raw audio bytes).
//   Tier 2: a dropped / picked local audio file.
//   Tier 3: an offline-rendered gentle detuned-partial piano arpeggio so there is
//           always real harmonic + percussive content — never blank, never silent.
//
//   The graph while playing:
//     source → convolver(reverb) → compressor(limiter) → master(~0.2) → dest
//     source →                                    → analyser (read each frame)
//
//   Analysis exposes RMS `energy`, spectral `flux` (onset strength) and spectral
//   `centroid` (brightness), plus `progress` = currentTime / duration (the
//   day-phase clock). Everything is smoothed so the sky drifts, never strobes.
// ─────────────────────────────────────────────────────────────────────────────

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";
export type AudioSourceKind = "recording" | "file" | "fallback";

/** Fetch a Path recording into an AudioBuffer via the existing read-only route.
 *  Handles both response shapes: JSON {url} or raw audio bytes. Null on any failure. */
export async function fetchRecordingBuffer(
  ctx: BaseAudioContext,
  id: string,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`/api/audio/${encodeURIComponent(id)}`, {
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

export async function decodeFileBuffer(
  ctx: BaseAudioContext,
  file: File,
): Promise<AudioBuffer | null> {
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  }
}

// ── Tier 3: deterministic offline piano arpeggio ────────────────────────────
// A slow ascending/descending arpeggio over an open, consonant voicing. Each
// note is a small stack of detuned partials with a soft percussive attack and a
// long exponential tail, so the analyser sees genuine onsets + harmonic content.

const A_MAJ9 = [
  220.0, // A3
  277.18, // C#4
  329.63, // E4
  415.3, // G#4
  554.37, // C#5
  659.25, // E5
];

function makeNote(
  offline: OfflineAudioContext,
  freq: number,
  start: number,
  dur: number,
  gainScale: number,
): void {
  const partials = [1, 2, 3, 4.02];
  const partialGain = [1.0, 0.42, 0.2, 0.08];
  const noteGain = offline.createGain();
  noteGain.gain.setValueAtTime(0.0001, start);
  noteGain.gain.exponentialRampToValueAtTime(0.9 * gainScale, start + 0.012);
  noteGain.gain.exponentialRampToValueAtTime(0.0006, start + dur);
  noteGain.connect(offline.destination);

  partials.forEach((mult, i) => {
    const osc = offline.createOscillator();
    osc.type = "sine";
    // Tiny per-partial detune gives the shimmer of a real struck string.
    osc.frequency.value = freq * mult * (1 + (i - 1.5) * 0.0008);
    const pg = offline.createGain();
    pg.gain.value = partialGain[i];
    osc.connect(pg).connect(noteGain);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  });
}

/** Render ~16s deterministic piano arpeggio. */
export async function renderFallbackBuffer(
  sampleRate: number,
): Promise<AudioBuffer> {
  const length = Math.floor(sampleRate * 16);
  const offline = new OfflineAudioContext(2, length, sampleRate);

  const step = 0.5;
  let t = 0.3;
  // Up the voicing, then back down — two gentle passes over 16s.
  const sequence: number[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < A_MAJ9.length; i++) sequence.push(A_MAJ9[i]);
    for (let i = A_MAJ9.length - 2; i > 0; i--) sequence.push(A_MAJ9[i]);
  }
  sequence.forEach((f, i) => {
    const emphasis = i % A_MAJ9.length === 0 ? 0.7 : 0.5;
    makeNote(offline, f, t, 1.8, emphasis);
    t += step;
  });
  // A soft sustaining low root pad underneath for warmth.
  makeNote(offline, 110.0, 0.3, 15.0, 0.28);

  return offline.startRendering();
}

// ── Live analysis ───────────────────────────────────────────────────────────

export interface Features {
  energy: number; // RMS 0..1 (smoothed)
  flux: number; // onset strength 0..1 (smoothed)
  centroid: number; // spectral centroid 0..1 (smoothed)
  progress: number; // currentTime / duration 0..1
}

/** Owns the AnalyserNode + smoothing state; call read() once per frame. */
export class Analysis {
  private analyser: AnalyserNode;
  private timeBuf: Float32Array;
  private freqBuf: Uint8Array;
  private prevMag: Float32Array;
  private energy = 0;
  private flux = 0;
  private centroid = 0;

  constructor(ctx: BaseAudioContext) {
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    a.smoothingTimeConstant = 0.6;
    this.analyser = a;
    this.timeBuf = new Float32Array(a.fftSize);
    this.freqBuf = new Uint8Array(a.frequencyBinCount);
    this.prevMag = new Float32Array(a.frequencyBinCount);
  }

  get node(): AnalyserNode {
    return this.analyser;
  }

  read(progress: number): Features {
    const a = this.analyser;
    a.getFloatTimeDomainData(this.timeBuf as Float32Array<ArrayBuffer>);
    a.getByteFrequencyData(this.freqBuf as Uint8Array<ArrayBuffer>);

    // RMS energy.
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = this.timeBuf[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeBuf.length);
    const rawEnergy = Math.min(1, rms * 3.2);

    // Spectral flux (positive difference) + centroid.
    let flux = 0;
    let weighted = 0;
    let total = 0;
    const bins = this.freqBuf.length;
    for (let i = 0; i < bins; i++) {
      const m = this.freqBuf[i] / 255;
      const d = m - this.prevMag[i];
      if (d > 0) flux += d;
      this.prevMag[i] = m;
      weighted += i * m;
      total += m;
    }
    const rawFlux = Math.min(1, (flux / bins) * 12);
    const rawCentroid = total > 1e-4 ? weighted / total / bins : 0;

    // Smooth: energy/centroid drift slowly; flux may rise fast (onset) but
    // decays slowly so no shaft ever strobes.
    this.energy += (rawEnergy - this.energy) * 0.08;
    this.centroid += (Math.min(1, rawCentroid * 2.4) - this.centroid) * 0.05;
    const target = Math.max(rawFlux, this.flux * 0.9);
    this.flux += (target - this.flux) * (rawFlux > this.flux ? 0.5 : 0.06);

    return {
      energy: this.energy,
      flux: this.flux,
      centroid: this.centroid,
      progress: Math.min(1, Math.max(0, progress)),
    };
  }
}

// ── A short synthetic convolution reverb impulse (no external asset) ─────────
export function makeReverbImpulse(ctx: BaseAudioContext, seconds = 2.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}
