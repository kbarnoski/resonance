// audio.ts — Web Audio engine for Kids Ball Pit
// D-major / bright just-intonation hexachord — always consonant, never harsh.
// All voices route through a master compressor + limiter (brick-wall safe for kids).

// D-major just-intonation hexachord: D E F# A B D' (6 pitches × 2 octaves = 12)
// Frequencies tuned to just ratios anchored on D3 (146.83 Hz)
const D3 = 146.83;
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]; // D E F# A B D'

export const BELL_FREQS: readonly number[] = [
  ...RATIOS.map((r) => D3 * r),          // octave 3
  ...RATIOS.map((r) => D3 * r * 2),      // octave 4
];
// 12 pitches total, indices 0–11

export interface AudioEngine {
  actx: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  padOscs: OscillatorNode[];
  limiter: DynamicsCompressorNode;
}

let _engine: AudioEngine | null = null;

/** Boot audio on first user gesture (iOS requirement). Idempotent. */
export function bootAudio(): AudioEngine {
  if (_engine) {
    if (_engine.actx.state === "suspended") void _engine.actx.resume();
    return _engine;
  }

  const actx = new AudioContext();

  // ── Master chain: gain → compressor → limiter → destination ──
  const master = actx.createGain();
  master.gain.value = 0.72;

  const compressor = actx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;

  // Brick-wall limiter (high ratio, hard threshold)
  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  master.connect(compressor);
  compressor.connect(limiter);
  limiter.connect(actx.destination);

  // ── Ambient pad: soft D-major triad, very low level ──
  const padFreqs = [D3, D3 * (5 / 4), D3 * (3 / 2)]; // D3 F#3 A3
  const padOscs: OscillatorNode[] = [];
  padFreqs.forEach((freq, i) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    const lfo = actx.createOscillator();
    const lg = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    lfo.type = "sine";
    lfo.frequency.value = 0.06 + i * 0.02;
    lg.gain.value = 0.006;
    lfo.connect(lg);
    lg.connect(g.gain);
    g.gain.value = 0.018;
    osc.connect(g);
    g.connect(master);
    osc.start();
    lfo.start();
    padOscs.push(osc);
  });

  _engine = { actx, master, compressor, padOscs, limiter };
  return _engine;
}

export function getEngine(): AudioEngine | null {
  return _engine;
}

/** Ring a bell-tone for a collision.
 *  velocity 0–1 maps to gain. pitch from BELL_FREQS[noteIdx]. */
export function ringBell(
  engine: AudioEngine,
  noteIdx: number,
  velocity: number
): void {
  const { actx, master } = engine;
  const freq = BELL_FREQS[noteIdx % BELL_FREQS.length];
  const t = actx.currentTime;
  const vel = Math.min(0.85, Math.max(0.06, velocity));

  const env = actx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vel * 0.55, t + 0.008);
  env.gain.setValueAtTime(vel * 0.55, t + 0.04);
  env.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  env.connect(master);

  // Fundamental (sine — warm bell body)
  const o1 = actx.createOscillator();
  o1.type = "sine";
  o1.frequency.value = freq;
  o1.connect(env);
  o1.start(t);
  o1.stop(t + 1.15);

  // 2nd partial (sine, +octave, softer — bell shimmer)
  const env2 = actx.createGain();
  env2.gain.setValueAtTime(0, t);
  env2.gain.linearRampToValueAtTime(vel * 0.14, t + 0.006);
  env2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  env2.connect(master);
  const o2 = actx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = freq * 2.756; // inharmonic partial for bell timbre
  o2.connect(env2);
  o2.start(t);
  o2.stop(t + 0.6);

  // Attack click (very short noise burst — tactile, not harsh)
  const bufSize = Math.floor(actx.sampleRate * 0.012);
  const buf = actx.createBuffer(1, bufSize, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  }
  const noise = actx.createBufferSource();
  noise.buffer = buf;
  const nEnv = actx.createGain();
  nEnv.gain.setValueAtTime(vel * 0.07, t);
  nEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
  // Band-pass around the fundamental
  const bp = actx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 1.5;
  bp.Q.value = 2;
  noise.connect(bp);
  bp.connect(nEnv);
  nEnv.connect(master);
  noise.start(t);
}

/** Play a sparkle run (scramble gesture) — rapid arpeggiated bells */
export function playSparkleRun(engine: AudioEngine): void {
  const { actx } = engine;
  const t = actx.currentTime;
  const order = [...BELL_FREQS.keys()].sort(() => Math.random() - 0.5).slice(0, 8);
  order.forEach((idx, i) => {
    const delay = i * 0.045;
    const env = actx.createGain();
    env.gain.setValueAtTime(0, t + delay);
    env.gain.linearRampToValueAtTime(0.28, t + delay + 0.007);
    env.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.55);
    env.connect(engine.master);
    const o = actx.createOscillator();
    o.type = "sine";
    o.frequency.value = BELL_FREQS[idx];
    o.connect(env);
    o.start(t + delay);
    o.stop(t + delay + 0.6);
  });
}

/** Tear down the audio engine (call on unmount) */
export function teardownAudio(): void {
  if (!_engine) return;
  try {
    _engine.padOscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
    void _engine.actx.close();
  } catch { /* ignore */ }
  _engine = null;
}
