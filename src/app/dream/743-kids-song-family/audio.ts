// audio.ts — Web Audio engine for the Song Family (cycle-2 of 738-kids-song-sprout).
//
// The companions' VOICES are made from GRAINS of Karel's REAL recorded
// "Welcome Home" piano. A remembered note is sung by selecting a grain of his
// piano near that pitch and pitch-shifting it (playbackRate) to the exact note,
// with a soft Hann window — concatenative / CataRT-style resynthesis. If his
// recording can't be fetched, a gentle FM/additive voice is rendered instead,
// so the piece ALWAYS sounds.
//
// Mic is ANALYSIS-ONLY (never connected to destination).
// Master chain: voices -> master gain (<=0.3) -> lowpass (~7.5k) ->
// DynamicsCompressor(thr -10, ratio 20) -> destination. Kids-safe, never harsh.
//
// CLIENT-SIDE ONLY. The grain loader READS an existing public GET route; nothing
// is recorded or sent and NO api route is created here.

// ── Warm consonant scale: D-Dorian across child-comfortable octaves. ─────────
// D Dorian = D E F G A B C. Everything snaps here so it is never sour.
export const SCALE_HZ: number[] = [
  146.83, // 0  D3
  164.81, // 1  E3
  174.61, // 2  F3
  196.0, // 3  G3
  220.0, // 4  A3
  246.94, // 5  B3
  261.63, // 6  C4
  293.66, // 7  D4
  329.63, // 8  E4
  349.23, // 9  F4
  392.0, // 10 G4
  440.0, // 11 A4
  493.88, // 12 B4
  523.25, // 13 C5
  587.33, // 14 D5
];

/** Snap an arbitrary frequency to the nearest scale-degree index. */
export function snapToScaleIndex(hz: number): number {
  if (!isFinite(hz) || hz <= 0) return 7; // default D4
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < SCALE_HZ.length; i++) {
    const d = Math.abs(Math.log2(SCALE_HZ[i]) - Math.log2(hz));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

// ─── Grain corpus types (CataRT-style; copied from the lab's piano loaders) ──

/** One pre-analyzed grain window into the source buffer. */
export interface Grain {
  offset: number; // start offset into buffer, seconds
  duration: number; // grain duration, seconds (~60–120ms)
  rms: number; // loudness 0..1-ish
  brightness: number; // zero-crossing-rate brightness proxy 0..1
  approxHz: number; // crude fundamental estimate via dominant lag, Hz
}

export interface Corpus {
  grains: Grain[];
  buffer: AudioBuffer;
  kind: AudioSourceKind;
}

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode; // -> lowpass -> compressor -> destination
  voiceBus: GainNode; // companion voices fan in here
  droneBus: GainNode; // warm drone bed
  analyser: AnalyserNode | null; // mic analyser, or null (ghost mode)
  micStream: MediaStream | null;
  timeBuf: Float32Array | null;
  sampleRate: number;
  corpus: Corpus | null; // set after loadVoiceCorpus resolves
}

/** Build the kids-safe master chain. Call from a user gesture (or auto for ghost). */
export function buildEngine(): AudioEngine {
  const Ctx: typeof AudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();

  const master = ctx.createGain();
  master.gain.value = 0.0; // fade in

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7500;
  lowpass.Q.value = 0.4;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 18;
  comp.ratio.value = 20;
  comp.attack.value = 0.012;
  comp.release.value = 0.28;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1.0;
  voiceBus.connect(master);

  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.0;
  droneBus.connect(master);

  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0, now);
  master.gain.linearRampToValueAtTime(0.28, now + 1.6);

  return {
    ctx,
    master,
    voiceBus,
    droneBus,
    analyser: null,
    micStream: null,
    timeBuf: null,
    sampleRate: ctx.sampleRate,
    corpus: null,
  };
}

