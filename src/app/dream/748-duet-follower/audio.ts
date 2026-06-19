// audio.ts — Duet Follower · Karel's real piano recording as a following accompanist
//
// His recording is played as ONE continuous source whose playbackRate is
// re-timed to the user's tapped pulse. NO grain cloud — whole-phrase
// continuous following. Each tap re-estimates the user's tempo from
// inter-onset intervals and nudges the recording toward the next musical
// landmark at the user's pace.
//
// CLIENT-SIDE ONLY. Reads an existing public GET route; nothing is recorded or sent.

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

// ─── Fetch Karel's recording ──────────────────────────────────────────────────
export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
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
    } else { arrayBuf = await res.arrayBuffer(); }
    return await ctx.decodeAudioData(arrayBuf);
  } catch { return null; } finally { clearTimeout(timer); }
}

// ─── Fallback synthesis ───────────────────────────────────────────────────────
// Renders ~14s of a soft, detuned piano-ish phrase offline so audio is NEVER
// empty when the live recording cannot be fetched (e.g. sandbox has no network).
// A gentle descending/ascending melodic figure so tempo-following is audible.
export async function renderFallbackBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer> {
  const SR = 44100;
  const DURATION = 14;
  const offline = new OfflineAudioContext(2, SR * DURATION, SR);

  // A simple lyrical phrase (C major-ish, warm) — note onsets spaced so the
  // user's pulse audibly speeds/slows the melody when followed.
  // [freqHz, startSec, durSec, gain]
  const notes: [number, number, number, number][] = [
    [261.63, 0.0, 1.1, 0.22], // C4
    [329.63, 1.0, 1.1, 0.20], // E4
    [392.0, 2.0, 1.1, 0.20],  // G4
    [523.25, 3.0, 1.4, 0.22], // C5
    [493.88, 4.4, 0.9, 0.18], // B4
    [392.0, 5.3, 1.0, 0.18],  // G4
    [440.0, 6.3, 1.2, 0.20],  // A4
    [329.63, 7.5, 1.4, 0.20], // E4
    [293.66, 8.9, 1.1, 0.18], // D4
    [261.63, 10.0, 2.0, 0.24], // C4 (resolve)
  ];

  for (const [freqHz, startT, durT, peak] of notes) {
    // fundamental + 3 harmonics with gentle roll-off (piano-ish)
    for (let h = 1; h <= 4; h++) {
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freqHz * h;
      osc.detune.value = (h - 1) * 2; // slight inharmonicity

      const gain = offline.createGain();
      const amp = (peak / h);
      gain.gain.setValueAtTime(0, startT);
      gain.gain.linearRampToValueAtTime(amp, startT + 0.03); // fast piano attack
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * 0.3), startT + durT * 0.6);
      gain.gain.linearRampToValueAtTime(0, startT + durT);

      osc.connect(gain);
      gain.connect(offline.destination);
      osc.start(startT);
      osc.stop(startT + durT);
    }
  }

  // Soft left-hand sustain bass under the phrase
  const bassNotes: [number, number, number][] = [
    [130.81, 0.0, 4.0],  // C3
    [196.0, 4.0, 3.5],   // G3
    [174.61, 7.5, 2.5],  // F3
    [130.81, 10.0, 4.0], // C3
  ];
  for (const [freqHz, startT, durT] of bassNotes) {
    const osc = offline.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freqHz;
    const gain = offline.createGain();
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(0.07, startT + 0.1);
    gain.gain.linearRampToValueAtTime(0, startT + durT);
    osc.connect(gain);
    gain.connect(offline.destination);
    osc.start(startT);
    osc.stop(startT + durT);
  }

  const rendered = await offline.startRendering();
  if (rendered.sampleRate === ctx.sampleRate) return rendered;
  const buf = ctx.createBuffer(
    rendered.numberOfChannels,
    rendered.length,
    rendered.sampleRate,
  );
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    buf.copyToChannel(rendered.getChannelData(c), c);
  }
  return buf;
}

