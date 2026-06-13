// audio.ts — Clap Canon audio engine
// Steve Reich phasing: two looping voices, second drifts slightly faster
// All synthesis: Web Audio API only, no external deps

export interface AudioEngine {
  ctx: AudioContext;
  limiter: DynamicsCompressorNode;
  masterGain: GainNode;
  analyser: AnalyserNode;
  timeDomainBuf: Float32Array;
  freqBuf: Float32Array;
  fftSize: number;
}

// Build master audio chain: gain → limiter → destination
export function buildAudioEngine(): AudioEngine {
  const ActxCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new ActxCtor();

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.75;

  // Brick-wall limiter: threshold ~-10dBFS, ratio 20:1
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  // Analyser for onset detection
  const fftSize = 2048;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;

  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  const timeDomainBuf = new Float32Array(fftSize);
  const freqBuf = new Float32Array(analyser.frequencyBinCount);

  return { ctx, limiter, masterGain, analyser, timeDomainBuf, freqBuf, fftSize };
}

// Build a sharp noise burst (clap/woodblock sound)
// voice=0 → warm low-mid clap; voice=1 → bright woodblock
export function playClap(engine: AudioEngine, voice: 0 | 1, scheduledTime?: number): void {
  const { ctx, masterGain } = engine;
  const t = scheduledTime ?? ctx.currentTime;

  if (voice === 0) {
    // Voice A: warm bandpass-filtered noise clap with a low "body"
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.75, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    g.connect(masterGain);

    // noise layer
    const noiseBuf = makeNoiseBuf(ctx, 0.22);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 650;
    bpf.Q.value = 1.2;
    src.connect(bpf);
    bpf.connect(g);
    src.start(t);
    src.stop(t + 0.22);

    // low woody click
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
    osc.type = "sine";
    osc.connect(og);
    og.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.1);

  } else {
    // Voice B: brighter woodblock — higher pitched click with overtones
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.65, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    g.connect(masterGain);

    // high noise click
    const noiseBuf = makeNoiseBuf(ctx, 0.14);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 2000;
    hpf.Q.value = 0.8;
    src.connect(hpf);
    hpf.connect(g);
    src.start(t);
    src.stop(t + 0.14);

    // bright woodblock tone
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.55, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.07);
    osc.type = "triangle";
    osc.connect(og);
    og.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.11);

    // second partial
    const osc2 = ctx.createOscillator();
    const og2 = ctx.createGain();
    og2.gain.setValueAtTime(0.28, t);
    og2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc2.frequency.value = 1320;
    osc2.type = "triangle";
    osc2.connect(og2);
    og2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.08);
  }
}