/** Attach mic for analysis. Returns true on success. Never routes to output. */
export async function attachMic(eng: AudioEngine): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const source = eng.ctx.createMediaStreamSource(stream);
    const analyser = eng.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.1;
    source.connect(analyser); // analysis only — NOT to destination
    eng.analyser = analyser;
    eng.micStream = stream;
    eng.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    return true;
  } catch {
    return false;
  }
}

// ─── Karel's real piano loader (proven pattern, copied verbatim) ─────────────

/**
 * Fetch Karel's recording into an AudioBuffer.
 * - 4s abort timeout.
 * - If the response is JSON: parse {url}, fetch that for the bytes.
 * - Else: the body itself is the audio bytes.
 * Returns null on ANY failure (caller falls back to synthesis).
 */
async function fetchPianoBuffer(
  ctx: BaseAudioContext,
  signal: AbortSignal,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
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
    signal.removeEventListener("abort", onAbort);
  }
}

// ─── Fallback synthesis (so the grain corpus is NEVER empty) ─────────────────

const FALLBACK_ROOT_HZ = 196; // ~G3
const FALLBACK_PHRASE = [0, 4, 7, 11, 12, 11, 7, 4, 0, 7, 12, 16, 12, 7, 4, 0];

/** Render a ~14s gentle piano-ish buffer offline: a soft detuned arpeggio with
 *  hammer transients, so the grain field always has harmonic + percussive content. */
async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 14;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, sampleRate);

  const noteSecs = durationSecs / FALLBACK_PHRASE.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  FALLBACK_PHRASE.forEach((semi, i) => {
    const start = i * noteSecs;
    const freq = FALLBACK_ROOT_HZ * Math.pow(2, semi / 12);
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
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, start + noteSecs * 2.4);
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
      osc.stop(start + noteSecs * 2.6);
    }
    const hammerLen = Math.floor(0.035 * sampleRate);
    const hammerBuf = offline.createBuffer(1, hammerLen, sampleRate);
    const hd = hammerBuf.getChannelData(0);
    for (let n = 0; n < hammerLen; n++) {
      const tt = n / hammerLen;
      hd[n] = (Math.random() * 2 - 1) * Math.pow(1 - tt, 2.5);
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

  const drone = offline.createOscillator();
  drone.type = "sine";
  drone.frequency.value = FALLBACK_ROOT_HZ / 2;
  const droneGain = offline.createGain();
  droneGain.gain.value = 0.04;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start(0);
  drone.stop(durationSecs);

  return offline.startRendering();
}

// ─── Grain-corpus analysis (CataRT-style) ────────────────────────────────────

/**
 * Slice an AudioBuffer into overlapping short grains, each tagged with RMS,
 * a brightness proxy, and a crude fundamental estimate (via the dominant
 * autocorrelation lag) so a remembered NOTE can pick a grain near that pitch.
 */
function buildGrainCorpus(buffer: AudioBuffer, kind: AudioSourceKind): Corpus {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const grainSecs = 0.1; // ~100ms, inside 60–120ms band
  const strideSecs = 0.05;
  const grainLen = Math.floor(grainSecs * sr);
  const stride = Math.floor(strideSecs * sr);

  const grains: Grain[] = [];
  for (let start = 0; start + grainLen < data.length; start += stride) {
    let sumSq = 0;
    let crossings = 0;
    let prev = data[start] || 0;
    for (let i = 1; i < grainLen; i++) {
      const s = data[start + i] || 0;
      sumSq += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) crossings++;
      prev = s;
    }
    const rms = Math.sqrt(sumSq / grainLen);
    if (rms < 0.012) continue; // drop silence

    const zcr = crossings / grainLen;
    const brightness = Math.min(1, zcr / 0.09);

    // Crude pitch: short autocorrelation within the grain, vocal/piano range.
    const approxHz = roughGrainHz(data, start, grainLen, sr);

    grains.push({
      offset: start / sr,
      duration: grainSecs,
      rms: Math.min(1, rms * 4),
      brightness,
      approxHz,
    });
  }

  const CAP = 16000;
  if (grains.length > CAP) {
    const step = grains.length / CAP;
    const trimmed: Grain[] = [];
    for (let i = 0; i < CAP; i++) trimmed.push(grains[Math.floor(i * step)]);
    return { grains: trimmed, buffer, kind };
  }
  return { grains, buffer, kind };
}

