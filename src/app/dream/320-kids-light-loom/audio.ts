/**
 * 320 · Kids Light Loom — Audio Engine
 *
 * Bowed-string physical model using approach (b):
 * Sawtooth oscillator + bandpass filter + bow-noise shaping + per-string
 * envelope driven by live bow-speed. The "stick-slip" feel comes from
 * bow-speed → brightness + amplitude mapping: slow bow = dark/soft,
 * fast bow = bright/loud, matching Helmholtz motion phenomenology.
 *
 * References:
 *   Serafin & Vergez — Real-time friction model of the violin (2000)
 *   Julius O. Smith — Digital Waveguide Bowed Strings (CCRMA)
 *   Helmholtz motion / stick-slip dynamics
 *
 * Signal chain per string:
 *   [Sawtooth osc] + [Noise osc] → [Gain (bow-speed)] → [BiquadFilter LP]
 *   → [string gain] → [master gain] → [Convolver reverb] → [DynamicsCompressor]
 *   → [master output]
 *
 * Always-on drone: root (D2) + fifth (A2) → filtered → reverb (same chain).
 */

// D-Dorian hexachord: D E F G A C
// Using just-intonation-flavored 5ths/4ths over D root
export const STRING_FREQS = [
  73.42,  // D2
  110.0,  // A2
  146.83, // D3
  196.0,  // G3
  220.0,  // A3
  293.66, // D4
];

// Bold saturated colors — one per string (low → high)
export const STRING_COLORS = [
  "#ff3a6e", // deep rose-magenta  (D2)
  "#ff7c2a", // vivid orange       (A2)
  "#f5d800", // bright amber       (D3)
  "#2af57b", // electric green     (G3)
  "#18cfff", // cyan               (A3)
  "#b06bff", // violet             (D4)
];

export interface StringVoice {
  sawOsc: OscillatorNode;
  noiseGain: GainNode;
  noiseSrc: AudioBufferSourceNode; // looping white-noise buffer
  bowGain: GainNode;     // bow-speed amplitude
  filterLP: BiquadFilterNode; // brightness filter
  filterHP: BiquadFilterNode; // keeps it warm
  envGain: GainNode;     // envelope
  targetBowSpeed: number;   // 0..1
  bowing: boolean;
}

export interface LoomAudio {
  ctx: AudioContext;
  voices: StringVoice[];
  masterGain: GainNode;
  dispose: () => void;
  setBowSpeed: (stringIdx: number, speed: number, active: boolean) => void;
}

/** Build a looping white-noise source */
function makeNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const bufLen = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

