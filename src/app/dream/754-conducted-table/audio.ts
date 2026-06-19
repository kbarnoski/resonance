// audio.ts — Conducted Table · loader + PHRASE segmentation + look-ahead scheduler.
//
// Cycle-2 of 729-piano-portal-jam. We keep 729's networking idea (both peers hold
// the SAME recording; only tiny note-EVENTS travel) but we DO NOT use its grain
// resynthesis. Instead we segment Karel's real piano into musical PHRASES by
// onset / silence detection and replay whole phrases via AudioBufferSourceNode.
//
// CLIENT-SIDE ONLY. Reads an existing public GET route; nothing recorded/uploaded.
// No API route is created here, so no guard is needed.

/** Karel's real solo-piano recording id (read-only existing API route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

/**
 * Fetch Karel's recording into an AudioBuffer. (Proven pattern, copied verbatim
 * from the lab's piano loaders.)
 */
export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
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
// If the live recording can't be fetched, render ~14s of a soft, detuned
// arpeggio offline so phrase segmentation ALWAYS has musical content. A small
// text-rose-300 notice surfaces in the UI that a fallback tone is playing.

const FALLBACK_ROOT_HZ = 196; // ~G3
// Grouped into clear phrases separated by short rests so onset detection finds
// natural phrase boundaries even in the fallback.
const FALLBACK_NOTES: { semi: number; rest: boolean }[] = [
  { semi: 0, rest: false }, { semi: 4, rest: false }, { semi: 7, rest: false },
  { semi: 12, rest: true },
  { semi: 11, rest: false }, { semi: 7, rest: false }, { semi: 4, rest: false },
  { semi: 0, rest: true },
  { semi: 7, rest: false }, { semi: 12, rest: false }, { semi: 16, rest: false },
  { semi: 19, rest: true },
  { semi: 16, rest: false }, { semi: 12, rest: false }, { semi: 7, rest: false },
  { semi: 0, rest: true },
];

/**
 * Render a ~14s gentle piano-ish buffer with an OfflineAudioContext so phrase
 * segmentation always has real harmonic + percussive content with rests.
 */
export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 16;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, sampleRate);

  const slotSecs = durationSecs / FALLBACK_NOTES.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  FALLBACK_NOTES.forEach((note, i) => {
    const start = i * slotSecs;
    const freq = FALLBACK_ROOT_HZ * Math.pow(2, note.semi / 12);
    // A rest note decays fast and leaves a quiet gap → a phrase boundary.
    const sustain = note.rest ? slotSecs * 0.5 : slotSecs * 1.4;
    const partials = [
      { mult: 1, gain: 0.5, detune: 0 },
      { mult: 2, gain: 0.22, detune: 5 },
      { mult: 3, gain: 0.12, detune: -6 },
      { mult: 4.01, gain: 0.05, detune: 8 },
    ];
    const bodyGain = offline.createGain();
    bodyGain.connect(master);
    const a = 0.006;
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.3, start + a);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, start + sustain);
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
      osc.stop(start + sustain + 0.2);
    }
    // Soft hammer transient → a clear onset for segmentation.
    const hammerLen = Math.floor(0.035 * sampleRate);
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
    hammerFilt.frequency.value = Math.min(4200, freq * 6);
    hammerFilt.Q.value = 0.6;
    const hammerGain = offline.createGain();
    hammerGain.gain.value = 0.35;
    hammer.connect(hammerFilt);
    hammerFilt.connect(hammerGain);
    hammerGain.connect(master);
    hammer.start(start);
  });

  return offline.startRendering();
}

// ─── Phrase segmentation (onset / silence detection — NOT grains) ────────────

/** One musical phrase: a contiguous slice of Karel's real playing. */
export interface Phrase {
  /** Start offset into the buffer, seconds. */
  start: number;
  /** Length, seconds (~0.6–3s). */
  dur: number;
  /** Mean RMS loudness across the phrase, 0..1-ish. */
  energy: number;
  /** Spectral brightness proxy (zero-crossing rate), 0..1 — low=bass, high=treble. */
  brightness: number;
}

/** The analyzed phrase set plus the buffer it points into. */
export interface PhraseBank {
  phrases: Phrase[];
  buffer: AudioBuffer;
  kind: AudioSourceKind;
}

/**
 * Segment an AudioBuffer into musical PHRASES.
 *
 * Scan RMS energy in ~20ms windows. A phrase STARTS when energy rises above a
 * threshold after a quiet gap; it ENDS when energy stays quiet for >~250ms.
 * Keep phrases ~0.6–3s; drop near-silent / too-short ones. Each surviving
 * phrase is a chunk of Karel's actual playing, not a grain.
 */