/** Dominant-lag fundamental estimate for one grain. Returns 0 if unclear. */
function roughGrainHz(
  data: Float32Array,
  start: number,
  len: number,
  sr: number,
): number {
  const minLag = Math.floor(sr / 700);
  const maxLag = Math.min(Math.floor(sr / 90), len - 1);
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < len - lag; i++) {
      corr += (data[start + i] || 0) * (data[start + i + lag] || 0);
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return 0;
  const hz = sr / bestLag;
  return hz >= 80 && hz <= 800 ? hz : 0;
}

/**
 * Load the companion voice corpus: try Karel's real piano, else synth fallback.
 * Stores the corpus on the engine and returns its kind.
 */
export async function loadVoiceCorpus(
  eng: AudioEngine,
  signal: AbortSignal,
): Promise<AudioSourceKind> {
  const piano = await fetchPianoBuffer(eng.ctx, signal);
  if (piano && !signal.aborted) {
    eng.corpus = buildGrainCorpus(piano, "piano");
    return "piano";
  }
  if (signal.aborted) return "fallback";
  const fb = await renderFallbackBuffer(eng.sampleRate);
  if (signal.aborted) return "fallback";
  eng.corpus = buildGrainCorpus(fb, "fallback");
  return "fallback";
}

// ─── A companion singing one remembered note = a pitch-shifted piano grain ───

/**
 * Sing one note as Karel-piano grains. A grain near the target pitch is chosen
 * and pitch-shifted (playbackRate) to land EXACTLY on `hz`. Warmer / fuller as
 * a companion grows (more stacked grain layers, longer tail). Hann window, soft
 * envelope — never a click, never loud.
 */
export function singGrainNote(
  eng: AudioEngine,
  hz: number,
  when: number,
  dur: number,
  growth: number, // 0..1 companion maturity
  vel = 1,
  pan = 0,
) {
  const ctx = eng.ctx;
  const corpus = eng.corpus;
  if (!corpus || corpus.grains.length === 0) return;

  // Choose grains whose approx pitch is closest to the target (within an octave
  // class so the shift stays mild), preferring sustained, mid-bright tone.
  const layers = 1 + Math.round(growth * 1.5); // 1..~2.5 stacked grains as it grows
  const picks = pickGrainsForPitch(corpus.grains, hz, layers + 2);
  if (picks.length === 0) return;

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  const voiceGain = ctx.createGain();
  const peak = (0.05 + growth * 0.06) * vel;
  const rel = 0.25 + growth * 0.7;
  voiceGain.gain.setValueAtTime(0.0001, when);
  voiceGain.gain.linearRampToValueAtTime(peak, when + 0.05);
  voiceGain.gain.setValueAtTime(peak, when + dur * 0.6);
  voiceGain.gain.exponentialRampToValueAtTime(0.0005, when + dur + rel);

  // soft per-voice tone shaping so high notes never bite
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400 + growth * 2400;
  lp.Q.value = 0.3;

  voiceGain.connect(lp);
  lp.connect(panner);
  panner.connect(eng.voiceBus);

  // Re-trigger a few overlapping grains across the note duration for a
  // sustained, choral tone rather than a single short pluck.
  const grainsPerNote = Math.max(2, Math.round((dur / 0.07) * (0.6 + growth * 0.6)));
  for (let n = 0; n < grainsPerNote; n++) {
    const grain = picks[n % picks.length];
    const ref = grain.approxHz > 0 ? grain.approxHz : hz;
    // pitch-shift the chosen grain to land on the target note
    let rate = hz / ref;
    // keep shifts gentle and natural — fold into a sane window
    while (rate > 1.9) rate /= 2;
    while (rate < 0.5) rate *= 2;

    const src = ctx.createBufferSource();
    src.buffer = corpus.buffer;
    src.playbackRate.value = rate;

    const gEnv = ctx.createGain();
    const gdur = grain.duration / rate;
    const t = when + (n / grainsPerNote) * dur * 0.9 + (Math.random() - 0.5) * 0.01;
    // Hann-ish window via two ramps — soft in, soft out
    gEnv.gain.setValueAtTime(0.0001, t);
    gEnv.gain.linearRampToValueAtTime(1.0, t + gdur * 0.5);
    gEnv.gain.linearRampToValueAtTime(0.0001, t + gdur);

    src.connect(gEnv);
    gEnv.connect(voiceGain);
    src.start(t, grain.offset, grain.duration);
    src.stop(t + gdur + 0.03);
  }
}