// ─── Onset envelope (visual + landmark detection) ───────────────────────────────
// Compute a coarse RMS envelope of the recording so we can (a) draw a
// piano-roll-ish ribbon and (b) pick musical "landmarks" (onset peaks) that
// each user tap advances toward. This is the honest, tractable substitute for
// full audio-to-score DTW alignment.
export interface RecordingMap {
  /** Downsampled RMS envelope, normalized 0..1 */
  envelope: Float32Array;
  /** Seconds per envelope bin */
  binSec: number;
  /** Times (sec) of detected onset landmarks, ascending */
  landmarks: number[];
  duration: number;
}

export function analyzeRecording(buffer: AudioBuffer): RecordingMap {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const duration = buffer.duration;

  // ~50ms bins
  const binSec = 0.05;
  const binSamples = Math.max(1, Math.floor(sr * binSec));
  const nBins = Math.floor(data.length / binSamples);
  const env = new Float32Array(nBins);
  let maxRms = 1e-6;
  for (let b = 0; b < nBins; b++) {
    let sum = 0;
    const start = b * binSamples;
    for (let i = 0; i < binSamples; i++) {
      const s = data[start + i];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / binSamples);
    env[b] = rms;
    if (rms > maxRms) maxRms = rms;
  }
  for (let b = 0; b < nBins; b++) env[b] /= maxRms;

  // Spectral-flux-free onset pick: rising-edge of the smoothed envelope.
  // Smooth a little, then find local rises above a threshold with refractory.
  const smooth = new Float32Array(nBins);
  for (let b = 0; b < nBins; b++) {
    const a = env[Math.max(0, b - 1)];
    const c = env[Math.min(nBins - 1, b + 1)];
    smooth[b] = (a + env[b] + c) / 3;
  }
  const landmarks: number[] = [];
  const refractoryBins = Math.floor(0.18 / binSec); // min 180ms between landmarks
  let lastOnset = -refractoryBins;
  for (let b = 2; b < nBins; b++) {
    const rise = smooth[b] - smooth[b - 2];
    if (rise > 0.08 && smooth[b] > 0.12 && b - lastOnset >= refractoryBins) {
      landmarks.push(b * binSec);
      lastOnset = b;
    }
  }
  // Ensure at least sparse landmarks so following always has targets.
  if (landmarks.length < 4) {
    landmarks.length = 0;
    const step = Math.max(0.8, duration / 16);
    for (let t = step; t < duration - step; t += step) landmarks.push(t);
  }

  return { envelope: env, binSec, landmarks, duration };
}

// ─── Follower engine ────────────────────────────────────────────────────────────
// The recording is one continuous BufferSource. We re-time it by adjusting
// playbackRate toward the user's groove, and on each tap we (gently) snap the
// pacing so the recording reaches the NEXT landmark in step with the user's
// estimated beat period. Continuous playback — never re-shuffled into grains.
export interface FollowerState {
  /** Current playhead position in the recording (sec) */
  position: number;
  /** Current playbackRate applied to the source */
  rate: number;
  /** Estimated user beat period (sec); 0 if not yet known */
  beatPeriod: number;
  /** Index of the next landmark the recording is heading toward */
  nextLandmark: number;
  /** Pulse intensity 0..1 — decays after each tap, for visual flare */
  pulse: number;
}

export interface FollowerEngine {
  /** Register a user pulse onset (tap). Re-estimates tempo + re-times. */
  tap(): void;
  /** Read the current follower state (call from rAF). */
  read(): FollowerState;
  /** Master output level 0..1 */
  setMaster(v: number): void;
  dispose(): void;
}