function makeNoiseBuf(ctx: AudioContext, secs: number): AudioBuffer {
  const n = Math.ceil(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ── Onset detector ──────────────────────────────────────────────────────────
// Uses EMA of broadband RMS; fires onset when energy jumps above adaptive threshold
export interface OnsetDetector {
  emaEnergy: number;
  lastOnsetTime: number; // ms timestamp
  refractoryMs: number;
}

export function makeOnsetDetector(): OnsetDetector {
  return { emaEnergy: 0.0, lastOnsetTime: 0, refractoryMs: 120 };
}

// Returns true if an onset was detected this frame
export function checkOnset(
  detector: OnsetDetector,
  analyser: AnalyserNode,
  timeDomainBuf: Float32Array<ArrayBufferLike>
): boolean {
  analyser.getFloatTimeDomainData(timeDomainBuf as Float32Array<ArrayBuffer>);

  // RMS of frame
  let sumSq = 0;
  for (let i = 0; i < timeDomainBuf.length; i++) {
    sumSq += timeDomainBuf[i] * timeDomainBuf[i];
  }
  const rms = Math.sqrt(sumSq / timeDomainBuf.length);

  // Fast-attack, slow-decay EMA for background energy
  const alpha = rms > detector.emaEnergy ? 0.8 : 0.05;
  detector.emaEnergy = alpha * rms + (1 - alpha) * detector.emaEnergy;

  const now = performance.now();
  const sinceLastOnset = now - detector.lastOnsetTime;

  // Fire if energy > 2.5x EMA background AND past refractory
  const threshold = Math.max(0.015, detector.emaEnergy * 2.5);
  if (rms > threshold && sinceLastOnset > detector.refractoryMs) {
    detector.lastOnsetTime = now;
    // Update EMA to include this burst so next frame isn't re-triggered
    detector.emaEnergy = rms * 0.7;
    return true;
  }
  return false;
}

// ── Phase-canon scheduler ───────────────────────────────────────────────────
// Two voices loop the same pattern; voice B's interval is slightly shorter
// so it gradually phases ahead, cycling back to unison every ~PHASE_CYCLE_S seconds.

export interface PhaseCanon {
  pattern: number[]; // inter-onset intervals in seconds (length >= 1)
  loopDur: number;   // sum of pattern intervals = one loop duration in seconds
  // Voice A: steady reference
  voiceAPhase: number; // current position within loop (0..loopDur)
  voiceANextBeat: number; // audioCtx.currentTime of next scheduled beat
  voiceAStepIdx: number;
  // Voice B: slightly faster
  voiceBPhase: number;
  voiceBNextBeat: number;
  voiceBStepIdx: number;
  // rate multiplier for voice B  (< 1 = faster loop = phase advances)
  phaseRate: number;
  active: boolean;
  schedulerInterval: ReturnType<typeof setInterval> | null;
}

const DEFAULT_CLAP_PATTERN: number[] = [0.28, 0.28, 0.56, 0.28, 0.28, 0.56]; // ~2.24s loop
const PHASE_DRIFT = 0.018; // fraction: voice B loops this much faster than voice A

export function makePhaseCanon(): PhaseCanon {
  return {
    pattern: [...DEFAULT_CLAP_PATTERN],
    loopDur: DEFAULT_CLAP_PATTERN.reduce((s, v) => s + v, 0),
    voiceAPhase: 0,
    voiceANextBeat: 0,
    voiceAStepIdx: 0,
    voiceBPhase: 0,
    voiceBNextBeat: 0,
    voiceBStepIdx: 0,
    phaseRate: 1 - PHASE_DRIFT,
    active: false,
    schedulerInterval: null,
  };
}

export function setPattern(canon: PhaseCanon, intervals: number[]): void {
  canon.pattern = intervals;
  canon.loopDur = intervals.reduce((s, v) => s + v, 0);
  canon.voiceAStepIdx = 0;
  canon.voiceBStepIdx = 0;
}

// Start both voices; call this after AudioContext is resumed
export function startCanon(
  canon: PhaseCanon,
  engine: AudioEngine,
  onClap: (voice: 0 | 1, beatTime: number) => void
): void {
  if (canon.active) stopCanon(canon);

  const { ctx } = engine;
  const now = ctx.currentTime;
  canon.voiceANextBeat = now + 0.05;
  canon.voiceBNextBeat = now + 0.05;
  canon.voiceAStepIdx = 0;
  canon.voiceBStepIdx = 0;
  canon.active = true;

  const LOOKAHEAD = 0.12; // seconds ahead to schedule
  const TICK_MS = 25;     // scheduler poll rate

  canon.schedulerInterval = setInterval(() => {
    if (!canon.active) return;
    const t = ctx.currentTime;

    // Schedule all voice A beats within lookahead window
    while (canon.voiceANextBeat < t + LOOKAHEAD) {
      const beatTime = canon.voiceANextBeat;
      playClap(engine, 0, beatTime);
      onClap(0, beatTime);
      const interval = canon.pattern[canon.voiceAStepIdx % canon.pattern.length];
      canon.voiceANextBeat += interval;
      canon.voiceAStepIdx++;
    }

    // Voice B: same intervals but contracted by phaseRate
    while (canon.voiceBNextBeat < t + LOOKAHEAD) {
      const beatTime = canon.voiceBNextBeat;
      playClap(engine, 1, beatTime);
      onClap(1, beatTime);
      const interval = canon.pattern[canon.voiceBStepIdx % canon.pattern.length] * canon.phaseRate;
      canon.voiceBNextBeat += interval;
      canon.voiceBStepIdx++;
    }
  }, TICK_MS);
}

export function stopCanon(canon: PhaseCanon): void {
  canon.active = false;
  if (canon.schedulerInterval !== null) {
    clearInterval(canon.schedulerInterval);
    canon.schedulerInterval = null;
  }
}

// Compute phase offset between voices in 0..1 (0 = unison, 0.5 = opposite)
export function computePhaseOffset(canon: PhaseCanon, engine: AudioEngine): number {
  if (!canon.active || canon.loopDur <= 0) return 0;
  const t = engine.ctx.currentTime;
  // Position within loop for each voice
  const aDur = canon.loopDur;
  const bDur = canon.loopDur * canon.phaseRate;
  // elapsed since start — approximate via nextBeat
  const aPos = ((t - (canon.voiceANextBeat - aDur)) % aDur) / aDur;
  const bPos = ((t - (canon.voiceBNextBeat - bDur)) % bDur) / bDur;
  let diff = (bPos - aPos + 1) % 1;
  // Normalize to 0..1 where 0.5 = half-loop ahead
  if (diff > 0.5) diff = 1 - diff; // fold to 0..0.5 distance
  return diff * 2; // 0 = unison, 1 = max phase
}

// Build a quantized rhythm from onset timestamps (ms)
// Returns array of IOI intervals in seconds
export function quantizeOnsets(onsetTimesMs: number[], minLoopS: number = 1.5, maxLoopS: number = 4.0): number[] {
  if (onsetTimesMs.length < 2) return [...DEFAULT_CLAP_PATTERN];

  const sorted = [...onsetTimesMs].sort((a, b) => a - b);
  const rawIOIs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    rawIOIs.push((sorted[i] - sorted[i - 1]) / 1000);
  }

  // Total span
  const spanS = (sorted[sorted.length - 1] - sorted[0]) / 1000;
  if (spanS < 0.3 || spanS > maxLoopS * 1.5) return [...DEFAULT_CLAP_PATTERN];

  // Quantize each IOI to nearest 16th note within the span
  const gridUnit = spanS / 16;
  const quantized = rawIOIs.map((ioi) => {
    const steps = Math.max(1, Math.round(ioi / gridUnit));
    return steps * gridUnit;
  });

  // Add a trailing interval to complete the loop if needed
  const total = quantized.reduce((s, v) => s + v, 0);
  const loopDur = Math.min(maxLoopS, Math.max(minLoopS, total + gridUnit * 2));
  const tail = loopDur - total;
  if (tail > gridUnit * 0.5) quantized.push(tail);

  return quantized;
}