/** Indices of grains whose approx pitch is nearest the target (octave-folded). */
function pickGrainsForPitch(grains: Grain[], hz: number, k: number): Grain[] {
  const targetPc = Math.log2(hz);
  const scored: Array<{ g: Grain; d: number }> = [];
  for (const g of grains) {
    if (g.approxHz <= 0) continue;
    // octave-folded log distance + a small bonus for sustained, not-too-bright
    let d = Math.abs(Math.log2(g.approxHz) - targetPc);
    while (d > 0.5) d -= 1; // fold to nearest octave class
    d = Math.abs(d);
    const tonePenalty = (1 - g.rms) * 0.15 + g.brightness * 0.1;
    scored.push({ g, d: d + tonePenalty });
  }
  if (scored.length === 0) {
    // no pitched grains at all — just take the loudest few
    return [...grains].sort((a, b) => b.rms - a.rms).slice(0, k);
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, k).map((s) => s.g);
}

// ─── Warm drone bed (always-on, swells with the family) ──────────────────────

export function startDrone(eng: AudioEngine) {
  const ctx = eng.ctx;
  const root = 73.42; // D2
  const fifth = 110.0; // A2
  const make = (hz: number, gain: number, detune: number) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(eng.droneBus);
    o.start();
  };
  make(root, 0.5, -4);
  make(root, 0.4, 5);
  make(fifth, 0.32, 0);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain);
  lfoGain.connect(eng.droneBus.gain);
  lfo.start();

  const now = ctx.currentTime;
  eng.droneBus.gain.setValueAtTime(0.0, now);
  eng.droneBus.gain.linearRampToValueAtTime(0.1, now + 4);
}

/** Drone fills out as the family grows (0..1 = sum of companion growth). */
export function setDroneLevel(eng: AudioEngine, family01: number) {
  const target = 0.09 + family01 * 0.11;
  eng.droneBus.gain.setTargetAtTime(target, eng.ctx.currentTime, 3);
}

/** Cheap autocorrelation pitch estimate over the mic time-domain buffer. */
export function estimatePitch(
  buf: Float32Array,
  sampleRate: number,
): { hz: number; rms: number } {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return { hz: 0, rms };

  let start = 0;
  let end = SIZE - 1;
  const thr = 0.18;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) > thr) {
      start = i;
      break;
    }
  }
  for (let i = SIZE - 1; i > SIZE / 2; i--) {
    if (Math.abs(buf[i]) > thr) {
      end = i;
      break;
    }
  }
  const trimmed = buf.subarray(start, end);
  const n = trimmed.length;
  if (n < 256) return { hz: 0, rms };

  const minLag = Math.floor(sampleRate / 800);
  const maxLag = Math.floor(sampleRate / 80);
  let bestLag = -1;
  let bestCorr = 0;
  let lastCorr = 1;
  let foundDip = false;
  for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) corr += trimmed[i] * trimmed[i + lag];
    corr /= n - lag;
    if (corr > 0.01 && corr > lastCorr) foundDip = true;
    if (foundDip && corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
    lastCorr = corr;
  }
  if (bestLag <= 0) return { hz: 0, rms };
  const hz = sampleRate / bestLag;
  if (hz < 70 || hz > 900) return { hz: 0, rms };
  return { hz, rms };
}