/** Build a synthetic convolver impulse response (no audio files) */
function makeSyntheticReverb(ctx: AudioContext): ConvolverNode {
  const sampleRate = ctx.sampleRate;
  const seconds = 2.2;
  const bufLen = Math.floor(sampleRate * seconds);
  const buf = ctx.createBuffer(2, bufLen, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < bufLen; i++) {
      // Exponential decay + random noise — classic synthetic reverb
      const env = Math.pow(1 - i / bufLen, 2.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

/** Build the always-on drone: D2 + A2 (root + fifth), soft and warm */
function buildDrone(ctx: AudioContext, dest: AudioNode): () => void {
  const droneFreqs = [73.42, 110.0]; // D2, A2
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  for (const freq of droneFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = freq * 3;
    lp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.value = 0;
    // Fade in slowly so it's not jarring
    g.gain.setTargetAtTime(0.04, ctx.currentTime, 1.5);

    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  return () => {
    for (let i = 0; i < oscs.length; i++) {
      const g = gains[i];
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      oscs[i].stop(ctx.currentTime + 1.5);
    }
  };
}

export function buildLoomAudio(ctx: AudioContext): LoomAudio {
  // ── output chain ──────────────────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.25;

  const reverb = makeSyntheticReverb(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.35;
  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.7;

  masterGain.connect(dryGain);
  dryGain.connect(compressor);
  masterGain.connect(reverb);
  reverb.connect(reverbGain);
  reverbGain.connect(compressor);
  compressor.connect(ctx.destination);

  // ── drone ─────────────────────────────────────────────────────────────────
  const stopDrone = buildDrone(ctx, masterGain);

  // ── per-string voices ─────────────────────────────────────────────────────
  const voices: StringVoice[] = STRING_FREQS.map((freq) => {
    // Sawtooth — the primary bowed tone
    const sawOsc = ctx.createOscillator();
    sawOsc.type = "sawtooth";
    sawOsc.frequency.value = freq;

    // Noise source — adds bow scrape at low speeds
    const noiseSrc = makeNoiseSource(ctx);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.3; // noise blend ratio
    noiseSrc.connect(noiseGain);
    noiseSrc.start();

    // Bow gain — controlled by bow speed
    const bowGain = ctx.createGain();
    bowGain.gain.value = 0;

    // Low-pass filter — frequency maps to bow speed (faster = brighter)
    const filterLP = ctx.createBiquadFilter();
    filterLP.type = "lowpass";
    filterLP.frequency.value = freq * 2; // start muted
    filterLP.Q.value = 1.2;

    // High-pass — remove sub rumble
    const filterHP = ctx.createBiquadFilter();
    filterHP.type = "highpass";
    filterHP.frequency.value = freq * 0.8;
    filterHP.Q.value = 0.7;

    // Envelope gain — smooth on/off
    const envGain = ctx.createGain();
    envGain.gain.value = 0;

    // Wire: [saw + noise] → bowGain → filterHP → filterLP → envGain → master
    sawOsc.connect(bowGain);
    noiseGain.connect(bowGain);
    bowGain.connect(filterHP);
    filterHP.connect(filterLP);
    filterLP.connect(envGain);
    envGain.connect(masterGain);

    sawOsc.start();

    return {
      sawOsc,
      noiseGain,
      noiseSrc,
      bowGain,
      filterLP,
      filterHP,
      envGain,
      targetBowSpeed: 0,
      bowing: false,
    };
  });

  /** Update a string's bow parameters each frame */
  function setBowSpeed(stringIdx: number, speed: number, active: boolean) {
    const v = voices[stringIdx];
    if (!v) return;
    const now = ctx.currentTime;
    const freq = STRING_FREQS[stringIdx];

    if (active && speed > 0.01) {
      // Speed 0..1 → amplitude, filter cutoff, noise ratio
      const amp = Math.min(1, speed * 1.4);
      // Stick-slip: slow = more noise (scratchy), fast = more tone (pure)
      const noiseRatio = Math.max(0.05, 0.5 - speed * 0.45);
      // Bow speed → brightness: low speed = 2x freq, high speed = 8x freq
      const cutoff = freq * (2 + speed * 6);

      v.bowGain.gain.setTargetAtTime(amp, now, 0.04);
      v.noiseGain.gain.setTargetAtTime(noiseRatio, now, 0.06);
      v.filterLP.frequency.setTargetAtTime(Math.min(cutoff, ctx.sampleRate / 2 - 100), now, 0.05);

      if (!v.bowing) {
        // Attack: swell in
        v.envGain.gain.cancelScheduledValues(now);
        v.envGain.gain.setTargetAtTime(1.0, now, 0.08);
        v.bowing = true;
      }
    } else {
      // Release: fade out
      if (v.bowing || speed <= 0.01) {
        v.envGain.gain.setTargetAtTime(0, now, 0.25);
        v.bowGain.gain.setTargetAtTime(0, now, 0.3);
        v.bowing = false;
      }
    }
  }

  function dispose() {
    stopDrone();
    for (const v of voices) {
      try { v.sawOsc.stop(); } catch { /* already stopped */ }
      try { v.noiseSrc.stop(); } catch { /* already stopped */ }
    }
  }

  return { ctx, voices, masterGain, dispose, setBowSpeed };
}
