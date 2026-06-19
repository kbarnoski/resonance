// audio.ts — Web Audio engine for the Song Sprout.
// Mic is ANALYSIS-ONLY (never connected to destination).
// Master chain: voices -> master gain (<=0.3) -> lowpass (~7500) ->
// compressor (thr -10, ratio 20) -> destination. Kids-safe, never harsh.

// ── Warm consonant scale: D-Dorian, a few octaves. Everything snaps here.
// D Dorian = D E F G A B C. Hz values across child-comfortable octaves.
// Index 0 lowest -> high. The sprout sings inside this so it is never sour.
export const SCALE_HZ: number[] = [
  146.83, // D3
  164.81, // E3
  174.61, // F3
  196.0,  // G3
  220.0,  // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  392.0,  // G4
  440.0,  // A4
  493.88, // B4
  523.25, // C5
  587.33, // D5
];

/** Snap an arbitrary frequency to the nearest scale degree index. */
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

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;       // post = lowpass -> compressor -> destination
  voiceBus: GainNode;     // sprout voice fans in here
  droneBus: GainNode;     // warm drone bed
  analyser: AnalyserNode | null; // mic analyser, or null (ghost mode)
  timeBuf: Float32Array | null;  // mic time-domain buffer
  sampleRate: number;
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

  // Gentle master fade-in.
  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0, now);
  master.gain.linearRampToValueAtTime(0.28, now + 1.6);

  return {
    ctx,
    master,
    voiceBus,
    droneBus,
    analyser: null,
    timeBuf: null,
    sampleRate: ctx.sampleRate,
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
    eng.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    return true;
  } catch {
    return false;
  }
}

/** Cheap autocorrelation pitch estimate over the mic time-domain buffer.
 *  Returns { hz, rms }. hz is 0 when no confident pitch. */
export function estimatePitch(
  buf: Float32Array,
  sampleRate: number
): { hz: number; rms: number } {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return { hz: 0, rms };

  // Trim silent edges.
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

  // Autocorrelation. Search lags for vocal range ~ 80–800 Hz.
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

// ── Sprout voice synthesis ───────────────────────────────────────────────
// A short, soft FM-ish bell/coo. Timbre warms & fills as the sprout grows
// (growth 0..1 -> more harmonics, longer release, gentle vibrato).

export function singNote(
  eng: AudioEngine,
  hz: number,
  when: number,
  dur: number,
  growth: number,
  vel = 1
) {
  const ctx = eng.ctx;
  const t = when;
  const peak = (0.06 + growth * 0.08) * vel;

  // Carrier
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.setValueAtTime(hz, t);

  // gentle vibrato grows with maturity
  if (growth > 0.15) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 4.5 + growth * 1.5;
    lfoGain.gain.value = hz * 0.006 * growth;
    lfo.connect(lfoGain);
    lfoGain.connect(carrier.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.6);
  }

  // FM partial — adds warmth/richness as it matures.
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  mod.type = "sine";
  mod.frequency.setValueAtTime(hz * (growth > 0.5 ? 2 : 3), t);
  modGain.gain.setValueAtTime(hz * (0.25 + growth * 0.6), t);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  // A second soft octave layer fades in with growth -> fuller voice.
  const oct = ctx.createOscillator();
  const octGain = ctx.createGain();
  oct.type = "triangle";
  oct.frequency.setValueAtTime(hz * 2, t);
  octGain.gain.value = growth * 0.4;

  const env = ctx.createGain();
  const rel = 0.4 + growth * 1.2;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.04);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0008, peak * 0.5), t + dur);
  env.gain.exponentialRampToValueAtTime(0.0006, t + dur + rel);

  // soft per-voice tone shaping so high notes never bite
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200 + growth * 2600;
  lp.Q.value = 0.3;

  carrier.connect(env);
  oct.connect(octGain);
  octGain.connect(env);
  env.connect(lp);
  lp.connect(eng.voiceBus);

  carrier.start(t);
  mod.start(t);
  oct.start(t);
  const stopAt = t + dur + rel + 0.1;
  carrier.stop(stopAt);
  mod.stop(stopAt);
  oct.stop(stopAt);
}

// ── Warm drone bed (always-on, swells with growth) ───────────────────────
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
    return o;
  };
  make(root, 0.5, -4);
  make(root, 0.4, 5);
  make(fifth, 0.32, 0);
  // soft swell LFO
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain);
  lfoGain.connect(eng.droneBus.gain);
  lfo.start();

  const now = ctx.currentTime;
  eng.droneBus.gain.setValueAtTime(0.0, now);
  eng.droneBus.gain.linearRampToValueAtTime(0.10, now + 4);
}

/** Drone fills out as the sprout grows. */
export function setDroneLevel(eng: AudioEngine, growth: number) {
  const target = 0.10 + growth * 0.10;
  eng.droneBus.gain.setTargetAtTime(target, eng.ctx.currentTime, 3);
}