export function buildFollowerEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  map: RecordingMap,
): FollowerEngine {
  // ── Master chain: source → masterGain → lowpass → compressor → dest ──────────
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.3;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 9000;
  lp.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.25;

  masterGain.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // ── Continuous source ────────────────────────────────────────────────────────
  let source: AudioBufferSourceNode | null = null;
  const srcGain = ctx.createGain();
  srcGain.gain.value = 1;
  srcGain.connect(masterGain);

  // Position bookkeeping: we track where the playhead is by integrating rate
  // against ctx time, because BufferSource doesn't expose a live position.
  let position = 0; // sec into buffer (logical)
  let lastClockT = ctx.currentTime;
  let rate = 1.0;
  let beatPeriod = 0; // user's estimated beat period
  const tapTimes: number[] = []; // ctx.currentTime of recent taps
  let nextLandmarkIdx = 0;
  let pulse = 0;

  function startSource(fromPos: number) {
    if (source) {
      try { source.stop(); } catch { /* ignore */ }
      try { source.disconnect(); } catch { /* ignore */ }
    }
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(srcGain);
    s.start(0, fromPos % buffer.duration);
    source = s;
    lastClockT = ctx.currentTime;
    position = fromPos % buffer.duration;
  }

  startSource(0);

  // Advance our logical position estimate based on elapsed clock × rate.
  function integratePosition() {
    const now = ctx.currentTime;
    const dt = now - lastClockT;
    lastClockT = now;
    position = (position + dt * rate) % buffer.duration;
  }

  function nextLandmarkTime(fromPos: number): { idx: number; t: number } {
    const lm = map.landmarks;
    for (let i = 0; i < lm.length; i++) {
      if (lm[i] > fromPos + 0.02) return { idx: i, t: lm[i] };
    }
    // wrap to start
    return { idx: 0, t: lm.length ? lm[0] + buffer.duration : fromPos + 1 };
  }

  function setRate(r: number) {
    rate = Math.max(0.4, Math.min(2.2, r));
    if (source) {
      source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.08);
    }
  }

  function tap() {
    integratePosition();
    const now = ctx.currentTime;
    tapTimes.push(now);
    if (tapTimes.length > 5) tapTimes.shift();
    pulse = 1;

    // Estimate beat period from recent inter-onset intervals (median-ish).
    if (tapTimes.length >= 2) {
      const iois: number[] = [];
      for (let i = 1; i < tapTimes.length; i++) {
        iois.push(tapTimes[i] - tapTimes[i - 1]);
      }
      iois.sort((a, b) => a - b);
      const mid = iois[Math.floor(iois.length / 2)];
      // clamp to a musical range (0.25s..2s → 30..240 bpm)
      beatPeriod = Math.max(0.25, Math.min(2.0, mid));
    }

    // Find the next musical landmark and the recording-time gap to it.
    const { idx, t } = nextLandmarkTime(position);
    nextLandmarkIdx = idx;
    const recordingGap = t - position; // seconds of recording to the next landmark

    if (beatPeriod > 0 && recordingGap > 0.05) {
      // We want the recording to ARRIVE at that landmark one user-beat from now.
      // required rate = recordingGap / beatPeriod  (re-time his performance to my groove)
      const target = recordingGap / beatPeriod;
      // Smooth toward target rather than snapping hard, so phrasing stays musical.
      const blended = rate * 0.35 + target * 0.65;
      setRate(blended);
    } else if (beatPeriod > 0) {
      // already at/past landmark — nudge a small step forward at groove tempo
      setRate(1.0 / Math.max(0.5, beatPeriod));
    }
  }

  function read(): FollowerState {
    integratePosition();
    // pulse decays ~600ms
    pulse = Math.max(0, pulse - 0.03);
    return {
      position,
      rate,
      beatPeriod,
      nextLandmark: nextLandmarkIdx,
      pulse,
    };
  }

  function setMaster(v: number) {
    masterGain.gain.setTargetAtTime(Math.max(0, Math.min(0.5, v)), ctx.currentTime, 0.15);
  }

  function dispose() {
    if (source) {
      try { source.stop(); } catch { /* ignore */ }
      try { source.disconnect(); } catch { /* ignore */ }
    }
    try { srcGain.disconnect(); } catch { /* ignore */ }
    try { masterGain.disconnect(); } catch { /* ignore */ }
    try { lp.disconnect(); } catch { /* ignore */ }
    try { comp.disconnect(); } catch { /* ignore */ }
  }

  return { tap, read, setMaster, dispose };
}
