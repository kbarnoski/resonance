/**
 * audio.ts — Web Audio engine for ferro-magnet prototype
 *
 * Tonal world: just-intonation hexachord built on D3 (146.83 Hz)
 *   D3, F#3, A3, D4, F#4, A4  — all consonant subsets, major triad stacked
 *   Rim bells: 5 pitches from this set, each a different size/register
 */

export interface AudioEngine {
  ringBell: (bellIndex: number) => void;
  teardown: () => void;
  bellFreqs: number[];
}

// Just-intonation hexachord on D (146.83 Hz × ratios 1, 5/4, 3/2, 2, 5/2, 3)
const D3 = 146.83;
const BELL_FREQS = [
  D3 * 3,       // A4  440.49 — small bell (highest, shortest)
  D3 * 2,       // D4  293.66
  D3 * (3 / 2), // A3  220.25
  D3 * (5 / 4), // F#3 183.54
  D3,           // D3  146.83 — big bell (lowest, longest)
];

// Always-on drone: D2 + A2 (open-fifth, very low, barely audible)
const DRONE_FREQS = [D3 / 2, D3 * (3 / 4)]; // D2, A2

export function bootAudio(): AudioEngine {
  const actx = new AudioContext();
  if (actx.state === "suspended") void actx.resume();
  return createAudioEngine(actx);
}

function createAudioEngine(actx: AudioContext): AudioEngine {
  // ── Master chain ──────────────────────────────────────────────────────────
  const masterGain = actx.createGain();
  masterGain.gain.value = 0.72;

  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  masterGain.connect(limiter);
  limiter.connect(actx.destination);

  // ── Drone ─────────────────────────────────────────────────────────────────
  const droneGain = actx.createGain();
  droneGain.gain.value = 0.04;
  droneGain.connect(masterGain);

  const droneOscs: OscillatorNode[] = DRONE_FREQS.map((freq, i) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    const lfo = actx.createOscillator();
    const lg = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    lfo.type = "sine";
    lfo.frequency.value = 0.07 + i * 0.023;
    lg.gain.value = 0.15;
    lfo.connect(lg);
    lg.connect(g.gain);
    g.gain.value = 0.5;
    osc.connect(g);
    g.connect(droneGain);
    lfo.start();
    osc.start();
    return osc;
  });

  // ── Bell synthesis ────────────────────────────────────────────────────────
  /**
   * Ring rim-bell i (0=highest/small, 4=lowest/big).
   * Bell timbre: fundamental + 2 partials at just-intonation ratios (2.76, 5.4)
   * plus a soft noise burst for the "ping" attack.
   */
  function ringBell(bellIndex: number, strength = 0.5) {
    const freq = BELL_FREQS[bellIndex];
    // Bell size → decay time and volume
    const decayTime = 0.6 + bellIndex * 0.2; // 0.6 → 1.4 s
    const volume = 0.18 + strength * 0.22;   // louder when spike is strong
    const now = actx.currentTime;

    // Partials
    const partialRatios = [1, 2.756, 5.404]; // classic bell spectrum
    const partialGains  = [1.0, 0.35, 0.12];

    partialRatios.forEach((ratio, pi) => {
      const osc = actx.createOscillator();
      const env = actx.createGain();
      osc.type = pi === 0 ? "sine" : "sine";
      osc.frequency.value = freq * ratio;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(volume * partialGains[pi], now + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);
      osc.connect(env);
      env.connect(masterGain);
      osc.start(now);
      osc.stop(now + decayTime + 0.05);
    });

    // Short noise burst ("ping" attack transient)
    const bufLen = Math.ceil(actx.sampleRate * 0.018);
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const noise = actx.createBufferSource();
    noise.buffer = buf;
    // Band-pass around fundamental
    const bp = actx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 6;
    const noiseEnv = actx.createGain();
    noiseEnv.gain.setValueAtTime(volume * 0.6, now);
    noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
    noise.connect(bp);
    bp.connect(noiseEnv);
    noiseEnv.connect(masterGain);
    noise.start(now);
  }

  // ── Teardown ──────────────────────────────────────────────────────────────
  function teardown() {
    droneOscs.forEach((o) => {
      try { o.stop(); } catch { /* already stopped */ }
    });
  }

  return { ringBell, teardown, bellFreqs: BELL_FREQS } satisfies AudioEngine;
}