export function segmentPhrases(
  buffer: AudioBuffer,
  kind: AudioSourceKind,
): PhraseBank {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const winSecs = 0.02;
  const win = Math.max(1, Math.floor(winSecs * sr));
  const nWins = Math.floor(data.length / win);

  // Per-window RMS + zero-crossing rate.
  const rms = new Float32Array(nWins);
  const zcr = new Float32Array(nWins);
  let peak = 1e-6;
  for (let w = 0; w < nWins; w++) {
    const base = w * win;
    let sumSq = 0;
    let crossings = 0;
    let prev = data[base] || 0;
    for (let i = 1; i < win; i++) {
      const s = data[base + i] || 0;
      sumSq += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) crossings++;
      prev = s;
    }
    const r = Math.sqrt(sumSq / win);
    rms[w] = r;
    zcr[w] = crossings / win;
    if (r > peak) peak = r;
  }

  // Adaptive thresholds relative to the loudest window.
  const onThresh = peak * 0.12;
  const offThresh = peak * 0.06;
  const minPhrase = 0.6;
  const maxPhrase = 3.0;
  const silenceToEnd = Math.ceil(0.25 / winSecs); // ~250ms of quiet ends a phrase
  const minLenWins = Math.ceil(minPhrase / winSecs);
  const maxLenWins = Math.floor(maxPhrase / winSecs);

  const phrases: Phrase[] = [];
  let w = 0;
  while (w < nWins) {
    // Seek a phrase start: a window above onThresh.
    if (rms[w] < onThresh) {
      w++;
      continue;
    }
    const startW = w;
    let quietRun = 0;
    let end = w;
    while (w < nWins) {
      if (rms[w] < offThresh) {
        quietRun++;
        if (quietRun >= silenceToEnd) break;
      } else {
        quietRun = 0;
        end = w;
      }
      if (w - startW >= maxLenWins) break; // cap long phrases
      w++;
    }
    const lenWins = end - startW + 1;
    if (lenWins >= minLenWins) {
      let sum = 0;
      let zsum = 0;
      for (let k = startW; k <= end; k++) {
        sum += rms[k];
        zsum += zcr[k];
      }
      const mean = sum / lenWins;
      const meanZ = zsum / lenWins;
      phrases.push({
        start: (startW * win) / sr,
        dur: (lenWins * win) / sr,
        energy: Math.min(1, (mean / peak) * 1.2),
        brightness: Math.min(1, meanZ / 0.08),
      });
    }
    w = end + silenceToEnd + 1;
  }

  // Safety net: if detection found too little (very legato recording), fall back
  // to evenly cut ~1.6s phrases so seats are never starved.
  if (phrases.length < 4) {
    phrases.length = 0;
    const chunk = 1.6;
    for (let t = 0; t + chunk < buffer.duration; t += chunk) {
      phrases.push({
        start: t,
        dur: chunk,
        energy: 0.7,
        brightness: 0.5,
      });
    }
  }

  // Sort by brightness so seats can be assigned a register-ordered slice of the bank.
  phrases.sort((a, b) => a.brightness - b.brightness);
  return { phrases, buffer, kind };
}

// ─── Look-ahead scheduler (Chris Wilson "A Tale of Two Clocks") ──────────────
//
// A setInterval lookahead schedules phrase triggers a bit into the FUTURE on the
// audio clock for rock-steady timing. The component owns the interval; this
// module just provides the helper that fires one phrase onto the audio graph.

/** Where to route a phrase: each seat has its own gain → master chain. */
export interface PhrasePlayOpts {
  /** Audio time to start (seconds, ctx.currentTime-based). */
  when: number;
  /** Semitone register shift for this seat's voice. */
  semis: number;
  /** Peak gain for this hit (0..1) — driven by dynamics + velocity. */
  vel: number;
  /** Optional cap on how long the phrase plays (seconds). */
  maxDur?: number;
}

/**
 * Trigger ONE phrase from the bank as an AudioBufferSourceNode with a short
 * attack/release envelope, register-shifted by playbackRate. Returns the source
 * so the caller can track / stop it on teardown.
 */
export function playPhrase(
  ctx: AudioContext,
  bank: PhraseBank,
  phrase: Phrase,
  dest: AudioNode,
  opts: PhrasePlayOpts,
): AudioBufferSourceNode | null {
  const src = ctx.createBufferSource();
  src.buffer = bank.buffer;
  // playbackRate shifts register per the seat's voice.
  src.playbackRate.value = Math.pow(2, opts.semis / 12);

  const g = ctx.createGain();
  src.connect(g);
  g.connect(dest);

  const playDur = Math.min(phrase.dur, opts.maxDur ?? phrase.dur);
  // Real (pitch-adjusted) playback length of the slice.
  const realDur = playDur / src.playbackRate.value;
  const atk = 0.02;
  const rel = Math.min(0.5, realDur * 0.4);
  const peak = Math.max(0.0001, opts.vel);

  const t0 = opts.when;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.setValueAtTime(peak, t0 + Math.max(atk, realDur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + realDur);

  try {
    src.start(t0, phrase.start, playDur);
    src.stop(t0 + realDur + 0.05);
  } catch {
    return null;
  }
  src.onended = () => {
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* ok */
    }
  };
  return src;
}
